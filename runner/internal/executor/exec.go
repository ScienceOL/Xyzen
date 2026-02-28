package executor

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"time"

	"github.com/scienceol/xyzen/runner/internal/protocol"
)

const (
	defaultTimeout = 120 // seconds
	maxOutputBytes = 1 << 20 // 1 MB
)

// Executor handles command execution and file operations within a work directory.
type Executor struct {
	workDir string
}

// New creates a new Executor rooted at the given directory.
func New(workDir string) *Executor {
	return &Executor{workDir: workDir}
}

// Exec runs a shell command and returns the result.
func (e *Executor) Exec(command, cwd string, timeoutSec int) protocol.ExecResultPayload {
	if timeoutSec <= 0 {
		timeoutSec = defaultTimeout
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	defer cancel()

	// Resolve working directory
	dir := e.workDir
	if cwd != "" {
		resolved, err := e.resolvePath(cwd)
		if err != nil {
			return protocol.ExecResultPayload{ExitCode: -1, Stderr: err.Error()}
		}
		dir = resolved
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.CommandContext(ctx, "cmd", "/C", command)
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", command)
	}
	cmd.Dir = dir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &limitedWriter{w: &stdout, limit: maxOutputBytes}
	cmd.Stderr = &limitedWriter{w: &stderr, limit: maxOutputBytes}

	err := cmd.Run()

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else if ctx.Err() == context.DeadlineExceeded {
			return protocol.ExecResultPayload{
				ExitCode: -1,
				Stdout:   stdout.String(),
				Stderr:   fmt.Sprintf("command timed out after %ds\n%s", timeoutSec, stderr.String()),
			}
		} else {
			exitCode = -1
			if stderr.Len() == 0 {
				stderr.WriteString(err.Error())
			}
		}
	}

	return protocol.ExecResultPayload{
		ExitCode: exitCode,
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
	}
}

// limitedWriter wraps an io.Writer and stops writing after limit bytes.
type limitedWriter struct {
	w       *bytes.Buffer
	limit   int
	written int
}

func (lw *limitedWriter) Write(p []byte) (int, error) {
	remaining := lw.limit - lw.written
	if remaining <= 0 {
		return len(p), nil // Discard silently
	}
	if len(p) > remaining {
		p = p[:remaining]
	}
	n, err := lw.w.Write(p)
	lw.written += n
	return n, err
}
