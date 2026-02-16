import { fileService, type UploadHandle } from "@/service/fileService";
import { folderService, type Folder } from "@/service/folderService";
import type { FileTreeItem } from "@/service/folderService";
import { knowledgeSetService } from "@/service/knowledgeSetService";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileList, type FileListHandle } from "./FileList";
import { DRAG_MIME } from "./FileTreeView";
import { KnowledgeToolbar } from "./KnowledgeToolbar";
import { StatusBar } from "./StatusBar";
import type { StorageStats, ViewMode } from "./types";
import { UploadProgress, type UploadItem } from "./UploadProgress";

/**
 * Given a desired name and a set of existing names in the same directory,
 * return a unique name by appending " (1)", " (2)", etc. when needed.
 */
const getUniqueFilename = (name: string, existingNames: string[]): string => {
  if (!existingNames.includes(name)) return name;

  const dotIdx = name.lastIndexOf(".");
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : "";

  let counter = 1;
  let candidate: string;
  do {
    candidate = `${base} (${counter})${ext}`;
    counter++;
  } while (existingNames.includes(candidate));

  return candidate;
};

/**
 * Recursively read all files from a FileSystemEntry tree.
 * Returns files paired with their relative path (e.g. "folder/sub/file.txt").
 */
async function readEntriesRecursive(
  entry: FileSystemEntry,
  basePath = "",
): Promise<{ file: File; relativePath: string }[]> {
  const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    return [{ file, relativePath: currentPath }];
  }

  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const results: { file: File; relativePath: string }[] = [];

    // readEntries may return batches; keep reading until empty
    let batch: FileSystemEntry[];
    do {
      batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        dirReader.readEntries(
          resolve as (entries: FileSystemEntry[]) => void,
          reject,
        );
      });
      for (const child of batch) {
        const childResults = await readEntriesRecursive(child, currentPath);
        results.push(...childResults);
      }
    } while (batch.length > 0);

    return results;
  }

  return [];
}

export interface KnowledgeFilePanelProps {
  knowledgeSetId: string;
  /** Show toolbar with breadcrumbs, view mode, upload, etc. */
  showToolbar?: boolean;
  /** Show status bar with file count and storage stats */
  showStatusBar?: boolean;
  /** Enable file uploads (drag-drop + button) */
  enableUpload?: boolean;
  /** Mobile menu button handler (hamburger to reopen sidebar) */
  onMenuClick?: () => void;
}

/**
 * Self-contained knowledge set file panel.
 *
 * Manages its own tree data fetching (no global store dependency) and renders
 * `FileList` with `filter="knowledge"`. Used by both the knowledge base Layout
 * and the Capsule KnowledgeTab.
 */
export function KnowledgeFilePanel({
  knowledgeSetId,
  showToolbar = true,
  showStatusBar = true,
  enableUpload = true,
  onMenuClick,
}: KnowledgeFilePanelProps) {
  const { t } = useTranslation();

  // ── Tree state (self-contained) ───────────────────────────────────
  const [treeItems, setTreeItems] = useState<FileTreeItem[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeSignal, setTreeSignal] = useState(0);

  // ── Navigation state ──────────────────────────────────────────────
  const [folderId, setFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [knowledgeSetName, setKnowledgeSetName] = useState<string | null>(null);

  // ── Misc state ────────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFileListLoading, setIsFileListLoading] = useState(false);
  const [currentFileCount, setCurrentFileCount] = useState(0);

  // ── Stats ─────────────────────────────────────────────────────────
  const [stats, setStats] = useState<StorageStats>({
    total: 0,
    used: 0,
    fileCount: 0,
    usagePercentage: 0,
    availableBytes: 0,
    maxFileSize: 100 * 1024 * 1024,
  });

  // ── Upload state ──────────────────────────────────────────────────
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const uploadHandlesRef = useRef<Map<string, UploadHandle>>(new Map());

  // ── Drag state ────────────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // ── Refs ───────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileListRef = useRef<FileListHandle>(null);

  // ── Fetch tree ────────────────────────────────────────────────────
  useEffect(() => {
    if (!knowledgeSetId) {
      setTreeItems([]);
      return;
    }

    let cancelled = false;
    setTreeLoading(true);

    folderService
      .getTree(knowledgeSetId)
      .then((items) => {
        if (!cancelled) {
          setTreeItems(items);
          setTreeLoading(false);
        }
      })
      .catch((e) => {
        console.error("Failed to fetch knowledge tree", e);
        if (!cancelled) setTreeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [knowledgeSetId, treeSignal]);

  // ── Fetch knowledge set name ──────────────────────────────────────
  useEffect(() => {
    if (!knowledgeSetId) {
      setKnowledgeSetName(null);
      return;
    }
    let cancelled = false;
    knowledgeSetService
      .getKnowledgeSet(knowledgeSetId)
      .then((ks) => {
        if (!cancelled) setKnowledgeSetName(ks.name);
      })
      .catch((e) => {
        console.error("Failed to fetch knowledge set name", e);
      });
    return () => {
      cancelled = true;
    };
  }, [knowledgeSetId]);

  // ── Fetch breadcrumbs ─────────────────────────────────────────────
  useEffect(() => {
    if (!folderId) {
      setBreadcrumbs([]);
      return;
    }
    folderService
      .getFolderPath(folderId)
      .then(setBreadcrumbs)
      .catch((e) => console.error("Failed to fetch breadcrumbs", e));
  }, [folderId]);

  // ── Fetch stats ───────────────────────────────────────────────────
  useEffect(() => {
    if (!showStatusBar && !enableUpload) return;
    const fetchStats = async () => {
      try {
        const data = await fileService.getStorageStats();
        setStats({
          used: data.quota.storage.used_bytes,
          total: data.quota.storage.limit_bytes,
          fileCount: data.quota.file_count.used,
          usagePercentage: data.quota.storage.usage_percentage,
          availableBytes: data.quota.storage.available_bytes,
          maxFileSize: data.quota.max_file_size.bytes,
        });
      } catch (error) {
        console.error("Stats fetch failed", error);
      }
    };
    fetchStats();
  }, [refreshKey, showStatusBar, enableUpload]);

  // ── Reset folder when knowledgeSetId changes ──────────────────────
  useEffect(() => {
    setFolderId(null);
  }, [knowledgeSetId]);

  // ── Optimistic tree mutations (local state) ───────────────────────
  const removeTreeItems = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setTreeItems((prev) => prev.filter((i) => !idSet.has(i.id)));
  }, []);

  const renameTreeItem = useCallback((id: string, newName: string) => {
    setTreeItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, name: newName } : i)),
    );
  }, []);

  // ── Refresh helpers ───────────────────────────────────────────────
  const refreshTree = useCallback(() => {
    setTreeSignal((s) => s + 1);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    refreshTree();
  }, [refreshTree]);

  // ── Stats optimistic update ───────────────────────────────────────
  const handleStatsUpdate = useCallback(
    (deletedBytes: number, deletedFileCount: number) => {
      setStats((prev) => {
        const newUsed = Math.max(0, prev.used - deletedBytes);
        const newFileCount = Math.max(0, prev.fileCount - deletedFileCount);
        const newAvailable = prev.total - newUsed;
        const newPercentage = prev.total > 0 ? (newUsed / prev.total) * 100 : 0;
        return {
          ...prev,
          used: newUsed,
          fileCount: newFileCount,
          availableBytes: newAvailable,
          usagePercentage: newPercentage,
        };
      });
    },
    [],
  );

  // ── Navigation ────────────────────────────────────────────────────
  const navigateToFolder = useCallback((id: string | null) => {
    setFolderId(id);
  }, []);

  // ── Folder creation ───────────────────────────────────────────────
  const handleCreateFolder = useCallback(() => {
    if (fileListRef.current) {
      fileListRef.current.createFolder(folderId);
    }
  }, [folderId]);

  // ── Breadcrumb drop ───────────────────────────────────────────────
  const handleDropOnBreadcrumb = useCallback(
    async (itemIds: string[], targetFolderId: string | null) => {
      if (fileListRef.current) {
        fileListRef.current.moveItems(itemIds, targetFolderId);
      }
    },
    [],
  );

  // ── Upload logic ──────────────────────────────────────────────────
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const parentId = folderId || null;

      let existingNames: string[] = [];
      try {
        const existingFiles = await fileService.listFiles({
          parent_id: parentId,
          filter_by_parent: true,
          limit: 1000,
          offset: 0,
        });
        existingNames = existingFiles.map((f) => f.original_filename);
      } catch {
        // proceed without dedup
      }

      for (const file of files) {
        if (stats.maxFileSize && file.size > stats.maxFileSize) {
          const maxSizeMB = (stats.maxFileSize / (1024 * 1024)).toFixed(0);
          const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
          alert(
            t("knowledge.upload.errors.fileTooLarge", {
              name: file.name,
              fileSizeMB,
              maxSizeMB,
            }),
          );
          continue;
        }

        if (
          stats.availableBytes !== undefined &&
          file.size > stats.availableBytes
        ) {
          const availableMB = (stats.availableBytes / (1024 * 1024)).toFixed(2);
          const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
          alert(
            t("knowledge.upload.errors.notEnoughStorage", {
              fileSizeMB,
              availableMB,
            }),
          );
          continue;
        }

        const uniqueName = getUniqueFilename(file.name, existingNames);
        existingNames.push(uniqueName);
        const uploadFile =
          uniqueName !== file.name
            ? new File([file], uniqueName, { type: file.type })
            : file;

        const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const uploadItem: UploadItem = {
          id: uploadId,
          fileName: uniqueName,
          progress: 0,
          status: "uploading",
        };

        setUploads((prev) => [...prev, uploadItem]);

        const handle = fileService.uploadFileWithProgress(
          uploadFile,
          "private",
          undefined,
          parentId,
          knowledgeSetId,
          (progress) => {
            setUploads((prev) =>
              prev.map((u) =>
                u.id === uploadId ? { ...u, progress: progress.percentage } : u,
              ),
            );
          },
        );

        uploadHandlesRef.current.set(uploadId, handle);

        handle.promise
          .then(() => {
            setUploads((prev) =>
              prev.map((u) =>
                u.id === uploadId
                  ? { ...u, status: "completed", progress: 100 }
                  : u,
              ),
            );
            uploadHandlesRef.current.delete(uploadId);
            setRefreshKey((prev) => prev + 1);
            refreshTree();
          })
          .catch((error: Error) => {
            if (error.message === "Upload cancelled") {
              setUploads((prev) =>
                prev.map((u) =>
                  u.id === uploadId ? { ...u, status: "cancelled" } : u,
                ),
              );
            } else {
              setUploads((prev) =>
                prev.map((u) =>
                  u.id === uploadId
                    ? { ...u, status: "error", error: error.message }
                    : u,
                ),
              );
            }
            uploadHandlesRef.current.delete(uploadId);
          });
      }
    },
    [folderId, knowledgeSetId, stats, t, refreshTree],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFolderUploadClick = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      await uploadFiles(files);
      e.target.value = "";
    }
  };

  /**
   * Upload files preserving their directory structure.
   * Accepts an array of { file, relativePath } where relativePath includes
   * the folder hierarchy (e.g. "MyFolder/sub/file.txt").
   * Creates folders on the backend first, then uploads each file into its parent.
   */
  const uploadFilesWithStructure = useCallback(
    async (entries: { file: File; relativePath: string }[]) => {
      if (entries.length === 0) return;

      const rootParentId = folderId || null;

      // Build unique directory paths from relative paths
      const dirPaths = new Set<string>();
      for (const { relativePath } of entries) {
        const parts = relativePath.split("/");
        for (let i = 1; i < parts.length; i++) {
          dirPaths.add(parts.slice(0, i).join("/"));
        }
      }

      // Sort by depth so parents are created before children
      const sortedDirs = Array.from(dirPaths).sort(
        (a, b) => a.split("/").length - b.split("/").length,
      );

      // Create folders sequentially (parent before child)
      const folderIdMap = new Map<string, string>();
      for (const dirPath of sortedDirs) {
        const parts = dirPath.split("/");
        const folderName = parts[parts.length - 1];
        const parentPath =
          parts.length > 1 ? parts.slice(0, -1).join("/") : null;
        const parentId = parentPath
          ? (folderIdMap.get(parentPath) ?? null)
          : rootParentId;

        try {
          const folder = await folderService.createFolder({
            name: folderName,
            parent_id: parentId,
          });
          folderIdMap.set(dirPath, folder.id);
        } catch (err) {
          console.error(`Failed to create folder: ${dirPath}`, err);
        }
      }

      // Upload each file into its correct parent folder
      for (const { file, relativePath } of entries) {
        const parts = relativePath.split("/");
        const parentDirPath =
          parts.length > 1 ? parts.slice(0, -1).join("/") : null;
        const parentId = parentDirPath
          ? (folderIdMap.get(parentDirPath) ?? rootParentId)
          : rootParentId;

        if (stats.maxFileSize && file.size > stats.maxFileSize) continue;
        if (
          stats.availableBytes !== undefined &&
          file.size > stats.availableBytes
        )
          continue;

        const baseName = parts[parts.length - 1];
        const uploadFile = new File([file], baseName, { type: file.type });

        const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const uploadItem: UploadItem = {
          id: uploadId,
          fileName: baseName,
          progress: 0,
          status: "uploading",
        };
        setUploads((prev) => [...prev, uploadItem]);

        const handle = fileService.uploadFileWithProgress(
          uploadFile,
          "private",
          undefined,
          parentId,
          knowledgeSetId,
          (progress) => {
            setUploads((prev) =>
              prev.map((u) =>
                u.id === uploadId ? { ...u, progress: progress.percentage } : u,
              ),
            );
          },
        );

        uploadHandlesRef.current.set(uploadId, handle);

        handle.promise
          .then(() => {
            setUploads((prev) =>
              prev.map((u) =>
                u.id === uploadId
                  ? { ...u, status: "completed", progress: 100 }
                  : u,
              ),
            );
            uploadHandlesRef.current.delete(uploadId);
            setRefreshKey((prev) => prev + 1);
            refreshTree();
          })
          .catch((error: Error) => {
            if (error.message === "Upload cancelled") {
              setUploads((prev) =>
                prev.map((u) =>
                  u.id === uploadId ? { ...u, status: "cancelled" } : u,
                ),
              );
            } else {
              setUploads((prev) =>
                prev.map((u) =>
                  u.id === uploadId
                    ? { ...u, status: "error", error: error.message }
                    : u,
                ),
              );
            }
            uploadHandlesRef.current.delete(uploadId);
          });
      }
    },
    [folderId, knowledgeSetId, stats, refreshTree],
  );

  /**
   * Handle folder upload via webkitdirectory input.
   */
  const handleFolderChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;

      const files = Array.from(e.target.files);
      e.target.value = "";

      const entries = files
        .map((file) => {
          const rel = (file as File & { webkitRelativePath?: string })
            .webkitRelativePath;
          if (!rel) return null;
          return { file, relativePath: rel };
        })
        .filter(Boolean) as { file: File; relativePath: string }[];

      await uploadFilesWithStructure(entries);
    },
    [uploadFilesWithStructure],
  );

  const handleCancelUpload = useCallback((uploadId: string) => {
    const handle = uploadHandlesRef.current.get(uploadId);
    if (handle) handle.abort();
  }, []);

  const handleDismissUpload = useCallback((uploadId: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== uploadId));
  }, []);

  const handleDismissAllUploads = useCallback(() => {
    uploads.forEach((u) => {
      if (u.status === "uploading") {
        const handle = uploadHandlesRef.current.get(u.id);
        if (handle) handle.abort();
      }
    });
    setUploads([]);
  }, [uploads]);

  // ── Drag and drop ─────────────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes(DRAG_MIME)) return;
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      dragCounterRef.current = 0;

      // Check for directory entries via File System Access API
      const items = Array.from(e.dataTransfer.items);
      const fsEntries = items
        .map((item) => item.webkitGetAsEntry?.())
        .filter(Boolean) as FileSystemEntry[];
      const hasDirectories = fsEntries.some((entry) => entry.isDirectory);

      if (hasDirectories) {
        // Recursively read all files from directory entries
        const allEntries: { file: File; relativePath: string }[] = [];
        for (const entry of fsEntries) {
          const results = await readEntriesRecursive(entry);
          allEntries.push(...results);
        }
        if (allEntries.length > 0) {
          await uploadFilesWithStructure(allEntries);
        }
      } else {
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
          await uploadFiles(files);
        }
      }
    },
    [uploadFiles, uploadFilesWithStructure],
  );

  // ── Title helper ──────────────────────────────────────────────────
  const title = knowledgeSetName || t("knowledge.titles.knowledgeBase");

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-1 flex-col min-w-0 overflow-hidden relative"
      onDragEnter={enableUpload ? handleDragEnter : undefined}
      onDragLeave={enableUpload ? handleDragLeave : undefined}
      onDragOver={enableUpload ? handleDragOver : undefined}
      onDrop={enableUpload ? handleDrop : undefined}
    >
      {/* Drag Overlay */}
      {enableUpload && isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-500/10 backdrop-blur-sm border-2 border-dashed border-indigo-500 rounded-lg m-2 pointer-events-none">
          <div className="text-center">
            <div className="text-4xl mb-2">📁</div>
            <div className="text-lg font-medium text-indigo-600 dark:text-indigo-400">
              {t("knowledge.upload.dropHere")}
            </div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              {knowledgeSetName
                ? t("knowledge.upload.dropToKnowledgeSet", {
                    name: knowledgeSetName,
                  })
                : folderId
                  ? t("knowledge.upload.dropToFolder")
                  : t("knowledge.upload.dropToUpload")}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {showToolbar && (
        <KnowledgeToolbar
          title={title}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onSearch={(q) => console.log("Search", q)}
          onUpload={handleUploadClick}
          onUploadFolder={handleFolderUploadClick}
          onRefresh={handleRefresh}
          isTrash={false}
          showCreateFolder
          onCreateFolder={handleCreateFolder}
          breadcrumbs={folderId ? breadcrumbs : undefined}
          onBreadcrumbClick={(id) => navigateToFolder(id)}
          onDropOnBreadcrumb={handleDropOnBreadcrumb}
          isLoading={isFileListLoading}
          onMenuClick={onMenuClick}
        />
      )}

      {/* File Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <FileList
          ref={fileListRef}
          filter="knowledge"
          viewMode={viewMode}
          refreshTrigger={refreshKey}
          onRefresh={handleRefresh}
          onFileCountChange={setCurrentFileCount}
          onStatsUpdate={handleStatsUpdate}
          onLoadingChange={setIsFileListLoading}
          currentFolderId={folderId}
          currentKnowledgeSetId={knowledgeSetId}
          onFolderChange={navigateToFolder}
          onCreateFolder={handleCreateFolder}
          onUpload={enableUpload ? handleUploadClick : undefined}
          treeItems={treeItems}
          treeLoading={treeLoading}
          onRefreshTree={refreshTree}
          removeTreeItems={removeTreeItems}
          renameTreeItem={renameTreeItem}
        />
      </div>

      {/* Status Bar */}
      {showStatusBar && (
        <StatusBar
          itemCount={folderId ? currentFileCount : stats.fileCount}
          stats={{
            used: stats.used,
            total: stats.total,
            fileCount: stats.fileCount,
          }}
        />
      )}

      {/* Upload Progress */}
      {enableUpload && (
        <>
          <AnimatePresence>
            {uploads.length > 0 && (
              <UploadProgress
                uploads={uploads}
                onCancel={handleCancelUpload}
                onDismiss={handleDismissUpload}
                onDismissAll={handleDismissAllUploads}
              />
            )}
          </AnimatePresence>

          {/* Hidden Upload Inputs */}
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            onChange={handleFileChange}
          />
          <input
            type="file"
            ref={folderInputRef}
            className="hidden"
            // @ts-expect-error webkitdirectory is not in the React typings
            webkitdirectory=""
            onChange={handleFolderChange}
          />
        </>
      )}
    </div>
  );
}
