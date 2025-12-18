import { Modal } from "@/components/animate-ui/primitives/headless/modal";
import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import { useXyzen } from "@/store";
import type { McpServer } from "@/types/mcp";
import { Button } from "@headlessui/react";
import {
  CommandLineIcon,
  DocumentTextIcon,
  ExclamationCircleIcon,
  PlayIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import * as monaco from "monaco-editor";

interface ToolTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  server: McpServer;
  toolName: string;
  toolDescription?: string;
}

interface ToolTestResult {
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime?: number;
}

export const ToolTestModal: React.FC<ToolTestModalProps> = ({
  isOpen,
  onClose,
  server,
  toolName,
  toolDescription,
}) => {
  const { token, backendUrl, addToolExecution } = useXyzen();
  const [parameters, setParameters] = useState<string>("{}");
  const [result, setResult] = useState<ToolTestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [parametersError, setParametersError] = useState<string | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoContainerRef = useRef<HTMLDivElement>(null);

  const validateParameters = (params: string): boolean => {
    try {
      JSON.parse(params);
      setParametersError(null);
      return true;
    } catch {
      setParametersError("Invalid JSON format");
      return false;
    }
  };

  // Initialize Monaco Editor
  useEffect(() => {
    if (!monacoContainerRef.current || editorRef.current) {
      return;
    }

    // Create the editor
    const editor = monaco.editor.create(monacoContainerRef.current, {
      value: parameters,
      language: "json",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      lineNumbers: "on",
      roundedSelection: false,
      readOnly: false,
      cursorStyle: "line",
      fontSize: 13,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      padding: { top: 12, bottom: 12 },
      bracketPairColorization: {
        enabled: true,
      },
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
      const value = editor.getValue();
      setParameters(value);
      validateParameters(value);
    });

    // Cleanup
    return () => {
      editor.dispose();
      editorRef.current = null;
    };
    // Intentionally using parameters only for initial value, not as a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update editor when isOpen changes
  useEffect(() => {
    if (isOpen && editorRef.current) {
      editorRef.current.layout();
    }
  }, [isOpen]);

  const handleTestTool = async () => {
    if (!validateParameters(parameters)) {
      return;
    }

    setIsRunning(true);
    setResult(null);

    try {
      const startTime = Date.now();

      // Call the actual MCP tool testing API
      const response = await fetch(
        `${backendUrl}/xyzen/api/v1/mcps/${server.id}/tools/${toolName}/test`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({
            parameters: JSON.parse(parameters),
          }),
        },
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      if (response.ok) {
        const data = await response.json();
        const testResult = {
          success: data.success,
          result: data.result,
          error: data.error,
          executionTime: data.execution_time_ms || executionTime,
        };
        setResult(testResult);

        // Add to execution history
        addToolExecution({
          serverId: server.id,
          toolName,
          parameters: JSON.parse(parameters),
          result: data.result,
          success: data.success,
          error: data.error,
          executionTime: data.execution_time_ms || executionTime,
        });
      } else {
        const errorData = await response.json();
        const errorResult = {
          success: false,
          error: errorData.detail || "Tool execution failed",
          executionTime,
        };
        setResult(errorResult);

        // Add to execution history
        addToolExecution({
          serverId: server.id,
          toolName,
          parameters: JSON.parse(parameters),
          success: false,
          error: errorData.detail || "Tool execution failed",
          executionTime,
        });
      }
    } catch (error) {
      const networkError = {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
        executionTime: Date.now() - Date.now(),
      };
      setResult(networkError);

      // Add to execution history
      addToolExecution({
        serverId: server.id,
        toolName,
        parameters: JSON.parse(parameters),
        success: false,
        error: error instanceof Error ? error.message : "Network error",
        executionTime: Date.now() - Date.now(),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleClose = () => {
    if (!isRunning) {
      setParameters("{}");
      setResult(null);
      setParametersError(null);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Test MCP Tool"
      maxWidth="max-w-[calc(100vw-200px)]"
    >
      <div className="flex flex-col h-[calc(100vh-200px)] gap-6">
        {/* Main Content Area */}
        <div className="flex flex-1 gap-6 min-h-0">
          {/* Left Panel - Tool Configuration */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tool Info */}
            <div className="rounded-sm bg-neutral-50 p-4 dark:bg-neutral-800/50 mb-6">
              <div className="flex items-center space-x-2 mb-3">
                <CommandLineIcon className="h-5 w-5 text-indigo-500" />
                <h3 className="font-medium text-neutral-900 dark:text-white">
                  Tool Information
                </h3>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Tool Name:
                  </span>
                  <code className="ml-2 rounded bg-neutral-200 px-2 py-1 text-sm font-mono text-indigo-600 dark:bg-neutral-700 dark:text-indigo-400">
                    {toolName}
                  </code>
                </div>
                <div>
                  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Server:
                  </span>
                  <span className="ml-2 text-sm text-neutral-600 dark:text-neutral-400">
                    {server.name} ({server.url})
                  </span>
                </div>
                {toolDescription && (
                  <div>
                    <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                      Description:
                    </span>
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                      {toolDescription}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Parameters Input */}
            <div className="flex-1 flex flex-col min-h-0">
              <label className="mb-3 flex items-center space-x-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                <DocumentTextIcon className="h-4 w-4" />
                <span>Parameters (JSON)</span>
              </label>
              <div
                ref={monacoContainerRef}
                className="flex-1 w-full rounded-sm border border-neutral-300 dark:border-neutral-600 overflow-hidden min-h-[200px]"
              />
              {parametersError && (
                <div className="mt-2 flex items-center space-x-2 text-sm text-red-600 dark:text-red-400">
                  <ExclamationCircleIcon className="h-4 w-4" />
                  <span>{parametersError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Results */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Right Panel Header with Test Button */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="h-5 w-5 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">R</span>
                </div>
                <h3 className="font-medium text-neutral-900 dark:text-white">
                  Test Results
                </h3>
              </div>

              {/* Test Button in Right Top Corner */}
              <Button
                onClick={handleTestTool}
                disabled={isRunning || !!parametersError}
                className="inline-flex items-center gap-2 rounded-sm bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all hover:from-indigo-500 hover:to-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunning ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Running...
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-4 w-4" />
                    Test Tool
                  </>
                )}
              </Button>
            </div>

            {/* Results Display Area */}
            <div className="flex-1 overflow-y-auto min-w-0">
              <AnimatePresence mode="wait">
                {isRunning && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center justify-center h-64 text-center"
                  >
                    <LoadingSpinner size="lg" centered />
                    <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
                      Executing tool...
                    </p>
                  </motion.div>
                )}

                {!isRunning && !result && (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center justify-center h-64 text-center"
                  >
                    <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-6 mb-4">
                      <PlayIcon className="h-12 w-12 text-neutral-400 dark:text-neutral-500" />
                    </div>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      Click "Test Tool" to see results here
                    </p>
                  </motion.div>
                )}

                {!isRunning && result && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3 }}
                    className={`rounded-sm border p-4 ${
                      result.success
                        ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                        : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
                    }`}
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <h4
                        className={`font-semibold ${
                          result.success
                            ? "text-green-800 dark:text-green-300"
                            : "text-red-800 dark:text-red-300"
                        }`}
                      >
                        {result.success ? "✅ Success" : "❌ Error"}
                      </h4>
                      {result.executionTime && (
                        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded">
                          {result.executionTime}ms
                        </span>
                      )}
                    </div>

                    <div className="space-y-4">
                      {result.success &&
                        result.result !== null &&
                        result.result !== undefined && (
                          <div>
                            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2 block">
                              Result:
                            </span>
                            <pre className="overflow-auto rounded-sm bg-neutral-900 p-4 text-sm text-green-400 dark:bg-neutral-800 max-h-96 whitespace-pre-wrap break-words">
                              {typeof result.result === "string"
                                ? result.result
                                : (JSON.stringify(result.result, null, 2) ??
                                  "null")}
                            </pre>
                          </div>
                        )}

                      {!result.success && result.error && (
                        <div>
                          <span className="text-sm font-medium text-red-700 dark:text-red-300 mb-2 block">
                            Error:
                          </span>
                          <pre className="overflow-auto rounded-sm bg-neutral-900 p-4 text-sm text-red-400 dark:bg-neutral-800 max-h-96 whitespace-pre-wrap break-words">
                            {result.error}
                          </pre>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Fixed Bottom Area with Close Button */}
        <div className="flex-shrink-0 flex justify-end pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <Button
            onClick={handleClose}
            disabled={isRunning}
            className="rounded-sm bg-neutral-200 px-6 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-500 focus:ring-offset-2 disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
          >
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};
