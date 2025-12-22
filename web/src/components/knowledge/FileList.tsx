import ConfirmationModal from "@/components/modals/ConfirmationModal";
import InputModal from "@/components/modals/InputModal";
import NotificationModal from "@/components/modals/NotificationModal";
import { PreviewModal } from "@/components/preview/PreviewModal";
import type { PreviewFile } from "@/components/preview/types";
import { fileService, type FileUploadResponse } from "@/service/fileService";
import { folderService, type Folder } from "@/service/folderService";
import {
  knowledgeSetService,
  type KnowledgeSetWithFileCount,
} from "@/service/knowledgeSetService";
import {
  ArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon,
  DocumentIcon,
  EyeIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { FolderIcon } from "@heroicons/react/24/solid";
import { useXyzen } from "@/store";
import { format } from "date-fns";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { ContextMenu, type ContextMenuType } from "./ContextMenu";
import { FileIcon } from "./FileIcon";
import { MoveToModal } from "./MoveToModal";
import type { KnowledgeTab, ViewMode } from "./types";

interface FileListProps {
  filter: KnowledgeTab;
  viewMode: ViewMode;
  refreshTrigger: number;
  onRefresh?: () => void;
  onFileCountChange?: (count: number) => void;
  currentFolderId: string | null;
  onFolderChange?: (folderId: string | null) => void;
  currentKnowledgeSetId?: string | null;
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
        onRefresh,
        onFileCountChange,
        currentFolderId,
        onFolderChange,
        currentKnowledgeSetId,
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

      const [knowledgeSetModal, setKnowledgeSetModal] = useState<{
        isOpen: boolean;
        file: FileUploadResponse;
      } | null>(null);

      const [knowledgeSets, setKnowledgeSets] = useState<
        KnowledgeSetWithFileCount[]
      >([]);

      // Confirmation Modal State
      const [confirmation, setConfirmation] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmLabel?: string;
        destructive?: boolean;
        onConfirm: () => void;
      } | null>(null);

      // Rename Modal State
      const [renameModal, setRenameModal] = useState<{
        isOpen: boolean;
        item: Folder | FileUploadResponse;
        type: ContextMenuType;
      } | null>(null);

      // Notification State
      const [notification, setNotification] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        type: "info" | "success" | "warning" | "error";
      } | null>(null);

      useImperativeHandle(
        ref,
        () => ({
          emptyTrash: async () => {
            if (files.length === 0 && folders.length === 0) return;
            const count = files.length + folders.length;

            setConfirmation({
              isOpen: true,
              title: "Empty Trash",
              message: `Are you sure you want to permanently delete ${count} items? This cannot be undone.`,
              confirmLabel: "Empty Trash",
              destructive: true,
              onConfirm: async () => {
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
                  if (onRefresh) onRefresh();
                } catch (error) {
                  console.error("Failed to empty trash", error);
                  alert(
                    "Failed to empty trash completely. Some items may remain.",
                  );
                } finally {
                  setIsLoading(false);
                }
              },
            });
          },
        }),
        [files, folders, onFileCountChange, onRefresh],
      );

      // Load knowledge sets for the modal
      useEffect(() => {
        const loadKnowledgeSets = async () => {
          try {
            const sets = await knowledgeSetService.listKnowledgeSets(false);
            setKnowledgeSets(sets);
          } catch (error) {
            console.error("Failed to load knowledge sets", error);
          }
        };
        loadKnowledgeSets();
      }, [refreshTrigger]);

      const loadFiles = useCallback(async () => {
        setIsLoading(true);
        try {
          // Handle Knowledge Set view
          if (filter === "knowledge" && currentKnowledgeSetId) {
            // Get file IDs linked to this knowledge set
            const fileIds = await knowledgeSetService.getFilesInKnowledgeSet(
              currentKnowledgeSetId,
            );

            // Fetch file details for each ID
            if (fileIds.length > 0) {
              const filePromises = fileIds.map((id) =>
                fileService.getFile(id).catch(() => null),
              );
              const filesData = await Promise.all(filePromises);
              const validFiles = filesData.filter(
                (f) => f !== null && !f.is_deleted,
              ) as FileUploadResponse[];
              setFiles(validFiles);
              setFolders([]);
              if (onFileCountChange) onFileCountChange(validFiles.length);
            } else {
              setFiles([]);
              setFolders([]);
              if (onFileCountChange) onFileCountChange(0);
            }
            return;
          }

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
      }, [filter, currentFolderId, currentKnowledgeSetId, onFileCountChange]);

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
        setRenameModal({ isOpen: true, item, type });
      };

      const handleRenameConfirm = async (newName: string) => {
        if (!renameModal) return;
        const { item, type } = renameModal;

        try {
          if (type === "folder") {
            await folderService.updateFolder(item.id, { name: newName });
          } else {
            await fileService.updateFile(item.id, {
              original_filename: newName,
            });
          }
          loadFiles(); // Refresh
          if (onRefresh) onRefresh();
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
          if (onRefresh) onRefresh();
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
        setConfirmation({
          isOpen: true,
          title: `Delete ${type === "folder" ? "Folder" : "File"}`,
          message: `Are you sure you want to delete this ${type}?`,
          confirmLabel: "Delete",
          destructive: true,
          onConfirm: async () => {
            try {
              const isHardDelete = filter === "trash";
              if (type === "folder") {
                await folderService.deleteFolder(item.id, isHardDelete);
              } else {
                await fileService.deleteFile(item.id, isHardDelete);
              }
              loadFiles();
              if (onRefresh) onRefresh();
            } catch (e) {
              console.error("Delete failed", e);
              alert("Delete failed");
            }
          },
        });
      };

      const handleDelete = async (fileId: string) => {
        // If in trash, perform hard delete
        const isHardDelete = filter === "trash";
        const confirmMsg = isHardDelete
          ? "Are you sure you want to permanently delete this file? This cannot be undone."
          : "Are you sure you want to move this file to Trash?";

        setConfirmation({
          isOpen: true,
          title: isHardDelete ? "Delete Forever" : "Move to Trash",
          message: confirmMsg,
          confirmLabel: isHardDelete ? "Delete Forever" : "Move to Trash",
          destructive: true,
          onConfirm: async () => {
            try {
              await fileService.deleteFile(fileId, isHardDelete);
              setFiles((prev) => {
                const next = prev.filter((f) => f.id !== fileId);
                if (onFileCountChange) onFileCountChange(next.length);
                return next;
              });
              if (onRefresh) onRefresh();
            } catch (error) {
              console.error("Delete failed", error);
            }
          },
        });
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
          if (onRefresh) onRefresh();
        } catch (error) {
          console.error("Restore failed", error);
          alert("Restore failed");
        }
      };

      const backendUrl = useXyzen((state) => state.backendUrl);
      const token = useXyzen((state) => state.token);

      const handleDownload = async (fileId: string, fileName: string) => {
        try {
          // Use proxy download endpoint to handle auth and force download
          const base = backendUrl || window.location.origin;
          const url = `${base}${base.endsWith("/") ? "" : "/"}xyzen/api/v1/files/${fileId}/download`;

          const response = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });

          if (!response.ok) throw new Error("Download failed");

          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = objectUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(objectUrl);
        } catch (error) {
          console.error("Download failed", error);
          alert("Download failed");
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

      const handleAddToKnowledgeSet = (file: FileUploadResponse) => {
        setKnowledgeSetModal({ isOpen: true, file });
      };

      const handleRemoveFromKnowledgeSet = async (file: FileUploadResponse) => {
        if (!currentKnowledgeSetId) return;

        setConfirmation({
          isOpen: true,
          title: "Remove from Knowledge Set",
          message: `Remove "${file.original_filename}" from this knowledge set?`,
          confirmLabel: "Remove",
          destructive: true,
          onConfirm: async () => {
            try {
              await knowledgeSetService.unlinkFileFromKnowledgeSet(
                currentKnowledgeSetId,
                file.id,
              );
              // Refresh the file list
              loadFiles();
              if (onRefresh) onRefresh();
            } catch (error) {
              console.error("Failed to remove file from knowledge set", error);
              alert("Failed to remove file from knowledge set");
            }
          },
        });
      };

      const handleLinkToKnowledgeSet = async (knowledgeSetId: string) => {
        if (!knowledgeSetModal) return;

        try {
          await knowledgeSetService.linkFileToKnowledgeSet(
            knowledgeSetId,
            knowledgeSetModal.file.id,
          );
          setKnowledgeSetModal(null);
          if (onRefresh) onRefresh();
          setNotification({
            isOpen: true,
            title: "Success",
            message: "File added to knowledge set successfully",
            type: "success",
          });
        } catch (error: unknown) {
          console.error("Failed to link file to knowledge set", error);
          const msg = error instanceof Error ? error.message : String(error);
          if (
            msg.toLowerCase().includes("already") ||
            msg.toLowerCase().includes("duplicate")
          ) {
            setNotification({
              isOpen: true,
              title: "Notice",
              message: "This file is already in the knowledge set.",
              type: "warning",
            });
          } else {
            setNotification({
              isOpen: true,
              title: "Error",
              message: "Failed to add file to knowledge set",
              type: "error",
            });
          }
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
                  <div className="col-span-8 md:col-span-6">Name</div>
                  <div className="hidden md:block md:col-span-2">Size</div>
                  <div className="hidden md:block md:col-span-3">
                    Date Modified
                  </div>
                  <div className="col-span-4 md:col-span-1"></div>
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
                    <div className="col-span-8 md:col-span-6 flex items-center gap-3 overflow-hidden">
                      <div className="flex-shrink-0">
                        <FolderIcon className="h-5 w-5 text-yellow-500" />
                      </div>
                      <span className="truncate font-medium">
                        {folder.name}
                      </span>
                    </div>
                    <div className="hidden md:block md:col-span-2 text-xs opacity-50">
                      -
                    </div>
                    <div className="hidden md:block md:col-span-3 text-xs opacity-50">
                      {format(new Date(folder.created_at), "MMM d, yyyy HH:mm")}
                    </div>
                    <div className="col-span-4 md:col-span-1 flex justify-end">
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
                      <div className="col-span-8 md:col-span-6 flex items-center gap-3 overflow-hidden">
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
                        className={`hidden md:block md:col-span-2 text-xs ${isSelected ? "text-indigo-200" : "text-neutral-500 dark:text-neutral-400"}`}
                      >
                        {formatSize(file.file_size)}
                      </div>
                      <div
                        className={`hidden md:block md:col-span-3 text-xs ${isSelected ? "text-indigo-200" : "text-neutral-500 dark:text-neutral-400"}`}
                      >
                        {format(new Date(file.created_at), "MMM d, yyyy HH:mm")}
                      </div>
                      <div className="col-span-4 md:col-span-1 flex justify-end">
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
                                handleDownload(file.id, file.original_filename);
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
              onDownload={
                contextMenu.type === "file"
                  ? (item) =>
                      handleDownload(
                        item.id,
                        (item as FileUploadResponse).original_filename,
                      )
                  : undefined
              }
              onAddToKnowledgeSet={
                contextMenu.type === "file"
                  ? handleAddToKnowledgeSet
                  : undefined
              }
              onRemoveFromKnowledgeSet={
                contextMenu.type === "file"
                  ? handleRemoveFromKnowledgeSet
                  : undefined
              }
              isInKnowledgeSetView={filter === "knowledge"}
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

          {/* Knowledge Set Selection Modal */}
          {knowledgeSetModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
                <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
                  Add to Knowledge Set
                </h3>
                <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
                  Select a knowledge set to add "
                  {knowledgeSetModal.file.original_filename}"
                </p>
                <div className="mb-4 max-h-64 space-y-2 overflow-y-auto">
                  {knowledgeSets.length === 0 ? (
                    <p className="text-sm text-neutral-400 italic">
                      No knowledge sets available. Create one first.
                    </p>
                  ) : (
                    knowledgeSets.map((ks) => (
                      <button
                        key={ks.id}
                        onClick={() => handleLinkToKnowledgeSet(ks.id)}
                        className="flex w-full items-center justify-between rounded-lg border border-neutral-200 p-3 text-left hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-neutral-900 dark:text-white">
                            {ks.name}
                          </div>
                          {ks.description && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">
                              {ks.description}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {ks.file_count} files
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <button
                  onClick={() => setKnowledgeSetModal(null)}
                  className="w-full rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {confirmation && (
            <ConfirmationModal
              isOpen={confirmation.isOpen}
              onClose={() => setConfirmation(null)}
              onConfirm={confirmation.onConfirm}
              title={confirmation.title}
              message={confirmation.message}
              confirmLabel={confirmation.confirmLabel}
              destructive={confirmation.destructive}
            />
          )}

          {renameModal && (
            <InputModal
              isOpen={renameModal.isOpen}
              onClose={() => setRenameModal(null)}
              onConfirm={handleRenameConfirm}
              title={`Rename ${renameModal.type === "folder" ? "Folder" : "File"}`}
              initialValue={
                renameModal.type === "folder"
                  ? (renameModal.item as Folder).name
                  : (renameModal.item as FileUploadResponse).original_filename
              }
              placeholder="Enter new name"
              confirmLabel="Rename"
            />
          )}

          {notification && (
            <NotificationModal
              isOpen={notification.isOpen}
              onClose={() => setNotification(null)}
              title={notification.title}
              message={notification.message}
              type={notification.type}
            />
          )}
        </div>
      );
    },
  ),
);

FileList.displayName = "FileList";
