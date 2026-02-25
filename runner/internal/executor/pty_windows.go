// +build windows

package executor

import (
	"fmt"

	"github.com/scienceol/xyzen/internal/protocol"
)

// PTYSession represents a single running PTY session.
type PTYSession struct{}

// PTYManager manages PTY sessions. On Windows, PTY is not supported.
type PTYManager struct {
	OutputFunc func(sessionID string, data []byte)
	ExitFunc   func(sessionID string, exitCode int)
}

// NewPTYManager creates a new PTY manager.
func NewPTYManager(workDir string) *PTYManager {
	return &PTYManager{}
}

func (m *PTYManager) Create(p protocol.PTYCreatePayload) error {
	return fmt.Errorf("PTY sessions are not supported on Windows")
}

func (m *PTYManager) Input(sessionID string, dataB64 string) error {
	return fmt.Errorf("PTY sessions are not supported on Windows")
}

func (m *PTYManager) Resize(sessionID string, cols, rows uint16) error {
	return fmt.Errorf("PTY sessions are not supported on Windows")
}

func (m *PTYManager) Close(sessionID string) error {
	return fmt.Errorf("PTY sessions are not supported on Windows")
}

func (m *PTYManager) CloseAll() {}
