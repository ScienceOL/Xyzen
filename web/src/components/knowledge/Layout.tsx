import {
  Sheet,
  SheetContent,
} from "@/components/animate-ui/components/radix/sheet";
import { fileService } from "@/service/fileService";
import { folderService, type Folder } from "@/service/folderService";
import { knowledgeSetService } from "@/service/knowledgeSetService";
import { DialogDescription, DialogTitle } from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CreateKnowledgeSetModal } from "./CreateKnowledgeSetModal";
import { FileList, type FileListHandle } from "./FileList";
import { KnowledgeToolbar } from "./KnowledgeToolbar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import type { KnowledgeTab, StorageStats, ViewMode } from "./types";

export const KnowledgeLayout = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<KnowledgeTab>("home");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [currentKnowledgeSetId, setCurrentKnowledgeSetId] = useState<
    string | null
  >(null);
  const [currentKnowledgeSetName, setCurrentKnowledgeSetName] = useState<
    string | null
  >(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCreateKnowledgeSetOpen, setIsCreateKnowledgeSetOpen] =
    useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [refreshKey, setRefreshKey] = useState(0);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);

  // Navigation Helper
  const handleNavigate = useCallback(
    (tab: KnowledgeTab, idOrFolderId: string | null = null) => {
      setActiveTab(tab);
      if (tab === "knowledge") {
        setCurrentKnowledgeSetId(idOrFolderId);
        setCurrentFolderId(null);
      } else if (tab === "folders") {
        setCurrentFolderId(idOrFolderId);
        setCurrentKnowledgeSetId(null);
      } else {
        setCurrentFolderId(null);
        setCurrentKnowledgeSetId(null);
      }
      setIsSidebarOpen(false);
    },
    [],
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
  const fileListRef = useRef<FileListHandle>(null);

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

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      try {
        const files = Array.from(e.target.files);
        const folderId = activeTab === "folders" ? currentFolderId : null;
        const knowledgeSetId =
          activeTab === "knowledge" ? currentKnowledgeSetId : null;

        // Validate files before upload
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
            const availableMB = (stats.availableBytes / (1024 * 1024)).toFixed(
              2,
            );
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            alert(
              t("knowledge.upload.errors.notEnoughStorage", {
                fileSizeMB,
                availableMB,
              }),
            );
            continue;
          }

          await fileService.uploadFile(
            file,
            "private",
            undefined,
            folderId,
            knowledgeSetId,
          );
        }
        // Trigger refresh
        setRefreshKey((prev) => prev + 1);
      } catch (error) {
        console.error("Upload failed", error);
        alert(t("knowledge.upload.errors.uploadFailed"));
      }
    }
  };

  const handleEmptyTrash = () => {
    if (fileListRef.current) {
      fileListRef.current.emptyTrash();
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt(t("knowledge.prompts.folderName"));
    if (name) {
      try {
        await folderService.createFolder({
          name,
          parent_id: currentFolderId,
        });
        setRefreshKey((prev) => prev + 1);
      } catch (e) {
        console.error("Failed to create folder", e);
        alert(t("knowledge.errors.createFolderFailed"));
      }
    }
  };

  const handleCreateKnowledgeSet = async () => {
    setIsCreateKnowledgeSetOpen(true);
  };

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
      case "folders":
        return t("knowledge.titles.myKnowledge");
      case "knowledge":
        return currentKnowledgeSetName || t("knowledge.titles.knowledgeBase");
      case "trash":
        return t("knowledge.titles.trash");
      default:
        return activeTab;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden border-t bg-white dark:bg-black text-neutral-900 dark:text-white">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex h-full">
        <Sidebar
          activeTab={activeTab}
          currentKnowledgeSetId={currentKnowledgeSetId}
          onTabChange={handleNavigate}
          refreshTrigger={refreshKey}
          onCreateKnowledgeSet={handleCreateKnowledgeSet}
        />
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
          />
        </SheetContent>
      </Sheet>

      {/* Main Area */}
      <div className="flex flex-1 flex-col min-w-0 bg-white dark:bg-black">
        {/* Toolbar */}
        <KnowledgeToolbar
          title={getTitle()}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onSearch={(q) => console.log("Search", q)}
          onUpload={handleUploadClick}
          onRefresh={() => setRefreshKey((k) => k + 1)}
          isTrash={activeTab === "trash"}
          onEmptyTrash={handleEmptyTrash}
          showCreateFolder={activeTab === "folders"}
          onCreateFolder={handleCreateFolder}
          breadcrumbs={activeTab === "folders" ? breadcrumbs : undefined}
          onBreadcrumbClick={(id) => handleNavigate("folders", id)}
          onMenuClick={() => setIsSidebarOpen(true)}
        />

        {/* File Content */}
        <div
          className="flex-1 overflow-y-auto bg-white dark:bg-black custom-scrollbar"
          onClick={() => {
            /* Deselect */
          }}
        >
          <FileList
            ref={fileListRef}
            filter={activeTab}
            viewMode={viewMode}
            refreshTrigger={refreshKey}
            onRefresh={() => setRefreshKey((k) => k + 1)}
            onFileCountChange={setCurrentFileCount}
            currentFolderId={currentFolderId}
            currentKnowledgeSetId={currentKnowledgeSetId}
            onFolderChange={(id) => handleNavigate("folders", id)}
          />
        </div>
        {/* Status Bar */}
        <StatusBar
          itemCount={currentFileCount}
          stats={{
            used: stats.used,
            total: stats.total,
            fileCount: stats.fileCount,
          }}
        />
      </div>

      {/* Hidden Upload Input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={handleFileChange}
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
