import { FileIcon } from "@/components/knowledge/FileIcon";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronRightIcon } from "lucide-react";
import React, { forwardRef } from "react";
import type { FlattenedItem } from "./types";
import {
  INDENTATION_WIDTH,
  formatDate,
  formatFileSize,
  type SortMode,
} from "./utilities";

// ---------------------------------------------------------------------------
// Props shared between TreeItemRow and TreeItemClone
// ---------------------------------------------------------------------------

interface TreeItemRowProps {
  item: FlattenedItem;
  depth: number;
  isSelected: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  indentationWidth?: number;
  sortMode?: SortMode;
  onCollapse?: (id: string) => void;
  onClick?: (e: React.MouseEvent, id: string) => void;
  onDoubleClick?: (id: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Ref callback to register item DOM element for marquee selection */
  registerRef?: (id: string, el: HTMLDivElement | null) => void;
}

/**
 * A tree item row that is both draggable (drag source) and droppable (drop target).
 * Items stay perfectly in place during drag — no shifting, no transforms.
 * Only the DragOverlay follows the cursor.
 */
export const TreeItemRow: React.FC<TreeItemRowProps> = ({
  item,
  depth,
  isSelected,
  isDragging = false,
  isDropTarget = false,
  indentationWidth = INDENTATION_WIDTH,
  sortMode = "name",
  onCollapse,
  onClick,
  onDoubleClick,
  onContextMenu,
  registerRef,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
  } = useDraggable({ id: item.id });

  const { setNodeRef: setDropRef } = useDroppable({ id: item.id });

  return (
    <div
      ref={(el) => {
        setDragRef(el);
        setDropRef(el);
        registerRef?.(item.id, el);
      }}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => onClick?.(e, item.id)}
      onDoubleClick={() => onDoubleClick?.(item.id)}
      onContextMenu={onContextMenu}
    >
      <TreeItemContent
        item={item}
        depth={depth}
        isSelected={isSelected}
        isDropTarget={isDropTarget}
        indentationWidth={indentationWidth}
        onCollapse={onCollapse}
        sortMode={sortMode}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Clone (shown in DragOverlay)
// ---------------------------------------------------------------------------

interface TreeItemCloneProps {
  item: FlattenedItem;
  depth: number;
  childCount?: number;
  sortMode?: SortMode;
}

/**
 * Lightweight clone rendered inside DragOverlay. No hooks needed.
 */
export const TreeItemClone: React.FC<TreeItemCloneProps> = ({
  item,
  depth,
  childCount,
  sortMode = "name",
}) => (
  <TreeItemContent
    item={item}
    depth={depth}
    isSelected={false}
    clone
    childCount={childCount}
    sortMode={sortMode}
  />
);

/**
 * Pure presentational component for tree item content.
 * Shows metadata (date/size) like macOS Finder's list view.
 */
const TreeItemContent = forwardRef<
  HTMLDivElement,
  {
    item: FlattenedItem;
    depth: number;
    isSelected: boolean;
    isDropTarget?: boolean;
    clone?: boolean;
    childCount?: number;
    indentationWidth?: number;
    onCollapse?: (id: string) => void;
    sortMode?: SortMode;
  }
>(
  (
    {
      item,
      depth,
      isSelected,
      isDropTarget = false,
      clone,
      childCount,
      indentationWidth = INDENTATION_WIDTH,
      onCollapse,
      sortMode = "name",
    },
    ref,
  ) => {
    // Pick which date to show based on sort mode
    const metaDate = sortMode === "created" ? item.createdAt : item.updatedAt;
    const metaSize =
      item.type === "file" ? formatFileSize(item.fileSize ?? 0) : null;

    return (
      <div
        ref={ref}
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none cursor-default group transition-colors ${
          clone
            ? "shadow-lg border border-indigo-300 bg-white dark:bg-neutral-900 dark:border-indigo-700 opacity-90"
            : isDropTarget
              ? "ring-2 ring-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 dark:ring-indigo-500"
              : isSelected
                ? "bg-indigo-600 text-white"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
        }`}
        style={{ paddingLeft: depth * indentationWidth + 8 }}
      >
        {/* Folder collapse/expand chevron or spacer */}
        {item.type === "folder" ? (
          <button
            className={`shrink-0 p-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 ${
              isSelected ? "hover:bg-indigo-500" : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onCollapse?.(item.id);
            }}
          >
            <ChevronRightIcon
              className={`h-3.5 w-3.5 transition-transform ${
                !item.collapsed ? "rotate-90" : ""
              } ${isSelected ? "text-white" : "text-neutral-500"}`}
            />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        {/* Icon */}
        <span className="shrink-0">
          {item.type === "folder" ? (
            <FolderIconColored
              className={`h-3.5 w-3.5 ${isSelected ? "text-yellow-300" : "text-yellow-500"}`}
            />
          ) : (
            <FileIcon
              filename={item.name}
              mimeType={item.file?.content_type || ""}
              className="h-3.5 w-3.5"
            />
          )}
        </span>

        {/* Name */}
        <span className="min-w-0 flex-1 truncate text-xs">{item.name}</span>

        {/* Metadata — file size & date (like Finder list view) */}
        {!clone && (
          <>
            {metaSize && (
              <span
                className={`shrink-0 text-[10px] tabular-nums ${
                  isSelected
                    ? "text-indigo-200"
                    : "text-neutral-400 dark:text-neutral-500"
                }`}
              >
                {metaSize}
              </span>
            )}
            <span
              className={`shrink-0 w-17.5 text-right text-[10px] tabular-nums ${
                isSelected
                  ? "text-indigo-200"
                  : "text-neutral-400 dark:text-neutral-500"
              }`}
            >
              {formatDate(metaDate)}
            </span>
          </>
        )}

        {/* Child count badge (for clone overlay when dragging collapsed folder) */}
        {clone && childCount && childCount > 0 ? (
          <span className="flex items-center justify-center rounded-full bg-indigo-500 px-1.5 text-[10px] font-semibold text-white min-w-5 h-5">
            {childCount}
          </span>
        ) : null}
      </div>
    );
  },
);

TreeItemContent.displayName = "TreeItemContent";

const FolderIconColored = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={className}
  >
    <path d="M3.75 3A1.75 1.75 0 002 4.75v3.26a3.235 3.235 0 011.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0016.25 5h-4.836a.25.25 0 01-.177-.073L9.823 3.513A1.75 1.75 0 008.586 3H3.75zM3.75 9A1.75 1.75 0 002 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0018 15.25v-4.5A1.75 1.75 0 0016.25 9H3.75z" />
  </svg>
);
