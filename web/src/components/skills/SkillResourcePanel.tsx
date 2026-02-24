import type { UploadHandle } from "@/service/fileService";
import type { FileTreeItem, Folder } from "@/service/folderService";
import {
  skillResourceService,
  type SkillStorageStats,
} from "@/service/skillResourceService";
import type { SkillRead } from "@/types/skills";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileList, type FileListHandle } from "../knowledge/FileList";
import { KnowledgeToolbar } from "../knowledge/KnowledgeToolbar";
import { StatusBar } from "../knowledge/StatusBar";
import type { StorageStats, ViewMode } from "../knowledge/types";
import { UploadProgress, type UploadItem } from "../knowledge/UploadProgress";

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

export interface SkillResourcePanelProps {
  skill: SkillRead;
  /** When true, hide all mutating actions (rename/delete/move/upload) */
  readonly?: boolean;
  /** Mobile menu button handler */
  onMenuClick?: () => void;
}

export function SkillResourcePanel({
  skill,
  readonly: readonlyMode = false,
  onMenuClick,
}: SkillResourcePanelProps) {
  const { t } = useTranslation();

  // ── Tree state ──────────────────────────────────────────────────
  const [treeItems, setTreeItems] = useState<FileTreeItem[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeSignal, setTreeSignal] = useState(0);

  // ── Navigation state ────────────────────────────────────────────
  const [folderId, setFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);

  // ── Misc state ──────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFileListLoading, setIsFileListLoading] = useState(false);
  const [currentFileCount, setCurrentFileCount] = useState(0);

  // ── Stats ────────────────────────────────────────────────────────
  const [stats, setStats] = useState<StorageStats>({
    total: 0,
    used: 0,
    fileCount: 0,
    usagePercentage: 0,
    availableBytes: 0,
    maxFileSize: 2 * 1024 * 1024, // 2 MiB per file for skills
  });

  // ── Upload state ─────────────────────────────────────────────────
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const uploadHandlesRef = useRef<Map<string, UploadHandle>>(new Map());

  // ── Drag state ──────────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // ── Refs ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileListRef = useRef<FileListHandle>(null);

  // ── Fetch tree ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setTreeLoading(true);

    skillResourceService
      .getTree(skill.id)
      .then((items) => {
        if (!cancelled) {
          setTreeItems(items);
          setTreeLoading(false);
        }
      })
      .catch((e) => {
        console.error("Failed to fetch skill resource tree", e);
        if (!cancelled) setTreeLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [skill.id, treeSignal]);

  // ── Fetch breadcrumbs ───────────────────────────────────────────
  useEffect(() => {
    if (!folderId) {
      setBreadcrumbs([]);
      return;
    }
    skillResourceService
      .getFolderPath(skill.id, folderId)
      .then(setBreadcrumbs)
      .catch((e) => console.error("Failed to fetch breadcrumbs", e));
  }, [skill.id, folderId]);

  // ── Fetch stats ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data: SkillStorageStats = await skillResourceService.getStats(
          skill.id,
        );
        setStats({
          used: data.total_size,
          total: data.max_total_size,
          fileCount: data.file_count,
          usagePercentage:
            data.max_total_size > 0
              ? (data.total_size / data.max_total_size) * 100
              : 0,
          availableBytes: data.max_total_size - data.total_size,
          maxFileSize: data.max_file_size,
        });
      } catch (error) {
        console.error("Stats fetch failed", error);
      }
    };
    fetchStats();
  }, [skill.id, refreshKey]);

  // ── Reset folder when skill changes ──────────────────────────────
  useEffect(() => {
    setFolderId(null);
  }, [skill.id]);

  // ── Optimistic tree mutations ────────────────────────────────────
  const removeTreeItems = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setTreeItems((prev) => prev.filter((i) => !idSet.has(i.id)));
  }, []);

  const renameTreeItem = useCallback((id: string, newName: string) => {
    setTreeItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, name: newName } : i)),
    );
  }, []);

  // ── Refresh helpers ──────────────────────────────────────────────
  const refreshTree = useCallback(() => {
    setTreeSignal((s) => s + 1);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    refreshTree();
  }, [refreshTree]);

  // ── Stats optimistic update ──────────────────────────────────────
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

  // ── Navigation ──────────────────────────────────────────────────
  const navigateToFolder = useCallback((id: string | null) => {
    setFolderId(id);
  }, []);

  // ── Folder creation ──────────────────────────────────────────────
  const handleCreateFolder = useCallback(() => {
    if (fileListRef.current) {
      fileListRef.current.createFolder(folderId);
    }
  }, [folderId]);

  // ── Breadcrumb drop ──────────────────────────────────────────────
  const handleDropOnBreadcrumb = useCallback(
    async (itemIds: string[], targetFolderId: string | null) => {
      if (fileListRef.current) {
        fileListRef.current.moveItems(itemIds, targetFolderId);
      }
    },
    [],
  );

  // ── Skill resource callbacks for FileList ────────────────────────
  const handleDeleteItem = useCallback(
    async (id: string, isDir: boolean) => {
      if (isDir) {
        await skillResourceService.deleteFolder(skill.id, id);
      } else {
        await skillResourceService.deleteFile(skill.id, id);
      }
    },
    [skill.id],
  );

  const handleRenameItem = useCallback(
    async (id: string, isDir: boolean, newName: string) => {
      if (isDir) {
        await skillResourceService.updateFolder(skill.id, id, {
          name: newName,
        });
      } else {
        await skillResourceService.updateFile(skill.id, id, {
          original_filename: newName,
        });
      }
    },
    [skill.id],
  );

  const handleMoveItem = useCallback(
    async (id: string, isDir: boolean, targetFolderId: string | null) => {
      if (isDir) {
        await skillResourceService.updateFolder(skill.id, id, {
          parent_id: targetFolderId,
        });
      } else {
        await skillResourceService.updateFile(skill.id, id, {
          parent_id: targetFolderId,
        });
      }
    },
    [skill.id],
  );

  const handleDownloadFile = useCallback(
    async (fileId: string) => {
      return skillResourceService.downloadRaw(skill.id, fileId);
    },
    [skill.id],
  );

  const handleCreateSkillFolder = useCallback(
    async (name: string, parentId: string | null) => {
      await skillResourceService.createFolder(skill.id, {
        name,
        parent_id: parentId,
      });
    },
    [skill.id],
  );

  // ── Upload logic ─────────────────────────────────────────────────
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || readonlyMode) return;

      const existingNames = treeItems
        .filter(
          (item) =>
            item.parent_id === folderId || (!item.parent_id && !folderId),
        )
        .map((item) => item.name);

      for (const file of files) {
        const uniqueName =
          file.name !== getUniqueFilename(file.name, existingNames)
            ? new File([file], getUniqueFilename(file.name, existingNames), {
                type: file.type,
              })
            : file;

        const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const uploadItem: UploadItem = {
          id: uploadId,
          fileName: uniqueName.name,
          progress: 0,
          status: "uploading",
        };

        setUploads((prev) => [...prev, uploadItem]);

        const handle = skillResourceService.uploadFileWithProgress(
          skill.id,
          uniqueName,
          folderId,
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
                  ? { ...u, status: "completed" as const, progress: 100 }
                  : u,
              ),
            );
            handleRefresh();
          })
          .catch((error) => {
            if (error.message !== "Upload cancelled") {
              setUploads((prev) =>
                prev.map((u) =>
                  u.id === uploadId
                    ? {
                        ...u,
                        status: "error" as const,
                        error: error.message,
                      }
                    : u,
                ),
              );
            }
          })
          .finally(() => {
            uploadHandlesRef.current.delete(uploadId);
          });
      }
    },
    [skill.id, folderId, readonlyMode, treeItems, handleRefresh],
  );

  // ── Upload handlers ──────────────────────────────────────────────
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      uploadFiles(files);
      e.target.value = "";
    },
    [uploadFiles],
  );

  const handleCancelUpload = useCallback((uploadId: string) => {
    const handle = uploadHandlesRef.current.get(uploadId);
    if (handle) {
      handle.abort();
      uploadHandlesRef.current.delete(uploadId);
    }
    setUploads((prev) => prev.filter((u) => u.id !== uploadId));
  }, []);

  const handleDismissUpload = useCallback((uploadId: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== uploadId));
  }, []);

  const handleDismissAllUploads = useCallback(() => {
    // Cancel any active uploads
    uploadHandlesRef.current.forEach((handle) => handle.abort());
    uploadHandlesRef.current.clear();
    setUploads([]);
  }, []);

  // ── Drag & drop ──────────────────────────────────────────────────
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (readonlyMode) return;
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer.types.includes("Files")) {
        setIsDragOver(true);
      }
    },
    [readonlyMode],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      if (readonlyMode) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        uploadFiles(files);
      }
    },
    [readonlyMode, uploadFiles],
  );

  return (
    <div
      className="flex h-full flex-col"
      onDragEnter={readonlyMode ? undefined : handleDragEnter}
      onDragLeave={readonlyMode ? undefined : handleDragLeave}
      onDragOver={readonlyMode ? undefined : handleDragOver}
      onDrop={readonlyMode ? undefined : handleDrop}
    >
      {/* Toolbar */}
      <KnowledgeToolbar
        title={skill.name}
        breadcrumbs={breadcrumbs}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onSearch={(q) => console.log("Search", q)}
        onBreadcrumbClick={navigateToFolder}
        onCreateFolder={readonlyMode ? undefined : handleCreateFolder}
        onUpload={readonlyMode ? () => {} : () => fileInputRef.current?.click()}
        isLoading={isFileListLoading}
        onRefresh={handleRefresh}
        onMenuClick={onMenuClick}
        onDropOnBreadcrumb={readonlyMode ? undefined : handleDropOnBreadcrumb}
      />

      {/* Hidden file input */}
      {!readonlyMode && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />
      )}

      {/* File list */}
      <div className="custom-scrollbar relative flex-1 overflow-y-auto">
        <FileList
          ref={fileListRef}
          filter="skill"
          viewMode={viewMode}
          refreshTrigger={refreshKey}
          onRefresh={handleRefresh}
          onFileCountChange={setCurrentFileCount}
          onStatsUpdate={handleStatsUpdate}
          onLoadingChange={setIsFileListLoading}
          currentFolderId={folderId}
          onFolderChange={navigateToFolder}
          onUpload={
            readonlyMode ? undefined : () => fileInputRef.current?.click()
          }
          onCreateFolder={readonlyMode ? undefined : handleCreateFolder}
          treeItems={treeItems}
          treeLoading={treeLoading}
          onRefreshTree={refreshTree}
          removeTreeItems={removeTreeItems}
          renameTreeItem={renameTreeItem}
          readonly={readonlyMode}
          onDeleteItem={handleDeleteItem}
          onRenameItem={handleRenameItem}
          onMoveItem={handleMoveItem}
          onDownloadFile={handleDownloadFile}
          onCreateSkillFolder={handleCreateSkillFolder}
        />

        {/* Drag overlay */}
        {isDragOver && !readonlyMode && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-50/80 dark:bg-indigo-950/30">
            <div className="rounded-lg border-2 border-dashed border-indigo-400 px-8 py-6 text-center">
              <p className="text-[13px] font-medium text-indigo-600 dark:text-indigo-400">
                {t("knowledge.filePanel.dropToUpload")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Upload progress */}
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

      {/* Status bar */}
      <StatusBar stats={stats} itemCount={currentFileCount} />
    </div>
  );
}
