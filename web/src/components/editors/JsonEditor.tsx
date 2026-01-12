import * as monaco from "monaco-editor";
import { useEffect, useRef, useCallback, useState } from "react";
import { useTheme } from "next-themes";

export interface JsonEditorProps {
  /** JSON string value */
  value: string;
  /** Called when the value changes */
  onChange: (value: string) => void;
  /** Called when validation state changes */
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
  /** Editor height (CSS value) */
  height?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Placeholder text when empty */
  placeholder?: string;
  /** Additional CSS class for the container */
  className?: string;
}

/**
 * Reusable JSON editor component built on Monaco Editor.
 *
 * Features:
 * - Syntax highlighting with dark/light theme support
 * - Real-time JSON validation with inline error markers
 * - Bracket pair colorization
 * - Auto-formatting on paste
 */
export function JsonEditor({
  value,
  onChange,
  onValidationChange,
  height = "300px",
  readOnly = false,
  placeholder = '{\n  "key": "value"\n}',
  className = "",
}: JsonEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Wait for client-side mount to avoid SSR theme mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Validate JSON and report errors
  const validateJson = useCallback(
    (jsonString: string): { isValid: boolean; errors: string[] } => {
      if (!jsonString.trim()) {
        return { isValid: true, errors: [] };
      }

      try {
        JSON.parse(jsonString);
        return { isValid: true, errors: [] };
      } catch (e) {
        const error = e instanceof Error ? e.message : "Invalid JSON";
        return { isValid: false, errors: [error] };
      }
    },
    [],
  );

  // Initialize Monaco Editor
  useEffect(() => {
    // Wait for client-side mount and theme to be resolved
    if (!mounted || !containerRef.current || editorRef.current) {
      return;
    }

    // Default to dark if theme not yet resolved (avoid flash)
    const theme = resolvedTheme === "light" ? "vs" : "vs-dark";

    const editor = monaco.editor.create(containerRef.current, {
      value: value || "",
      language: "json",
      theme,
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: "on",
      roundedSelection: false,
      readOnly,
      cursorStyle: "line",
      fontSize: 13,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      padding: { top: 12, bottom: 12 },
      bracketPairColorization: {
        enabled: true,
      },
      folding: true,
      foldingHighlight: true,
      formatOnPaste: true,
      tabSize: 2,
      wordWrap: "on",
      suggest: {
        showKeywords: true,
      },
      quickSuggestions: {
        other: true,
        strings: true,
      },
    });

    editorRef.current = editor;

    // Listen to content changes
    editor.onDidChangeModelContent(() => {
      const newValue = editor.getValue();
      onChange(newValue);

      // Validate and report
      if (onValidationChange) {
        const { isValid, errors } = validateJson(newValue);
        onValidationChange(isValid, errors);
      }
    });

    // Initial validation
    if (onValidationChange && value) {
      const { isValid, errors } = validateJson(value);
      onValidationChange(isValid, errors);
    }

    // Cleanup
    return () => {
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Update theme when it changes
  useEffect(() => {
    if (editorRef.current) {
      const theme = resolvedTheme === "light" ? "vs" : "vs-dark";
      monaco.editor.setTheme(theme);
    }
  }, [resolvedTheme]);

  // Update value from external changes (but avoid loops)
  useEffect(() => {
    if (editorRef.current) {
      const currentValue = editorRef.current.getValue();
      if (value !== currentValue) {
        // Preserve cursor position
        const position = editorRef.current.getPosition();
        editorRef.current.setValue(value);
        if (position) {
          editorRef.current.setPosition(position);
        }
      }
    }
  }, [value]);

  // Update read-only state
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ readOnly });
    }
  }, [readOnly]);

  // Determine if using percentage height
  const isPercentHeight = height === "100%" || height.endsWith("%");

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-md border border-neutral-200 overflow-hidden dark:border-neutral-700 bg-white dark:bg-neutral-900 ${isPercentHeight ? "h-full" : ""} ${className}`}
      style={isPercentHeight ? undefined : { height }}
      data-placeholder={placeholder}
    >
      {/* Show loading placeholder before Monaco mounts */}
      {!mounted && (
        <div className="w-full h-full flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-sm">
          Loading editor...
        </div>
      )}
    </div>
  );
}

export default JsonEditor;
