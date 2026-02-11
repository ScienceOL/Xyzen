import { Modal } from "@/components/animate-ui/components/animate/modal";
import { cn } from "@/lib/utils";
import { skillService } from "@/service/skillService";
import type { SkillRead } from "@/types/skills";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildSkillCreateRequest,
  parseSkillFolderFiles,
  type ParsedSkillFolder,
} from "./skillFolderParser";
import { createAndAttachSkill } from "./skillActions";

interface CreateSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId?: string | null;
  onCreated?: (skill: SkillRead) => Promise<void> | void;
}

interface ParsedSkillMetadata {
  name: string;
  description: string;
  resourcesCount: number;
}

interface WebkitDirectoryReaderLike {
  readEntries: (
    success: (entries: WebkitEntry[]) => void,
    error?: (error: DOMException | Error) => void,
  ) => void;
}

interface WebkitEntry {
  isFile?: boolean;
  isDirectory?: boolean;
  name?: string;
  file?: (
    success: (file: File) => void,
    error?: (error: DOMException | Error) => void,
  ) => void;
  createReader?: () => WebkitDirectoryReaderLike;
}

interface DroppedSkillFilesResult {
  files: File[];
  rootName: string | null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unknown error";
}

function inferRootName(files: File[]): string | null {
  for (const file of files) {
    const relativePath = (file as File & { webkitRelativePath?: string })
      .webkitRelativePath;
    if (relativePath && relativePath.includes("/")) {
      const [root] = relativePath.split("/");
      return root || null;
    }
  }
  return null;
}

function attachRelativePath(file: File, relativePath: string): File {
  try {
    Object.defineProperty(file, "webkitRelativePath", {
      value: relativePath,
      configurable: true,
    });
  } catch {
    // Ignore if runtime does not allow redefining the property.
  }
  return file;
}

async function readFileEntry(entry: WebkitEntry): Promise<File> {
  if (typeof entry.file !== "function") {
    throw new Error("Invalid dropped file entry");
  }

  return new Promise<File>((resolve, reject) => {
    entry.file?.(resolve, reject);
  });
}

async function readAllDirectoryEntries(
  reader: WebkitDirectoryReaderLike,
): Promise<WebkitEntry[]> {
  const entries: WebkitEntry[] = [];

  while (true) {
    const chunk = await new Promise<WebkitEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (chunk.length === 0) {
      break;
    }
    entries.push(...chunk);
  }

  return entries;
}

async function collectFilesFromEntry(
  entry: WebkitEntry,
  parentPath = "",
): Promise<File[]> {
  const entryName = entry.name ?? "";
  const currentPath = [parentPath, entryName].filter(Boolean).join("/");

  if (entry.isFile) {
    const file = await readFileEntry(entry);
    const relativePath = currentPath || file.name;
    return [attachRelativePath(file, relativePath)];
  }

  if (entry.isDirectory) {
    const reader = entry.createReader?.();
    if (!reader) {
      return [];
    }
    const children = await readAllDirectoryEntries(reader);
    const nestedFiles = await Promise.all(
      children.map((child) => collectFilesFromEntry(child, currentPath)),
    );
    return nestedFiles.flat();
  }

  return [];
}

async function extractDroppedSkillFiles(
  dataTransfer: DataTransfer,
): Promise<DroppedSkillFilesResult> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries: WebkitEntry[] = [];
  for (const item of items) {
    const itemWithEntry = item as unknown as {
      webkitGetAsEntry?: () => unknown;
    };
    if (typeof itemWithEntry.webkitGetAsEntry !== "function") {
      continue;
    }
    const entry = itemWithEntry.webkitGetAsEntry();
    if (entry) {
      entries.push(entry as WebkitEntry);
    }
  }

  const hasDirectoryEntry = entries.some((entry) => entry.isDirectory);
  if (hasDirectoryEntry) {
    const files = (
      await Promise.all(entries.map((entry) => collectFilesFromEntry(entry)))
    ).flat();
    const rootDirectory = entries.find(
      (entry) => entry.isDirectory && entry.name && entry.name.length > 0,
    );
    return {
      files,
      rootName: rootDirectory?.name ?? inferRootName(files),
    };
  }

  const files = Array.from(dataTransfer.files ?? []);
  return {
    files,
    rootName: inferRootName(files),
  };
}

export function CreateSkillModal({
  isOpen,
  onClose,
  agentId,
  onCreated,
}: CreateSkillModalProps) {
  const { t } = useTranslation();
  const directoryInputRef = useRef<HTMLInputElement | null>(null);

  const [folderName, setFolderName] = useState<string>("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [parsedFolder, setParsedFolder] = useState<ParsedSkillFolder | null>(
    null,
  );
  const [metadataPreview, setMetadataPreview] =
    useState<ParsedSkillMetadata | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setFolderName("");
      setParseErrors([]);
      setCreateError(null);
      setIsParsing(false);
      setIsCreating(false);
      setIsDragActive(false);
      setParsedFolder(null);
      setMetadataPreview(null);
      if (directoryInputRef.current) {
        directoryInputRef.current.value = "";
      }
    }
  }, [isOpen]);

  const canCreate = useMemo(
    () => !isParsing && !isCreating && !!parsedFolder && !!metadataPreview,
    [isParsing, isCreating, parsedFolder, metadataPreview],
  );

  const openDirectoryPicker = () => {
    if (!directoryInputRef.current) return;

    directoryInputRef.current.setAttribute("webkitdirectory", "");
    directoryInputRef.current.setAttribute("directory", "");
    directoryInputRef.current.click();
  };

  const processSelectedFiles = useCallback(
    async (files: File[], rootName: string | null = null) => {
      if (!files.length) return;

      setIsParsing(true);
      setCreateError(null);
      setParseErrors([]);
      setParsedFolder(null);
      setMetadataPreview(null);

      if (rootName?.trim()) {
        setFolderName(rootName);
      } else {
        const firstRelative = files[0].webkitRelativePath;
        if (firstRelative) {
          const firstRoot = firstRelative.split("/")[0];
          setFolderName(
            firstRoot || t("app.toolbar.skills.unknownFolder", "folder"),
          );
        } else {
          setFolderName(t("app.toolbar.skills.unknownFolder", "folder"));
        }
      }

      try {
        const parsedResult = await parseSkillFolderFiles(files);
        if (!parsedResult.ok) {
          setParseErrors(parsedResult.errors);
          return;
        }

        const payload = parsedResult.payload;
        const parseResponse = await skillService.parseSkill({
          skill_md: payload.skill_md,
          resources: payload.resources,
        });

        if (!parseResponse.valid) {
          setParseErrors([
            parseResponse.error ||
              t(
                "app.toolbar.skills.parseFailed",
                "SKILL.md validation failed in backend",
              ),
          ]);
          return;
        }

        const parsedName = parseResponse.name?.trim();
        const parsedDescription = parseResponse.description?.trim();

        if (!parsedName || !parsedDescription) {
          setParseErrors([
            t(
              "app.toolbar.skills.missingParsedMetadata",
              "Missing parsed skill name or description",
            ),
          ]);
          return;
        }

        setParsedFolder(payload);
        setMetadataPreview({
          name: parsedName,
          description: parsedDescription,
          resourcesCount: payload.resources.length,
        });
      } catch (error) {
        setParseErrors([
          toErrorMessage(error) ||
            t(
              "app.toolbar.skills.parseUnexpected",
              "Failed to parse skill folder",
            ),
        ]);
      } finally {
        setIsParsing(false);
      }
    },
    [t],
  );

  const handleFolderSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    const firstRelative = files[0].webkitRelativePath;
    const rootName = firstRelative ? firstRelative.split("/")[0] || null : null;
    await processSelectedFiles(files, rootName);
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isParsing || isCreating) return;
    setIsDragActive(true);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isParsing || isCreating) return;
    event.dataTransfer.dropEffect = "copy";
    if (!isDragActive) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setIsDragActive(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);
    if (isParsing || isCreating) return;

    setCreateError(null);
    setParseErrors([]);
    try {
      const dropped = await extractDroppedSkillFiles(event.dataTransfer);
      if (!dropped.files.length) {
        setParseErrors([
          t(
            "app.toolbar.skills.dropEmpty",
            "No files were detected in the dropped folder.",
          ),
        ]);
        return;
      }
      await processSelectedFiles(dropped.files, dropped.rootName);
    } catch (error) {
      setParseErrors([
        toErrorMessage(error) ||
          t(
            "app.toolbar.skills.parseUnexpected",
            "Failed to parse skill folder",
          ),
      ]);
    }
  };

  const handleCreate = async () => {
    if (!parsedFolder || !metadataPreview) {
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const request = buildSkillCreateRequest(
        parsedFolder,
        metadataPreview.name,
        metadataPreview.description,
      );

      const created = agentId
        ? await createAndAttachSkill(agentId, request)
        : await skillService.createSkill(request);
      await onCreated?.(created);
      onClose();
    } catch (error) {
      setCreateError(
        toErrorMessage(error) ||
          t("app.toolbar.skills.createFailed", "Failed to create skill"),
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isParsing && !isCreating) {
          onClose();
        }
      }}
      title={t("app.toolbar.skills.createTitle", "Create Skill")}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300">
          {t(
            "app.toolbar.skills.uploadHint",
            "Upload a skill folder containing SKILL.md at the root and text resources.",
          )}
        </div>

        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "rounded-md border border-dashed px-3 py-4 text-center text-sm transition-colors",
            "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300",
            isDragActive &&
              "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/20 dark:text-indigo-300",
            (isParsing || isCreating) && "pointer-events-none opacity-60",
          )}
        >
          {isDragActive
            ? t("app.toolbar.skills.dropActive", "Drop folder to upload")
            : t(
                "app.toolbar.skills.dropHint",
                "Or drag and drop a skill folder here",
              )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openDirectoryPicker}
            disabled={isParsing || isCreating}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isParsing
              ? t("app.toolbar.skills.parsing", "Parsing...")
              : t("app.toolbar.skills.selectFolder", "Select Folder")}
          </button>

          {folderName && (
            <span className="text-sm text-neutral-600 dark:text-neutral-300">
              {t("app.toolbar.skills.selectedFolder", "Selected")}: {folderName}
            </span>
          )}
        </div>

        <input
          ref={directoryInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFolderSelect}
        />

        {parseErrors.length > 0 && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
            <div className="font-medium">
              {t("app.toolbar.skills.validationErrors", "Validation errors")}
            </div>
            <ul className="mt-2 list-disc pl-5">
              {parseErrors.map((error, index) => (
                <li key={`${error}-${index}`}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {metadataPreview && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800/60 dark:bg-green-900/20 dark:text-green-200">
            <div className="font-medium">
              {t("app.toolbar.skills.previewTitle", "Parsed Skill Preview")}
            </div>
            <div className="mt-2 space-y-1">
              <div>
                <span className="font-medium">
                  {t("app.toolbar.skills.previewName", "Name")}:
                </span>
                {metadataPreview.name}
              </div>
              <div>
                <span className="font-medium">
                  {t("app.toolbar.skills.previewDescription", "Description")}:
                </span>
                {metadataPreview.description}
              </div>
              <div>
                <span className="font-medium">
                  {t("app.toolbar.skills.previewResources", "Resources")}:
                </span>
                {metadataPreview.resourcesCount}
              </div>
            </div>
          </div>
        )}

        {createError && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
            {createError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isParsing || isCreating}
            className="rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating
              ? t("app.toolbar.skills.creating", "Creating...")
              : t("app.toolbar.skills.createAction", "Create Skill")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default CreateSkillModal;
