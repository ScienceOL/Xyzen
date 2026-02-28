/**
 * LocalEchoController - Mosh-inspired predictive local echo for terminal.
 *
 * Displays typed characters immediately (underlined) while waiting for
 * server confirmation. When server output arrives, predictions are
 * reconciled: matching chars confirmed, divergent chars erased.
 *
 * Rules:
 * - Only predict printable ASCII characters (32-126)
 * - Enter, Ctrl+C, Tab, arrow keys → clear all predictions immediately
 * - Disable echo for 10s after detecting password prompt in output
 */

import type { Terminal } from "@xterm/xterm";

const PASSWORD_PATTERN = /[Pp]ass(?:word|phrase)\s*:/;
const PASSWORD_SUPPRESS_MS = 10_000;
const UNDERLINE_ON = "\x1b[4m";
const UNDERLINE_OFF = "\x1b[24m";

export class LocalEchoController {
  private term: Terminal;
  private predictions: string[] = [];
  private suppressUntil = 0;
  private enabled = true;

  constructor(term: Terminal) {
    this.term = term;
  }

  /**
   * Called when user types data. Returns true if the char was predicted
   * (and echoed locally), false if it should not be predicted.
   */
  handleInput(data: string): boolean {
    if (!this.enabled) return false;

    // Check if we're in password suppression mode
    if (Date.now() < this.suppressUntil) {
      return false;
    }

    // Non-predictable input → clear predictions
    if (this._isControlInput(data)) {
      this._clearPredictions();
      return false;
    }

    // Only predict printable ASCII
    if (data.length === 1) {
      const code = data.charCodeAt(0);
      if (code >= 32 && code <= 126) {
        this.predictions.push(data);
        // Write predicted char underlined
        this.term.write(`${UNDERLINE_ON}${data}${UNDERLINE_OFF}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Called when server output arrives. Reconciles predictions with actual output.
   * Returns the output data that should be written to the terminal.
   */
  handleOutput(data: Uint8Array): Uint8Array {
    // Check for password prompt in output
    const textForCheck = new TextDecoder().decode(data);
    if (PASSWORD_PATTERN.test(textForCheck)) {
      this.suppressUntil = Date.now() + PASSWORD_SUPPRESS_MS;
      this._clearPredictions();
    }

    if (this.predictions.length === 0) {
      return data;
    }

    // Try to reconcile: check if server output starts with predicted chars
    const text = new TextDecoder().decode(data);
    let matchCount = 0;

    for (let i = 0; i < this.predictions.length && i < text.length; i++) {
      if (text[i] === this.predictions[i]) {
        matchCount++;
      } else {
        break;
      }
    }

    if (matchCount > 0) {
      // Erase predicted chars from display
      this._erasePredictions();
      // Remove matched predictions
      this.predictions.splice(0, matchCount);
      // Re-display remaining predictions (underlined)
      if (this.predictions.length > 0) {
        // Write actual output first, then re-display remaining predictions
        const encoder = new TextEncoder();
        const actualOutput = encoder.encode(text);
        this.term.write(actualOutput);
        this.term.write(
          `${UNDERLINE_ON}${this.predictions.join("")}${UNDERLINE_OFF}`,
        );
        // Return empty since we already wrote
        return new Uint8Array(0);
      }
      // All predictions matched — write actual output normally
      return data;
    }

    // Divergence detected — erase all predictions and write server output
    this._erasePredictions();
    this.predictions = [];
    return data;
  }

  /** Clear all pending predictions. */
  clear(): void {
    this._clearPredictions();
  }

  /** Enable or disable local echo. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this._clearPredictions();
    }
  }

  get hasPredictions(): boolean {
    return this.predictions.length > 0;
  }

  private _isControlInput(data: string): boolean {
    if (data.length === 0) return true;

    const code = data.charCodeAt(0);

    // Enter (CR or LF)
    if (code === 13 || code === 10) return true;
    // Ctrl+C, Ctrl+D, Ctrl+Z, etc. (control chars 0-31 except printable)
    if (code < 32) return true;
    // Escape sequences (arrows, function keys, etc.)
    if (code === 27) return true;
    // DEL
    if (code === 127) return true;
    // Multi-byte escape sequences
    if (data.length > 1 && data.startsWith("\x1b")) return true;

    return false;
  }

  private _clearPredictions(): void {
    if (this.predictions.length > 0) {
      this._erasePredictions();
      this.predictions = [];
    }
  }

  private _erasePredictions(): void {
    if (this.predictions.length === 0) return;
    // Move cursor back by prediction count and erase
    const count = this.predictions.length;
    // Backspace + erase each predicted char
    this.term.write(`\x1b[${count}D\x1b[${count}P`);
  }
}
