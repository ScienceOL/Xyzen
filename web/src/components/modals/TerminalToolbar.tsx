import { useIsTouchDevice } from "@/hooks/use-is-touch-device";
import type { Terminal as XTerm } from "@xterm/xterm";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

interface TerminalToolbarProps {
  xtermRef: React.RefObject<XTerm | null>;
}

type ActiveModifier = "ctrl" | "alt" | null;

// ANSI escape sequences for arrow keys
const ARROW_SEQ: Record<string, string> = {
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
};

const ARROW_REPEAT_DELAY = 400;
const ARROW_REPEAT_INTERVAL = 80;

const btnSpring = { type: "spring" as const, stiffness: 400, damping: 25 };

function haptic() {
  try {
    if ("vibrate" in navigator) navigator.vibrate(10);
  } catch {
    // ignore
  }
}

export function TerminalToolbar({ xtermRef }: TerminalToolbarProps) {
  const isTouch = useIsTouchDevice();
  const [modifier, setModifier] = useState<ActiveModifier>(null);
  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handlerCleanupRef = useRef<(() => void) | null>(null);

  // Focus the xterm textarea so the virtual keyboard stays open
  const focusTerminal = useCallback(() => {
    xtermRef.current?.focus();
  }, [xtermRef]);

  const sendInput = useCallback(
    (data: string) => {
      xtermRef.current?.input(data, true);
      focusTerminal();
    },
    [xtermRef, focusTerminal],
  );

  // Attach custom key event handler when modifier is active,
  // so physical keyboard presses combine with the modifier
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm || !modifier) {
      handlerCleanupRef.current?.();
      handlerCleanupRef.current = null;
      return;
    }

    const handler = (ev: KeyboardEvent): boolean => {
      if (ev.type !== "keydown") return true;
      // Ignore modifier keys themselves
      if (
        ev.key === "Control" ||
        ev.key === "Alt" ||
        ev.key === "Shift" ||
        ev.key === "Meta"
      )
        return true;

      haptic();

      if (modifier === "ctrl") {
        const code = ev.key.toUpperCase().charCodeAt(0);
        // A-Z → 1-26, special: [ \ ] ^ _ → 27-31
        if (code >= 65 && code <= 90) {
          xterm.input(String.fromCharCode(code - 64), true);
        } else if (ev.key === "[") {
          xterm.input("\x1b", true); // Ctrl+[ = ESC
        } else if (ev.key === "\\") {
          xterm.input("\x1c", true);
        } else if (ev.key === "]") {
          xterm.input("\x1d", true);
        } else if (ev.key === "^" || ev.key === "6") {
          xterm.input("\x1e", true);
        } else if (ev.key === "_" || ev.key === "-") {
          xterm.input("\x1f", true);
        }
      } else if (modifier === "alt") {
        xterm.input("\x1b" + ev.key, true);
      }

      setModifier(null);
      ev.preventDefault();
      ev.stopPropagation();
      return false;
    };

    xterm.attachCustomKeyEventHandler(handler);
    handlerCleanupRef.current = () => {
      xterm.attachCustomKeyEventHandler(() => true);
    };

    return () => {
      handlerCleanupRef.current?.();
      handlerCleanupRef.current = null;
    };
  }, [modifier, xtermRef]);

  // Cleanup repeat timers on unmount
  useEffect(() => {
    return () => {
      if (repeatTimerRef.current) clearTimeout(repeatTimerRef.current);
      if (repeatIntervalRef.current) clearInterval(repeatIntervalRef.current);
    };
  }, []);

  // Send a key, applying modifier if active
  const sendKey = useCallback(
    (data: string) => {
      haptic();
      if (modifier === "ctrl") {
        const code = data.toUpperCase().charCodeAt(0);
        if (code >= 65 && code <= 90) {
          sendInput(String.fromCharCode(code - 64));
        } else {
          sendInput(data);
        }
        setModifier(null);
      } else if (modifier === "alt") {
        sendInput("\x1b" + data);
        setModifier(null);
      } else {
        sendInput(data);
      }
    },
    [modifier, sendInput],
  );

  const toggleModifier = useCallback(
    (mod: "ctrl" | "alt") => {
      haptic();
      setModifier((prev) => (prev === mod ? null : mod));
      focusTerminal();
    },
    [focusTerminal],
  );

  // Arrow key auto-repeat handlers
  const startRepeat = useCallback(
    (direction: string) => {
      haptic();
      const seq = ARROW_SEQ[direction];
      sendInput(seq);
      repeatTimerRef.current = setTimeout(() => {
        repeatIntervalRef.current = setInterval(() => {
          haptic();
          sendInput(seq);
        }, ARROW_REPEAT_INTERVAL);
      }, ARROW_REPEAT_DELAY);
    },
    [sendInput],
  );

  const stopRepeat = useCallback(() => {
    if (repeatTimerRef.current) {
      clearTimeout(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
    if (repeatIntervalRef.current) {
      clearInterval(repeatIntervalRef.current);
      repeatIntervalRef.current = null;
    }
  }, []);

  // Copy selection from xterm to clipboard
  const handleCopy = useCallback(() => {
    haptic();
    const sel = xtermRef.current?.getSelection();
    if (sel) {
      void navigator.clipboard.writeText(sel);
      xtermRef.current?.clearSelection();
    }
    focusTerminal();
  }, [xtermRef, focusTerminal]);

  // Paste from clipboard into xterm
  const handlePaste = useCallback(() => {
    haptic();
    void navigator.clipboard
      .readText()
      .then((text) => {
        if (text) sendInput(text);
      })
      .catch(() => {
        // Clipboard permission denied or unavailable
      });
  }, [sendInput]);

  // Prevent focus loss on desktop mouse clicks
  const preventFocus = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  if (!isTouch) return null;

  const btnBase =
    "select-none rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors";
  const btnNormal = `${btnBase} bg-white/[0.06] text-neutral-300`;
  const btnActive = `${btnBase} bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30`;

  const charKeys = [
    { label: "ESC", data: "\x1b" },
    { label: "TAB", data: "\t" },
  ];

  const symbolKeys = [
    { label: "|", data: "|" },
    { label: "~", data: "~" },
    { label: "/", data: "/" },
  ];

  const arrowKeys = [
    { label: "\u2190", direction: "left" },
    { label: "\u2191", direction: "up" },
    { label: "\u2193", direction: "down" },
    { label: "\u2192", direction: "right" },
  ];

  return (
    <div className="custom-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-t border-white/[0.06] bg-white/[0.02] px-2 py-1.5 backdrop-blur-sm">
      {/* ESC / TAB */}
      {charKeys.map((k) => (
        <motion.button
          key={k.label}
          type="button"
          className={btnNormal}
          whileTap={{ scale: 0.92 }}
          transition={btnSpring}
          onMouseDown={preventFocus}
          onTouchStart={(e) => {
            e.preventDefault();
            sendKey(k.data);
          }}
          onClick={() => sendKey(k.data)}
        >
          {k.label}
        </motion.button>
      ))}

      {/* CTRL */}
      <motion.button
        type="button"
        className={modifier === "ctrl" ? btnActive : btnNormal}
        animate={{ scale: modifier === "ctrl" ? 1.03 : 1 }}
        whileTap={{ scale: 0.92 }}
        transition={btnSpring}
        onMouseDown={preventFocus}
        onTouchStart={(e) => {
          e.preventDefault();
          toggleModifier("ctrl");
        }}
        onClick={() => toggleModifier("ctrl")}
      >
        CTRL
      </motion.button>

      {/* ALT */}
      <motion.button
        type="button"
        className={modifier === "alt" ? btnActive : btnNormal}
        animate={{ scale: modifier === "alt" ? 1.03 : 1 }}
        whileTap={{ scale: 0.92 }}
        transition={btnSpring}
        onMouseDown={preventFocus}
        onTouchStart={(e) => {
          e.preventDefault();
          toggleModifier("alt");
        }}
        onClick={() => toggleModifier("alt")}
      >
        ALT
      </motion.button>

      {/* Symbol keys */}
      {symbolKeys.map((k) => (
        <motion.button
          key={k.label}
          type="button"
          className={btnNormal}
          whileTap={{ scale: 0.92 }}
          transition={btnSpring}
          onMouseDown={preventFocus}
          onTouchStart={(e) => {
            e.preventDefault();
            sendKey(k.data);
          }}
          onClick={() => sendKey(k.data)}
        >
          {k.label}
        </motion.button>
      ))}

      {/* Separator */}
      <div className="mx-0.5 h-4 w-px shrink-0 bg-white/[0.08]" />

      {/* Copy / Paste */}
      <motion.button
        type="button"
        className={btnNormal}
        whileTap={{ scale: 0.92 }}
        transition={btnSpring}
        onMouseDown={preventFocus}
        onTouchStart={(e) => {
          e.preventDefault();
          handleCopy();
        }}
        onClick={handleCopy}
      >
        COPY
      </motion.button>
      <motion.button
        type="button"
        className={btnNormal}
        whileTap={{ scale: 0.92 }}
        transition={btnSpring}
        onMouseDown={preventFocus}
        onTouchStart={(e) => {
          e.preventDefault();
          handlePaste();
        }}
        onClick={handlePaste}
      >
        PASTE
      </motion.button>

      {/* Separator */}
      <div className="mx-0.5 h-4 w-px shrink-0 bg-white/[0.08]" />

      {/* Arrow keys with auto-repeat */}
      {arrowKeys.map((k) => (
        <motion.button
          key={k.direction}
          type="button"
          className={btnNormal}
          whileTap={{ scale: 0.92 }}
          transition={btnSpring}
          onMouseDown={preventFocus}
          onTouchStart={(e) => {
            e.preventDefault();
            startRepeat(k.direction);
          }}
          onTouchEnd={stopRepeat}
          onTouchCancel={stopRepeat}
          onClick={() => {
            // Fallback for mouse clicks (desktop touch emulation)
            if (!repeatTimerRef.current && !repeatIntervalRef.current) {
              haptic();
              sendInput(ARROW_SEQ[k.direction]);
            }
          }}
        >
          {k.label}
        </motion.button>
      ))}
    </div>
  );
}
