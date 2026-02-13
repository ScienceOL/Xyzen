import {
  FileItem,
  Files,
  FolderContent,
  FolderItem,
  FolderTrigger,
} from "@/components/animate-ui/components/radix/files";
import { type FileUploadResponse, fileService } from "@/service/fileService";
import { folderService, type Folder } from "@/service/folderService";
import React, { useCallback, useRef, useState } from "react";
import type { ContextMenuType } from "./ContextMenu";
import { FileIcon } from "./FileIcon";

// Module-level drag context — readable during dragOver (dataTransfer.getData is drop-only)
let dragContext: {
  ids: string[];
  types: Record<string, "file" | "folder">;
} | null = null;

export const DRAG_MIME = "application/x-xyzen-drag";

export function getDragContext() {
  return dragContext;
}

interface FileTreeViewProps {
  folders: Folder[];
  files: FileUploadResponse[];
  selectedIds: Set<string>;
  /** Ref map for marquee selection — items register their DOM elements here */
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  /** Set of all folder IDs (for determining item types during drag) */
  folderIds: Set<string>;
  onItemClick: (e: React.MouseEvent, id: string) => void;
  onFileDoubleClick: (file: FileUploadResponse) => void;
  onContextMenu: (
    e: React.MouseEvent,
    item: Folder | FileUploadResponse,
    type: ContextMenuType,
  ) => void;
  onDropOnFolder: (itemIds: string[], targetFolderId: string | null) => void;
}

/** Lazy-loaded folder node that fetches children on first expand */
const TreeFolderNode = ({
  folder,
  selectedIds,
  itemRefs,
  folderIds,
  onItemClick,
  onFileDoubleClick,
  onContextMenu,
  onDropOnFolder,
  depth = 0,
}: {
  folder: Folder;
  selectedIds: Set<string>;
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  folderIds: Set<string>;
  onItemClick: (e: React.MouseEvent, id: string) => void;
  onFileDoubleClick: (file: FileUploadResponse) => void;
  onContextMenu: (
    e: React.MouseEvent,
    item: Folder | FileUploadResponse,
    type: ContextMenuType,
  ) => void;
  onDropOnFolder: (itemIds: string[], targetFolderId: string | null) => void;
  depth?: number;
}) => {
  const [childFolders, setChildFolders] = useState<Folder[] | null>(null);
  const [childFiles, setChildFiles] = useState<FileUploadResponse[] | null>(
    null,
  );
  const loadingRef = useRef(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const loadChildren = useCallback(async () => {
    if (childFolders !== null || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const [folders, files] = await Promise.all([
        folderService.listFolders(folder.id),
        fileService.listFiles({
          parent_id: folder.id,
          filter_by_parent: true,
          is_dir: false,
          limit: 200,
        }),
      ]);
      setChildFolders(folders);
      setChildFiles(files);
    } catch {
      setChildFolders([]);
      setChildFiles([]);
    } finally {
      loadingRef.current = false;
    }
  }, [folder.id, childFolders]);

  const isSelected = selectedIds.has(folder.id);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const ids = selectedIds.has(folder.id) ? [...selectedIds] : [folder.id];
      const types: Record<string, "file" | "folder"> = {};
      for (const id of ids) {
        types[id] = folderIds.has(id) ? "folder" : "file";
      }
      dragContext = { ids, types };
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragContext));
      e.dataTransfer.effectAllowed = "move";
    },
    [folder.id, selectedIds, folderIds],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      // Prevent dropping a folder into itself
      if (dragContext?.ids.includes(folder.id)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
    },
    [folder.id],
  );

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      try {
        const data = JSON.parse(e.dataTransfer.getData(DRAG_MIME));
        if (data?.ids?.length > 0) {
          onDropOnFolder(data.ids, folder.id);
        }
      } catch {
        // ignore
      }
    },
    [folder.id, onDropOnFolder],
  );

  return (
    <FolderItem value={folder.id}>
      <div
        ref={(el) => {
          if (el) itemRefs.current.set(folder.id, el as HTMLDivElement);
          else itemRefs.current.delete(folder.id);
        }}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={() => {
          dragContext = null;
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={
          isDragOver
            ? "rounded-md ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
            : ""
        }
      >
        <FolderTrigger
          onClick={(e) => {
            loadChildren();
            onItemClick(e, folder.id);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e, folder, "folder");
          }}
          className={
            isSelected
              ? "bg-indigo-600 text-white hover:bg-indigo-600 dark:hover:bg-indigo-600 [&_.files-chevron]:text-white [&>span]:text-white"
              : ""
          }
          icon={
            <FolderIconColored
              className={`h-3.5 w-3.5 ${isSelected ? "text-yellow-300" : "text-yellow-500"}`}
            />
          }
        >
          {folder.name}
        </FolderTrigger>
      </div>
      <FolderContent>
        {childFolders === null ? (
          <div className="px-2 py-1 text-xs text-neutral-400 animate-pulse">
            ...
          </div>
        ) : (
          <>
            {childFolders.length > 0 && (
              <Files type="multiple">
                {childFolders.map((child) => (
                  <TreeFolderNode
                    key={child.id}
                    folder={child}
                    selectedIds={selectedIds}
                    itemRefs={itemRefs}
                    folderIds={folderIds}
                    onItemClick={onItemClick}
                    onFileDoubleClick={onFileDoubleClick}
                    onContextMenu={onContextMenu}
                    onDropOnFolder={onDropOnFolder}
                    depth={depth + 1}
                  />
                ))}
              </Files>
            )}
            {childFiles?.map((file) => (
              <TreeFileNode
                key={file.id}
                file={file}
                isSelected={selectedIds.has(file.id)}
                itemRefs={itemRefs}
                selectedIds={selectedIds}
                folderIds={folderIds}
                onItemClick={onItemClick}
                onFileDoubleClick={onFileDoubleClick}
                onContextMenu={onContextMenu}
              />
            ))}
          </>
        )}
      </FolderContent>
    </FolderItem>
  );
};

/** File leaf node */
const TreeFileNode = ({
  file,
  isSelected,
  itemRefs,
  selectedIds,
  folderIds,
  onItemClick,
  onFileDoubleClick,
  onContextMenu,
}: {
  file: FileUploadResponse;
  isSelected: boolean;
  itemRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  selectedIds: Set<string>;
  folderIds: Set<string>;
  onItemClick: (e: React.MouseEvent, id: string) => void;
  onFileDoubleClick: (file: FileUploadResponse) => void;
  onContextMenu: (
    e: React.MouseEvent,
    item: FileUploadResponse,
    type: ContextMenuType,
  ) => void;
}) => {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const ids = selectedIds.has(file.id) ? [...selectedIds] : [file.id];
      const types: Record<string, "file" | "folder"> = {};
      for (const id of ids) {
        types[id] = folderIds.has(id) ? "folder" : "file";
      }
      dragContext = { ids, types };
      e.dataTransfer.setData(DRAG_MIME, JSON.stringify(dragContext));
      e.dataTransfer.effectAllowed = "move";
    },
    [file.id, selectedIds, folderIds],
  );

  return (
    <div
      ref={(el) => {
        if (el) itemRefs.current.set(file.id, el as HTMLDivElement);
        else itemRefs.current.delete(file.id);
      }}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => {
        dragContext = null;
      }}
    >
      <FileItem
        onClick={(e) => onItemClick(e, file.id)}
        onDoubleClick={() => onFileDoubleClick(file)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e, file, "file");
        }}
        className={`cursor-default ${
          isSelected
            ? "bg-indigo-600 text-white hover:bg-indigo-600 dark:hover:bg-indigo-600 [&>span]:text-white"
            : ""
        }`}
        icon={
          <FileIcon
            filename={file.original_filename}
            mimeType={file.content_type || ""}
            className="h-3.5 w-3.5"
          />
        }
      >
        {file.original_filename}
      </FileItem>
    </div>
  );
};

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

const FileTreeViewComp = ({
  folders,
  files,
  selectedIds,
  itemRefs,
  folderIds,
  onItemClick,
  onFileDoubleClick,
  onContextMenu,
  onDropOnFolder,
}: FileTreeViewProps) => {
  return (
    <div className="p-2">
      <Files type="multiple">
        {folders.map((folder) => (
          <TreeFolderNode
            key={folder.id}
            folder={folder}
            selectedIds={selectedIds}
            itemRefs={itemRefs}
            folderIds={folderIds}
            onItemClick={onItemClick}
            onFileDoubleClick={onFileDoubleClick}
            onContextMenu={onContextMenu}
            onDropOnFolder={onDropOnFolder}
          />
        ))}
      </Files>
      {files.map((file) => (
        <TreeFileNode
          key={file.id}
          file={file}
          isSelected={selectedIds.has(file.id)}
          itemRefs={itemRefs}
          selectedIds={selectedIds}
          folderIds={folderIds}
          onItemClick={onItemClick}
          onFileDoubleClick={onFileDoubleClick}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
};

export const FileTreeView = React.memo(FileTreeViewComp);
