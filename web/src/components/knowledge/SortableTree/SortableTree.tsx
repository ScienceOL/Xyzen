import type { FileUploadResponse } from "@/service/fileService";
import type { Folder } from "@/service/folderService";
import { folderService } from "@/service/folderService";
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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ContextMenuType } from "../ContextMenu";
import { TreeItemClone, TreeItemRow } from "./SortableTreeItem";
import type { TreeItem } from "./types";
import {
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
// Props
// ---------------------------------------------------------------------------

interface SortableTreeProps {
  /** Root-level folders from FileList (used as initial data & refresh signal) */
  folders: Folder[];
  /** Root-level files from FileList */
  files: FileUploadResponse[];
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

const SortableTreeComp: React.FC<SortableTreeProps> = ({
  folders,
  files,
  selectedIds,
  itemRefs,
  onItemClick,
  onFileDoubleClick,
  onContextMenu,
  onDropOnFolder,
}) => {
  // ===== State =====
  const [items, setItems] = useState<TreeItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);

  // ---- Fetch the entire tree from backend in ONE call ----
  const fetchTree = useCallback(async () => {
    try {
      const flat = await folderService.getTree();
      const tree = buildTreeFromFlat(flat, sortMode, sortDirection);

      // Preserve the current collapse state of folders so a refetch
      // doesn't reset all folders to collapsed.
      setItems((prev) => {
        if (prev.length === 0) return tree;

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

        return applyState(tree);
      });
      setLoaded(true);
    } catch (e) {
      console.error("Failed to fetch file tree", e);
    }
  }, [sortMode, sortDirection]);

  // Initial load
  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // Re-fetch when parent props change
  const prevSignalRef = useRef<string>("");
  useEffect(() => {
    const signal = [
      ...folders.map((f) => f.id),
      ...files.map((f) => f.id),
    ].join(",");
    if (prevSignalRef.current && prevSignalRef.current !== signal) {
      fetchTree();
    }
    prevSignalRef.current = signal;
  }, [folders, files, fetchTree]);

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
    ): { item: Folder | FileUploadResponse; type: ContextMenuType } | null => {
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

      // Refetch for consistency
      setTimeout(() => fetchTree(), 500);
    },
    [
      items,
      flattenedItems,
      draggedIds,
      sortMode,
      sortDirection,
      onDropOnFolder,
      fetchTree,
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

  // ===== Loading state =====
  if (!loaded) {
    return null;
  }

  if (items.length === 0) {
    return null;
  }

  // ===== Render =====
  return (
    <div className="flex h-full flex-col">
      {/* Sort controls — Finder-style toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-neutral-200 dark:border-neutral-700 text-[11px] text-neutral-500 dark:text-neutral-400 shrink-0">
        <span className="mr-1">Sort:</span>
        {(["name", "modified", "created"] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => handleSortChange(mode)}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              sortMode === mode
                ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 font-medium"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            {mode === "name"
              ? "Name"
              : mode === "modified"
                ? "Modified"
                : "Created"}
            {sortMode === mode && (
              <span className="ml-0.5">
                {sortDirection === "asc" ? "↑" : "↓"}
              </span>
            )}
          </button>
        ))}
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
                  sortMode={sortMode}
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
};

export const SortableTree = React.memo(SortableTreeComp);
