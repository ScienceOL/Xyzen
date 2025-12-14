import { fileService } from "@/service/fileService";
import { useRef, useState, useEffect } from "react";
import { FileList, type FileListHandle } from "./FileList";
import { KnowledgeToolbar } from "./KnowledgeToolbar";
import { Sidebar } from "./Sidebar";
import { StatusBar } from "./StatusBar";
import type { KnowledgeTab, ViewMode, StorageStats } from "./types";

export const KnowledgeLayout = () => {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>("home");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [refreshKey, setRefreshKey] = useState(0);

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
        for (const file of files) {
          await fileService.uploadFile(file);
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

  // Helper for title
  const getTitle = () => {
    switch (activeTab) {
      case "home":
        return "Recents";
      case "all":
        return "All Files";
      case "trash":
        return "Trash";
      default:
        return activeTab;
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-black text-neutral-900 dark:text-white">
      {/* Sidebar */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

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
