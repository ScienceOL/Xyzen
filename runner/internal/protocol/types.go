package protocol

import "encoding/json"

// Request is a message from the cloud to the runner.
type Request struct {
	ID      string          `json:"id"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// Response is a message from the runner to the cloud.
type Response struct {
	ID      string      `json:"id"`
	Type    string      `json:"type"`
	Success bool        `json:"success"`
	Payload interface{} `json:"payload"`
}

// ExecPayload is the payload for an "exec" request.
type ExecPayload struct {
	Command string `json:"command"`
	Cwd     string `json:"cwd,omitempty"`
	Timeout int    `json:"timeout,omitempty"`
}

// ExecResultPayload is the payload for an "exec_result" response.
type ExecResultPayload struct {
	ExitCode int    `json:"exit_code"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
}

// FilePayload is for read_file / write_file requests.
type FilePayload struct {
	Path    string `json:"path"`
	Content string `json:"content,omitempty"`
	Data    string `json:"data,omitempty"` // base64 for binary
}

// FileResult is the response for read_file.
type FileResult struct {
	Content string `json:"content,omitempty"`
	Data    string `json:"data,omitempty"` // base64 for binary
}

// ListFilesPayload is for list_files requests.
type ListFilesPayload struct {
	Path string `json:"path"`
}

// FileInfoResult represents a single file entry.
type FileInfoResult struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"is_dir"`
	Size  *int64 `json:"size,omitempty"`
}

// FindFilesPayload is for find_files requests.
type FindFilesPayload struct {
	Root    string `json:"root"`
	Pattern string `json:"pattern"`
}

// SearchPayload is for search_in_files requests.
type SearchPayload struct {
	Root    string `json:"root"`
	Pattern string `json:"pattern"`
	Include string `json:"include,omitempty"`
}

// SearchMatchResult represents a single search match.
type SearchMatchResult struct {
	File    string `json:"file"`
	Line    int    `json:"line"`
	Content string `json:"content"`
}

// InfoPayload is sent by the runner on connect.
type InfoPayload struct {
	OS          string   `json:"os"`
	WorkDir     string   `json:"work_dir"`
	PTYSessions []string `json:"pty_sessions,omitempty"`
}

// ErrorPayload for error responses.
type ErrorPayload struct {
	Error string `json:"error"`
}

// --- PTY (terminal session) payloads ---

// PTYCreatePayload is the payload for a "pty_create" request.
type PTYCreatePayload struct {
	SessionID string   `json:"session_id"`
	Command   string   `json:"command,omitempty"` // e.g. "claude", "bash"; defaults to user's shell
	Args      []string `json:"args,omitempty"`
	Cols      uint16   `json:"cols,omitempty"`
	Rows      uint16   `json:"rows,omitempty"`
}

// PTYInputPayload is the payload for a "pty_input" message (cloud → runner).
type PTYInputPayload struct {
	SessionID string `json:"session_id"`
	Data      string `json:"data"` // raw terminal input (base64)
}

// PTYOutputPayload is the payload for a "pty_output" message (runner → cloud, proactive).
type PTYOutputPayload struct {
	SessionID string `json:"session_id"`
	Data      string `json:"data"` // raw terminal output (base64)
}

// PTYResizePayload is the payload for a "pty_resize" request.
type PTYResizePayload struct {
	SessionID string `json:"session_id"`
	Cols      uint16 `json:"cols"`
	Rows      uint16 `json:"rows"`
}

// PTYClosePayload is the payload for a "pty_close" request.
type PTYClosePayload struct {
	SessionID string `json:"session_id"`
}

// PTYExitPayload is the payload for a "pty_exit" event (runner → cloud, proactive).
type PTYExitPayload struct {
	SessionID string `json:"session_id"`
	ExitCode  int    `json:"exit_code"`
}
