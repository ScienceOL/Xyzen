package client

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"runtime"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/scienceol/xyzen/runner/internal/config"
	"github.com/scienceol/xyzen/runner/internal/executor"
	"github.com/scienceol/xyzen/runner/internal/protocol"
	"github.com/scienceol/xyzen/runner/internal/ui"
)

const (
	pingInterval   = 20 * time.Second
	writeTimeout   = 10 * time.Second
	writeChanSize  = 256
)

// Client manages the WebSocket connection to the Xyzen backend.
type Client struct {
	cfg    *config.Config
	exec   *executor.Executor
	ptyMgr *executor.PTYManager

	mu          sync.Mutex
	writeCh     chan interface{}
	reconnector *Reconnector

	stopCh chan struct{}
	once   sync.Once
}

// New creates a new Client.
func New(cfg *config.Config) *Client {
	c := &Client{
		cfg:         cfg,
		exec:        executor.New(cfg.WorkDir),
		ptyMgr:      executor.NewPTYManager(cfg.WorkDir),
		reconnector: NewReconnector(),
		stopCh:      make(chan struct{}),
	}

	c.ptyMgr.OutputFunc = c.sendPTYOutput
	c.ptyMgr.ExitFunc = c.sendPTYExit

	return c
}

// Stop signals the client to shut down gracefully.
func (c *Client) Stop() {
	c.once.Do(func() {
		close(c.stopCh)
	})
}

// send enqueues a message for the write goroutine. Non-blocking — drops
// the message if the buffer is full or no connection is active.
func (c *Client) send(v interface{}) {
	c.mu.Lock()
	ch := c.writeCh
	c.mu.Unlock()
	if ch == nil {
		return
	}
	select {
	case ch <- v:
	default:
		// Buffer full — drop to avoid blocking PTY/heartbeat goroutines.
	}
}

// writeLoop is the single goroutine that writes to the WebSocket.
func (c *Client) writeLoop(conn *websocket.Conn, ch <-chan interface{}, done <-chan struct{}) {
	for {
		select {
		case <-done:
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			_ = conn.SetWriteDeadline(time.Now().Add(writeTimeout))
			if err := conn.WriteJSON(msg); err != nil {
				log.Printf("write error: %v", err)
				return
			}
		}
	}
}

// Run connects to the server and enters the message loop with automatic reconnection.
func (c *Client) Run() error {
	for {
		select {
		case <-c.stopCh:
			return nil
		default:
		}

		err := c.connectAndServe()
		if err != nil {
			ui.Error("Connection lost: %v", err)
		}

		select {
		case <-c.stopCh:
			return nil
		default:
		}

		ui.Info("Reconnecting...")
		if !c.reconnector.Wait(c.stopCh) {
			return nil
		}
	}
}

func (c *Client) connectAndServe() error {
	u, err := url.Parse(c.cfg.URL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	q := u.Query()
	q.Set("token", c.cfg.Token)
	u.RawQuery = q.Encode()

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return fmt.Errorf("dial failed: %w", err)
	}

	// Set up per-connection write channel + writer goroutine
	writeCh := make(chan interface{}, writeChanSize)
	writeDone := make(chan struct{})

	c.mu.Lock()
	c.writeCh = writeCh
	c.mu.Unlock()

	go c.writeLoop(conn, writeCh, writeDone)

	defer func() {
		close(writeDone)
		conn.Close()
		c.mu.Lock()
		c.writeCh = nil
		c.mu.Unlock()
	}()

	// Read the "connected" message
	var connMsg struct {
		Type     string `json:"type"`
		RunnerID string `json:"runner_id"`
	}
	if err := conn.ReadJSON(&connMsg); err != nil {
		return fmt.Errorf("failed to read connected message: %w", err)
	}
	if connMsg.Type != "connected" {
		return fmt.Errorf("unexpected first message type: %s", connMsg.Type)
	}
	ui.Success("Connected %s", ui.Dim("(runner "+connMsg.RunnerID+")"))

	// Successful handshake — reset backoff for next disconnect
	c.reconnector.Reset()

	// Send info message with active PTY sessions (survives reconnection)
	activeSessions := c.ptyMgr.ListSessions()
	c.send(protocol.Response{
		Type: "info",
		Payload: protocol.InfoPayload{
			OS:          fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH),
			WorkDir:     c.cfg.WorkDir,
			PTYSessions: activeSessions,
		},
	})

	// Start heartbeat
	pingDone := make(chan struct{})
	go c.heartbeatLoop(pingDone)

	// Message loop (single reader — no concurrency issue on reads)
	for {
		select {
		case <-c.stopCh:
			close(pingDone)
			return nil
		default:
		}

		_, raw, err := conn.ReadMessage()
		if err != nil {
			close(pingDone)
			return fmt.Errorf("read error: %w", err)
		}

		var req protocol.Request
		if err := json.Unmarshal(raw, &req); err != nil {
			log.Printf("Invalid message: %s", err)
			continue
		}

		switch req.Type {
		case "ping":
			c.send(map[string]string{"type": "pong"})
		case "pong":
			// Heartbeat ack — no action
		default:
			go c.handleRequest(req)
		}
	}
}

func (c *Client) handleRequest(req protocol.Request) {
	var resp protocol.Response
	resp.ID = req.ID

	switch req.Type {
	case "exec":
		resp = c.handleExec(req)
	case "read_file":
		resp = c.handleReadFile(req)
	case "read_file_bytes":
		resp = c.handleReadFileBytes(req)
	case "write_file":
		resp = c.handleWriteFile(req)
	case "write_file_bytes":
		resp = c.handleWriteFileBytes(req)
	case "list_files":
		resp = c.handleListFiles(req)
	case "find_files":
		resp = c.handleFindFiles(req)
	case "search_in_files":
		resp = c.handleSearchInFiles(req)
	case "pty_create":
		resp = c.handlePTYCreate(req)
	case "pty_input":
		resp = c.handlePTYInput(req)
	case "pty_resize":
		resp = c.handlePTYResize(req)
	case "pty_close":
		resp = c.handlePTYClose(req)
	default:
		resp.Type = req.Type + "_result"
		resp.Success = false
		resp.Payload = protocol.ErrorPayload{Error: fmt.Sprintf("unknown request type: %s", req.Type)}
	}

	c.send(resp)
}

func (c *Client) handleExec(req protocol.Request) protocol.Response {
	var p protocol.ExecPayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "exec_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	result := c.exec.Exec(p.Command, p.Cwd, p.Timeout)
	return protocol.Response{ID: req.ID, Type: "exec_result", Success: true, Payload: result}
}

func (c *Client) handleReadFile(req protocol.Request) protocol.Response {
	var p protocol.FilePayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "read_file_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	content, err := c.exec.ReadFile(p.Path)
	if err != nil {
		return protocol.Response{ID: req.ID, Type: "read_file_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	return protocol.Response{ID: req.ID, Type: "read_file_result", Success: true, Payload: protocol.FileResult{Content: content}}
}

func (c *Client) handleReadFileBytes(req protocol.Request) protocol.Response {
	var p protocol.FilePayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "read_file_bytes_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	data, err := c.exec.ReadFileBytes(p.Path)
	if err != nil {
		return protocol.Response{ID: req.ID, Type: "read_file_bytes_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	return protocol.Response{ID: req.ID, Type: "read_file_bytes_result", Success: true, Payload: protocol.FileResult{Data: data}}
}

func (c *Client) handleWriteFile(req protocol.Request) protocol.Response {
	var p protocol.FilePayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "write_file_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	if err := c.exec.WriteFile(p.Path, p.Content); err != nil {
		return protocol.Response{ID: req.ID, Type: "write_file_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	return protocol.Response{ID: req.ID, Type: "write_file_result", Success: true, Payload: struct{}{}}
}

func (c *Client) handleWriteFileBytes(req protocol.Request) protocol.Response {
	var p protocol.FilePayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "write_file_bytes_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	if err := c.exec.WriteFileBytes(p.Path, p.Data); err != nil {
		return protocol.Response{ID: req.ID, Type: "write_file_bytes_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	return protocol.Response{ID: req.ID, Type: "write_file_bytes_result", Success: true, Payload: struct{}{}}
}

func (c *Client) handleListFiles(req protocol.Request) protocol.Response {
	var p protocol.ListFilesPayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "list_files_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	files, err := c.exec.ListFiles(p.Path)
	if err != nil {
		return protocol.Response{ID: req.ID, Type: "list_files_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	return protocol.Response{ID: req.ID, Type: "list_files_result", Success: true, Payload: map[string]interface{}{"files": files}}
}

func (c *Client) handleFindFiles(req protocol.Request) protocol.Response {
	var p protocol.FindFilesPayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "find_files_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	files, err := c.exec.FindFiles(p.Root, p.Pattern)
	if err != nil {
		return protocol.Response{ID: req.ID, Type: "find_files_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	return protocol.Response{ID: req.ID, Type: "find_files_result", Success: true, Payload: map[string]interface{}{"files": files}}
}

func (c *Client) handleSearchInFiles(req protocol.Request) protocol.Response {
	var p protocol.SearchPayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "search_in_files_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	matches, err := c.exec.SearchInFiles(p.Root, p.Pattern, p.Include)
	if err != nil {
		return protocol.Response{ID: req.ID, Type: "search_in_files_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	return protocol.Response{ID: req.ID, Type: "search_in_files_result", Success: true, Payload: map[string]interface{}{"matches": matches}}
}

func (c *Client) heartbeatLoop(done <-chan struct{}) {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-c.stopCh:
			return
		case <-ticker.C:
			c.send(map[string]string{"type": "ping"})
		}
	}
}

// --- PTY handlers ---

func (c *Client) handlePTYCreate(req protocol.Request) protocol.Response {
	var p protocol.PTYCreatePayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "pty_create_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	if err := c.ptyMgr.Create(p); err != nil {
		return protocol.Response{ID: req.ID, Type: "pty_create_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	return protocol.Response{ID: req.ID, Type: "pty_create_result", Success: true, Payload: struct{}{}}
}

func (c *Client) handlePTYInput(req protocol.Request) protocol.Response {
	var p protocol.PTYInputPayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "pty_input_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	if err := c.ptyMgr.Input(p.SessionID, p.Data); err != nil {
		return protocol.Response{ID: req.ID, Type: "pty_input_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	return protocol.Response{ID: req.ID, Type: "pty_input_result", Success: true, Payload: struct{}{}}
}

func (c *Client) handlePTYResize(req protocol.Request) protocol.Response {
	var p protocol.PTYResizePayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "pty_resize_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	if err := c.ptyMgr.Resize(p.SessionID, p.Cols, p.Rows); err != nil {
		return protocol.Response{ID: req.ID, Type: "pty_resize_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	return protocol.Response{ID: req.ID, Type: "pty_resize_result", Success: true, Payload: struct{}{}}
}

func (c *Client) handlePTYClose(req protocol.Request) protocol.Response {
	var p protocol.PTYClosePayload
	if err := json.Unmarshal(req.Payload, &p); err != nil {
		return protocol.Response{ID: req.ID, Type: "pty_close_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	if err := c.ptyMgr.Close(p.SessionID); err != nil {
		return protocol.Response{ID: req.ID, Type: "pty_close_result", Success: false, Payload: protocol.ErrorPayload{Error: err.Error()}}
	}
	return protocol.Response{ID: req.ID, Type: "pty_close_result", Success: true, Payload: struct{}{}}
}

func (c *Client) sendPTYOutput(sessionID string, data []byte) {
	c.send(map[string]interface{}{
		"type": "pty_output",
		"payload": protocol.PTYOutputPayload{
			SessionID: sessionID,
			Data:      base64.StdEncoding.EncodeToString(data),
		},
	})
}

func (c *Client) sendPTYExit(sessionID string, exitCode int) {
	c.send(map[string]interface{}{
		"type": "pty_exit",
		"payload": protocol.PTYExitPayload{
			SessionID: sessionID,
			ExitCode:  exitCode,
		},
	})
}
