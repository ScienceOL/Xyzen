import { type Folder } from "@/service/folderService";
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  Squares2X2Icon,
  ListBulletIcon,
  TrashIcon,
  FolderIcon,
  HomeIcon,
  ChevronRightIcon as BreadcrumbSeparatorIcon,
} from "@heroicons/react/24/outline";
import type { ViewMode } from "./types";

interface KnowledgeToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onSearch: (query: string) => void;
  onUpload: () => void;
  onCreateFolder?: () => void;
  onRefresh: () => void;
  onEmptyTrash?: () => void;
  title: string;
  isTrash?: boolean;
  showCreateFolder?: boolean;
  breadcrumbs?: Folder[];
  onBreadcrumbClick?: (folderId: string | null) => void;
}

export const KnowledgeToolbar = ({
  viewMode,
  onViewModeChange,
  onSearch,
  onUpload,
  onCreateFolder,
  onRefresh,
  onEmptyTrash,
  title,
  isTrash,
  showCreateFolder,
  breadcrumbs,
  onBreadcrumbClick,
}: KnowledgeToolbarProps) => {
  return (
    <div className="flex h-12 items-center justify-between border-b border-neutral-200 bg-white/80 px-4 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
      {/* Left: Navigation & Title OR Breadcrumbs */}
      <div className="flex items-center gap-4">
        {breadcrumbs ? (
          <div className="flex items-center gap-1 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            <button
              onClick={() => onBreadcrumbClick && onBreadcrumbClick(null)}
              className={`flex items-center gap-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded px-1.5 py-0.5 ${breadcrumbs.length === 0 ? "text-neutral-900 font-semibold dark:text-white" : ""}`}
            >
              <HomeIcon className="h-4 w-4" />
              <span>Home</span>
            </button>

            {breadcrumbs.map((folder, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <div key={folder.id} className="flex items-center gap-1">
                  <BreadcrumbSeparatorIcon className="h-3 w-3 text-neutral-400" />
                  <button
                    onClick={() =>
                      !isLast &&
                      onBreadcrumbClick &&
                      onBreadcrumbClick(folder.id)
                    }
                    disabled={isLast}
                    className={`truncate max-w-[150px] hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded px-1.5 py-0.5 ${isLast ? "text-neutral-900 font-semibold dark:text-white cursor-default" : "cursor-pointer"}`}
                  >
                    {folder.name}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <h1 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 capitalize">
            {title}
          </h1>
        )}
      </div>

      {/* Center: Search (Optional) */}

      {/* Right: Actions */}
      <div className="flex items-center gap-3">
        {/* View Toggle */}
        <div className="flex items-center rounded-md bg-neutral-100 p-0.5 dark:bg-neutral-800">
          <button
            onClick={() => onViewModeChange("list")}
            className={`rounded p-1 ${
              viewMode === "list"
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white"
                : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
            }`}
            title="List View"
          >
            <ListBulletIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => onViewModeChange("grid")}
            className={`rounded p-1 ${
              viewMode === "grid"
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white"
                : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400"
            }`}
            title="Grid View"
          >
            <Squares2X2Icon className="h-4 w-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search"
            onChange={(e) => onSearch(e.target.value)}
            className="h-8 w-48 rounded-md border-0 bg-neutral-100 pl-8 pr-4 text-xs text-neutral-900 focus:ring-1 focus:ring-indigo-500 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />

        {/* Action Buttons */}
        {showCreateFolder && onCreateFolder && (
          <button
            onClick={onCreateFolder}
            className="flex items-center gap-1 rounded-md bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            <FolderIcon className="h-3 w-3" />
            <span>New Folder</span>
          </button>
        )}

        {isTrash && onEmptyTrash ? (
          <button
            onClick={onEmptyTrash}
            className="flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
          >
            <TrashIcon className="h-3 w-3" />
            <span>Empty</span>
          </button>
        ) : (
          <button
            onClick={onUpload}
            className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900"
          >
            <PlusIcon className="h-3 w-3" />
            <span>Upload</span>
          </button>
        )}

        <button
          onClick={onRefresh}
          className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          <ArrowPathIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
