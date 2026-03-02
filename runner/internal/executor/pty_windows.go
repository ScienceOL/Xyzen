//go:build windows

package executor

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"os/exec"
	"sync"
	"time"

	"github.com/UserExistsError/conpty"
	"github.com/scienceol/xyzen/runner/internal/protocol"
)

const (
	coalesceInterval = 16 * time.Millisecond
	coalesceMaxBytes = 16 * 1024
)

// PTYSession represents a single running PTY session backed by ConPTY.
type PTYSession struct {
	id     string
	cpty   *conpty.ConPty
	cancel context.CancelFunc
	done   chan struct{} // closed when the process exits
}

// PTYManager manages multiple concurrent PTY sessions via Windows ConPTY.
type PTYManager struct {
	mu       sync.RWMutex
	sessions map[string]*PTYSession
	workDir  string
	// OutputFunc is called when a PTY session produces output.
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

// detectShell returns the best available shell on Windows.
func detectShell() string {
	if path, err := exec.LookPath("pwsh.exe"); err == nil {
		return path
	}
	if path, err := exec.LookPath("powershell.exe"); err == nil {
		return path
	}
	return "cmd.exe"
}

// Create starts a new PTY session with the given command.
func (m *PTYManager) Create(p protocol.PTYCreatePayload) error {
	if !conpty.IsConPtyAvailable() {
		return fmt.Errorf("ConPTY is not available on this version of Windows")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.sessions[p.SessionID]; exists {
		return fmt.Errorf("session %s already exists", p.SessionID)
	}

	command := p.Command
	if command == "" {
		command = detectShell()
	}

	cols := p.Cols
	rows := p.Rows
	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}

	// Build the full command line for ConPTY.
	commandLine := command
	for _, arg := range p.Args {
		commandLine += " " + arg
	}

	ctx, cancel := context.WithCancel(context.Background())

	cpty, err := conpty.Start(commandLine, conpty.ConPtyDimensions(int(cols), int(rows)), conpty.ConPtyWorkDir(m.workDir))
	if err != nil {
		cancel()
		return fmt.Errorf("start conpty: %w", err)
	}

	session := &PTYSession{
		id:     p.SessionID,
		cpty:   cpty,
		cancel: cancel,
		done:   make(chan struct{}),
	}
	m.sessions[p.SessionID] = session

	go m.readLoop(session, ctx)
	go m.waitLoop(session, ctx)

	log.Printf("PTY session %s started: %s", p.SessionID, commandLine)
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

	_, err = session.cpty.Write(data)
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

	return session.cpty.Resize(int(cols), int(rows))
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

	session.cancel()
	_ = session.cpty.Close()

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
		session.cancel()
		_ = session.cpty.Close()
		log.Printf("PTY session %s closed (cleanup)", id)
	}
}

// readLoop reads from the ConPTY and coalesces output into larger chunks
// before delivering via OutputFunc. This dramatically reduces WebSocket
// message count at the cost of up to coalesceInterval (16ms) latency.
func (m *PTYManager) readLoop(session *PTYSession, ctx context.Context) {
	readBuf := make([]byte, 32*1024)
	coalBuf := make([]byte, 0, coalesceMaxBytes+32*1024)
	timer := time.NewTimer(coalesceInterval)
	timer.Stop()

	dataCh := make(chan []byte, 8)
	errCh := make(chan error, 1)

	// Dedicated read goroutine — cpty.Read blocks, so we run it separately
	// and feed chunks into dataCh for the coalescer select loop.
	go func() {
		for {
			n, err := session.cpty.Read(readBuf)
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
				flush()
			} else if len(coalBuf) == len(chunk) {
				timer.Reset(coalesceInterval)
			}
		case <-timer.C:
			flush()
		case <-errCh:
			flush()
			return
		case <-ctx.Done():
			flush()
			return
		}
	}
}

func (m *PTYManager) waitLoop(session *PTYSession, ctx context.Context) {
	rawCode, err := session.cpty.Wait(ctx)
	close(session.done)

	exitCode := int(rawCode)
	if err != nil && ctx.Err() != nil {
		// Context cancelled — session was intentionally closed.
		exitCode = -1
	}

	m.mu.Lock()
	delete(m.sessions, session.id)
	m.mu.Unlock()

	_ = session.cpty.Close()

	if m.ExitFunc != nil {
		m.ExitFunc(session.id, exitCode)
	}

	log.Printf("PTY session %s exited with code %d", session.id, exitCode)
}
