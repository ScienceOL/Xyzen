import type { FileUploadResponse } from "@/service/fileService";
import type { Folder } from "@/service/folderService";
import React from "react";
import type { ContextMenuType } from "./ContextMenu";
import { SortableTree } from "./SortableTree";

// Module-level drag context — readable during dragOver (dataTransfer.getData is drop-only)
// Used by FileList's list/grid views which still use native HTML5 DnD.
let dragContext: {
  ids: string[];
  types: Record<string, "file" | "folder">;
} | null = null;

export const DRAG_MIME = "application/x-xyzen-drag";

export function getDragContext() {
  return dragContext;
}

export function setDragContext(
  ctx: { ids: string[]; types: Record<string, "file" | "folder"> } | null,
) {
  dragContext = ctx;
}

interface FileTreeViewProps {
  folders: Folder[];
  files: FileUploadResponse[];
  selectedIds: Set<string>;
  /** Ref map for marquee selection — items register their DOM elements here */
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  onItemClick: (e: React.MouseEvent, id: string) => void;
  onFileDoubleClick: (file: FileUploadResponse) => void;
  onContextMenu: (
    e: React.MouseEvent,
    item: Folder | FileUploadResponse,
    type: ContextMenuType,
  ) => void;
  onDropOnFolder: (
    itemIds: string[],
    targetFolderId: string | null,
    typeMap?: Record<string, "file" | "folder">,
  ) => void;
}

const FileTreeViewComp = ({
  folders,
  files,
  selectedIds,
  itemRefs,
  onItemClick,
  onFileDoubleClick,
  onContextMenu,
  onDropOnFolder,
}: FileTreeViewProps) => {
  return (
    <SortableTree
      folders={folders}
      files={files}
      selectedIds={selectedIds}
      itemRefs={itemRefs}
      onItemClick={onItemClick}
      onFileDoubleClick={onFileDoubleClick}
      onContextMenu={onContextMenu}
      onDropOnFolder={onDropOnFolder}
    />
  );
};

export const FileTreeView = React.memo(FileTreeViewComp);
