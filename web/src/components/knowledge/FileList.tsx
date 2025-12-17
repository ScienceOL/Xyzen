import { PreviewModal } from "@/components/preview/PreviewModal";
import type { PreviewFile } from "@/components/preview/types";
import { fileService, type FileUploadResponse } from "@/service/fileService";
import { folderService, type Folder } from "@/service/folderService";
import { ContextMenu, type ContextMenuType } from "./ContextMenu";
import { MoveToModal } from "./MoveToModal";
import {
  ArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon,
  DocumentIcon,
  EyeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { FolderIcon } from "@heroicons/react/24/solid";
import { format } from "date-fns";
import React, {
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
  currentFolderId?: string | null;
  onFolderChange?: (folderId: string | null) => void;
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

export const FileList = React.memo(
  forwardRef<FileListHandle, FileListProps>(
    (
      {
        filter,
        viewMode,
        refreshTrigger,
        onFileCountChange,
        currentFolderId,
        onFolderChange,
      },
      ref,
    ) => {
      const [files, setFiles] = useState<FileUploadResponse[]>([]);
      const [folders, setFolders] = useState<Folder[]>([]);
      const [isLoading, setIsLoading] = useState(false);

      // Preview State
      const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
      const [isPreviewOpen, setIsPreviewOpen] = useState(false);
      const [selectedId, setSelectedId] = useState<string | null>(null);

      // Context Menu State
      const [contextMenu, setContextMenu] = useState<{
        type: ContextMenuType;
        item: Folder | FileUploadResponse;
        position: { x: number; y: number };
      } | null>(null);

      // Modal States
      const [moveModal, setMoveModal] = useState<{
        isOpen: boolean;
        item: Folder | FileUploadResponse;
        type: ContextMenuType;
      } | null>(null);

      useImperativeHandle(
        ref,
        () => ({
          emptyTrash: async () => {
            if (files.length === 0 && folders.length === 0) return;
            const count = files.length + folders.length;
            if (
              !confirm(
                `Are you sure you want to permanently delete ${count} items? This cannot be undone.`,
              )
            )
              return;

            try {
              setIsLoading(true);
              // Hard delete all currently listed files
              await Promise.all(
                files.map((f) => fileService.deleteFile(f.id, true)),
              );
              // Hard delete all currently listed folders
              await Promise.all(
                folders.map((f) => folderService.deleteFolder(f.id, true)),
              );

              setFiles([]);
              setFolders([]);
              if (onFileCountChange) onFileCountChange(0);
            } catch (error) {
              console.error("Failed to empty trash", error);
              alert("Failed to empty trash completely. Some items may remain.");
            } finally {
              setIsLoading(false);
            }
          },
        }),
        [files, folders, onFileCountChange],
      );

      const loadFiles = useCallback(async () => {
        setIsLoading(true);
        try {
          if (filter === "folders") {
            // ... (existing logic)
            const folderData = await folderService.listFolders(
              currentFolderId || null,
            );
            setFolders(folderData);
            const fileData = await fileService.listFiles({
              folder_id: currentFolderId || null,
              filter_by_folder: true,
            });
            setFiles(fileData);
            if (onFileCountChange)
              onFileCountChange(fileData.length + folderData.length);
            return;
          }

          const params: { category?: string; include_deleted: boolean } = {
            include_deleted: filter === "trash",
          };

          if (["images", "audio", "documents"].includes(filter)) {
            params.category = filter;
          }

          const data = await fileService.listFiles(params);

          let filteredData = data;

          if (filter === "trash") {
            filteredData = data.filter((f) => f.is_deleted);
            // Also fetch deleted folders for Trash view (Root only for now)
            const deletedFolders = await folderService.listFolders(null, true);
            // Filter to show only deleted ones (backend might return all if include_deleted is just a flag)
            // Backend `get_folders_by_user`: `if not include_deleted: statement = statement.where(Folder.is_deleted == False)`
            // So if include_deleted=True, it returns BOTH active and deleted.
            // We need to filter client side for Trash view.
            setFolders(deletedFolders.filter((f) => f.is_deleted));
          } else {
            filteredData = data.filter((f) => !f.is_deleted);
            setFolders([]);
          }

          setFiles(filteredData);

          if (onFileCountChange) {
            onFileCountChange(filteredData.length); // + folders?
          }
        } catch (error) {
          console.error("Failed to load files", error);
        } finally {
          setIsLoading(false);
        }
      }, [filter, currentFolderId, onFileCountChange]);

      useEffect(() => {
        loadFiles();
      }, [loadFiles, refreshTrigger]);

      const handleContextMenu = (
        e: React.MouseEvent,
        item: Folder | FileUploadResponse,
        type: ContextMenuType,
      ) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({
          type,
          item,
          position: { x: e.clientX, y: e.clientY },
        });
        setSelectedId(item.id);
      };

      const handleRename = async (
        item: Folder | FileUploadResponse,
        type: ContextMenuType,
      ) => {
        const newName = prompt(
          "Enter new name:",
          type === "folder"
            ? (item as Folder).name
            : (item as FileUploadResponse).original_filename,
        );
        if (!newName || newName.trim() === "") return;

        try {
          if (type === "folder") {
            await folderService.updateFolder(item.id, { name: newName });
          } else {
            await fileService.updateFile(item.id, {
              original_filename: newName,
            });
          }
          loadFiles(); // Refresh
        } catch (e) {
          console.error("Rename failed", e);
          alert("Rename failed");
        }
      };

      const handleMove = async (targetFolderId: string | null) => {
        if (!moveModal) return;
        const { item, type } = moveModal;

        try {
          if (type === "folder") {
            await folderService.updateFolder(item.id, {
              parent_id: targetFolderId,
            });
          } else {
            await fileService.updateFile(item.id, {
              folder_id: targetFolderId,
            });
          }
          loadFiles(); // Refresh list
          setMoveModal(null);
        } catch (e) {
          console.error("Move failed", e);
          alert("Move failed");
        }
      };

      const handleDeleteItem = async (
        item: Folder | FileUploadResponse,
        type: ContextMenuType,
      ) => {
        if (!confirm(`Are you sure you want to delete this ${type}?`)) return;

        try {
          const isHardDelete = filter === "trash";
          if (type === "folder") {
            await folderService.deleteFolder(item.id, isHardDelete);
          } else {
            await fileService.deleteFile(item.id, isHardDelete);
          }
          loadFiles();
        } catch (e) {
          console.error("Delete failed", e);
          alert("Delete failed");
        }
      };

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

      const handleRestore = async (id: string, type: ContextMenuType) => {
        try {
          if (type === "folder") {
            // Need to implement restoreFolder in service
            await folderService.updateFolder(id, { is_deleted: false });
          } else {
            await fileService.restoreFile(id);
          }

          // Remove from trash view
          if (type === "folder") {
            setFolders((prev) => prev.filter((f) => f.id !== id));
          } else {
            setFiles((prev) => {
              const next = prev.filter((f) => f.id !== id);
              if (onFileCountChange) onFileCountChange(next.length);
              return next;
            });
          }
        } catch (error) {
          console.error("Restore failed", error);
          alert("Restore failed");
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

      const handleFolderClick = (folderId: string) => {
        if (onFolderChange) {
          onFolderChange(folderId);
        }
      };

      if (isLoading) {
        return (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            Loading...
          </div>
        );
      }

      if (files.length === 0 && folders.length === 0) {
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
                {folders.map((folder) => (
                  <div
                    key={`folder-${folder.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(folder.id);
                    }}
                    onDoubleClick={() => handleFolderClick(folder.id)}
                    onContextMenu={(e) =>
                      handleContextMenu(e, folder, "folder")
                    }
                    className={`group grid grid-cols-12 gap-4 px-4 py-2 text-sm items-center cursor-default ${
                      selectedId === folder.id
                        ? "bg-indigo-600 text-white"
                        : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <div className="col-span-6 flex items-center gap-3 overflow-hidden">
                      <div className="flex-shrink-0">
                        <FolderIcon className="h-5 w-5 text-yellow-500" />
                      </div>
                      <span className="truncate font-medium">
                        {folder.name}
                      </span>
                    </div>
                    <div className="col-span-2 text-xs opacity-50">-</div>
                    <div className="col-span-3 text-xs opacity-50">
                      {format(new Date(folder.created_at), "MMM d, yyyy HH:mm")}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      {/* Folder Actions */}
                      <div
                        className={`flex gap-2 ${selectedId === folder.id ? "text-white" : "text-neutral-400 opacity-0 group-hover:opacity-100"}`}
                      >
                        {filter === "trash" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestore(folder.id, "folder");
                            }}
                            title="Restore"
                          >
                            <ArrowPathRoundedSquareIcon
                              className={`h-4 w-4 ${selectedId === folder.id ? "hover:text-white" : "hover:text-green-600"}`}
                            />
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteItem(folder, "folder");
                          }}
                          title={
                            filter === "trash" ? "Delete Immediately" : "Delete"
                          }
                        >
                          <TrashIcon
                            className={`h-4 w-4 ${selectedId === folder.id ? "hover:text-red-200" : "hover:text-red-500"}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
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
                      onContextMenu={(e) => handleContextMenu(e, file, "file")}
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
                        <span className="truncate">
                          {file.original_filename}
                        </span>
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
                                handleRestore(file.id, "file");
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
              {folders.map((folder) => (
                <div
                  key={`folder-${folder.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(folder.id);
                  }}
                  onDoubleClick={() => handleFolderClick(folder.id)}
                  onContextMenu={(e) => handleContextMenu(e, folder, "folder")}
                  className={`group flex flex-col items-center gap-2 rounded-md p-3 text-center cursor-default ${
                    selectedId === folder.id
                      ? "bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-900/50"
                      : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center">
                    <FolderIcon className="h-10 w-10 text-yellow-500" />
                  </div>
                  <span
                    className={`w-full truncate text-xs font-medium ${selectedId === folder.id ? "text-indigo-700 dark:text-indigo-300" : "text-neutral-700 dark:text-neutral-300"}`}
                  >
                    {folder.name}
                  </span>
                </div>
              ))}

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
                    onContextMenu={(e) => handleContextMenu(e, file, "file")}
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

          {contextMenu && (
            <ContextMenu
              type={contextMenu.type}
              item={contextMenu.item}
              position={contextMenu.position}
              onClose={() => setContextMenu(null)}
              onRename={handleRename}
              onDelete={handleDeleteItem}
              onMove={(item, type) =>
                setMoveModal({ isOpen: true, item, type })
              }
              onDownload={(item) => handleDownload(item.id)}
            />
          )}

          {moveModal && (
            <MoveToModal
              isOpen={moveModal.isOpen}
              onClose={() => setMoveModal(null)}
              onMove={handleMove}
              title={`Move "${moveModal.type === "folder" ? (moveModal.item as Folder).name : (moveModal.item as FileUploadResponse).original_filename}"`}
              currentFolderId={currentFolderId || null}
              itemId={moveModal.item.id}
              itemType={moveModal.type}
            />
          )}

          <PreviewModal
            isOpen={isPreviewOpen}
            onClose={() => setIsPreviewOpen(false)}
            file={previewFile}
          />
        </div>
      );
    },
  ),
);

FileList.displayName = "FileList";
