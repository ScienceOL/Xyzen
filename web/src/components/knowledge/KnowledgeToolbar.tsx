import { type Folder } from "@/service/folderService";
import {
  ArrowPathIcon,
  ChevronRightIcon as BreadcrumbSeparatorIcon,
  FolderIcon,
  HomeIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  Squares2X2Icon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
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
  onMenuClick?: () => void;
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
  onMenuClick,
}: KnowledgeToolbarProps) => {
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  return (
    <div className="relative flex h-12 items-center justify-between border-b border-neutral-200 bg-white/80 px-2 md:px-4 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
      {/* Mobile Search Overlay */}
      {isMobileSearchOpen && (
        <div className="absolute inset-0 z-10 flex items-center bg-white px-2 dark:bg-neutral-900">
          <MagnifyingGlassIcon className="mr-2 h-5 w-5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search files..."
            autoFocus
            onChange={(e) => onSearch(e.target.value)}
            className="flex-1 border-none bg-transparent text-sm text-neutral-900 placeholder-neutral-400 focus:ring-0 dark:text-white"
          />
          <button
            onClick={() => {
              setIsMobileSearchOpen(false);
              onSearch("");
            }}
            className="p-2 text-neutral-500"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Left: Navigation & Title OR Breadcrumbs */}
      <div
        className={`flex items-center gap-2 md:gap-4 ${isMobileSearchOpen ? "invisible" : ""}`}
      >
        {/* Mobile Menu Button */}
        <button
          onClick={onMenuClick}
          className="p-2 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 md:hidden"
        >
          <ListBulletIcon className="h-5 w-5" />
        </button>

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
      <div
        className={`flex items-center gap-1 md:gap-3 ${isMobileSearchOpen ? "invisible" : ""}`}
      >
        {/* Mobile Search Trigger */}
        <button
          onClick={() => setIsMobileSearchOpen(true)}
          className="p-1.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 md:hidden"
        >
          <MagnifyingGlassIcon className="h-5 w-5" />
        </button>

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

        {/* Desktop Search Input */}
        <div className="relative hidden md:block">
          <MagnifyingGlassIcon className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search"
            onChange={(e) => onSearch(e.target.value)}
            className="h-8 w-48 rounded-md border-0 bg-neutral-100 pl-8 pr-4 text-xs text-neutral-900 focus:ring-1 focus:ring-indigo-500 dark:bg-neutral-800 dark:text-white"
          />
        </div>

        <div className="hidden h-4 w-px bg-neutral-200 dark:bg-neutral-700 md:block" />

        {/* Action Buttons */}
        {showCreateFolder && onCreateFolder && (
          <button
            onClick={onCreateFolder}
            className="flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 md:px-3"
            title="New Folder"
          >
            <FolderIcon className="h-4 w-4 md:h-3 md:w-3" />
            <span className="hidden md:inline">New Folder</span>
          </button>
        )}

        {isTrash && onEmptyTrash ? (
          <button
            onClick={onEmptyTrash}
            className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900 md:px-3"
            title="Empty Trash"
          >
            <TrashIcon className="h-4 w-4 md:h-3 md:w-3" />
            <span className="hidden md:inline">Empty</span>
          </button>
        ) : (
          <button
            onClick={onUpload}
            className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-neutral-900 md:px-3"
            title="Upload File"
          >
            <PlusIcon className="h-4 w-4 md:h-3 md:w-3" />
            <span className="hidden md:inline">Upload</span>
          </button>
        )}

        <button
          onClick={onRefresh}
          className="hidden rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 md:block"
          title="Refresh"
        >
          <ArrowPathIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
