import type { FileUploadResponse } from "@/service/fileService";
import type { Folder, FileTreeItem } from "@/service/folderService";
import React from "react";
import type { ContextMenuType } from "./ContextMenu";
import { SortableTree, type SortableTreeHandle } from "./SortableTree";

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

export type FileTreeViewHandle = SortableTreeHandle;

interface FileTreeViewProps {
  treeItems: FileTreeItem[];
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
  onFolderCreated?: (name: string, parentId: string | null) => Promise<void>;
  onRefresh?: () => void;
  /** When true, disables drag-drop and folder creation (trash view) */
  isTrashView?: boolean;
}

const FileTreeViewComp = React.forwardRef<
  FileTreeViewHandle,
  FileTreeViewProps
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
      isTrashView,
    },
    ref,
  ) => {
    return (
      <SortableTree
        ref={ref}
        treeItems={treeItems}
        selectedIds={selectedIds}
        itemRefs={itemRefs}
        onItemClick={onItemClick}
        onFileDoubleClick={onFileDoubleClick}
        onContextMenu={onContextMenu}
        onDropOnFolder={onDropOnFolder}
        onFolderCreated={onFolderCreated}
        onRefresh={onRefresh}
        isTrashView={isTrashView}
      />
    );
  },
);

FileTreeViewComp.displayName = "FileTreeView";

export const FileTreeView = React.memo(FileTreeViewComp);
