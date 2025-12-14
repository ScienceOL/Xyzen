import { fileService } from "@/service/fileService";
import {
  ArrowUpTrayIcon,
  DocumentPlusIcon,
  FolderPlusIcon,
} from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import { FileList } from "./FileList";

export const HomeView = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Trigger file selection
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsUploading(true);
      try {
        const files = Array.from(e.target.files);
        for (const file of files) {
          await fileService.uploadFile(file);
        }
        window.location.reload();
      } catch (error) {
        console.error("Upload failed", error);
      } finally {
        setIsUploading(false);
      }
    }
  };

  const CardBaseClass =
    "group relative flex h-32 flex-col items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900/50 dark:hover:border-neutral-700";
  const TextBaseClass =
    "mt-3 text-sm font-medium text-neutral-600 group-hover:text-neutral-900 dark:text-neutral-400 dark:group-hover:text-white";

  return (
    <div className="flex flex-1 flex-col gap-8 p-8 overflow-y-auto">
      {/* Get Started Section */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-neutral-900 dark:text-white">
          Get Started
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* New Page Card */}
          <button className={CardBaseClass}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors dark:bg-purple-500/10 dark:text-purple-500 dark:group-hover:bg-purple-500">
              <DocumentPlusIcon className="h-6 w-6" />
            </div>
            <span className={TextBaseClass}>New Page</span>
            <div className="absolute right-2 bottom-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-600 text-white shadow-sm opacity-0 transition-opacity group-hover:opacity-100">
                <DocumentPlusIcon className="h-4 w-4" />
              </div>
            </div>
          </button>

          {/* Upload Files Card */}
          <button
            onClick={handleUploadClick}
            disabled={isUploading}
            className={CardBaseClass}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors dark:bg-blue-500/10 dark:text-blue-500 dark:group-hover:bg-blue-500">
              <ArrowUpTrayIcon className="h-6 w-6" />
            </div>
            <span className={TextBaseClass}>
              {isUploading ? "Uploading..." : "Upload Files"}
            </span>
            <div className="absolute right-2 bottom-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-white shadow-sm opacity-0 transition-opacity group-hover:opacity-100">
                <ArrowUpTrayIcon className="h-4 w-4" />
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              onChange={handleFileChange}
            />
          </button>

          {/* Upload Folder Card */}
          <button className={CardBaseClass}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors dark:bg-green-500/10 dark:text-green-500 dark:group-hover:bg-green-500">
              <FolderPlusIcon className="h-6 w-6" />
            </div>
            <span className={TextBaseClass}>Upload Folder</span>
            <div className="absolute right-2 bottom-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-green-600 text-white shadow-sm opacity-0 transition-opacity group-hover:opacity-100">
                <FolderPlusIcon className="h-4 w-4" />
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Recent Files Section */}
      <div className="flex-1">
        <h2 className="mb-4 text-xl font-bold text-neutral-900 dark:text-white">
          Recent Files
        </h2>
        <FileList filter="home" />
      </div>
    </div>
  );
};
