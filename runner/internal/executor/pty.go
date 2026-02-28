// +build !windows

package executor

import (
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"os/exec"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/scienceol/xyzen/runner/internal/protocol"
)

const (
	// coalesceInterval is the maximum delay before flushing buffered PTY
	// output. Balances latency (~1 frame at 60 fps) vs message count.
	coalesceInterval = 16 * time.Millisecond
	// coalesceMaxBytes triggers an immediate flush when the buffer reaches
	// this size, regardless of the timer.
	coalesceMaxBytes = 16 * 1024
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
		command = os.Getenv("SHELL")
		if command == "" {
			command = "/bin/sh"
		}
	}

	cmd := exec.Command(command, p.Args...)
	cmd.Dir = m.workDir
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

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

	go m.readLoop(session)
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

// readLoop reads from the PTY and coalesces output into larger chunks
// before delivering via OutputFunc. This dramatically reduces WebSocket
// message count at the cost of up to coalesceInterval (16ms) latency.
func (m *PTYManager) readLoop(session *PTYSession) {
	readBuf := make([]byte, 32*1024)
	coalBuf := make([]byte, 0, coalesceMaxBytes+32*1024)
	timer := time.NewTimer(coalesceInterval)
	timer.Stop()

	dataCh := make(chan []byte, 8)
	errCh := make(chan error, 1)

	// Dedicated read goroutine — ptmx.Read blocks, so we run it separately
	// and feed chunks into dataCh for the coalescer select loop.
	go func() {
		for {
			n, err := session.ptmx.Read(readBuf)
			if n > 0 {
				chunk := make([]byte, n)
				copy(chunk, readBuf[:n])
				dataCh <- chunk
			}
			if err != nil {
				errCh <- err
				return
			}
		}
	}()

	flush := func() {
		if len(coalBuf) > 0 && m.OutputFunc != nil {
			out := make([]byte, len(coalBuf))
			copy(out, coalBuf)
			m.OutputFunc(session.id, out)
			coalBuf = coalBuf[:0]
		}
		timer.Stop()
	}

	for {
		select {
		case chunk := <-dataCh:
			coalBuf = append(coalBuf, chunk...)
			if len(coalBuf) >= coalesceMaxBytes {
				// Buffer large enough — flush immediately
				flush()
			} else if len(coalBuf) == len(chunk) {
				// First data after idle — start the coalesce timer
				timer.Reset(coalesceInterval)
			}
		case <-timer.C:
			// Timer fired — flush whatever we have
			flush()
		case <-errCh:
			// PTY read error (EOF / closed) — flush remaining and exit
			flush()
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

	m.mu.Lock()
	delete(m.sessions, session.id)
	m.mu.Unlock()

	_ = session.ptmx.Close()

	if m.ExitFunc != nil {
		m.ExitFunc(session.id, exitCode)
	}

	log.Printf("PTY session %s exited with code %d", session.id, exitCode)
}
