package ui

import (
	"fmt"
	"os"
	"strings"
)

// ANSI color/style codes
const (
	reset   = "\033[0m"
	bold    = "\033[1m"
	dim     = "\033[2m"
	italic  = "\033[3m"
	cyan    = "\033[36m"
	green   = "\033[32m"
	yellow  = "\033[33m"
	red     = "\033[31m"
	magenta = "\033[35m"
	blue    = "\033[34m"
	white   = "\033[97m"
	gray    = "\033[90m"
)

// isTTY returns true if stderr is a terminal.
func isTTY() bool {
	fi, err := os.Stderr.Stat()
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeCharDevice != 0
}

// s wraps text with ANSI codes only when stderr is a TTY.
func s(codes, text string) string {
	if !isTTY() {
		return text
	}
	return codes + text + reset
}

// Banner prints the startup banner.
//
//	 xyzen v0.1.0
func Banner(version string) {
	fmt.Fprintf(os.Stderr, "\n  %s %s\n", s(bold+cyan, "xyzen"), s(dim, "v"+version))
}

// UpdateNotice prints a boxed update notice.
//
//	 ┌ Update available: 0.1.0 → 0.2.0
//	 └ curl -fsSL https://... -o /usr/local/bin/xyzen && chmod +x /usr/local/bin/xyzen
func UpdateNotice(current, latest, downloadURL string) {
	fmt.Fprintf(os.Stderr, "\n  %s %s %s %s %s\n",
		s(yellow, "┌"),
		s(dim, "Update available:"),
		s(dim, current),
		s(yellow, "→"),
		s(bold+green, latest),
	)
	fmt.Fprintf(os.Stderr, "  %s %s\n",
		s(yellow, "└"),
		s(dim, downloadURL),
	)
}

// KeyValue prints a labeled line:  ▸ label  value
func KeyValue(label, value string) {
	fmt.Fprintf(os.Stderr, "  %s %-11s %s\n", s(cyan, "▸"), s(dim, label), s(white, value))
}

// Info prints an info line:  ● message
func Info(format string, a ...any) {
	msg := fmt.Sprintf(format, a...)
	fmt.Fprintf(os.Stderr, "  %s %s\n", s(cyan, "●"), msg)
}

// Success prints a success line:  ✔ message
func Success(format string, a ...any) {
	msg := fmt.Sprintf(format, a...)
	fmt.Fprintf(os.Stderr, "  %s %s\n", s(green, "✔"), msg)
}

// Warn prints a warning line:  ▲ message
func Warn(format string, a ...any) {
	msg := fmt.Sprintf(format, a...)
	fmt.Fprintf(os.Stderr, "  %s %s\n", s(yellow, "▲"), msg)
}

// Error prints an error line:  ✖ message
func Error(format string, a ...any) {
	msg := fmt.Sprintf(format, a...)
	fmt.Fprintf(os.Stderr, "  %s %s\n", s(red, "✖"), msg)
}

// Separator prints a dim horizontal line.
func Separator() {
	fmt.Fprintf(os.Stderr, "  %s\n", s(dim, strings.Repeat("─", 48)))
}

// Dim wraps text in dim style (for use in other formatted output).
func Dim(text string) string {
	return s(dim, text)
}
