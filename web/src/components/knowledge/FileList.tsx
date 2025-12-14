import { PreviewModal } from "@/components/preview/PreviewModal";
import type { PreviewFile } from "@/components/preview/types";
import { fileService, type FileUploadResponse } from "@/service/fileService";
import {
  ArrowDownTrayIcon,
  DocumentIcon,
  EyeIcon,
  MicrophoneIcon,
  PhotoIcon,
  TrashIcon,
  VideoCameraIcon,
} from "@heroicons/react/24/outline";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import type { KnowledgeTab } from "./types";

interface FileListProps {
  filter: KnowledgeTab;
}

const getFileIcon = (category: string) => {
  switch (category) {
    case "images":
      return PhotoIcon;
    case "audio":
      return MicrophoneIcon;
    case "videos":
      return VideoCameraIcon;
    default:
      return DocumentIcon;
  }
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const FileList = ({ filter }: FileListProps) => {
  const [files, setFiles] = useState<FileUploadResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Preview State
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      let categoryFilter: string | undefined;
      if (["images", "audio", "documents"].includes(filter)) {
        categoryFilter = filter;
      }

      const data = await fileService.listFiles({
        category: categoryFilter,
        include_deleted: false,
      });
      setFiles(data);
    } catch (error) {
      console.error("Failed to load files", error);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleDelete = async (fileId: string) => {
    if (!confirm("Are you sure you want to delete this file?")) return;
    try {
      await fileService.deleteFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (error) {
      console.error("Delete failed", error);
    }
  };

  const handleDownload = async (fileId: string) => {
    try {
      const { download_url } = await fileService.getFileUrl(fileId);
      window.open(download_url, "_blank");
    } catch (error) {
      console.error("Download failed", error);
    }
  };

  const handlePreview = (file: FileUploadResponse) => {
    setPreviewFile({
      id: file.id,
      name: file.original_filename,
      type: file.content_type,
      size: file.file_size,
    });
    setIsPreviewOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
        Loading files...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-neutral-500">
        No files found.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-black">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-800">
          <thead className="bg-neutral-50 dark:bg-neutral-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Size
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Date
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-white dark:divide-neutral-800 dark:bg-black">
            {files.map((file, idx) => {
              const Icon = getFileIcon(file.category);
              return (
                <motion.tr
                  key={file.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="group hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <td className="whitespace-nowrap px-6 py-4">
                    <button
                      onClick={() => handlePreview(file)}
                      className="flex items-center hover:text-indigo-600 dark:hover:text-indigo-400 text-left"
                    >
                      <div className="flex-shrink-0">
                        <Icon className="h-5 w-5 text-neutral-400 group-hover:text-indigo-500" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-neutral-900 dark:text-neutral-200">
                          {file.original_filename}
                        </div>
                      </div>
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-500 dark:text-neutral-400">
                    {formatSize(file.file_size)}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-neutral-500 dark:text-neutral-400">
                    {format(new Date(file.created_at), "MMM d, yyyy")}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                    <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => handlePreview(file)}
                        className="text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                        title="Preview"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDownload(file.id)}
                        className="text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                        title="Download"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(file.id)}
                        className="text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                        title="Delete"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        file={previewFile}
      />
    </>
  );
};
