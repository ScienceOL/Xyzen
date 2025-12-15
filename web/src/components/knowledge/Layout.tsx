import { fileService } from "@/service/fileService";
import { folderService, type Folder } from "@/service/folderService";
import { useRef, useState, useEffect, useCallback } from "react";
import { FileList, type FileListHandle } from "./FileList";
import { KnowledgeToolbar } from "./KnowledgeToolbar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import type { KnowledgeTab, ViewMode, StorageStats } from "./types";

export const KnowledgeLayout = () => {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>("home");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [refreshKey, setRefreshKey] = useState(0);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);

  // Navigation Helper
  const handleNavigate = useCallback(
    (tab: KnowledgeTab, folderId: string | null = null) => {
      setActiveTab(tab);
      setCurrentFolderId(folderId);
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

  // Stats & File Count
  const [stats, setStats] = useState<StorageStats>({
    total: 0,
    used: 0,
    fileCount: 0,
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
        used: data.total_size,
        total: 100 * 1024 * 1024, // Hardcoded 100MB limit from previous code
        fileCount: data.total_files,
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
        // Determine folder ID: only pass if in folders tab
        const folderId = activeTab === "folders" ? currentFolderId : null;

        for (const file of files) {
          await fileService.uploadFile(file, "private", undefined, folderId);
        }
        // Trigger refresh
        setRefreshKey((prev) => prev + 1);
      } catch (error) {
        console.error("Upload failed", error);
        alert("Upload failed");
      }
    }
  };

  const handleEmptyTrash = () => {
    if (fileListRef.current) {
      fileListRef.current.emptyTrash();
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt("Enter folder name:");
    if (name) {
      try {
        await folderService.createFolder({
          name,
          parent_id: currentFolderId,
        });
        setRefreshKey((prev) => prev + 1);
      } catch (e) {
        console.error("Failed to create folder", e);
        alert("Failed to create folder");
      }
    }
  };

  const handleCreateRootFolder = async () => {
    const name = prompt("Enter new root folder name:");
    if (name) {
      try {
        await folderService.createFolder({
          name,
          parent_id: null,
        });
        setRefreshKey((prev) => prev + 1);
      } catch (e) {
        console.error("Failed to create root folder", e);
        alert("Failed to create folder");
      }
    }
  };

  // Helper for title
  const getTitle = () => {
    switch (activeTab) {
      case "home":
        return "Recents";
      case "all":
        return "All Files";
      case "folders":
        return "My Knowledge"; // Or "Folder Name" if available?
      case "trash":
        return "Trash";
      default:
        return activeTab;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-black text-neutral-900 dark:text-white">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        currentFolderId={currentFolderId}
        onTabChange={handleNavigate}
        refreshTrigger={refreshKey}
        onCreateRootFolder={handleCreateRootFolder}
      />

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
            onFileCountChange={setCurrentFileCount}
            currentFolderId={currentFolderId}
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
    </div>
  );
};

export default KnowledgeLayout;
