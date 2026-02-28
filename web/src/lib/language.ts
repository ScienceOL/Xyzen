/**
 * Shared file-language detection utilities.
 *
 * Used by SandboxWorkspace, FileEditor, and anywhere that needs to map
 * a filename to a Monaco language identifier.
 */

export const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  swift: "swift",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "ini",
  xml: "xml",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  sql: "sql",
  dockerfile: "dockerfile",
  makefile: "plaintext",
  graphql: "graphql",
  prisma: "plaintext",
  env: "plaintext",
  txt: "plaintext",
};

/** Return the Monaco language id for a given filename. */
export function getLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "plaintext";
  const ext = lower.split(".").pop() ?? "";
  return EXT_TO_LANGUAGE[ext] ?? "plaintext";
}

const TEXT_CONTENT_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/javascript",
  "application/typescript",
  "application/xhtml+xml",
  "application/sql",
  "application/graphql",
  "application/toml",
]);

/**
 * Returns true when a file can be opened in the text editor.
 *
 * Detection is based on either the file extension (matches anything in
 * EXT_TO_LANGUAGE) or the content-type header.
 */
export function isTextFile(
  filename: string,
  contentType?: string | null,
): boolean {
  // Extension-based check
  const lower = filename.toLowerCase();
  if (lower === "dockerfile" || lower === "makefile") return true;
  const ext = lower.split(".").pop() ?? "";
  if (ext in EXT_TO_LANGUAGE) return true;

  // Content-type–based check
  if (contentType) {
    if (contentType.startsWith("text/")) return true;
    if (TEXT_CONTENT_TYPES.has(contentType)) return true;
  }

  return false;
}
