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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  return (
    <div className="relative flex h-14 items-center justify-between border-b border-white/20 dark:border-neutral-700/30 px-3 md:px-4">
      {/* Mobile Search Overlay */}
      {isMobileSearchOpen && (
        <div className="absolute inset-0 z-10 flex items-center bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl px-3 rounded-t-2xl">
          <MagnifyingGlassIcon className="mr-2 h-5 w-5 text-neutral-400" />
          <input
            type="text"
            placeholder={t("knowledge.toolbar.searchFilesPlaceholder")}
            autoFocus
            onChange={(e) => onSearch(e.target.value)}
            className="flex-1 border-none bg-transparent text-sm text-neutral-900 placeholder-neutral-400 focus:ring-0 dark:text-white"
          />
          <button
            onClick={() => {
              setIsMobileSearchOpen(false);
              onSearch("");
            }}
            className="p-2 text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 rounded-lg hover:bg-white/50 dark:hover:bg-white/10 transition-colors"
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
              <span>{t("knowledge.toolbar.home")}</span>
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
                    className={`truncate max-w-37.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded px-1.5 py-0.5 ${isLast ? "text-neutral-900 font-semibold dark:text-white cursor-default" : "cursor-pointer"}`}
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
        <div className="flex items-center rounded-sm bg-white/50 dark:bg-neutral-800/50 p-1 border border-white/20 dark:border-neutral-700/30">
          <button
            onClick={() => onViewModeChange("list")}
            className={`rounded-lg p-1.5 transition-all duration-200 ${
              viewMode === "list"
                ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
            title={t("knowledge.toolbar.listView")}
          >
            <ListBulletIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => onViewModeChange("grid")}
            className={`rounded-lg p-1.5 transition-all duration-200 ${
              viewMode === "grid"
                ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
            title={t("knowledge.toolbar.gridView")}
          >
            <Squares2X2Icon className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop Search Input */}
        <div className="relative hidden md:block">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder={t("knowledge.toolbar.searchPlaceholder")}
            onChange={(e) => onSearch(e.target.value)}
            className="h-9 w-48 rounded-sm border border-white/20 dark:border-neutral-700/30 bg-white/50 dark:bg-neutral-800/50 pl-9 pr-4 text-xs text-neutral-900 placeholder-neutral-400 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 dark:text-white transition-all"
          />
        </div>

        <div className="hidden h-6 w-px bg-neutral-300/50 dark:bg-neutral-600/30 md:block" />

        {/* Action Buttons */}
        {showCreateFolder && onCreateFolder && (
          <button
            onClick={onCreateFolder}
            className="flex items-center gap-1.5 rounded-sm bg-white/50 dark:bg-neutral-800/50 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-200 border border-white/20 dark:border-neutral-700/30 hover:bg-white/80 dark:hover:bg-neutral-700/60 transition-all duration-200"
            title={t("knowledge.toolbar.newFolder")}
          >
            <FolderIcon className="h-4 w-4" />
            <span className="hidden md:inline">
              {t("knowledge.toolbar.newFolder")}
            </span>
          </button>
        )}

        {isTrash && onEmptyTrash ? (
          <button
            onClick={onEmptyTrash}
            className="flex items-center gap-1.5 rounded-sm bg-red-500/90 hover:bg-red-500 px-3 py-2 text-xs font-medium text-white shadow-sm transition-all duration-200"
            title={t("knowledge.toolbar.emptyTrash")}
          >
            <TrashIcon className="h-4 w-4" />
            <span className="hidden md:inline">
              {t("knowledge.toolbar.empty")}
            </span>
          </button>
        ) : (
          <button
            onClick={onUpload}
            className="flex items-center gap-1.5 rounded-sm bg-indigo-500/90 hover:bg-indigo-500 px-3 py-2 text-xs font-medium text-white shadow-sm transition-all duration-200"
            title={t("knowledge.toolbar.uploadFile")}
          >
            <PlusIcon className="h-4 w-4" />
            <span className="hidden md:inline">
              {t("knowledge.toolbar.upload")}
            </span>
          </button>
        )}

        <button
          onClick={onRefresh}
          className="hidden rounded-sm p-2 text-neutral-500 hover:bg-white/50 dark:hover:bg-white/10 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-all duration-200 md:block"
          title={t("knowledge.toolbar.refresh")}
        >
          <ArrowPathIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
