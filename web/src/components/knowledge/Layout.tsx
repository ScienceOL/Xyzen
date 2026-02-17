import {
  Sheet,
  SheetContent,
} from "@/components/animate-ui/components/radix/sheet";
import {
  DOCK_HORIZONTAL_MARGIN,
  DOCK_SAFE_AREA,
} from "@/components/layouts/BottomDock";
import { MOBILE_BREAKPOINT } from "@/configs/common";
import { useKnowledge } from "@/hooks/useKnowledge";
import { fileService, type UploadHandle } from "@/service/fileService";
import { folderService, type Folder } from "@/service/folderService";
import { knowledgeSetService } from "@/service/knowledgeSetService";
import { DialogDescription, DialogTitle } from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateKnowledgeSetModal } from "./CreateKnowledgeSetModal";
import { FileList, type FileListHandle } from "./FileList";
import { DRAG_MIME } from "./FileTreeView";
import { KnowledgeFilePanel } from "./KnowledgeFilePanel";
import { KnowledgeToolbar } from "./KnowledgeToolbar";
import { RecentsView } from "./RecentsView";
import { Sidebar } from "./Sidebar";
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

export const KnowledgeLayout = () => {
  const { t } = useTranslation();

  // Centralized knowledge state from the store
  const {
    knowledgeActiveTab: activeTab,
    knowledgeFolderId: currentFolderId,
    knowledgeSetId: currentKnowledgeSetId,
    knowledgeTreeItems,
    knowledgeTreeLoading,
    trashTreeItems,
    trashTreeLoading,
    navigateKnowledge,
    setKnowledgeFolderId,
    refreshKnowledge,
    removeTreeItems,
    renameTreeItem,
  } = useKnowledge();

  const [currentKnowledgeSetName, setCurrentKnowledgeSetName] = useState<
    string | null
  >(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreateKnowledgeSetOpen, setIsCreateKnowledgeSetOpen] =
    useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [refreshKey, setRefreshKey] = useState(0);
  const [isFileListLoading, setIsFileListLoading] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);

  // Navigate into a subfolder (independent of tab)
  const navigateToFolder = useCallback(
    (folderId: string | null) => {
      setKnowledgeFolderId(folderId);
    },
    [setKnowledgeFolderId],
  );

  // Navigation Helper — switches tabs (sidebar clicks)
  const handleNavigate = useCallback(
    (
      tab: Parameters<typeof navigateKnowledge>[0],
      idOrKnowledgeSetId: string | null = null,
    ) => {
      navigateKnowledge(tab, idOrKnowledgeSetId);
      setIsSidebarOpen(false);
    },
    [navigateKnowledge],
  );

  // Fetch breadcrumbs when currentFolderId changes
  useEffect(() => {
    const fetchPath = async () => {
      if (!currentFolderId) {
        setBreadcrumbs([]);
        return;
      }
      try {
        const path = await folderService.getFolderPath(currentFolderId);
        setBreadcrumbs(path);
      } catch (e) {
        console.error("Failed to fetch breadcrumbs", e);
      }
    };
    fetchPath();
  }, [currentFolderId]);

  // Fetch knowledge set name when currentKnowledgeSetId changes
  useEffect(() => {
    const fetchKnowledgeSetName = async () => {
      if (!currentKnowledgeSetId) {
        setCurrentKnowledgeSetName(null);
        return;
      }
      try {
        const ks = await knowledgeSetService.getKnowledgeSet(
          currentKnowledgeSetId,
        );
        setCurrentKnowledgeSetName(ks.name);
      } catch (e) {
        console.error("Failed to fetch knowledge set name", e);
      }
    };
    fetchKnowledgeSetName();
  }, [currentKnowledgeSetId]);

  // Stats & File Count
  const [stats, setStats] = useState<StorageStats>({
    total: 0,
    used: 0,
    fileCount: 0,
    usagePercentage: 0,
    availableBytes: 0,
    maxFileSize: 100 * 1024 * 1024, // Default 100MB
  });
  const [currentFileCount, setCurrentFileCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const fileListRef = useRef<FileListHandle>(null);

  // Upload progress tracking
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const uploadHandlesRef = useRef<Map<string, UploadHandle>>(new Map());

  useEffect(() => {
    // Initial stats fetch
    fetchStats();
  }, [refreshKey]); // Refetch stats when files change

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

  // Optimistic update for stats when files are deleted
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

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFolderUploadClick = () => {
    folderInputRef.current?.click();
  };

  // Upload files with current context
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      // Capture current context at upload time
      const parentId = currentFolderId || null;
      const knowledgeSetId =
        activeTab === "knowledge" ? currentKnowledgeSetId : null;

      // Fetch existing filenames in current directory for deduplication
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
        // If we can't fetch, proceed without dedup
      }

      // Validate and start uploads
      for (const file of files) {
        // Check if file exceeds max size
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

        // Check if upload would exceed storage quota
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

        // Deduplicate filename
        const uniqueName = getUniqueFilename(file.name, existingNames);
        existingNames.push(uniqueName); // Track for batch dedup
        const uploadFile =
          uniqueName !== file.name
            ? new File([file], uniqueName, { type: file.type })
            : file;

        // Create upload item
        const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const uploadItem: UploadItem = {
          id: uploadId,
          fileName: uniqueName,
          progress: 0,
          status: "uploading",
        };

        setUploads((prev) => [...prev, uploadItem]);

        // Start upload with progress tracking
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

        // Handle completion
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
            // Trigger refresh after successful upload
            setRefreshKey((prev) => prev + 1);
            refreshKnowledge();
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
    [
      activeTab,
      currentFolderId,
      currentKnowledgeSetId,
      stats,
      t,
      refreshKnowledge,
    ],
  );

  // Cancel upload handler
  const handleCancelUpload = useCallback((uploadId: string) => {
    const handle = uploadHandlesRef.current.get(uploadId);
    if (handle) {
      handle.abort();
    }
  }, []);

  // Dismiss upload item
  const handleDismissUpload = useCallback((uploadId: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== uploadId));
  }, []);

  // Dismiss all uploads
  const handleDismissAllUploads = useCallback(() => {
    // Cancel any active uploads
    uploads.forEach((u) => {
      if (u.status === "uploading") {
        const handle = uploadHandlesRef.current.get(u.id);
        if (handle) {
          handle.abort();
        }
      }
    });
    setUploads([]);
  }, [uploads]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      await uploadFiles(files);
      // Reset input so user can upload same file again
      e.target.value = "";
    }
  };

  /**
   * Handle folder upload via webkitdirectory input.
   * Creates the folder hierarchy on the backend first,
   * then uploads each file into its correct parent folder.
   */
  const handleFolderChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;

      const files = Array.from(e.target.files);
      // Reset input so user can upload the same folder again
      e.target.value = "";

      // The root parent for the upload
      const rootParentId = currentFolderId || null;
      const knowledgeSetId =
        activeTab === "knowledge" ? currentKnowledgeSetId : null;

      // Build a set of unique directory paths from webkitRelativePath.
      // e.g. "MyFolder/sub/file.txt" → ["MyFolder", "MyFolder/sub"]
      const dirPaths = new Set<string>();
      for (const file of files) {
        const rel = (file as File & { webkitRelativePath?: string })
          .webkitRelativePath;
        if (!rel) continue;
        const parts = rel.split("/");
        // All segments except the last (filename) form directory paths
        for (let i = 1; i < parts.length; i++) {
          dirPaths.add(parts.slice(0, i).join("/"));
        }
      }

      // Sort by depth so parents are created before children
      const sortedDirs = Array.from(dirPaths).sort(
        (a, b) => a.split("/").length - b.split("/").length,
      );

      // Map from directory path → created folder ID
      const folderIdMap = new Map<string, string>();

      // Create folders sequentially (parent before child)
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

      // Now upload each file into its correct parent folder
      for (const file of files) {
        const rel = (file as File & { webkitRelativePath?: string })
          .webkitRelativePath;
        if (!rel) continue;
        const parts = rel.split("/");
        const parentDirPath =
          parts.length > 1 ? parts.slice(0, -1).join("/") : null;
        const parentId = parentDirPath
          ? (folderIdMap.get(parentDirPath) ?? rootParentId)
          : rootParentId;

        // Check file size
        if (stats.maxFileSize && file.size > stats.maxFileSize) continue;
        if (
          stats.availableBytes !== undefined &&
          file.size > stats.availableBytes
        )
          continue;

        // Extract bare filename (last segment of the relative path).
        // Always create a new File so the multipart Content-Disposition
        // header contains only the basename, not the webkitRelativePath.
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
            refreshKnowledge();
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
    [
      activeTab,
      currentFolderId,
      currentKnowledgeSetId,
      stats,
      refreshKnowledge,
    ],
  );

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Ignore internal item drags (only show overlay for external file drops)
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

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        await uploadFiles(files);
      }
    },
    [uploadFiles],
  );

  const handleEmptyTrash = () => {
    if (fileListRef.current) {
      fileListRef.current.emptyTrash();
    }
  };

  // Handle dropping files onto a breadcrumb (move to ancestor folder or root)
  const handleDropOnBreadcrumb = useCallback(
    async (itemIds: string[], targetFolderId: string | null) => {
      if (fileListRef.current) {
        fileListRef.current.moveItems(itemIds, targetFolderId);
      }
    },
    [],
  );

  const handleCreateFolder = useCallback(() => {
    if (fileListRef.current) {
      fileListRef.current.createFolder(currentFolderId);
    }
  }, [currentFolderId]);

  // Refresh both the local refreshKey and the store tree
  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    refreshKnowledge();
  }, [refreshKnowledge]);

  const handleCreateKnowledgeSet = async () => {
    setIsCreateKnowledgeSetOpen(true);
  };

  // Handle dropping files onto knowledge set items in sidebar
  const handleDropOnKnowledgeSet = useCallback(
    async (fileIds: string[], knowledgeSetId: string) => {
      try {
        await Promise.all(
          fileIds.map((fileId) =>
            knowledgeSetService.linkFileToKnowledgeSet(knowledgeSetId, fileId),
          ),
        );
        setRefreshKey((prev) => prev + 1);
        refreshKnowledge();
      } catch (e) {
        console.error("Failed to add files to knowledge set", e);
      }
    },
    [refreshKnowledge],
  );

  const handleSubmitCreateKnowledgeSet = async (values: {
    name: string;
    description: string;
  }) => {
    try {
      await knowledgeSetService.createKnowledgeSet({
        name: values.name,
        description: values.description ? values.description : null,
      });
      setRefreshKey((prev) => prev + 1);
    } catch (e) {
      console.error("Failed to create knowledge set", e);
      throw e;
    }
  };

  // Helper for title
  const getTitle = () => {
    switch (activeTab) {
      case "home":
        return t("knowledge.titles.recents");
      case "all":
        return t("knowledge.titles.allFiles");
      case "knowledge":
        return currentKnowledgeSetName || t("knowledge.titles.knowledgeBase");
      case "trash":
        return t("knowledge.titles.trash");
      default:
        return activeTab;
    }
  };

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white gap-4"
      style={
        window.innerWidth < MOBILE_BREAKPOINT
          ? {}
          : {
              paddingTop: 16,
              paddingBottom: DOCK_SAFE_AREA,
              paddingLeft: DOCK_HORIZONTAL_MARGIN,
              paddingRight: DOCK_HORIZONTAL_MARGIN,
            }
      }
    >
      {/* Desktop Sidebar - Frosted Glass */}
      <div className="hidden md:flex h-full">
        <div className="h-full sm:rounded-2xl overflow-hidden bg-white/60 dark:bg-neutral-900/60 backdrop-blur-2xl border border-white/30 dark:border-neutral-700/50 shadow-lg">
          <Sidebar
            activeTab={activeTab}
            currentKnowledgeSetId={currentKnowledgeSetId}
            onTabChange={handleNavigate}
            refreshTrigger={refreshKey}
            onCreateKnowledgeSet={handleCreateKnowledgeSet}
            onDropOnKnowledgeSet={handleDropOnKnowledgeSet}
          />
        </div>
      </div>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent
          side="left"
          className="p-0 w-56 border-r-0"
          showCloseButton={false}
        >
          <VisuallyHidden>
            <DialogTitle>{t("knowledge.a11y.navTitle")}</DialogTitle>
            <DialogDescription>
              {t("knowledge.a11y.navDescription")}
            </DialogDescription>
          </VisuallyHidden>
          <Sidebar
            activeTab={activeTab}
            currentKnowledgeSetId={currentKnowledgeSetId}
            onTabChange={handleNavigate}
            refreshTrigger={refreshKey}
            onCreateKnowledgeSet={handleCreateKnowledgeSet}
            onDropOnKnowledgeSet={handleDropOnKnowledgeSet}
          />
        </SheetContent>
      </Sheet>

      {/* Main Area - Frosted Glass */}
      <div
        className="flex flex-1 flex-col min-w-0 sm:rounded-2xl bg-neutral-50/70 dark:bg-neutral-950 overflow-hidden backdrop-blur-2xl sm:border sm:border-white/30 sm:dark:border-neutral-700/50 sm:shadow-lg relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {activeTab === "knowledge" && currentKnowledgeSetId ? (
          <KnowledgeFilePanel
            knowledgeSetId={currentKnowledgeSetId}
            showToolbar
            showStatusBar
            enableUpload
            onMenuClick={() => setIsSidebarOpen(true)}
          />
        ) : (
          <>
            {/* Drag Overlay */}
            {isDragOver && activeTab !== "trash" && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-indigo-500/10 backdrop-blur-sm border-2 border-dashed border-indigo-500 rounded-lg m-2 pointer-events-none">
                <div className="text-center">
                  <div className="text-4xl mb-2">📁</div>
                  <div className="text-lg font-medium text-indigo-600 dark:text-indigo-400">
                    {t("knowledge.upload.dropHere")}
                  </div>
                  <div className="text-sm text-neutral-500 dark:text-neutral-400">
                    {currentFolderId
                      ? t("knowledge.upload.dropToFolder")
                      : t("knowledge.upload.dropToUpload")}
                  </div>
                </div>
              </div>
            )}
            {/* Toolbar */}
            <KnowledgeToolbar
              title={getTitle()}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onSearch={(q) => console.log("Search", q)}
              onUpload={handleUploadClick}
              onUploadFolder={handleFolderUploadClick}
              onRefresh={handleRefresh}
              isTrash={activeTab === "trash"}
              onEmptyTrash={handleEmptyTrash}
              showCreateFolder={activeTab === "all"}
              onCreateFolder={handleCreateFolder}
              breadcrumbs={
                currentFolderId && activeTab === "all" ? breadcrumbs : undefined
              }
              onBreadcrumbClick={(id) => navigateToFolder(id)}
              onDropOnBreadcrumb={handleDropOnBreadcrumb}
              onMenuClick={() => setIsSidebarOpen(true)}
              isLoading={isFileListLoading}
            />

            {/* File Content */}
            <div
              className="flex-1 overflow-y-auto custom-scrollbar"
              onClick={() => {
                /* Deselect */
              }}
            >
              {activeTab === "home" ? (
                <RecentsView
                  refreshTrigger={refreshKey}
                  onKnowledgeSetClick={(id) => handleNavigate("knowledge", id)}
                  onCreateKnowledgeSet={handleCreateKnowledgeSet}
                  onRefresh={handleRefresh}
                  onFileCountChange={setCurrentFileCount}
                  onStatsUpdate={handleStatsUpdate}
                  onLoadingChange={setIsFileListLoading}
                  onUpload={handleUploadClick}
                  treeItems={knowledgeTreeItems}
                  treeLoading={knowledgeTreeLoading}
                  onRefreshTree={refreshKnowledge}
                />
              ) : (
                <FileList
                  ref={fileListRef}
                  filter={activeTab}
                  viewMode={viewMode}
                  refreshTrigger={refreshKey}
                  onRefresh={handleRefresh}
                  onFileCountChange={setCurrentFileCount}
                  onStatsUpdate={handleStatsUpdate}
                  onLoadingChange={setIsFileListLoading}
                  currentFolderId={currentFolderId}
                  currentKnowledgeSetId={currentKnowledgeSetId}
                  onFolderChange={(id) => navigateToFolder(id)}
                  onCreateFolder={handleCreateFolder}
                  onUpload={handleUploadClick}
                  treeItems={
                    activeTab === "trash" ? trashTreeItems : knowledgeTreeItems
                  }
                  treeLoading={
                    activeTab === "trash"
                      ? trashTreeLoading
                      : knowledgeTreeLoading
                  }
                  onRefreshTree={refreshKnowledge}
                  removeTreeItems={removeTreeItems}
                  renameTreeItem={renameTreeItem}
                />
              )}
            </div>
            {/* Status Bar */}
            <StatusBar
              itemCount={
                currentFolderId && activeTab === "all"
                  ? currentFileCount
                  : stats.fileCount
              }
              stats={{
                used: stats.used,
                total: stats.total,
                fileCount: stats.fileCount,
              }}
            />

            {/* Upload Progress Floating Panel - inside main area for relative positioning */}
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
          </>
        )}
      </div>

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

      <CreateKnowledgeSetModal
        isOpen={isCreateKnowledgeSetOpen}
        onClose={() => setIsCreateKnowledgeSetOpen(false)}
        onCreate={handleSubmitCreateKnowledgeSet}
      />
    </div>
  );
};

export default KnowledgeLayout;
