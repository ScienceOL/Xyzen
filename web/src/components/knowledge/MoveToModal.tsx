import { folderService, type Folder } from "@/service/folderService";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { FolderIcon as FolderSolidIcon } from "@heroicons/react/24/solid";
import { useCallback, useEffect, useState } from "react";

interface MoveToModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => Promise<void>;
  title: string;
  currentFolderId: string | null; // The folder we are currently in (to avoid moving to itself if user selects current) - though logic check handles this
  itemId: string; // ID of item being moved (to prevent moving folder to self)
  itemType: "file" | "folder";
}

export const MoveToModal = ({
  isOpen,
  onClose,
  onMove,
  title,
  itemId,
  itemType,
}: MoveToModalProps) => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentPathId, setCurrentPathId] = useState<string | null>(null); // Current folder ID in navigation
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // Load folders for a specific parent
  const loadFolders = useCallback(
    async (parentId: string | null) => {
      setIsLoading(true);
      try {
        const data = await folderService.listFolders(parentId);
        // Filter out self if moving a folder
        const filtered =
          itemType === "folder" ? data.filter((f) => f.id !== itemId) : data;
        setFolders(filtered);

        // Update breadcrumbs
        if (parentId) {
          const path = await folderService.getFolderPath(parentId);
          setBreadcrumbs(path);
        } else {
          setBreadcrumbs([]);
        }
      } catch (e) {
        console.error("Failed to load folders", e);
      } finally {
        setIsLoading(false);
      }
    },
    [itemType, itemId],
  );

  useEffect(() => {
    if (isOpen) {
      // Reset state on open
      setCurrentPathId(null);
      setSelectedTargetId(null);
      loadFolders(null);
    }
  }, [isOpen, loadFolders]);

  const handleNavigate = (folderId: string | null) => {
    setCurrentPathId(folderId);
    setSelectedTargetId(folderId); // Auto-select the folder we navigate into as potential target
    loadFolders(folderId);
  };

  const handleConfirm = async () => {
    // If moving folder to itself or child, backend will block, but we can also check here if we had full tree
    await onMove(selectedTargetId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-96 rounded-xl bg-white p-4 shadow-xl dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
        <h3 className="mb-4 text-sm font-semibold text-neutral-900 dark:text-white">
          {title}
        </h3>

        {/* Breadcrumbs */}
        <div className="mb-2 flex items-center gap-1 text-xs text-neutral-500 overflow-x-auto whitespace-nowrap pb-2">
          <button
            onClick={() => handleNavigate(null)}
            className={`hover:text-indigo-600 ${!currentPathId ? "font-bold text-neutral-900 dark:text-white" : ""}`}
          >
            Home
          </button>
          {breadcrumbs.map((b) => (
            <div key={b.id} className="flex items-center gap-1">
              <ChevronRightIcon className="h-3 w-3" />
              <button
                onClick={() => handleNavigate(b.id)}
                className={`hover:text-indigo-600 ${currentPathId === b.id ? "font-bold text-neutral-900 dark:text-white" : ""}`}
              >
                {b.name}
              </button>
            </div>
          ))}
        </div>

        {/* Folder List */}
        <div className="mb-4 h-60 overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-xs text-neutral-400">
              Loading...
            </div>
          ) : folders.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-neutral-400">
              No subfolders
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {/* If strictly in root, maybe show "Select Root" explicitly?
                        Actually selectedTargetId handles "current location".
                        But we list subfolders to navigate deeper.
                    */}
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  onClick={() => setSelectedTargetId(folder.id)}
                  onDoubleClick={() => handleNavigate(folder.id)}
                  className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm ${selectedTargetId === folder.id ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100" : "hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-300"}`}
                >
                  <div className="flex items-center gap-2">
                    <FolderSolidIcon className="h-4 w-4 text-yellow-500" />
                    <span className="truncate max-w-[180px]">
                      {folder.name}
                    </span>
                  </div>
                  {/* Drill down button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNavigate(folder.id);
                    }}
                    className="text-neutral-400 hover:text-neutral-600"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 text-xs">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="rounded-md bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-500"
          >
            Move Here
          </button>
        </div>
      </div>
    </div>
  );
};
