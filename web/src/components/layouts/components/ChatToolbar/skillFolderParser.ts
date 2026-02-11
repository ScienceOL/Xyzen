import type { SkillCreateRequest, SkillResourceInput } from "@/types/skills";

export interface ParsedSkillFolder {
  name: string;
  description: string;
  skill_md: string;
  resources: SkillResourceInput[];
}

export interface ParseSkillFolderSuccess {
  ok: true;
  payload: ParsedSkillFolder;
}

export interface ParseSkillFolderFailure {
  ok: false;
  errors: string[];
}

export type ParseSkillFolderResult =
  | ParseSkillFolderSuccess
  | ParseSkillFolderFailure;

export const MAX_SKILL_RESOURCE_FILES = 200;
export const MAX_SKILL_RESOURCE_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_SKILL_RESOURCE_TOTAL_BYTES = 25 * 1024 * 1024;

const IGNORED_FILE_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

const IGNORED_DIRECTORIES = new Set([
  "__MACOSX",
  "__pycache__",
  ".git",
  ".svn",
  ".hg",
]);

function stripRootDirectory(rawPath: string): string {
  const normalized = rawPath.replace(/\\+/g, "/").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("/")) {
    return normalized;
  }

  const parts = normalized.split("/").filter((part) => part.length > 0);
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }

  if (parts[0] === "." || parts[0] === "..") {
    return parts.join("/");
  }

  return parts.slice(1).join("/");
}

export function normalizeSkillRelativePath(rawPath: string): string {
  const path = stripRootDirectory(rawPath).trim();

  if (!path) {
    throw new Error("Path is empty after normalization");
  }

  if (path.startsWith("/")) {
    throw new Error("Path must be relative");
  }

  const parts = path.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("Path contains invalid segments");
  }

  return parts.join("/");
}

function normalizePathWithoutRootStripping(rawPath: string): string {
  const normalized = rawPath.replace(/\\+/g, "/").trim();
  if (!normalized) {
    throw new Error("Path is empty after normalization");
  }
  if (normalized.startsWith("/")) {
    throw new Error("Path must be relative");
  }

  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("Path contains invalid segments");
  }

  return parts.join("/");
}

function isIgnoredPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((part) => IGNORED_DIRECTORIES.has(part))) {
    return true;
  }

  const fileName = parts[parts.length - 1] ?? "";
  if (IGNORED_FILE_NAMES.has(fileName)) {
    return true;
  }
  if (fileName.endsWith(".pyc")) {
    return true;
  }
  return false;
}

function hasPrefix(pathParts: string[], prefixParts: string[]): boolean {
  if (prefixParts.length > pathParts.length) {
    return false;
  }

  for (let index = 0; index < prefixParts.length; index += 1) {
    if (pathParts[index] !== prefixParts[index]) {
      return false;
    }
  }
  return true;
}

async function readTextFileStrict(
  file: File,
): Promise<{ content: string; byteLength: number }> {
  let text: string;
  let byteLength: number;
  if (typeof file.text === "function") {
    text = await file.text();
    byteLength = new TextEncoder().encode(text).byteLength;
  } else if (typeof file.arrayBuffer === "function") {
    const arrayBuffer = await file.arrayBuffer();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    text = decoder.decode(arrayBuffer);
    byteLength = arrayBuffer.byteLength;
  } else if (typeof FileReader !== "undefined") {
    text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => {
        reject(new Error("FileReader failed to read file"));
      };
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("FileReader returned non-text result"));
          return;
        }
        resolve(result);
      };
      reader.readAsText(file, "utf-8");
    });
    byteLength = new TextEncoder().encode(text).byteLength;
  } else {
    throw new Error("File text reader is unavailable");
  }

  if (text.includes("\u0000")) {
    throw new Error("File contains NUL bytes");
  }

  let disallowedControlChars = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const isDisallowedControl =
      (code >= 0x01 && code <= 0x08) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f);
    if (isDisallowedControl) {
      disallowedControlChars += 1;
    }
  }
  if (text.length > 0 && disallowedControlChars / text.length > 0.05) {
    throw new Error("File appears to be binary content");
  }

  return { content: text, byteLength };
}

export async function parseSkillFolderFiles(
  files: File[],
): Promise<ParseSkillFolderResult> {
  if (!files.length) {
    return {
      ok: false,
      errors: ["No files were selected. Please upload a skill folder."],
    };
  }

  const errors: string[] = [];
  const resourceMap = new Map<string, string>();
  const seenPaths = new Set<string>();
  let resourceCount = 0;
  let totalResourceBytes = 0;

  const preparedFiles: Array<{
    file: File;
    normalizedPath: string;
    parts: string[];
  }> = [];

  for (const file of files) {
    const candidatePath = file.webkitRelativePath || file.name;

    let normalizedPath: string;
    try {
      normalizedPath = normalizePathWithoutRootStripping(candidatePath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "invalid path";
      errors.push(`${candidatePath}: ${detail}`);
      continue;
    }

    if (isIgnoredPath(normalizedPath)) {
      continue;
    }

    preparedFiles.push({
      file,
      normalizedPath,
      parts: normalizedPath.split("/"),
    });
  }

  const skillPathCandidates = preparedFiles.filter((entry) => {
    const fileName = entry.parts[entry.parts.length - 1];
    return fileName === "SKILL.md";
  });

  if (skillPathCandidates.length === 0) {
    errors.push("Missing SKILL.md at folder root");
    return {
      ok: false,
      errors,
    };
  }

  if (skillPathCandidates.length > 1) {
    errors.push("Multiple SKILL.md files detected");
    return {
      ok: false,
      errors,
    };
  }

  const skillRootParts = skillPathCandidates[0].parts.slice(0, -1);

  let skillMdContent: string | null = null;
  let skillMdCount = 0;

  for (const prepared of preparedFiles) {
    if (!hasPrefix(prepared.parts, skillRootParts)) {
      continue;
    }

    const relativeParts = prepared.parts.slice(skillRootParts.length);
    if (relativeParts.length === 0) {
      continue;
    }
    const relativePath = relativeParts.join("/");

    if (seenPaths.has(relativePath)) {
      errors.push(`${relativePath}: duplicate file path detected`);
      continue;
    }
    seenPaths.add(relativePath);

    const fileName = relativePath.split("/").pop();
    if (relativePath !== "SKILL.md" && fileName === "SKILL.md") {
      errors.push(`${relativePath}: SKILL.md must be located at the root`);
      continue;
    }

    let content: string;
    let byteLength: number;
    try {
      const fileData = await readTextFileStrict(prepared.file);
      content = fileData.content;
      byteLength = fileData.byteLength;
    } catch {
      errors.push(`${relativePath}: file is not readable as UTF-8 text`);
      continue;
    }

    if (relativePath === "SKILL.md") {
      skillMdCount += 1;
      skillMdContent = content;
      continue;
    }

    resourceCount += 1;
    if (resourceCount > MAX_SKILL_RESOURCE_FILES) {
      errors.push(
        `Too many resource files: ${resourceCount} (max ${MAX_SKILL_RESOURCE_FILES})`,
      );
      continue;
    }

    if (byteLength > MAX_SKILL_RESOURCE_FILE_BYTES) {
      errors.push(
        `${relativePath}: file exceeds max size ${MAX_SKILL_RESOURCE_FILE_BYTES} bytes`,
      );
      continue;
    }

    totalResourceBytes += byteLength;
    if (totalResourceBytes > MAX_SKILL_RESOURCE_TOTAL_BYTES) {
      errors.push(
        `Total resource size exceeds max ${MAX_SKILL_RESOURCE_TOTAL_BYTES} bytes`,
      );
      continue;
    }

    resourceMap.set(relativePath, content);
  }

  if (skillMdCount === 0) {
    errors.push("Missing SKILL.md at folder root");
  }

  if (errors.length > 0 || !skillMdContent) {
    return {
      ok: false,
      errors,
    };
  }

  const resources = Array.from(resourceMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => ({ path, content }));

  return {
    ok: true,
    payload: {
      name: "",
      description: "",
      skill_md: skillMdContent,
      resources,
    },
  };
}

export function buildSkillCreateRequest(
  parsed: ParsedSkillFolder,
  parsedName: string,
  parsedDescription: string,
): SkillCreateRequest {
  return {
    name: parsedName,
    description: parsedDescription,
    skill_md: parsed.skill_md,
    resources: parsed.resources,
    compatibility: null,
    license: null,
    metadata_json: null,
  };
}
