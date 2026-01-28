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
import { useXyzen } from "@/store";
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
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { ContextMenu, type ContextMenuType } from "./ContextMenu";
import { FileIcon } from "./FileIcon";
import { ImageThumbnail } from "./ImageThumbnail";
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

const isImageFile = (mimeType: string, filename: string) => {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return (
    mimeType.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"].includes(ext)
  );
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
      const { t } = useTranslation();
      const [files, setFiles] = useState<FileUploadResponse[]>([]);
      const [folders, setFolders] = useState<Folder[]>([]);
      const [isLoading, setIsLoading] = useState(false);

      // Preview State
      const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
      const [isPreviewOpen, setIsPreviewOpen] = useState(false);
      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

      // Selection box state for drag select
      const [selectionBox, setSelectionBox] = useState<{
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
      } | null>(null);
      const containerRef = useRef<HTMLDivElement>(null);
      const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
      const didSelectionRef = useRef(false);
      // Track potential selection start (before drag threshold is met)
      const selectionStartRef = useRef<{
        startX: number;
        startY: number;
        clientX: number;
        clientY: number;
        ctrlKey: boolean;
        metaKey: boolean;
      } | null>(null);
      const DRAG_THRESHOLD = 5; // pixels to move before starting selection box

      // Helper to handle item click with multi-select support
      const handleItemClick = useCallback(
        (e: React.MouseEvent, itemId: string) => {
          e.stopPropagation();
          if (didLongPressRef.current) {
            didLongPressRef.current = false;
            return;
          }
          // If we just finished a drag selection, don't change selection
          if (didSelectionRef.current) {
            didSelectionRef.current = false;
            return;
          }

          // Ctrl/Cmd click to toggle selection
          if (e.ctrlKey || e.metaKey) {
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(itemId)) {
                next.delete(itemId);
              } else {
                next.add(itemId);
              }
              return next;
            });
          } else {
            // Normal click - select only this item
            setSelectedIds(new Set([itemId]));
          }
        },
        [],
      );

      // Selection box handlers for drag select
      const handleSelectionStart = useCallback((e: React.MouseEvent) => {
        // Don't start selection on right-click
        if (e.button !== 0) return;

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const startX = e.clientX - rect.left + container.scrollLeft;
        const startY = e.clientY - rect.top + container.scrollTop;

        // Store the potential selection start point
        selectionStartRef.current = {
          startX,
          startY,
          clientX: e.clientX,
          clientY: e.clientY,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
        };
      }, []);

      const handleSelectionMove = useCallback(
        (e: React.MouseEvent) => {
          const container = containerRef.current;
          if (!container) return;

          const rect = container.getBoundingClientRect();
          const currentX = e.clientX - rect.left + container.scrollLeft;
          const currentY = e.clientY - rect.top + container.scrollTop;

          // Check if we should start the selection box (drag threshold)
          if (selectionStartRef.current && !selectionBox) {
            const dx = e.clientX - selectionStartRef.current.clientX;
            const dy = e.clientY - selectionStartRef.current.clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance >= DRAG_THRESHOLD) {
              // Start the selection box
              setSelectionBox({
                startX: selectionStartRef.current.startX,
                startY: selectionStartRef.current.startY,
                currentX,
                currentY,
              });

              // Clear selection if not holding Ctrl/Cmd
              if (
                !selectionStartRef.current.ctrlKey &&
                !selectionStartRef.current.metaKey
              ) {
                setSelectedIds(new Set());
              }
            }
            return;
          }

          if (!selectionBox) return;

          setSelectionBox((prev) =>
            prev ? { ...prev, currentX, currentY } : null,
          );

          // Calculate selection box bounds
          const boxLeft = Math.min(selectionBox.startX, currentX);
          const boxRight = Math.max(selectionBox.startX, currentX);
          const boxTop = Math.min(selectionBox.startY, currentY);
          const boxBottom = Math.max(selectionBox.startY, currentY);

          // Check which items are within the selection box
          const newSelection = new Set<string>();
          itemRefs.current.forEach((element, id) => {
            const itemRect = element.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            const itemLeft =
              itemRect.left - containerRect.left + container.scrollLeft;
            const itemRight =
              itemRect.right - containerRect.left + container.scrollLeft;
            const itemTop =
              itemRect.top - containerRect.top + container.scrollTop;
            const itemBottom =
              itemRect.bottom - containerRect.top + container.scrollTop;

            // Check if item intersects with selection box
            if (
              itemLeft < boxRight &&
              itemRight > boxLeft &&
              itemTop < boxBottom &&
              itemBottom > boxTop
            ) {
              newSelection.add(id);
            }
          });

          setSelectedIds(newSelection);
        },
        [selectionBox],
      );

      const handleSelectionEnd = useCallback(() => {
        // Mark that we just finished a selection to prevent onClick from clearing
        if (selectionBox) {
          didSelectionRef.current = true;
        }
        setSelectionBox(null);
        selectionStartRef.current = null;
      }, [selectionBox]);

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
              title: t("knowledge.fileList.emptyTrash.title"),
              message: t("knowledge.fileList.emptyTrash.message", {
                count,
              }),
              confirmLabel: t("knowledge.fileList.emptyTrash.confirm"),
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
                  alert(t("knowledge.fileList.emptyTrash.failed"));
                } finally {
                  setIsLoading(false);
                }
              },
            });
          },
        }),
        [files, folders, onFileCountChange, onRefresh, t],
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
        // Only change selection if clicked item is not already selected
        // This preserves multi-selection when right-clicking on selected items
        if (!selectedIds.has(item.id)) {
          setSelectedIds(new Set([item.id]));
        }
      };

      // Mobile: long-press to open context menu (touch only)
      const longPressTimerRef = useRef<number | null>(null);
      const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
      const didLongPressRef = useRef(false);

      const clearLongPress = useCallback(() => {
        if (longPressTimerRef.current !== null) {
          window.clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressStartRef.current = null;
      }, []);

      const createLongPressHandlers = useCallback(
        (item: Folder | FileUploadResponse, type: ContextMenuType) => {
          const onPointerDown = (e: React.PointerEvent) => {
            if (e.pointerType !== "touch") return;
            didLongPressRef.current = false;
            longPressStartRef.current = { x: e.clientX, y: e.clientY };

            clearLongPress();
            longPressTimerRef.current = window.setTimeout(() => {
              didLongPressRef.current = true;
              // Haptic feedback (best-effort)
              try {
                if ("vibrate" in navigator) {
                  navigator.vibrate(10);
                }
              } catch {
                // ignore
              }
              setContextMenu({
                type,
                item,
                position: { x: e.clientX, y: e.clientY },
              });
              // Only change selection if item is not already selected
              setSelectedIds((prev) =>
                prev.has(item.id) ? prev : new Set([item.id]),
              );
            }, 550);
          };

          const onPointerMove = (e: React.PointerEvent) => {
            if (e.pointerType !== "touch") return;
            const start = longPressStartRef.current;
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            // Cancel if user is scrolling/dragging
            if (Math.hypot(dx, dy) > 10) {
              clearLongPress();
            }
          };

          const onPointerUp = () => {
            clearLongPress();
          };

          const onPointerCancel = () => {
            clearLongPress();
          };

          return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
        },
        [clearLongPress],
      );

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
          alert(t("knowledge.fileList.rename.failed"));
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
          alert(t("knowledge.fileList.move.failed"));
        }
      };

      const handleDeleteItem = async (
        item: Folder | FileUploadResponse,
        type: ContextMenuType,
      ) => {
        // Check if we have multiple items selected and the clicked item is one of them
        const hasMultipleSelected =
          selectedIds.size > 1 && selectedIds.has(item.id);

        if (hasMultipleSelected) {
          // Bulk delete - separate files and folders
          const selectedFileIds: string[] = [];
          const selectedFolderIds: string[] = [];

          selectedIds.forEach((id) => {
            if (files.some((f) => f.id === id)) {
              selectedFileIds.push(id);
            } else if (folders.some((f) => f.id === id)) {
              selectedFolderIds.push(id);
            }
          });

          const totalCount = selectedFileIds.length + selectedFolderIds.length;
          const isHardDelete = filter === "trash";

          setConfirmation({
            isOpen: true,
            title: isHardDelete
              ? t("knowledge.fileList.actions.deleteForever")
              : t("knowledge.fileList.actions.delete"),
            message: t("knowledge.fileList.bulkDelete.message", {
              count: totalCount,
            }),
            confirmLabel: t("knowledge.fileList.actions.delete"),
            destructive: true,
            onConfirm: async () => {
              try {
                // Delete files one by one (more reliable than bulk API)
                if (selectedFileIds.length > 0) {
                  await Promise.all(
                    selectedFileIds.map((id) =>
                      fileService.deleteFile(id, isHardDelete),
                    ),
                  );
                }
                // Delete folders one by one
                if (selectedFolderIds.length > 0) {
                  await Promise.all(
                    selectedFolderIds.map((id) =>
                      folderService.deleteFolder(id, isHardDelete),
                    ),
                  );
                }
                setSelectedIds(new Set());
                loadFiles();
                if (onRefresh) onRefresh();
              } catch (e) {
                console.error("Bulk delete failed", e);
                alert(t("knowledge.fileList.actions.deleteFailed"));
              }
            },
          });
          return;
        }

        // Single item delete
        const itemTypeLabel =
          type === "folder"
            ? t("knowledge.fileList.itemTypes.folder")
            : t("knowledge.fileList.itemTypes.file");

        setConfirmation({
          isOpen: true,
          title: t("knowledge.fileList.deleteItem.title", {
            itemType: itemTypeLabel,
          }),
          message: t("knowledge.fileList.deleteItem.message", {
            itemType: itemTypeLabel,
          }),
          confirmLabel: t("knowledge.fileList.actions.delete"),
          destructive: true,
          onConfirm: async () => {
            try {
              const isHardDelete = filter === "trash";
              if (type === "folder") {
                await folderService.deleteFolder(item.id, isHardDelete);
              } else {
                await fileService.deleteFile(item.id, isHardDelete);
              }
              setSelectedIds(new Set());
              loadFiles();
              if (onRefresh) onRefresh();
            } catch (e) {
              console.error("Delete failed", e);
              alert(t("knowledge.fileList.actions.deleteFailed"));
            }
          },
        });
      };

      const handleDelete = async (fileId: string) => {
        // If in trash, perform hard delete
        const isHardDelete = filter === "trash";
        const confirmMsg = isHardDelete
          ? t("knowledge.fileList.deleteForever.message")
          : t("knowledge.fileList.moveToTrash.message");

        setConfirmation({
          isOpen: true,
          title: isHardDelete
            ? t("knowledge.fileList.actions.deleteForever")
            : t("knowledge.fileList.actions.moveToTrash"),
          message: confirmMsg,
          confirmLabel: isHardDelete
            ? t("knowledge.fileList.actions.deleteForever")
            : t("knowledge.fileList.actions.moveToTrash"),
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
          alert(t("knowledge.fileList.actions.restoreFailed"));
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
          alert(t("knowledge.fileList.actions.downloadFailed"));
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
          title: t("knowledge.fileList.knowledgeSet.remove.title"),
          message: t("knowledge.fileList.knowledgeSet.remove.message", {
            name: file.original_filename,
          }),
          confirmLabel: t("knowledge.fileList.knowledgeSet.remove.confirm"),
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
              alert(t("knowledge.fileList.knowledgeSet.remove.failed"));
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
            title: t("knowledge.fileList.notifications.successTitle"),
            message: t("knowledge.fileList.knowledgeSet.added"),
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
              title: t("knowledge.fileList.notifications.noticeTitle"),
              message: t("knowledge.fileList.knowledgeSet.alreadyInSet"),
              type: "warning",
            });
          } else {
            setNotification({
              isOpen: true,
              title: t("knowledge.fileList.notifications.errorTitle"),
              message: t("knowledge.fileList.knowledgeSet.addFailed"),
              type: "error",
            });
          }
        }
      };

      if (isLoading) {
        return (
          <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            {t("common.loading")}
          </div>
        );
      }

      if (files.length === 0 && folders.length === 0) {
        return (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-neutral-400">
            <DocumentIcon className="h-8 w-8 opacity-50" />
            <span>
              {filter === "trash"
                ? t("knowledge.fileList.empty.trash")
                : t("knowledge.fileList.empty.noItems")}
            </span>
          </div>
        );
      }

      return (
        <div
          ref={containerRef}
          className="h-full w-full relative select-none"
          onClick={() => {
            // If a long-press just opened the menu, ignore the synthetic click.
            if (didLongPressRef.current) {
              didLongPressRef.current = false;
              return;
            }
            // If we just finished a drag selection, don't clear the selection
            if (didSelectionRef.current) {
              didSelectionRef.current = false;
              return;
            }
            setSelectedIds(new Set());
          }}
          onMouseDown={handleSelectionStart}
          onMouseMove={handleSelectionMove}
          onMouseUp={handleSelectionEnd}
          onMouseLeave={handleSelectionEnd}
        >
          {/* Selection Box */}
          {selectionBox && (
            <div
              className="absolute border-2 border-indigo-500 bg-indigo-500/10 pointer-events-none z-40"
              style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                width: Math.abs(selectionBox.currentX - selectionBox.startX),
                height: Math.abs(selectionBox.currentY - selectionBox.startY),
              }}
            />
          )}
          {viewMode === "list" ? (
            <div className="min-w-full inline-block align-middle">
              <div className="border-b border-neutral-200 dark:border-neutral-800">
                <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium uppercase text-neutral-500 dark:text-neutral-400">
                  <div className="col-span-8 md:col-span-6">
                    {t("knowledge.fileList.columns.name")}
                  </div>
                  <div className="hidden md:block md:col-span-2">
                    {t("knowledge.fileList.columns.size")}
                  </div>
                  <div className="hidden md:block md:col-span-3">
                    {t("knowledge.fileList.columns.dateModified")}
                  </div>
                  <div className="col-span-4 md:col-span-1"></div>
                </div>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800/50">
                {folders.map((folder) => (
                  <div
                    key={`folder-${folder.id}`}
                    ref={(el) => {
                      if (el) itemRefs.current.set(folder.id, el);
                      else itemRefs.current.delete(folder.id);
                    }}
                    onClick={(e) => handleItemClick(e, folder.id)}
                    onDoubleClick={() => handleFolderClick(folder.id)}
                    onContextMenu={(e) =>
                      handleContextMenu(e, folder, "folder")
                    }
                    {...createLongPressHandlers(folder, "folder")}
                    className={`group grid grid-cols-12 gap-4 px-4 py-2 text-sm items-center cursor-default ${
                      selectedIds.has(folder.id)
                        ? "bg-indigo-600 text-white"
                        : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    }`}
                  >
                    <div className="col-span-8 md:col-span-6 flex items-center gap-3 overflow-hidden">
                      <div className="shrink-0">
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
                        className={`flex gap-2 ${selectedIds.has(folder.id) ? "text-white" : "text-neutral-400 opacity-0 group-hover:opacity-100"}`}
                      >
                        {filter === "trash" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestore(folder.id, "folder");
                            }}
                            title={t("knowledge.fileList.actions.restore")}
                          >
                            <ArrowPathRoundedSquareIcon
                              className={`h-4 w-4 ${selectedIds.has(folder.id) ? "hover:text-white" : "hover:text-green-600"}`}
                            />
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteItem(folder, "folder");
                          }}
                          title={
                            filter === "trash"
                              ? t(
                                  "knowledge.fileList.actions.deleteImmediately",
                                )
                              : t("knowledge.fileList.actions.delete")
                          }
                        >
                          <TrashIcon
                            className={`h-4 w-4 ${selectedIds.has(folder.id) ? "hover:text-red-200" : "hover:text-red-500"}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {files.map((file) => {
                  const isSelected = selectedIds.has(file.id);

                  return (
                    <div
                      key={file.id}
                      ref={(el) => {
                        if (el) itemRefs.current.set(file.id, el);
                        else itemRefs.current.delete(file.id);
                      }}
                      onClick={(e) => handleItemClick(e, file.id)}
                      onDoubleClick={() => handlePreview(file)}
                      onContextMenu={(e) => handleContextMenu(e, file, "file")}
                      {...createLongPressHandlers(file, "file")}
                      className={`group grid grid-cols-12 gap-4 px-4 py-2 text-sm items-center cursor-default ${
                        isSelected
                          ? "bg-indigo-600 text-white"
                          : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800 odd:bg-white even:bg-neutral-50/50 dark:odd:bg-transparent dark:even:bg-white/5"
                      }`}
                    >
                      <div className="col-span-8 md:col-span-6 flex items-center gap-3 overflow-hidden">
                        <div className="shrink-0">
                          <FileIcon
                            filename={file.original_filename}
                            mimeType={file.content_type}
                            className="h-5 w-5"
                          />
                        </div>
                        <span className="truncate select-none">
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
                            title={t("knowledge.fileList.actions.preview")}
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
                              title={t("knowledge.fileList.actions.restore")}
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
                              title={t("knowledge.fileList.actions.download")}
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
                                ? t(
                                    "knowledge.fileList.actions.deleteImmediately",
                                  )
                                : t("knowledge.fileList.actions.moveToTrash")
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
                  ref={(el) => {
                    if (el) itemRefs.current.set(folder.id, el);
                    else itemRefs.current.delete(folder.id);
                  }}
                  onClick={(e) => handleItemClick(e, folder.id)}
                  onDoubleClick={() => handleFolderClick(folder.id)}
                  onContextMenu={(e) => handleContextMenu(e, folder, "folder")}
                  {...createLongPressHandlers(folder, "folder")}
                  className={`group flex flex-col items-center gap-2 rounded-md p-3 text-center cursor-default ${
                    selectedIds.has(folder.id)
                      ? "bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-900/50"
                      : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  <div className="flex h-12 w-12 items-center justify-center">
                    <FolderIcon className="h-10 w-10 text-yellow-500" />
                  </div>
                  <span
                    className={`w-full truncate text-xs font-medium ${selectedIds.has(folder.id) ? "text-indigo-700 dark:text-indigo-300" : "text-neutral-700 dark:text-neutral-300"}`}
                  >
                    {folder.name}
                  </span>
                </div>
              ))}

              {files.map((file) => {
                const isSelected = selectedIds.has(file.id);
                const isImage = isImageFile(
                  file.content_type,
                  file.original_filename,
                );

                return (
                  <div
                    key={file.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(file.id, el);
                      else itemRefs.current.delete(file.id);
                    }}
                    onClick={(e) => handleItemClick(e, file.id)}
                    onDoubleClick={() => handlePreview(file)}
                    onContextMenu={(e) => handleContextMenu(e, file, "file")}
                    {...createLongPressHandlers(file, "file")}
                    className={`group flex flex-col items-center gap-2 rounded-md p-3 text-center cursor-default ${
                      isSelected
                        ? "bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-900/50"
                        : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {isImage ? (
                      <ImageThumbnail
                        fileId={file.id}
                        alt={file.original_filename}
                        className="h-12 w-12 rounded"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center">
                        <FileIcon
                          filename={file.original_filename}
                          mimeType={file.content_type}
                          className="h-10 w-10"
                        />
                      </div>
                    )}
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
              title={t("knowledge.moveModal.title", {
                name:
                  moveModal.type === "folder"
                    ? (moveModal.item as Folder).name
                    : (moveModal.item as FileUploadResponse).original_filename,
              })}
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
                  {t("knowledge.fileList.knowledgeSet.add.title")}
                </h3>
                <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
                  {t("knowledge.fileList.knowledgeSet.add.subtitle", {
                    name: knowledgeSetModal.file.original_filename,
                  })}
                </p>
                <div className="mb-4 max-h-64 space-y-2 overflow-y-auto">
                  {knowledgeSets.length === 0 ? (
                    <p className="text-sm text-neutral-400 italic">
                      {t("knowledge.fileList.knowledgeSet.none")}
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
                          {t("knowledge.fileList.knowledgeSet.fileCount", {
                            count: ks.file_count,
                          })}
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <button
                  onClick={() => setKnowledgeSetModal(null)}
                  className="w-full rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
                >
                  {t("common.cancel")}
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
              title={
                renameModal.type === "folder"
                  ? t("knowledge.fileList.rename.titleFolder")
                  : t("knowledge.fileList.rename.titleFile")
              }
              initialValue={
                renameModal.type === "folder"
                  ? (renameModal.item as Folder).name
                  : (renameModal.item as FileUploadResponse).original_filename
              }
              placeholder={t("knowledge.fileList.rename.placeholder")}
              confirmLabel={t("knowledge.fileList.rename.confirm")}
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
