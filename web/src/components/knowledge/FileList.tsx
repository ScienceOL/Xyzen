import ConfirmationModal from "@/components/modals/ConfirmationModal";
import InputModal from "@/components/modals/InputModal";
import NotificationModal from "@/components/modals/NotificationModal";
import { PreviewModal } from "@/components/preview/PreviewModal";
import type { PreviewFile } from "@/components/preview/types";
import { isTextFile } from "@/lib/language";
import { fileService, type FileUploadResponse } from "@/service/fileService";
import type { FileTreeItem } from "@/service/folderService";
import { folderService, type Folder } from "@/service/folderService";
import {
  knowledgeSetService,
  type KnowledgeSetWithFileCount,
} from "@/service/knowledgeSetService";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  DocumentIcon,
  EyeIcon,
  FolderPlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { FolderIcon } from "@heroicons/react/24/solid";
import { format } from "date-fns";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useInView } from "react-intersection-observer";
import { ContextMenu, type ContextMenuType } from "./ContextMenu";
import { FileEditor } from "./FileEditor";
import { FileIcon } from "./FileIcon";
import {
  DRAG_MIME,
  FileTreeView,
  getDragContext,
  type FileTreeViewHandle,
} from "./FileTreeView";
import { ImageThumbnail } from "./ImageThumbnail";
import { MoveToModal } from "./MoveToModal";
import type { KnowledgeTab, ViewMode } from "./types";

interface FileListProps {
  filter: KnowledgeTab;
  viewMode: ViewMode;
  refreshTrigger: number;
  onRefresh?: () => void;
  onFileCountChange?: (count: number) => void;
  onStatsUpdate?: (deletedBytes: number, deletedFileCount: number) => void;
  onLoadingChange?: (loading: boolean) => void;
  currentFolderId: string | null;
  onFolderChange?: (folderId: string | null) => void;
  currentKnowledgeSetId?: string | null;
  onCreateFolder?: () => void;
  onUpload?: () => void;
  /** Tree items from the centralized knowledge store (for "all" & "knowledge" tabs) */
  treeItems?: FileTreeItem[];
  treeLoading?: boolean;
  /** Called to trigger a tree refetch in the store */
  onRefreshTree?: () => void;
  /** Optimistically remove items from the tree */
  removeTreeItems?: (ids: string[]) => void;
  /** Optimistically rename an item in the tree */
  renameTreeItem?: (id: string, newName: string) => void;
  /** When true, hide all mutating actions (rename/delete/move/upload) */
  readonly?: boolean;
  /** Override callbacks for skill mode — when set, FileList uses these instead of direct service imports */
  onDeleteItem?: (id: string, isDir: boolean) => Promise<void>;
  onRenameItem?: (id: string, isDir: boolean, newName: string) => Promise<void>;
  onMoveItem?: (
    id: string,
    isDir: boolean,
    targetFolderId: string | null,
  ) => Promise<void>;
  onDownloadFile?: (fileId: string) => Promise<Response>;
  onEditSave?: (fileId: string, content: string) => Promise<void>;
  onCreateSkillFolder?: (
    name: string,
    parentId: string | null,
  ) => Promise<void>;
}

export interface FileListHandle {
  emptyTrash: () => Promise<void>;
  /** Move items (files/folders) to a target folder (null = root). Used by breadcrumb drop. */
  moveItems: (itemIds: string[], targetFolderId: string | null) => void;
  /** Trigger inline folder creation in the tree view. */
  createFolder: (parentId: string | null) => void;
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

/**
 * Collect all descendant IDs of a given root item from a flat tree list.
 * Uses BFS to find children by parent_id.
 */
function collectDescendantIds(items: FileTreeItem[], rootId: string): string[] {
  const ids: string[] = [];
  const queue = [rootId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const item of items) {
      if (item.parent_id === parentId) {
        ids.push(item.id);
        if (item.is_dir) queue.push(item.id);
      }
    }
  }
  return ids;
}

export const FileList = React.memo(
  forwardRef<FileListHandle, FileListProps>(
    (
      {
        filter,
        viewMode,
        refreshTrigger,
        onRefresh,
        onFileCountChange,
        onStatsUpdate,
        onLoadingChange,
        currentFolderId,
        onFolderChange,
        currentKnowledgeSetId,
        onCreateFolder,
        onUpload,
        treeItems = [],
        treeLoading = false,
        onRefreshTree,
        removeTreeItems,
        renameTreeItem,
        readonly: readonlyMode,
        onDeleteItem,
        onRenameItem,
        onMoveItem,
        onDownloadFile,
        onEditSave,
        onCreateSkillFolder,
      },
      ref,
    ) => {
      const { t } = useTranslation();
      const [files, setFiles] = useState<FileUploadResponse[]>([]);
      const [folders, setFolders] = useState<Folder[]>([]);
      const [isLoading, setIsLoading] = useState(false);

      // Helper: is this a tree-based tab?
      const isTreeTab =
        filter === "all" ||
        filter === "knowledge" ||
        filter === "trash" ||
        filter === "skill";
      const isSkillMode = filter === "skill";

      // Notify parent when loading state changes
      const effectiveLoading = isTreeTab ? treeLoading : isLoading;
      useEffect(() => {
        onLoadingChange?.(effectiveLoading);
      }, [effectiveLoading, onLoadingChange]);

      // Refs to track current files/folders for imperative handle
      const filesRef = useRef<FileUploadResponse[]>([]);
      const foldersRef = useRef<Folder[]>([]);

      // Keep refs in sync with state
      useEffect(() => {
        filesRef.current = files;
      }, [files]);

      useEffect(() => {
        foldersRef.current = folders;
      }, [folders]);

      // Pagination state for infinite scroll
      const PAGE_SIZE = 100;
      const [hasMoreFiles, setHasMoreFiles] = useState(true);
      const [isLoadingMore, setIsLoadingMore] = useState(false);
      const filesOffsetRef = useRef(0);
      /** True while a non-append (full reload) fetch is in flight. */
      const isReloadingRef = useRef(false);

      // useInView for infinite scroll trigger
      const { ref: loadMoreRef, inView } = useInView({
        threshold: 0,
        rootMargin: "200px",
      });

      // Track inView state in a ref for use in loadFiles callback
      const inViewRef = useRef(inView);
      useEffect(() => {
        inViewRef.current = inView;
      }, [inView]);

      // Preview State
      const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
      const [isPreviewOpen, setIsPreviewOpen] = useState(false);
      // Editor state
      const [editorFile, setEditorFile] = useState<{
        id: string;
        name: string;
        contentType: string;
        size: number;
      } | null>(null);
      const [isEditorOpen, setIsEditorOpen] = useState(false);
      const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

      // Selection box state for drag select
      const [selectionBox, setSelectionBox] = useState<{
        startX: number;
        startY: number;
        currentX: number;
        currentY: number;
      } | null>(null);
      const containerRef = useRef<HTMLDivElement>(null);
      const treeViewRef = useRef<FileTreeViewHandle>(null);
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

      // Computed set of folder IDs for drag type detection
      const folderIds = useMemo(
        () => new Set(folders.map((f) => f.id)),
        [folders],
      );

      // Handle drag-and-drop onto a folder (from tree view or flat list)
      const loadFilesRef = useRef<() => void>(() => {});
      const handleDropOnFolder = useCallback(
        async (
          itemIds: string[],
          targetFolderId: string | null,
          /** Optional type map from SortableTree (knows nested types). */
          typeMap?: Record<string, "file" | "folder">,
        ) => {
          try {
            await Promise.all(
              itemIds.map((id) => {
                const isFolder = typeMap
                  ? typeMap[id] === "folder"
                  : folderIds.has(id);
                if (isFolder) {
                  return isSkillMode && onMoveItem
                    ? onMoveItem(id, true, targetFolderId)
                    : folderService.updateFolder(id, {
                        parent_id: targetFolderId,
                      });
                }
                return isSkillMode && onMoveItem
                  ? onMoveItem(id, false, targetFolderId)
                  : fileService.updateFile(id, {
                      parent_id: targetFolderId,
                    });
              }),
            );
            setSelectedIds(new Set());
            // For tree tabs, refresh via the store; for other tabs, reload locally
            if (
              (filter === "all" ||
                filter === "knowledge" ||
                filter === "skill" ||
                filter === "trash") &&
              onRefreshTree
            ) {
              onRefreshTree();
            } else {
              loadFilesRef.current();
            }
          } catch (e) {
            console.error("Drop move failed", e);
          }
        },
        [folderIds, filter, isSkillMode, onMoveItem, onRefreshTree],
      );

      // Drag start handler for flat list/grid items
      const handleDragStartItem = useCallback(
        (e: React.DragEvent, itemId: string) => {
          const ids = selectedIds.has(itemId) ? [...selectedIds] : [itemId];
          const types: Record<string, "file" | "folder"> = {};
          for (const id of ids) {
            types[id] = folderIds.has(id) ? "folder" : "file";
          }
          const ctx = { ids, types };
          // Set module-level dragContext so dragOver can read it
          (window as unknown as Record<string, unknown>).__xyzenDragContext =
            ctx;
          e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ctx));
          e.dataTransfer.effectAllowed = "move";
        },
        [selectedIds, folderIds],
      );

      // Drag over handler for folder rows in flat list/grid
      const handleDragOverFolder = useCallback(
        (e: React.DragEvent, folderId: string) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          // Check module-level context to prevent dropping on self
          const ctx =
            getDragContext() ||
            ((window as unknown as Record<string, unknown>)
              .__xyzenDragContext as { ids: string[] } | null);
          if (ctx?.ids?.includes(folderId)) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
        },
        [],
      );

      // Drop handler for folder rows in flat list/grid
      const handleDropOnFolderRow = useCallback(
        (e: React.DragEvent, folderId: string) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            const data = JSON.parse(e.dataTransfer.getData(DRAG_MIME));
            if (data?.ids?.length > 0) {
              handleDropOnFolder(data.ids, folderId);
            }
          } catch {
            // ignore
          }
        },
        [handleDropOnFolder],
      );

      // Track which folder is being dragged over (for visual feedback in flat list)
      const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(
        null,
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

      // Background context menu (right-click on empty space)
      const [bgContextMenu, setBgContextMenu] = useState<{
        x: number;
        y: number;
      } | null>(null);

      // Close background context menu on any outside click
      useEffect(() => {
        if (!bgContextMenu) return;
        const handleMouseDown = () => setBgContextMenu(null);
        // Delay to avoid immediate close from the same event
        const timer = setTimeout(
          () => document.addEventListener("mousedown", handleMouseDown),
          0,
        );
        return () => {
          clearTimeout(timer);
          document.removeEventListener("mousedown", handleMouseDown);
        };
      }, [bgContextMenu]);

      // Modal States
      const [moveModal, setMoveModal] = useState<{
        isOpen: boolean;
        item: Folder | FileUploadResponse;
        type: ContextMenuType;
      } | null>(null);

      const [knowledgeSetModal, setKnowledgeSetModal] = useState<{
        isOpen: boolean;
        item: Folder | FileUploadResponse;
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
          moveItems: (itemIds: string[], targetFolderId: string | null) => {
            handleDropOnFolder(itemIds, targetFolderId);
          },
          createFolder: (parentId: string | null) => {
            treeViewRef.current?.createFolder(parentId);
          },
          emptyTrash: async () => {
            // For tree-based trash, use treeItems count
            const itemCount = treeItems.length;
            if (itemCount === 0) return;

            setConfirmation({
              isOpen: true,
              title: t("knowledge.fileList.emptyTrash.title"),
              message: t("knowledge.fileList.emptyTrash.message", {
                count: itemCount,
              }),
              confirmLabel: t("knowledge.fileList.emptyTrash.confirm"),
              destructive: true,
              onConfirm: async () => {
                // Optimistic: clear trash tree immediately
                if (removeTreeItems) {
                  removeTreeItems(treeItems.map((i) => i.id));
                }

                setFiles([]);
                setFolders([]);
                if (onFileCountChange) onFileCountChange(0);

                try {
                  await fileService.emptyTrash();
                  if (onRefresh) onRefresh();
                  if (onRefreshTree) onRefreshTree();
                } catch (error) {
                  console.error("Failed to empty trash", error);
                  // Revert by refetching
                  if (onRefreshTree) onRefreshTree();
                  alert(t("knowledge.fileList.emptyTrash.failed"));
                }
              },
            });
          },
        }),
        [
          handleDropOnFolder,
          onFileCountChange,
          onRefresh,
          onRefreshTree,
          removeTreeItems,
          t,
          treeItems,
        ],
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

      const loadFiles = useCallback(
        async (append: boolean = false) => {
          // "all", "knowledge", and "trash" tabs use the centralized tree from the store.
          // No local fetching needed for these tabs.
          if (
            filter === "all" ||
            filter === "knowledge" ||
            filter === "skill" ||
            filter === "trash"
          ) {
            return;
          }

          if (append) {
            // Prevent appending while a full reload is in flight (race condition).
            if (isReloadingRef.current) return;
            setIsLoadingMore(true);
          } else {
            // Only show full loading spinner on initial load (no existing data).
            if (
              filesRef.current.length === 0 &&
              foldersRef.current.length === 0
            ) {
              setIsLoading(true);
            }
            isReloadingRef.current = true;
            filesOffsetRef.current = 0;
            setHasMoreFiles(true);
          }

          try {
            // "home" = Recents: flat list of recent files across all folders (no folders shown)
            if (filter === "home") {
              if (!append) {
                setFolders([]);
              }

              const fileData = await fileService.listFiles({
                limit: PAGE_SIZE,
                offset: filesOffsetRef.current,
                is_dir: false,
              });
              const validFiles = fileData.filter((f) => !f.is_deleted);

              if (append) {
                setFiles((prev) => {
                  const newFiles = [...prev, ...validFiles];
                  if (onFileCountChange) {
                    setTimeout(() => onFileCountChange(newFiles.length), 0);
                  }
                  return newFiles;
                });
              } else {
                setFiles(validFiles);
                if (onFileCountChange) {
                  onFileCountChange(validFiles.length);
                }
              }

              filesOffsetRef.current += fileData.length;
              setHasMoreFiles(fileData.length === PAGE_SIZE);
              return;
            }

            // Handle other views (trash, images, documents, audio, etc.) with pagination
            const params: {
              category?: string;
              include_deleted: boolean;
              limit: number;
              offset: number;
            } = {
              include_deleted: false,
              limit: PAGE_SIZE,
              offset: filesOffsetRef.current,
            };

            if (["images", "audio", "documents"].includes(filter)) {
              params.category = filter;
            }

            const data = await fileService.listFiles(params);

            const filteredData = data.filter((f) => !f.is_deleted);
            if (!append) {
              setFolders([]);
            }

            if (append) {
              setFiles((prev) => {
                const newFiles = [...prev, ...filteredData];
                if (onFileCountChange) {
                  setTimeout(() => onFileCountChange(newFiles.length), 0);
                }
                return newFiles;
              });
            } else {
              setFiles(filteredData);
              if (onFileCountChange) {
                onFileCountChange(filteredData.length);
              }
            }

            // offset 应该增加 API 返回的原始数量，而不是过滤后的数量
            filesOffsetRef.current += data.length;
            setHasMoreFiles(data.length === PAGE_SIZE);
          } catch (error) {
            console.error("Failed to load files", error);
          } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
            isReloadingRef.current = false;
          }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filter, currentFolderId],
      );

      // Keep ref in sync so handleDropOnFolder (defined before loadFiles) can call it
      loadFilesRef.current = loadFiles;

      // Callback for inline folder creation from the tree view
      const handleFolderCreated = useCallback(
        async (name: string, parentId: string | null) => {
          try {
            if (isSkillMode && onCreateSkillFolder) {
              await onCreateSkillFolder(name, parentId);
            } else {
              const folder = await folderService.createFolder({
                name,
                parent_id: parentId,
              });
              // If in knowledge view, link the new folder to the knowledge set
              if (filter === "knowledge" && currentKnowledgeSetId) {
                await knowledgeSetService.linkFileToKnowledgeSet(
                  currentKnowledgeSetId,
                  folder.id,
                );
              }
            }
            // Refresh the tree via the store
            if (onRefreshTree) {
              onRefreshTree();
            }
          } catch (e) {
            console.error("Failed to create folder", e);
          }
        },
        [
          filter,
          isSkillMode,
          currentKnowledgeSetId,
          onRefreshTree,
          onCreateSkillFolder,
        ],
      );

      // Load more files when scrolling to bottom
      const loadMoreFiles = useCallback(() => {
        if (!isLoadingMore && hasMoreFiles) {
          loadFiles(true);
        }
      }, [isLoadingMore, hasMoreFiles, loadFiles]);

      useEffect(() => {
        loadFiles();
      }, [loadFiles, refreshTrigger]);

      // Trigger load more when scrolling into view
      // Key insight: we need to trigger not just when inView changes to true,
      // but also when loading finishes while still in view
      useEffect(() => {
        if (inView && hasMoreFiles && !isLoadingMore && !isLoading) {
          loadMoreFiles();
        }
      }, [inView, hasMoreFiles, isLoadingMore, isLoading, loadMoreFiles]);

      // Additional check: when loading finishes and still in view, continue loading
      // This handles the case where the trigger element stays in view after loading
      const prevLoadingMoreRef = useRef(isLoadingMore);
      useEffect(() => {
        const wasLoading = prevLoadingMoreRef.current;
        prevLoadingMoreRef.current = isLoadingMore;

        // If we just finished loading and are still in view with more data available
        if (
          wasLoading &&
          !isLoadingMore &&
          inViewRef.current &&
          hasMoreFiles &&
          !isLoading
        ) {
          // Use setTimeout to allow React to settle before triggering next load
          const timer = setTimeout(() => {
            loadMoreFiles();
          }, 50);
          return () => clearTimeout(timer);
        }
      }, [isLoadingMore, hasMoreFiles, isLoading, loadMoreFiles]);

      const handleContextMenu = (
        e: React.MouseEvent,
        item: Folder | FileUploadResponse,
        type: ContextMenuType,
      ) => {
        e.preventDefault();
        e.stopPropagation();
        setBgContextMenu(null);
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

        // Check for duplicate name (excluding self)
        if (type === "folder") {
          const duplicate = folders.find(
            (f) => f.name === newName && f.id !== item.id,
          );
          if (duplicate) {
            setNotification({
              isOpen: true,
              title: t("knowledge.fileList.notifications.errorTitle"),
              message: t("knowledge.fileList.rename.duplicateName"),
              type: "warning",
            });
            return;
          }
        } else {
          const duplicate = files.find(
            (f) => f.original_filename === newName && f.id !== item.id,
          );
          if (duplicate) {
            setNotification({
              isOpen: true,
              title: t("knowledge.fileList.notifications.errorTitle"),
              message: t("knowledge.fileList.rename.duplicateName"),
              type: "warning",
            });
            return;
          }
        }

        try {
          // Optimistic: rename in tree immediately
          if (
            renameTreeItem &&
            (filter === "all" ||
              filter === "knowledge" ||
              filter === "skill" ||
              filter === "trash")
          ) {
            renameTreeItem(item.id, newName);
          }

          if (type === "folder") {
            if (isSkillMode && onRenameItem) {
              await onRenameItem(item.id, true, newName);
            } else {
              await folderService.updateFolder(item.id, { name: newName });
            }
          } else {
            if (isSkillMode && onRenameItem) {
              await onRenameItem(item.id, false, newName);
            } else {
              await fileService.updateFile(item.id, {
                original_filename: newName,
              });
            }
          }
          // Refresh: tree tabs via store, others locally
          if (
            (filter === "all" ||
              filter === "knowledge" ||
              filter === "skill" ||
              filter === "trash") &&
            onRefreshTree
          ) {
            onRefreshTree();
          } else {
            loadFiles();
          }
        } catch (e) {
          console.error("Rename failed", e);
          // Revert optimistic update
          if (onRefreshTree) onRefreshTree();
          alert(t("knowledge.fileList.rename.failed"));
        }
      };

      const handleMove = async (targetFolderId: string | null) => {
        if (!moveModal) return;
        const { item, type } = moveModal;

        try {
          if (type === "folder") {
            if (isSkillMode && onMoveItem) {
              await onMoveItem(item.id, true, targetFolderId);
            } else {
              await folderService.updateFolder(item.id, {
                parent_id: targetFolderId,
              });
            }
          } else {
            if (isSkillMode && onMoveItem) {
              await onMoveItem(item.id, false, targetFolderId);
            } else {
              await fileService.updateFile(item.id, {
                parent_id: targetFolderId,
              });
            }
          }
          // Refresh: tree tabs via store, others locally
          if (
            (filter === "all" ||
              filter === "knowledge" ||
              filter === "skill" ||
              filter === "trash") &&
            onRefreshTree
          ) {
            onRefreshTree();
          } else {
            loadFiles();
          }
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
            } else {
              // Tree view fallback — treeItems has is_dir to classify
              const treeItem = treeItems.find((ti) => ti.id === id);
              if (treeItem) {
                if (treeItem.is_dir) {
                  selectedFolderIds.push(id);
                } else {
                  selectedFileIds.push(id);
                }
              }
            }
          });

          const totalCount = selectedFileIds.length + selectedFolderIds.length;
          const isHardDelete = filter === "trash";

          // Calculate total size of selected files for optimistic update
          let totalDeletedBytes = 0;
          for (const id of selectedFileIds) {
            const file = files.find((f) => f.id === id);
            if (file) {
              totalDeletedBytes += file.file_size;
            } else {
              const treeItem = treeItems.find((ti) => ti.id === id);
              if (treeItem) totalDeletedBytes += treeItem.file_size;
            }
          }

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
                // Optimistic: remove from tree immediately
                if (
                  removeTreeItems &&
                  (filter === "all" ||
                    filter === "knowledge" ||
                    filter === "skill" ||
                    filter === "trash")
                ) {
                  // Collect all IDs including descendants of selected folders
                  const allIds = [...selectedFileIds, ...selectedFolderIds];
                  for (const folderId of selectedFolderIds) {
                    allIds.push(...collectDescendantIds(treeItems, folderId));
                  }
                  removeTreeItems(allIds);
                }

                // Delete files one by one (more reliable than bulk API)
                if (selectedFileIds.length > 0) {
                  await Promise.all(
                    selectedFileIds.map((id) =>
                      isSkillMode && onDeleteItem
                        ? onDeleteItem(id, false)
                        : fileService.deleteFile(id, isHardDelete),
                    ),
                  );
                }
                // Delete folders one by one
                if (selectedFolderIds.length > 0) {
                  await Promise.all(
                    selectedFolderIds.map((id) =>
                      isSkillMode && onDeleteItem
                        ? onDeleteItem(id, true)
                        : folderService.deleteFolder(id, isHardDelete),
                    ),
                  );
                }

                // Optimistic update - only for hard delete (permanent deletion releases space)
                if (isHardDelete && onStatsUpdate) {
                  onStatsUpdate(totalDeletedBytes, selectedFileIds.length);
                }

                setSelectedIds(new Set());
                if (
                  (filter === "all" ||
                    filter === "knowledge" ||
                    filter === "skill" ||
                    filter === "trash") &&
                  onRefreshTree
                ) {
                  onRefreshTree();
                } else {
                  loadFiles();
                }
              } catch (e) {
                console.error("Bulk delete failed", e);
                // Revert optimistic update
                if (onRefreshTree) onRefreshTree();
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

        // Get file size for optimistic update
        const fileSize =
          type === "file" ? (item as FileUploadResponse).file_size : 0;

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

              // Optimistic: remove from tree immediately
              if (
                removeTreeItems &&
                (filter === "all" ||
                  filter === "knowledge" ||
                  filter === "skill" ||
                  filter === "trash")
              ) {
                const descendantIds =
                  type === "folder"
                    ? collectDescendantIds(treeItems, item.id)
                    : [];
                removeTreeItems([item.id, ...descendantIds]);
              }

              if (type === "folder") {
                if (isSkillMode && onDeleteItem) {
                  await onDeleteItem(item.id, true);
                } else {
                  await folderService.deleteFolder(item.id, isHardDelete);
                }
              } else {
                if (isSkillMode && onDeleteItem) {
                  await onDeleteItem(item.id, false);
                } else {
                  await fileService.deleteFile(item.id, isHardDelete);
                }
              }

              // Optimistic update - only for hard delete (permanent deletion releases space)
              if (isHardDelete && type === "file" && onStatsUpdate) {
                onStatsUpdate(fileSize, 1);
              }

              setSelectedIds(new Set());
              if (
                (filter === "all" ||
                  filter === "knowledge" ||
                  filter === "skill" ||
                  filter === "trash") &&
                onRefreshTree
              ) {
                onRefreshTree();
              } else {
                loadFiles();
              }
            } catch (e) {
              console.error("Delete failed", e);
              // Revert optimistic update
              if (onRefreshTree) onRefreshTree();
              alert(t("knowledge.fileList.actions.deleteFailed"));
            }
          },
        });
      };

      const handleRestore = async (id: string, _type: ContextMenuType) => {
        try {
          // Optimistic: remove from trash view immediately
          if (removeTreeItems && filter === "trash") {
            const descendantIds = collectDescendantIds(treeItems, id);
            removeTreeItems([id, ...descendantIds]);
          }

          // Unified restore endpoint handles both files and folders (recursive for folders)
          await fileService.restoreFile(id);

          if (onRefresh) onRefresh();
          if (onRefreshTree) onRefreshTree();
        } catch (error) {
          console.error("Restore failed", error);
          // Revert optimistic update
          if (onRefreshTree) onRefreshTree();
          alert(t("knowledge.fileList.actions.restoreFailed"));
        }
      };

      const handleDownload = async (fileId: string, fileName: string) => {
        try {
          const response =
            isSkillMode && onDownloadFile
              ? await onDownloadFile(fileId)
              : await fileService.downloadRaw(fileId);

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
          type: file.content_type || "",
          size: file.file_size,
        });
        setIsPreviewOpen(true);
      };

      const handleEdit = (file: FileUploadResponse) => {
        setEditorFile({
          id: file.id,
          name: file.original_filename,
          contentType: file.content_type || "",
          size: file.file_size,
        });
        setIsEditorOpen(true);
      };

      /** Double-click: open text files in editor, others in preview. */
      const handleFileDoubleClick = (file: FileUploadResponse) => {
        if (isTextFile(file.original_filename, file.content_type)) {
          handleEdit(file);
        } else {
          handlePreview(file);
        }
      };

      const handleFolderClick = (folderId: string) => {
        if (onFolderChange) {
          onFolderChange(folderId);
        }
      };

      const handleAddToKnowledgeSet = (item: Folder | FileUploadResponse) => {
        setKnowledgeSetModal({ isOpen: true, item });
      };

      const handleRemoveFromKnowledgeSet = async (
        item: Folder | FileUploadResponse,
      ) => {
        if (!currentKnowledgeSetId) return;
        const itemName =
          "original_filename" in item ? item.original_filename : item.name;

        setConfirmation({
          isOpen: true,
          title: t("knowledge.fileList.knowledgeSet.remove.title"),
          message: t("knowledge.fileList.knowledgeSet.remove.message", {
            name: itemName,
          }),
          confirmLabel: t("knowledge.fileList.knowledgeSet.remove.confirm"),
          destructive: true,
          onConfirm: async () => {
            try {
              await knowledgeSetService.unlinkFileFromKnowledgeSet(
                currentKnowledgeSetId,
                item.id,
              );
              // Refresh the tree via the store
              if (onRefreshTree) {
                onRefreshTree();
              }
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
            knowledgeSetModal.item.id,
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

      // For tree tabs, use treeItems for empty/loading checks
      if (isTreeTab) {
        if (treeLoading && treeItems.length === 0) {
          return null;
        }
        if (!treeLoading && treeItems.length === 0) {
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
      } else {
        if (isLoading && files.length === 0 && folders.length === 0) {
          return null;
        }
        if (!isLoading && files.length === 0 && folders.length === 0) {
          return (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-neutral-400">
              <DocumentIcon className="h-8 w-8 opacity-50" />
              <span>{t("knowledge.fileList.empty.noItems")}</span>
            </div>
          );
        }
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
            setBgContextMenu(null);
          }}
          onContextMenu={(e) => {
            // Background right-click (not on items — items call e.stopPropagation())
            e.preventDefault();
            setContextMenu(null);
            setBgContextMenu({ x: e.clientX, y: e.clientY });
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
          {filter === "all" ||
          filter === "knowledge" ||
          filter === "skill" ||
          filter === "trash" ? (
            <FileTreeView
              ref={treeViewRef}
              treeItems={treeItems}
              selectedIds={selectedIds}
              itemRefs={itemRefs}
              onItemClick={handleItemClick}
              onFileDoubleClick={handleFileDoubleClick}
              onContextMenu={handleContextMenu}
              onDropOnFolder={handleDropOnFolder}
              onFolderCreated={handleFolderCreated}
              onRefresh={onRefreshTree}
              isTrashView={filter === "trash"}
            />
          ) : viewMode === "list" ? (
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
                    draggable
                    onDragStart={(e) => handleDragStartItem(e, folder.id)}
                    onDragEnd={() => {
                      (
                        window as unknown as Record<string, unknown>
                      ).__xyzenDragContext = null;
                    }}
                    onDragOver={(e) => {
                      handleDragOverFolder(e, folder.id);
                      if (e.defaultPrevented) setDragOverFolderId(folder.id);
                    }}
                    onDragLeave={() =>
                      setDragOverFolderId((prev) =>
                        prev === folder.id ? null : prev,
                      )
                    }
                    onDrop={(e) => {
                      setDragOverFolderId(null);
                      handleDropOnFolderRow(e, folder.id);
                    }}
                    onClick={(e) => handleItemClick(e, folder.id)}
                    onDoubleClick={() => handleFolderClick(folder.id)}
                    onContextMenu={(e) =>
                      handleContextMenu(e, folder, "folder")
                    }
                    {...createLongPressHandlers(folder, "folder")}
                    className={`group grid grid-cols-12 gap-4 px-4 py-2 text-sm items-center cursor-default ${
                      dragOverFolderId === folder.id
                        ? "ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 rounded"
                        : selectedIds.has(folder.id)
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
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteItem(folder, "folder");
                          }}
                          title={t("knowledge.fileList.actions.delete")}
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
                      draggable
                      onDragStart={(e) => handleDragStartItem(e, file.id)}
                      onDragEnd={() => {
                        (
                          window as unknown as Record<string, unknown>
                        ).__xyzenDragContext = null;
                      }}
                      onClick={(e) => handleItemClick(e, file.id)}
                      onDoubleClick={() => handleFileDoubleClick(file)}
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
                            mimeType={file.content_type || ""}
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

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteItem(file, "file");
                            }}
                            title={t("knowledge.fileList.actions.moveToTrash")}
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
                  draggable
                  onDragStart={(e) => handleDragStartItem(e, folder.id)}
                  onDragEnd={() => {
                    (
                      window as unknown as Record<string, unknown>
                    ).__xyzenDragContext = null;
                  }}
                  onDragOver={(e) => {
                    handleDragOverFolder(e, folder.id);
                    if (e.defaultPrevented) setDragOverFolderId(folder.id);
                  }}
                  onDragLeave={() =>
                    setDragOverFolderId((prev) =>
                      prev === folder.id ? null : prev,
                    )
                  }
                  onDrop={(e) => {
                    setDragOverFolderId(null);
                    handleDropOnFolderRow(e, folder.id);
                  }}
                  onClick={(e) => handleItemClick(e, folder.id)}
                  onDoubleClick={() => handleFolderClick(folder.id)}
                  onContextMenu={(e) => handleContextMenu(e, folder, "folder")}
                  {...createLongPressHandlers(folder, "folder")}
                  className={`group flex flex-col items-center gap-2 rounded-md p-3 text-center cursor-default ${
                    dragOverFolderId === folder.id
                      ? "ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                      : selectedIds.has(folder.id)
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
                  file.content_type || "",
                  file.original_filename,
                );

                return (
                  <div
                    key={file.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(file.id, el);
                      else itemRefs.current.delete(file.id);
                    }}
                    draggable
                    onDragStart={(e) => handleDragStartItem(e, file.id)}
                    onDragEnd={() => {
                      (
                        window as unknown as Record<string, unknown>
                      ).__xyzenDragContext = null;
                    }}
                    onClick={(e) => handleItemClick(e, file.id)}
                    onDoubleClick={() => handleFileDoubleClick(file)}
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
                          mimeType={file.content_type || ""}
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

          {/* Load more trigger for infinite scroll */}
          {hasMoreFiles && (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center py-4"
            >
              {isLoadingMore && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
              )}
            </div>
          )}

          {contextMenu && (
            <ContextMenu
              type={contextMenu.type}
              item={contextMenu.item}
              position={contextMenu.position}
              onClose={() => setContextMenu(null)}
              onRename={readonlyMode ? undefined : handleRename}
              onDelete={readonlyMode ? undefined : handleDeleteItem}
              onMove={
                readonlyMode
                  ? undefined
                  : (item, type) => setMoveModal({ isOpen: true, item, type })
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
              onPreview={
                contextMenu.type === "file"
                  ? (item) => handlePreview(item as FileUploadResponse)
                  : undefined
              }
              onEdit={
                contextMenu.type === "file" &&
                !readonlyMode &&
                isTextFile(
                  (contextMenu.item as FileUploadResponse).original_filename,
                  (contextMenu.item as FileUploadResponse).content_type,
                )
                  ? (item) => handleEdit(item as FileUploadResponse)
                  : undefined
              }
              onOpen={
                contextMenu.type === "folder"
                  ? (item) => handleFolderClick(item.id)
                  : undefined
              }
              onAddToKnowledgeSet={
                isSkillMode ? undefined : handleAddToKnowledgeSet
              }
              onRemoveFromKnowledgeSet={
                isSkillMode ? undefined : handleRemoveFromKnowledgeSet
              }
              onRestore={
                isSkillMode
                  ? undefined
                  : (item, type) => handleRestore(item.id, type)
              }
              onBulkDelete={
                selectedIds.size > 1
                  ? () => handleDeleteItem(contextMenu.item, contextMenu.type)
                  : undefined
              }
              onBulkMove={
                selectedIds.size > 1
                  ? () =>
                      setMoveModal({
                        isOpen: true,
                        item: contextMenu.item,
                        type: contextMenu.type,
                      })
                  : undefined
              }
              isInKnowledgeSetView={filter === "knowledge"}
              isTrashView={filter === "trash"}
              selectedCount={
                selectedIds.has(contextMenu.item.id) ? selectedIds.size : 1
              }
            />
          )}

          {/* Background context menu (right-click on empty space) */}
          {bgContextMenu &&
            createPortal(
              <div
                className="fixed z-50 min-w-40 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                style={{ top: bgContextMenu.y, left: bgContextMenu.x }}
                ref={(el) => {
                  if (!el) return;
                  // Adjust to keep in viewport
                  const rect = el.getBoundingClientRect();
                  if (rect.right > window.innerWidth) {
                    el.style.left = `${window.innerWidth - rect.width - 10}px`;
                  }
                  if (rect.bottom > window.innerHeight) {
                    el.style.top = `${window.innerHeight - rect.height - 10}px`;
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex flex-col gap-0.5">
                  {onCreateFolder &&
                    (filter === "all" || filter === "knowledge") && (
                      <button
                        onClick={() => {
                          onCreateFolder();
                          setBgContextMenu(null);
                        }}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      >
                        <FolderPlusIcon className="h-4 w-4" />
                        {t("knowledge.toolbar.newFolder")}
                      </button>
                    )}
                  {onUpload && filter !== "trash" && (
                    <button
                      onClick={() => {
                        onUpload();
                        setBgContextMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      <ArrowUpTrayIcon className="h-4 w-4" />
                      {t("knowledge.toolbar.uploadFile")}
                    </button>
                  )}
                </div>
              </div>,
              document.body,
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

          {editorFile && (
            <FileEditor
              isOpen={isEditorOpen}
              onClose={() => {
                setIsEditorOpen(false);
                setEditorFile(null);
              }}
              file={editorFile}
              onLoadContent={(fileId) =>
                isSkillMode && onDownloadFile
                  ? onDownloadFile(fileId)
                  : fileService.downloadRaw(fileId)
              }
              onSaveContent={async (fileId, content) => {
                if (isSkillMode && onEditSave) {
                  await onEditSave(fileId, content);
                } else {
                  await fileService.updateFileContent(fileId, content);
                }
              }}
              readonly={readonlyMode}
            />
          )}

          {/* Knowledge Set Selection Modal */}
          {knowledgeSetModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
                <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
                  {t("knowledge.fileList.knowledgeSet.add.title")}
                </h3>
                <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
                  {t("knowledge.fileList.knowledgeSet.add.subtitle", {
                    name:
                      "original_filename" in knowledgeSetModal.item
                        ? knowledgeSetModal.item.original_filename
                        : knowledgeSetModal.item.name,
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
