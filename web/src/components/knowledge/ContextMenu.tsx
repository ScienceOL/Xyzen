import { type FileUploadResponse } from "@/service/fileService";
import { type Folder } from "@/service/folderService";
import {
  ArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon,
  ArrowsRightLeftIcon,
  CodeBracketSquareIcon,
  EyeIcon,
  FolderOpenIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

export type ContextMenuType = "file" | "folder";

export interface ContextMenuProps {
  type: ContextMenuType;
  item: Folder | FileUploadResponse;
  position: { x: number; y: number };
  onClose: () => void;
  onRename?: (item: Folder | FileUploadResponse, type: ContextMenuType) => void;
  onDelete?: (item: Folder | FileUploadResponse, type: ContextMenuType) => void;
  onMove?: (item: Folder | FileUploadResponse, type: ContextMenuType) => void;
  onDownload?: (item: FileUploadResponse) => void;
  onEdit?: (item: FileUploadResponse) => void;
  onPreview?: (item: FileUploadResponse) => void;
  onOpen?: (item: Folder) => void;
  onAddToKnowledgeSet?: (item: Folder | FileUploadResponse) => void;
  onRemoveFromKnowledgeSet?: (item: Folder | FileUploadResponse) => void;
  onRestore?: (
    item: Folder | FileUploadResponse,
    type: ContextMenuType,
  ) => void;
  onBulkDelete?: () => void;
  onBulkMove?: () => void;
  isInKnowledgeSetView?: boolean;
  isTrashView?: boolean;
  selectedCount?: number;
}

export const ContextMenu = ({
  type,
  item,
  position,
  onClose,
  onRename,
  onDelete,
  onMove,
  onDownload,
  onEdit,
  onPreview,
  onOpen,
  onAddToKnowledgeSet,
  onRemoveFromKnowledgeSet,
  onRestore,
  onBulkDelete,
  onBulkMove,
  isInKnowledgeSetView = false,
  isTrashView = false,
  selectedCount = 1,
}: ContextMenuProps) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  // Adjust position to keep menu within viewport
  useEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      let { x, y } = position;

      if (x + menuRect.width > window.innerWidth) {
        x = window.innerWidth - menuRect.width - 10;
      }
      if (y + menuRect.height > window.innerHeight) {
        y = window.innerHeight - menuRect.height - 10;
      }
      setAdjustedPosition({ x, y });
    }
  }, [position]);

  // Trash view menu
  if (isTrashView) {
    return createPortal(
      <div
        ref={menuRef}
        className="fixed z-50 min-w-40 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
        style={{ top: adjustedPosition.y, left: adjustedPosition.x }}
      >
        <div className="flex flex-col gap-0.5">
          {selectedCount > 1 ? (
            <>
              {onRestore && (
                <button
                  onClick={() => {
                    onRestore(item, type);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <ArrowPathRoundedSquareIcon className="h-4 w-4" />
                  {t("knowledge.contextMenu.restoreSelected", {
                    count: selectedCount,
                  })}
                </button>
              )}
              <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />
              {onBulkDelete && (
                <button
                  onClick={() => {
                    onBulkDelete();
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <TrashIcon className="h-4 w-4" />
                  {t("knowledge.contextMenu.deleteSelected", {
                    count: selectedCount,
                  })}
                </button>
              )}
            </>
          ) : (
            <>
              {onRestore && (
                <button
                  onClick={() => {
                    onRestore(item, type);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                >
                  <ArrowPathRoundedSquareIcon className="h-4 w-4" />
                  {t("knowledge.contextMenu.restore")}
                </button>
              )}
              <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />
              {onDelete && (
                <button
                  onClick={() => {
                    onDelete(item, type);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <TrashIcon className="h-4 w-4" />
                  {t("knowledge.contextMenu.deleteForever")}
                </button>
              )}
            </>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  // Multi-select context menu (non-trash)
  if (selectedCount > 1) {
    return createPortal(
      <div
        ref={menuRef}
        className="fixed z-50 min-w-40 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
        style={{ top: adjustedPosition.y, left: adjustedPosition.x }}
      >
        <div className="flex flex-col gap-0.5">
          {onBulkMove && (
            <button
              onClick={() => {
                onBulkMove();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <ArrowsRightLeftIcon className="h-4 w-4" />
              {t("knowledge.contextMenu.moveSelected", {
                count: selectedCount,
              })}
            </button>
          )}

          <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />

          {onBulkDelete && (
            <button
              onClick={() => {
                onBulkDelete();
                onClose();
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <TrashIcon className="h-4 w-4" />
              {t("knowledge.contextMenu.deleteSelected", {
                count: selectedCount,
              })}
            </button>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  // Normal single-item view menu
  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-40 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
      style={{ top: adjustedPosition.y, left: adjustedPosition.x }}
    >
      <div className="flex flex-col gap-0.5">
        {type === "folder" && onOpen && (
          <button
            onClick={() => {
              onOpen(item as Folder);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <FolderOpenIcon className="h-4 w-4" />
            {t("knowledge.contextMenu.open")}
          </button>
        )}

        {type === "file" && onPreview && (
          <button
            onClick={() => {
              onPreview(item as FileUploadResponse);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <EyeIcon className="h-4 w-4" />
            {t("knowledge.contextMenu.preview")}
          </button>
        )}

        {type === "file" && onEdit && (
          <button
            onClick={() => {
              onEdit(item as FileUploadResponse);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <CodeBracketSquareIcon className="h-4 w-4" />
            {t("knowledge.contextMenu.edit")}
          </button>
        )}

        {type === "file" && onDownload && (
          <button
            onClick={() => {
              onDownload(item as FileUploadResponse);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            {t("knowledge.contextMenu.download")}
          </button>
        )}

        {(type === "folder" && onOpen) ||
        (type === "file" && (onPreview || onEdit || onDownload)) ? (
          <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />
        ) : null}

        {onRename && (
          <button
            onClick={() => {
              onRename(item, type);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <PencilIcon className="h-4 w-4" />
            {t("knowledge.contextMenu.rename")}
          </button>
        )}

        {onMove && (
          <button
            onClick={() => {
              onMove(item, type);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <ArrowsRightLeftIcon className="h-4 w-4" />
            {t("knowledge.contextMenu.moveTo")}
          </button>
        )}

        {onAddToKnowledgeSet && !isInKnowledgeSetView && (
          <button
            onClick={() => {
              onAddToKnowledgeSet(item);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <PlusIcon className="h-4 w-4" />
            {t("knowledge.contextMenu.addToKnowledgeSet")}
          </button>
        )}

        {onRemoveFromKnowledgeSet && isInKnowledgeSetView && (
          <button
            onClick={() => {
              onRemoveFromKnowledgeSet(item);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <MinusIcon className="h-4 w-4" />
            {t("knowledge.contextMenu.removeFromKnowledgeSet")}
          </button>
        )}

        <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />

        {onDelete && (
          <button
            onClick={() => {
              onDelete(item, type);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <TrashIcon className="h-4 w-4" />
            {t("knowledge.contextMenu.delete")}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
};
