import { useEffect, useRef, useState } from "react";
import { type Folder } from "@/service/folderService";
import { type FileUploadResponse } from "@/service/fileService";
import {
  PencilIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  ArrowsRightLeftIcon, // Move icon
} from "@heroicons/react/24/outline";

export type ContextMenuType = "file" | "folder";

export interface ContextMenuProps {
  type: ContextMenuType;
  item: Folder | FileUploadResponse;
  position: { x: number; y: number };
  onClose: () => void;
  onRename: (item: Folder | FileUploadResponse, type: ContextMenuType) => void;
  onDelete: (item: Folder | FileUploadResponse, type: ContextMenuType) => void;
  onMove: (item: Folder | FileUploadResponse, type: ContextMenuType) => void;
  onDownload?: (item: FileUploadResponse) => void;
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
}: ContextMenuProps) => {
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

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-lg border border-neutral-200 bg-white p-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
      style={{ top: adjustedPosition.y, left: adjustedPosition.x }}
    >
      <div className="flex flex-col gap-0.5">
        {type === "file" && onDownload && (
          <button
            onClick={() => {
              onDownload(item as FileUploadResponse);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Download
          </button>
        )}

        <button
          onClick={() => {
            onRename(item, type);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <PencilIcon className="h-4 w-4" />
          Rename
        </button>

        <button
          onClick={() => {
            onMove(item, type);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <ArrowsRightLeftIcon className="h-4 w-4" />
          Move to...
        </button>

        <div className="my-1 h-px bg-neutral-200 dark:bg-neutral-800" />

        <button
          onClick={() => {
            onDelete(item, type);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <TrashIcon className="h-4 w-4" />
          Delete
        </button>
      </div>
    </div>
  );
};
