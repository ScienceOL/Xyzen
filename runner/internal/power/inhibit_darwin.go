//go:build darwin

package power

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"sync"
)

type darwinInhibitor struct {
	mu  sync.Mutex
	cmd *exec.Cmd
}

func newInhibitor() Inhibitor {
	return &darwinInhibitor{}
}

func (d *darwinInhibitor) Start() error {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.cmd != nil {
		return nil // already running
	}

	path, err := exec.LookPath("caffeinate")
	if err != nil {
		return fmt.Errorf("caffeinate not found: %w", err)
	}

	// -i: prevent idle sleep
	// -s: prevent system sleep (AC power)
	// -w <pid>: exit automatically when the runner process dies
	d.cmd = exec.Command(path, "-is", "-w", strconv.Itoa(os.Getpid()))
	if err := d.cmd.Start(); err != nil {
		d.cmd = nil
		return fmt.Errorf("failed to start caffeinate: %w", err)
	}

	// Reap the child in background so it doesn't become a zombie.
	go d.cmd.Wait()

	return nil
}

func (d *darwinInhibitor) Stop() {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.cmd != nil && d.cmd.Process != nil {
		d.cmd.Process.Kill()
		d.cmd = nil
	}
}
