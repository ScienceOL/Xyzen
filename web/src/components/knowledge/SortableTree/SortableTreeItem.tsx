import { FileIcon } from "@/components/knowledge/FileIcon";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { FolderIcon, FolderOpenIcon } from "lucide-react";
import React, { forwardRef, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { FlattenedItem } from "./types";
import {
  COL_DATE_WIDTH,
  COL_SIZE_WIDTH,
  INDENTATION_WIDTH,
  formatDate,
  formatFileSize,
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
  isEditing?: boolean;
  onEditConfirm?: (name: string) => void;
  onEditCancel?: () => void;
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
  isEditing = false,
  onEditConfirm,
  onEditCancel,
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
  } = useDraggable({ id: item.id, disabled: isEditing });

  const { setNodeRef: setDropRef } = useDroppable({ id: item.id });

  return (
    <div
      ref={(el) => {
        setDragRef(el);
        setDropRef(el);
        registerRef?.(item.id, el);
      }}
      style={{ opacity: isDragging ? 0.4 : 1, touchAction: "none" }}
      {...(isEditing ? {} : attributes)}
      {...(isEditing ? {} : listeners)}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onClick={(e) => {
        if (!isEditing) {
          onClick?.(e, item.id);
          if (item.type === "folder") onCollapse?.(item.id);
        }
      }}
      onDoubleClick={() => {
        if (!isEditing) onDoubleClick?.(item.id);
      }}
      onContextMenu={isEditing ? undefined : onContextMenu}
    >
      <TreeItemContent
        item={item}
        depth={depth}
        isSelected={isSelected}
        isDropTarget={isDropTarget}
        indentationWidth={indentationWidth}
        isEditing={isEditing}
        onEditConfirm={onEditConfirm}
        onEditCancel={onEditCancel}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Clone (shown in DragOverlay)
// ---------------------------------------------------------------------------

interface TreeItemCloneProps {
  item: FlattenedItem;
  childCount?: number;
}

/**
 * Compact Finder-style drag preview: icon + name + optional child count badge.
 * Rendered inside DragOverlay — no hooks needed.
 */
export const TreeItemClone: React.FC<TreeItemCloneProps> = ({
  item,
  childCount,
}) => (
  <div className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 max-w-64 pointer-events-none">
    {/* Icon */}
    <span className="shrink-0 text-yellow-400 dark:text-yellow-500">
      {item.type === "folder" ? (
        <FolderIcon className="h-4 w-4" />
      ) : (
        <FileIcon
          filename={item.name}
          mimeType={item.file?.content_type || ""}
          className="h-4 w-4"
        />
      )}
    </span>

    {/* Name — truncated */}
    <span className="truncate text-xs font-medium text-neutral-800 dark:text-neutral-200">
      {item.name}
    </span>

    {/* Child count badge (dragging a collapsed folder with children) */}
    {childCount && childCount > 1 ? (
      <span className="ml-0.5 flex shrink-0 items-center justify-center rounded-full bg-indigo-500 px-1.5 text-[10px] font-semibold text-white min-w-5 h-5">
        {childCount}
      </span>
    ) : null}
  </div>
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
    indentationWidth?: number;
    isEditing?: boolean;
    onEditConfirm?: (name: string) => void;
    onEditCancel?: () => void;
  }
>(
  (
    {
      item,
      depth,
      isSelected,
      isDropTarget = false,
      indentationWidth = INDENTATION_WIDTH,
      isEditing = false,
      onEditConfirm,
      onEditCancel,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus and select all text when entering editing mode
    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [isEditing]);

    // Always show updatedAt and file size
    const metaDate = item.updatedAt;
    const metaSize =
      item.type === "file" ? formatFileSize(item.fileSize ?? 0) : "--";

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const value = (e.target as HTMLInputElement).value.trim();
        if (value) {
          onEditConfirm?.(value);
        } else {
          onEditCancel?.();
        }
      } else if (e.key === "Escape") {
        onEditCancel?.();
      }
    };

    const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const value = e.target.value.trim();
      if (value) {
        onEditConfirm?.(value);
      } else {
        onEditCancel?.();
      }
    };

    return (
      <div
        ref={ref}
        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm select-none cursor-default group transition-colors ${
          isDropTarget
            ? "ring-2 ring-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 dark:ring-indigo-500"
            : isSelected
              ? "bg-indigo-600 text-white"
              : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
        }`}
        style={{ paddingLeft: depth * indentationWidth + 8 }}
      >
        {/* Folder icon or file icon */}
        {item.type === "folder" ? (
          <span
            className={`shrink-0 ${isSelected ? "text-white" : "text-yellow-400 dark:text-yellow-500"}`}
          >
            {item.collapsed ? (
              <FolderIcon className="h-4 w-4" />
            ) : (
              <FolderOpenIcon className="h-4 w-4" />
            )}
          </span>
        ) : (
          <span className="shrink-0 ml-0.5">
            <FileIcon
              filename={item.name}
              mimeType={item.file?.content_type || ""}
              className="h-3.5 w-3.5"
            />
          </span>
        )}

        {/* Name or inline input */}
        {isEditing ? (
          <input
            ref={inputRef}
            defaultValue={t("knowledge.toolbar.newFolderPlaceholder")}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="min-w-0 flex-1 truncate text-xs bg-white dark:bg-neutral-800 border border-indigo-400 dark:border-indigo-500 rounded px-1 py-0 outline-none focus:ring-1 focus:ring-indigo-400 text-neutral-900 dark:text-neutral-100"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs">{item.name}</span>
        )}

        {/* Date Modified column — fixed width */}
        {!isEditing && (
          <span
            className={`shrink-0 ${COL_DATE_WIDTH} text-right text-[10px] tabular-nums ${
              isSelected
                ? "text-indigo-200"
                : "text-neutral-400 dark:text-neutral-500"
            }`}
          >
            {formatDate(metaDate)}
          </span>
        )}
        {/* Size column — fixed width */}
        {!isEditing && (
          <span
            className={`shrink-0 ${COL_SIZE_WIDTH} text-right text-[10px] tabular-nums ${
              isSelected
                ? "text-indigo-200"
                : "text-neutral-400 dark:text-neutral-500"
            }`}
          >
            {metaSize}
          </span>
        )}
      </div>
    );
  },
);

TreeItemContent.displayName = "TreeItemContent";
