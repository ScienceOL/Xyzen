import type { FileUploadResponse } from "@/service/fileService";
import type { Folder, FileTreeItem } from "@/service/folderService";
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  type DropAnimation,
  PointerSensor,
  type UniqueIdentifier,
  defaultDropAnimation,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ContextMenuType } from "../ContextMenu";
import { TreeItemClone, TreeItemRow } from "./SortableTreeItem";
import type { TreeItem } from "./types";
import {
  COL_DATE_WIDTH,
  COL_SIZE_WIDTH,
  type SortDirection,
  type SortMode,
  buildTreeFromFlat,
  findItemDeep,
  flattenTree,
  getChildCount,
  insertItem,
  removeItem,
  setProperty,
  sortTree,
} from "./utilities";

// ---------------------------------------------------------------------------
// Public handle
// ---------------------------------------------------------------------------

export interface SortableTreeHandle {
  createFolder: (parentId: string | null) => void;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SortableTreeProps {
  /** Flat tree items from the store (via useKnowledge) */
  treeItems: FileTreeItem[];
  selectedIds: Set<string>;
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onItemClick: (e: React.MouseEvent, id: string) => void;
  onFileDoubleClick: (file: FileUploadResponse) => void;
  onContextMenu: (
    e: React.MouseEvent,
    item: Folder | FileUploadResponse,
    type: ContextMenuType,
  ) => void;
  /** Called after a drag moves an item to a new parent. */
  onDropOnFolder: (
    itemIds: string[],
    targetFolderId: string | null,
    typeMap?: Record<string, "file" | "folder">,
  ) => void;
  /** Called when user confirms inline folder creation. */
  onFolderCreated?: (name: string, parentId: string | null) => Promise<void>;
  /** Called after drag-end to trigger a refetch from the store. */
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const dropAnimationConfig: DropAnimation = {
  keyframes({ transform }) {
    return [
      { opacity: 1, transform: CSS.Transform.toString(transform.initial) },
      {
        opacity: 0,
        transform: CSS.Transform.toString({
          ...transform.final,
          x: transform.final.x + 5,
          y: transform.final.y + 5,
        }),
      },
    ];
  },
  easing: "ease-out",
  sideEffects({ active }) {
    active.node.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: defaultDropAnimation.duration,
      easing: defaultDropAnimation.easing,
    });
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TEMP_FOLDER_ID = "__new_folder__";

const SortableTreeComp = React.forwardRef<
  SortableTreeHandle,
  SortableTreeProps
>(
  (
    {
      treeItems,
      selectedIds,
      itemRefs,
      onItemClick,
      onFileDoubleClick,
      onContextMenu,
      onDropOnFolder,
      onFolderCreated,
      onRefresh,
    },
    ref,
  ) => {
    // ===== State =====
    const [items, setItems] = useState<TreeItem[]>([]);
    const [sortMode, setSortMode] = useState<SortMode>("name");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
    const [overId, setOverId] = useState<UniqueIdentifier | null>(null);

    // Inline folder creation
    const [editingId, setEditingId] = useState<string | null>(null);
    const editingParentIdRef = useRef<string | null>(null);

    // ---- Build tree from prop data, preserving collapse state ----
    useEffect(() => {
      const newTree = buildTreeFromFlat(treeItems, sortMode, sortDirection);

      setItems((prev) => {
        if (prev.length === 0) return newTree;

        const collapseMap = new Map<string, boolean>();
        const collectState = (nodes: TreeItem[]) => {
          for (const n of nodes) {
            if (n.type === "folder" && n.collapsed !== undefined) {
              collapseMap.set(n.id, n.collapsed);
            }
            if (n.children.length > 0) collectState(n.children);
          }
        };
        collectState(prev);

        const applyState = (nodes: TreeItem[]): TreeItem[] =>
          nodes.map((n) => ({
            ...n,
            collapsed:
              n.type === "folder"
                ? (collapseMap.get(n.id) ?? true)
                : n.collapsed,
            children:
              n.children.length > 0 ? applyState(n.children) : n.children,
          }));

        return applyState(newTree);
      });
    }, [treeItems, sortMode, sortDirection]);

    // Re-sort locally when sort mode changes (no refetch needed)
    const handleSortChange = useCallback(
      (mode: SortMode) => {
        if (mode === sortMode) {
          // Toggle direction
          setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
          setItems((prev) =>
            sortTree(prev, mode, sortDirection === "asc" ? "desc" : "asc"),
          );
        } else {
          setSortMode(mode);
          setSortDirection("asc");
          setItems((prev) => sortTree(prev, mode, "asc"));
        }
      },
      [sortMode, sortDirection],
    );

    // ===== Collapse / Expand =====
    const handleCollapse = useCallback((id: string) => {
      setItems((prev) => setProperty(prev, id, "collapsed", (value) => !value));
    }, []);

    // ===== Flatten for rendering =====
    const flattenedItems = useMemo(() => flattenTree(items), [items]);

    const activeItem = activeId
      ? flattenedItems.find(({ id }) => id === activeId)
      : null;

    /**
     * The set of item IDs being dragged.
     * If the actively-dragged item is part of the selection, drag ALL selected.
     * Otherwise drag only the single item.
     */
    const draggedIds = useMemo(() => {
      if (!activeId) return new Set<string>();
      const aid = String(activeId);
      if (selectedIds.has(aid) && selectedIds.size > 1) return selectedIds;
      return new Set([aid]);
    }, [activeId, selectedIds]);

    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: { distance: 8 },
      }),
    );

    // ===== Context-menu item lookup =====
    const findOriginalItem = useCallback(
      (
        id: string,
      ): {
        item: Folder | FileUploadResponse;
        type: ContextMenuType;
      } | null => {
        const flat = flattenedItems.find((i) => i.id === id);
        if (flat?.folder) return { item: flat.folder, type: "folder" };
        if (flat?.file) return { item: flat.file, type: "file" };
        return null;
      },
      [flattenedItems],
    );

    // ===== Drag helpers =====

    /**
     * Compute which folder (or null = root) a drop would land in.
     * Returns `undefined` if the drop would be a no-op (same parent).
     */
    const computeDropTarget = useCallback(
      (activeIdStr: string, overIdStr: string): string | null | undefined => {
        const overItem = flattenedItems.find((i) => i.id === overIdStr);
        if (!overItem) return undefined;

        const activeFlat = flattenedItems.find((i) => i.id === activeIdStr);
        const currentParentId = activeFlat?.parentId ?? null;

        let target: string | null;
        if (overItem.type === "folder" && overItem.id !== activeIdStr) {
          // Expanded folder that is the item's current parent → move OUT
          if (!overItem.collapsed && overItem.id === currentParentId) {
            target = overItem.parentId;
          } else {
            // Any other folder (collapsed or expanded) → move INTO
            target = overItem.id;
          }
        } else {
          // File or self → become sibling (same parent)
          target = overItem.parentId;
        }

        return target === currentParentId ? undefined : target;
      },
      [flattenedItems],
    );

    /**
     * The folder id that would receive the drop, or `null` for root.
     * `undefined` means no valid drop target (same parent / invalid).
     */
    const dropTargetId = useMemo(() => {
      if (!activeId || !overId || activeId === overId) return undefined;
      return computeDropTarget(String(activeId), String(overId));
    }, [activeId, overId, computeDropTarget]);

    // ===== Drag handlers =====

    const handleDragStart = useCallback(({ active }: DragStartEvent) => {
      setActiveId(active.id);
      document.body.style.setProperty("cursor", "grabbing");
    }, []);

    const handleDragOver = useCallback(({ over }: DragOverEvent) => {
      setOverId(over?.id ?? null);
    }, []);

    const handleDragEnd = useCallback(
      ({ active, over }: DragEndEvent) => {
        // Capture before clearing state
        const idsToMove = new Set(draggedIds);
        setActiveId(null);
        setOverId(null);
        document.body.style.setProperty("cursor", "");

        if (!over || active.id === over.id) return;

        const activeIdStr = String(active.id);
        const overIdStr = String(over.id);

        const overItem = flattenedItems.find((i) => i.id === overIdStr);
        if (!overItem) return;

        // Determine target parent from the primary dragged item
        const activeFlat = flattenedItems.find((i) => i.id === activeIdStr);
        const currentParentId = activeFlat?.parentId ?? null;

        let targetParentId: string | null;
        if (overItem.type === "folder" && overItem.id !== activeIdStr) {
          // Expanded folder that is the item's current parent → move OUT
          if (!overItem.collapsed && overItem.id === currentParentId) {
            targetParentId = overItem.parentId;
          } else {
            // Any other folder (collapsed or expanded) → move INTO
            targetParentId = overItem.id;
          }
        } else {
          targetParentId = overItem.parentId;
        }

        // Don't drop onto one of the items being dragged
        if (targetParentId !== null && idsToMove.has(targetParentId)) return;

        // Collect all items to move, filtering out invalid ones
        const itemsToMove: { id: string; item: TreeItem }[] = [];
        const typeMap: Record<string, "file" | "folder"> = {};

        for (const id of idsToMove) {
          const item = findItemDeep(items, id);
          if (!item) continue;

          // Skip items already in the target folder
          const flat = flattenedItems.find((i) => i.id === id);
          if ((flat?.parentId ?? null) === targetParentId) continue;

          // Prevent circular move (folder into its own descendant)
          if (
            item.type === "folder" &&
            targetParentId !== null &&
            findItemDeep(item.children, targetParentId)
          ) {
            continue;
          }

          itemsToMove.push({ id, item });
          typeMap[id] = item.type;
        }

        if (itemsToMove.length === 0) return;

        // Optimistic update: remove all, then insert all
        let updatedTree = items;
        for (const { id } of itemsToMove) {
          updatedTree = removeItem(updatedTree, id);
        }
        for (const { item } of itemsToMove) {
          updatedTree = insertItem(
            updatedTree,
            { ...item, children: item.children },
            targetParentId,
            sortMode,
            sortDirection,
          );
        }
        setItems(updatedTree);

        // Backend call
        onDropOnFolder(
          itemsToMove.map(({ id }) => id),
          targetParentId,
          typeMap,
        );

        // Trigger store refetch for consistency
        if (onRefresh) {
          setTimeout(() => onRefresh(), 500);
        }
      },
      [
        items,
        flattenedItems,
        draggedIds,
        sortMode,
        sortDirection,
        onDropOnFolder,
        onRefresh,
      ],
    );

    const handleDragCancel = useCallback(() => {
      setActiveId(null);
      setOverId(null);
      document.body.style.setProperty("cursor", "");
    }, []);

    // ===== Ref registration for marquee =====
    const registerRef = useCallback(
      (id: string, el: HTMLDivElement | null) => {
        if (el) itemRefs.current.set(id, el);
        else itemRefs.current.delete(id);
      },
      [itemRefs],
    );

    // ===== Inline folder creation =====
    const removeTempNode = useCallback(() => {
      setEditingId(null);
      setItems((prev) => removeItem(prev, TEMP_FOLDER_ID));
    }, []);

    const handleEditConfirm = useCallback(
      async (name: string) => {
        const parentId = editingParentIdRef.current;
        removeTempNode();
        if (onFolderCreated) {
          await onFolderCreated(name, parentId);
        }
      },
      [onFolderCreated, removeTempNode],
    );

    const handleEditCancel = useCallback(() => {
      removeTempNode();
    }, [removeTempNode]);

    // Expose createFolder via ref
    useImperativeHandle(
      ref,
      () => ({
        createFolder: (parentId: string | null) => {
          // Remove any existing temp node first
          setItems((prev) => {
            const cleaned = removeItem(prev, TEMP_FOLDER_ID);

            const tempItem: TreeItem = {
              id: TEMP_FOLDER_ID,
              name: "",
              type: "folder",
              children: [],
              collapsed: true,
              isEditing: true,
            };

            if (parentId === null) {
              // Insert at the beginning of root
              return [tempItem, ...cleaned];
            }

            // Insert as first child of the target folder, and expand it
            const insertInto = (nodes: TreeItem[]): TreeItem[] =>
              nodes.map((node) => {
                if (node.id === parentId) {
                  return {
                    ...node,
                    collapsed: false,
                    children: [tempItem, ...node.children],
                  };
                }
                if (node.children.length > 0) {
                  return { ...node, children: insertInto(node.children) };
                }
                return node;
              });

            return insertInto(cleaned);
          });

          editingParentIdRef.current = parentId;
          setEditingId(TEMP_FOLDER_ID);
        },
      }),
      [],
    );

    // ===== Loading state =====
    if (treeItems.length === 0 && items.length === 0 && !editingId) {
      return null;
    }

    // ===== Render =====
    return (
      <div className="flex h-full flex-col">
        {/* Finder-style table header */}
        <div className="flex items-center border-b border-neutral-200 dark:border-neutral-700 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 shrink-0 select-none">
          {/* Name column — flex-1 */}
          <button
            onClick={() => handleSortChange("name")}
            className={`flex flex-1 items-center gap-0.5 px-3 py-1.5 text-left transition-colors hover:text-neutral-700 dark:hover:text-neutral-300 ${
              sortMode === "name"
                ? "text-neutral-700 dark:text-neutral-300"
                : ""
            }`}
          >
            Name
            {sortMode === "name" &&
              (sortDirection === "asc" ? (
                <ChevronUpIcon className="h-3 w-3" />
              ) : (
                <ChevronDownIcon className="h-3 w-3" />
              ))}
          </button>
          {/* Date Modified column — fixed width */}
          <button
            onClick={() => handleSortChange("modified")}
            className={`flex ${COL_DATE_WIDTH} shrink-0 items-center gap-0.5 px-2 py-1.5 text-left transition-colors hover:text-neutral-700 dark:hover:text-neutral-300 ${
              sortMode === "modified"
                ? "text-neutral-700 dark:text-neutral-300"
                : ""
            }`}
          >
            Date Modified
            {sortMode === "modified" &&
              (sortDirection === "asc" ? (
                <ChevronUpIcon className="h-3 w-3" />
              ) : (
                <ChevronDownIcon className="h-3 w-3" />
              ))}
          </button>
          {/* Size column — fixed width */}
          <button
            onClick={() => handleSortChange("size")}
            className={`flex ${COL_SIZE_WIDTH} shrink-0 items-center justify-end gap-0.5 px-2 py-1.5 text-right transition-colors hover:text-neutral-700 dark:hover:text-neutral-300 ${
              sortMode === "size"
                ? "text-neutral-700 dark:text-neutral-300"
                : ""
            }`}
          >
            Size
            {sortMode === "size" &&
              (sortDirection === "asc" ? (
                <ChevronUpIcon className="h-3 w-3" />
              ) : (
                <ChevronDownIcon className="h-3 w-3" />
              ))}
          </button>
        </div>

        {/* Tree — items stay in place during drag (Finder-like) */}
        <div
          className={`flex-1 p-2 rounded-md transition-colors ${
            activeId && dropTargetId === null
              ? "bg-indigo-50/50 dark:bg-indigo-950/20 ring-2 ring-inset ring-indigo-300 dark:ring-indigo-600"
              : ""
          }`}
        >
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <AnimatePresence initial={false}>
              {flattenedItems.map((item) => (
                <motion.div
                  key={item.id}
                  layout={!activeId}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{
                    layout: { duration: 0.2, ease: "easeInOut" },
                    opacity: { duration: 0.15 },
                    height: { duration: 0.2 },
                  }}
                  style={{ overflow: "hidden" }}
                >
                  <TreeItemRow
                    item={item}
                    depth={item.depth}
                    isSelected={selectedIds.has(item.id)}
                    isDragging={draggedIds.has(item.id)}
                    isDropTarget={dropTargetId === item.id}
                    isEditing={editingId === item.id}
                    onEditConfirm={handleEditConfirm}
                    onEditCancel={handleEditCancel}
                    onCollapse={
                      item.type === "folder" ? handleCollapse : undefined
                    }
                    onClick={onItemClick}
                    onDoubleClick={(id: string) => {
                      const found = findOriginalItem(id);
                      if (found?.type === "file") {
                        onFileDoubleClick(found.item as FileUploadResponse);
                      } else if (found?.type === "folder") {
                        handleCollapse(id);
                      }
                    }}
                    onContextMenu={(e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const found = findOriginalItem(item.id);
                      if (found) {
                        onContextMenu(e, found.item, found.type);
                      }
                    }}
                    registerRef={registerRef}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            {createPortal(
              <DragOverlay dropAnimation={dropAnimationConfig}>
                {activeId && activeItem ? (
                  <TreeItemClone
                    item={activeItem}
                    childCount={
                      draggedIds.size > 1
                        ? draggedIds.size
                        : getChildCount(items, String(activeId)) + 1
                    }
                  />
                ) : null}
              </DragOverlay>,
              document.body,
            )}
          </DndContext>
        </div>
      </div>
    );
  },
);

SortableTreeComp.displayName = "SortableTree";

export const SortableTree = React.memo(SortableTreeComp);
