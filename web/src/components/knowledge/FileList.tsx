import { PreviewModal } from "@/components/preview/PreviewModal";
import type { PreviewFile } from "@/components/preview/types";
import { fileService, type FileUploadResponse } from "@/service/fileService";
import {
  ArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon,
  DocumentIcon,
  EyeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { format } from "date-fns";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { FileIcon } from "./FileIcon";
import type { KnowledgeTab, ViewMode } from "./types";

interface FileListProps {
  filter: KnowledgeTab;
  viewMode: ViewMode;
  refreshTrigger?: number;
  onFileCountChange?: (count: number) => void;
}

export interface FileListHandle {
  emptyTrash: () => Promise<void>;
}

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const FileList = forwardRef<FileListHandle, FileListProps>(
  ({ filter, viewMode, refreshTrigger, onFileCountChange }, ref) => {
    const [files, setFiles] = useState<FileUploadResponse[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Preview State
    const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        emptyTrash: async () => {
          if (files.length === 0) return;
          if (
            !confirm(
              `Are you sure you want to permanently delete ${files.length} items? This cannot be undone.`,
            )
          )
            return;

          try {
            setIsLoading(true);
            // Hard delete all currently listed files
            await Promise.all(
              files.map((f) => fileService.deleteFile(f.id, true)),
            );
            setFiles([]);
            if (onFileCountChange) onFileCountChange(0);
          } catch (error) {
            console.error("Failed to empty trash", error);
            alert("Failed to empty trash completely. Some files may remain.");
          } finally {
            setIsLoading(false);
          }
        },
      }),
      [files, onFileCountChange],
    );

    const loadFiles = useCallback(async () => {
      setIsLoading(true);
      try {
        const params: { category?: string; include_deleted: boolean } = {
          include_deleted: filter === "trash",
        };

        if (["images", "audio", "documents"].includes(filter)) {
          params.category = filter;
        }

        const data = await fileService.listFiles(params);

        // Client-side filtering because API might return all files (active + deleted) if include_deleted=true
        // If filtering for "trash", we only want deleted files.
        // If filtering for others ("home", "all"), we only want active files (which default include_deleted=false handles, but good to be explicit).

        let filteredData = data;
        if (filter === "trash") {
          filteredData = data.filter((f) => f.is_deleted);
        } else {
          // Double check we don't show deleted files in normal views
          filteredData = data.filter((f) => !f.is_deleted);
        }

        setFiles(filteredData);
        if (onFileCountChange) {
          onFileCountChange(filteredData.length);
        }
      } catch (error) {
        console.error("Failed to load files", error);
      } finally {
        setIsLoading(false);
      }
    }, [filter, onFileCountChange]);

    useEffect(() => {
      loadFiles();
    }, [loadFiles, refreshTrigger]);

    const handleDelete = async (fileId: string) => {
      // If in trash, perform hard delete
      const isHardDelete = filter === "trash";
      const confirmMsg = isHardDelete
        ? "Are you sure you want to permanently delete this file? This cannot be undone."
        : "Are you sure you want to move this file to Trash?";

      if (!confirm(confirmMsg)) return;

      try {
        await fileService.deleteFile(fileId, isHardDelete);
        setFiles((prev) => {
          const next = prev.filter((f) => f.id !== fileId);
          if (onFileCountChange) onFileCountChange(next.length);
          return next;
        });
      } catch (error) {
        console.error("Delete failed", error);
      }
    };

    const handleRestore = async (fileId: string) => {
      try {
        await fileService.restoreFile(fileId);
        // Remove from trash view
        setFiles((prev) => {
          const next = prev.filter((f) => f.id !== fileId);
          if (onFileCountChange) onFileCountChange(next.length);
          return next;
        });
      } catch (error) {
        console.error("Restore failed", error);
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
        <div className="flex h-full items-center justify-center text-sm text-neutral-500">
          Loading...
        </div>
      );
    }

    if (files.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-neutral-400">
          <DocumentIcon className="h-8 w-8 opacity-50" />
          <span>{filter === "trash" ? "Trash is empty" : "No items"}</span>
        </div>
      );
    }

    return (
      <div className="h-full w-full" onClick={() => setSelectedId(null)}>
        {viewMode === "list" ? (
          <div className="min-w-full inline-block align-middle">
            <div className="border-b border-neutral-200 dark:border-neutral-800">
              <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium uppercase text-neutral-500 dark:text-neutral-400">
                <div className="col-span-6">Name</div>
                <div className="col-span-2">Size</div>
                <div className="col-span-3">Date Modified</div>
                <div className="col-span-1"></div>
              </div>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800/50">
              {files.map((file) => {
                const isSelected = selectedId === file.id;

                return (
                  <div
                    key={file.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(file.id);
                    }}
                    onDoubleClick={() => handlePreview(file)}
                    className={`group grid grid-cols-12 gap-4 px-4 py-2 text-sm items-center cursor-default ${
                      isSelected
                        ? "bg-indigo-600 text-white"
                        : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800 odd:bg-white even:bg-neutral-50/50 dark:odd:bg-transparent dark:even:bg-white/5"
                    }`}
                  >
                    <div className="col-span-6 flex items-center gap-3 overflow-hidden">
                      <div className="flex-shrink-0">
                        <FileIcon
                          filename={file.original_filename}
                          mimeType={file.content_type}
                          className="h-5 w-5"
                        />
                      </div>
                      <span className="truncate">{file.original_filename}</span>
                    </div>
                    <div
                      className={`col-span-2 text-xs ${isSelected ? "text-indigo-200" : "text-neutral-500 dark:text-neutral-400"}`}
                    >
                      {formatSize(file.file_size)}
                    </div>
                    <div
                      className={`col-span-3 text-xs ${isSelected ? "text-indigo-200" : "text-neutral-500 dark:text-neutral-400"}`}
                    >
                      {format(new Date(file.created_at), "MMM d, yyyy HH:mm")}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {/* Context Menu or Hover Actions */}
                      <div
                        className={`flex gap-2 ${isSelected ? "text-white" : "text-neutral-400 opacity-0 group-hover:opacity-100"}`}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreview(file);
                          }}
                          title="Preview"
                        >
                          <EyeIcon
                            className={`h-4 w-4 ${isSelected ? "hover:text-white" : "hover:text-indigo-600"}`}
                          />
                        </button>

                        {filter === "trash" ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestore(file.id);
                            }}
                            title="Restore"
                          >
                            <ArrowPathRoundedSquareIcon
                              className={`h-4 w-4 ${isSelected ? "hover:text-white" : "hover:text-green-600"}`}
                            />
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(file.id);
                            }}
                            title="Download"
                          >
                            <ArrowDownTrayIcon
                              className={`h-4 w-4 ${isSelected ? "hover:text-white" : "hover:text-indigo-600"}`}
                            />
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(file.id);
                          }}
                          title={
                            filter === "trash"
                              ? "Delete Immediately"
                              : "Move to Trash"
                          }
                        >
                          <TrashIcon
                            className={`h-4 w-4 ${isSelected ? "hover:text-red-200" : "hover:text-red-500"}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 p-4 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
            {files.map((file) => {
              const isSelected = selectedId === file.id;

              return (
                <div
                  key={file.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(file.id);
                  }}
                  onDoubleClick={() => handlePreview(file)}
                  className={`group flex flex-col items-center gap-2 rounded-md p-3 text-center cursor-default ${
                    isSelected
                      ? "bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-900/50"
                      : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center">
                    <FileIcon
                      filename={file.original_filename}
                      mimeType={file.content_type}
                      className="h-10 w-10"
                    />
                  </div>
                  <span
                    className={`w-full truncate text-xs font-medium ${isSelected ? "text-indigo-700 dark:text-indigo-300" : "text-neutral-700 dark:text-neutral-300"}`}
                  >
                    {file.original_filename}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <PreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          file={previewFile}
        />
      </div>
    );
  },
);

FileList.displayName = "FileList";
