//go:build linux

package power

import (
	"fmt"
	"os/exec"
	"sync"
	"syscall"
)

type linuxInhibitor struct {
	mu  sync.Mutex
	cmd *exec.Cmd
}

func newInhibitor() Inhibitor {
	return &linuxInhibitor{}
}

func (l *linuxInhibitor) Start() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.cmd != nil {
		return nil // already running
	}

	path, err := exec.LookPath("systemd-inhibit")
	if err != nil {
		return fmt.Errorf("systemd-inhibit not found: %w", err)
	}

	l.cmd = exec.Command(path,
		"--what=sleep",
		"--who=xyzen-runner",
		"--why=Runner active",
		"sleep", "infinity",
	)
	// Kernel sends SIGTERM to child when parent dies — prevents orphans.
	l.cmd.SysProcAttr = &syscall.SysProcAttr{Pdeathsig: syscall.SIGTERM}

	if err := l.cmd.Start(); err != nil {
		l.cmd = nil
		return fmt.Errorf("failed to start systemd-inhibit: %w", err)
	}

	go l.cmd.Wait()

	return nil
}

func (l *linuxInhibitor) Stop() {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.cmd != nil && l.cmd.Process != nil {
		l.cmd.Process.Kill()
		l.cmd = nil
	}
}
