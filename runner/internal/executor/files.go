package executor

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"

	"github.com/scienceol/xyzen/internal/protocol"
)

// ReadFile reads a text file and returns its content.
func (e *Executor) ReadFile(path string) (string, error) {
	resolved, err := e.resolvePath(path)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return "", fmt.Errorf("read file: %w", err)
	}
	return string(data), nil
}

// ReadFileBytes reads a file and returns base64-encoded content.
func (e *Executor) ReadFileBytes(path string) (string, error) {
	resolved, err := e.resolvePath(path)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return "", fmt.Errorf("read file: %w", err)
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// WriteFile writes text content to a file, creating parent directories.
func (e *Executor) WriteFile(path, content string) error {
	resolved, err := e.resolvePath(path)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(resolved), 0o755); err != nil {
		return fmt.Errorf("create directory: %w", err)
	}
	return os.WriteFile(resolved, []byte(content), 0o644)
}

// WriteFileBytes writes base64-decoded data to a file.
func (e *Executor) WriteFileBytes(path, data string) error {
	resolved, err := e.resolvePath(path)
	if err != nil {
		return err
	}
	raw, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return fmt.Errorf("base64 decode: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(resolved), 0o755); err != nil {
		return fmt.Errorf("create directory: %w", err)
	}
	return os.WriteFile(resolved, raw, 0o644)
}

// ListFiles returns entries in a directory.
func (e *Executor) ListFiles(path string) ([]protocol.FileInfoResult, error) {
	resolved, err := e.resolvePath(path)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(resolved)
	if err != nil {
		return nil, fmt.Errorf("list directory: %w", err)
	}

	var results []protocol.FileInfoResult
	for _, entry := range entries {
		info, err := entry.Info()
		var size *int64
		if err == nil {
			s := info.Size()
			size = &s
		}
		results = append(results, protocol.FileInfoResult{
			Name:  entry.Name(),
			Path:  filepath.Join(path, entry.Name()),
			IsDir: entry.IsDir(),
			Size:  size,
		})
	}
	return results, nil
}

// resolvePath resolves a path relative to workDir and validates it stays within bounds.
func (e *Executor) resolvePath(path string) (string, error) {
	var resolved string
	if filepath.IsAbs(path) {
		resolved = filepath.Clean(path)
	} else {
		resolved = filepath.Join(e.workDir, path)
	}

	// Resolve symlinks for security check
	real, err := filepath.EvalSymlinks(resolved)
	if err != nil {
		// If the path doesn't exist yet (for writes), check the parent
		parent := filepath.Dir(resolved)
		realParent, parentErr := filepath.EvalSymlinks(parent)
		if parentErr != nil {
			// Parent also doesn't exist — the write operation will create it,
			// so validate the logical path instead
			real = resolved
		} else {
			real = filepath.Join(realParent, filepath.Base(resolved))
		}
	}

	// Ensure the resolved path is under workDir
	workDirReal, err := filepath.EvalSymlinks(e.workDir)
	if err != nil {
		workDirReal = e.workDir
	}

	rel, err := filepath.Rel(workDirReal, real)
	if err != nil || len(rel) >= 2 && rel[:2] == ".." {
		return "", fmt.Errorf("path %q is outside the working directory", path)
	}

	return resolved, nil
}
