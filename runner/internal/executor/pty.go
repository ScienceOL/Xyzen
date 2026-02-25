// +build !windows

package executor

import (
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"os/exec"
	"sync"

	"github.com/creack/pty"
	"github.com/scienceol/xyzen/internal/protocol"
)

// PTYSession represents a single running PTY session.
type PTYSession struct {
	id   string
	cmd  *exec.Cmd
	ptmx *os.File
	done chan struct{} // closed when the process exits
}

// PTYManager manages multiple concurrent PTY sessions.
type PTYManager struct {
	mu       sync.RWMutex
	sessions map[string]*PTYSession
	workDir  string
	// OutputFunc is called when a PTY session produces output.
	// The caller sets this to route output to the WebSocket.
	OutputFunc func(sessionID string, data []byte)
	// ExitFunc is called when a PTY session's process exits.
	ExitFunc func(sessionID string, exitCode int)
}

// NewPTYManager creates a new PTY manager.
func NewPTYManager(workDir string) *PTYManager {
	return &PTYManager{
		sessions: make(map[string]*PTYSession),
		workDir:  workDir,
	}
}

// Create starts a new PTY session with the given command.
func (m *PTYManager) Create(p protocol.PTYCreatePayload) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.sessions[p.SessionID]; exists {
		return fmt.Errorf("session %s already exists", p.SessionID)
	}

	command := p.Command
	if command == "" {
		// Default to user's shell
		command = os.Getenv("SHELL")
		if command == "" {
			command = "/bin/sh"
		}
	}

	cmd := exec.Command(command, p.Args...)
	cmd.Dir = m.workDir
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	// Set initial size
	winSize := &pty.Winsize{
		Cols: p.Cols,
		Rows: p.Rows,
	}
	if winSize.Cols == 0 {
		winSize.Cols = 80
	}
	if winSize.Rows == 0 {
		winSize.Rows = 24
	}

	ptmx, err := pty.StartWithSize(cmd, winSize)
	if err != nil {
		return fmt.Errorf("start pty: %w", err)
	}

	session := &PTYSession{
		id:   p.SessionID,
		cmd:  cmd,
		ptmx: ptmx,
		done: make(chan struct{}),
	}
	m.sessions[p.SessionID] = session

	// Read output goroutine
	go m.readLoop(session)

	// Wait for exit goroutine
	go m.waitLoop(session)

	log.Printf("PTY session %s started: %s %v", p.SessionID, command, p.Args)
	return nil
}

// Input writes data to a PTY session's stdin.
func (m *PTYManager) Input(sessionID string, dataB64 string) error {
	m.mu.RLock()
	session, ok := m.sessions[sessionID]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}

	data, err := base64.StdEncoding.DecodeString(dataB64)
	if err != nil {
		return fmt.Errorf("decode input: %w", err)
	}

	_, err = session.ptmx.Write(data)
	return err
}

// Resize changes the PTY window size.
func (m *PTYManager) Resize(sessionID string, cols, rows uint16) error {
	m.mu.RLock()
	session, ok := m.sessions[sessionID]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}

	return pty.Setsize(session.ptmx, &pty.Winsize{Cols: cols, Rows: rows})
}

// Close terminates a PTY session.
func (m *PTYManager) Close(sessionID string) error {
	m.mu.Lock()
	session, ok := m.sessions[sessionID]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("session %s not found", sessionID)
	}
	delete(m.sessions, sessionID)
	m.mu.Unlock()

	// Kill the process and close the PTY
	if session.cmd.Process != nil {
		_ = session.cmd.Process.Kill()
	}
	_ = session.ptmx.Close()

	log.Printf("PTY session %s closed", sessionID)
	return nil
}

// ListSessions returns the IDs of all active PTY sessions.
func (m *PTYManager) ListSessions() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	ids := make([]string, 0, len(m.sessions))
	for id := range m.sessions {
		ids = append(ids, id)
	}
	return ids
}

// CloseAll terminates all active PTY sessions (called on shutdown).
func (m *PTYManager) CloseAll() {
	m.mu.Lock()
	sessions := make(map[string]*PTYSession, len(m.sessions))
	for k, v := range m.sessions {
		sessions[k] = v
	}
	m.sessions = make(map[string]*PTYSession)
	m.mu.Unlock()

	for id, session := range sessions {
		if session.cmd.Process != nil {
			_ = session.cmd.Process.Kill()
		}
		_ = session.ptmx.Close()
		log.Printf("PTY session %s closed (cleanup)", id)
	}
}

func (m *PTYManager) readLoop(session *PTYSession) {
	buf := make([]byte, 32*1024) // 32KB read buffer
	for {
		n, err := session.ptmx.Read(buf)
		if n > 0 && m.OutputFunc != nil {
			m.OutputFunc(session.id, buf[:n])
		}
		if err != nil {
			return
		}
	}
}

func (m *PTYManager) waitLoop(session *PTYSession) {
	err := session.cmd.Wait()
	close(session.done)

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}

	// Remove from active sessions
	m.mu.Lock()
	delete(m.sessions, session.id)
	m.mu.Unlock()

	// Close the PTY fd
	_ = session.ptmx.Close()

	if m.ExitFunc != nil {
		m.ExitFunc(session.id, exitCode)
	}

	log.Printf("PTY session %s exited with code %d", session.id, exitCode)
}
