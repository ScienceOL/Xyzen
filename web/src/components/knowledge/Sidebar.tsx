import ConfirmationModal from "@/components/modals/ConfirmationModal";
import {
  knowledgeSetService,
  type KnowledgeSetWithFileCount,
} from "@/service/knowledgeSetService";
import {
  ClockIcon,
  DocumentIcon,
  FolderIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DRAG_MIME } from "./FileTreeView";
import type { KnowledgeTab } from "./types";

interface SidebarProps {
  activeTab: KnowledgeTab;
  currentKnowledgeSetId: string | null;
  onTabChange: (tab: KnowledgeTab, knowledgeSetId?: string | null) => void;
  refreshTrigger?: number;
  onCreateKnowledgeSet: () => void;
  onDropOnKnowledgeSet?: (fileIds: string[], knowledgeSetId: string) => void;
}

const SidebarComp = ({
  activeTab,
  currentKnowledgeSetId,
  onTabChange,
  refreshTrigger,
  onCreateKnowledgeSet,
  onDropOnKnowledgeSet,
}: SidebarProps) => {
  const { t } = useTranslation();
  const [knowledgeSets, setKnowledgeSets] = useState<
    KnowledgeSetWithFileCount[]
  >([]);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    knowledgeSet: KnowledgeSetWithFileCount | null;
  }>({ isOpen: false, knowledgeSet: null });

  useEffect(() => {
    const fetchKnowledgeSets = async () => {
      try {
        const sets = await knowledgeSetService.listKnowledgeSets(false);
        setKnowledgeSets(sets);
      } catch (error) {
        console.error("Failed to fetch knowledge sets", error);
      }
    };
    fetchKnowledgeSets();
  }, [refreshTrigger]);

  const handleDeleteClick = (
    e: React.MouseEvent,
    knowledgeSet: KnowledgeSetWithFileCount,
  ) => {
    e.stopPropagation();
    setDeleteConfirmation({ isOpen: true, knowledgeSet });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.knowledgeSet) return;

    const knowledgeSetId = deleteConfirmation.knowledgeSet.id;
    try {
      await knowledgeSetService.deleteKnowledgeSet(knowledgeSetId, false);
      const sets = await knowledgeSetService.listKnowledgeSets(false);
      setKnowledgeSets(sets);
      if (currentKnowledgeSetId === knowledgeSetId) {
        onTabChange("home");
      }
    } catch (error) {
      console.error("Failed to delete knowledge set", error);
    }
  };

  // Drag-over tracking for knowledge set drop targets
  const [dragOverKnowledgeSetId, setDragOverKnowledgeSetId] = useState<
    string | null
  >(null);

  const handleKsDragOver = useCallback((e: React.DragEvent, ksId: string) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDragOverKnowledgeSetId(ksId);
  }, []);

  const handleKsDragLeave = useCallback((ksId: string) => {
    setDragOverKnowledgeSetId((prev) => (prev === ksId ? null : prev));
  }, []);

  const handleKsDrop = useCallback(
    (e: React.DragEvent, ksId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverKnowledgeSetId(null);
      try {
        const data = JSON.parse(e.dataTransfer.getData(DRAG_MIME));
        if (data?.ids?.length > 0 && onDropOnKnowledgeSet) {
          // Only add files (not folders) to knowledge sets
          const fileIds = data.ids.filter(
            (id: string) => data.types?.[id] !== "folder",
          );
          if (fileIds.length > 0) {
            onDropOnKnowledgeSet(fileIds, ksId);
          }
        }
      } catch {
        // ignore
      }
    },
    [onDropOnKnowledgeSet],
  );

  const navGroups = [
    {
      title: t("knowledge.sidebar.groups.favorites"),
      items: [
        {
          id: "home",
          label: t("knowledge.titles.recents"),
          icon: ClockIcon,
        },
        {
          id: "all",
          label: t("knowledge.titles.allFiles"),
          icon: DocumentIcon,
        },
      ],
    },
    {
      title: t("knowledge.sidebar.groups.media"),
      items: [
        {
          id: "images",
          label: t("knowledge.sidebar.items.images"),
          icon: PhotoIcon,
        },
        {
          id: "documents",
          label: t("knowledge.sidebar.items.documents"),
          icon: DocumentIcon,
        },
      ],
    },
  ];

  return (
    <div className="flex h-full w-56 flex-col pt-4">
      {/* Navigation */}
      <nav className="flex-1 space-y-6 px-3 overflow-y-auto custom-scrollbar">
        {/* Static Groups */}
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx}>
            <h3 className="mb-1.5 px-2 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              {group.title}
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id as KnowledgeTab)}
                    className={`flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-white/80 dark:bg-white/10 text-neutral-900 dark:text-white shadow-sm"
                        : "text-neutral-600 hover:bg-white/50 dark:hover:bg-white/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-neutral-500 dark:text-neutral-400"}`}
                    />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Dynamic Knowledge Section */}
        <div>
          <div className="mb-1.5 flex items-center justify-between px-2 pr-1">
            <h3 className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
              {t("knowledge.titles.knowledgeBase")}
            </h3>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateKnowledgeSet();
              }}
              className="rounded-lg p-1 hover:bg-white/50 dark:hover:bg-white/10 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              title={t("knowledge.sidebar.newKnowledgeSet")}
            >
              <PlusIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {knowledgeSets.map((knowledgeSet) => {
              // Active if we are in "knowledge" tab AND the current knowledge set ID matches
              const isActive =
                activeTab === "knowledge" &&
                currentKnowledgeSetId === knowledgeSet.id;

              return (
                <button
                  key={knowledgeSet.id}
                  onClick={() => onTabChange("knowledge", knowledgeSet.id)}
                  onDragOver={(e) => handleKsDragOver(e, knowledgeSet.id)}
                  onDragLeave={() => handleKsDragLeave(knowledgeSet.id)}
                  onDrop={(e) => handleKsDrop(e, knowledgeSet.id)}
                  className={`flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium transition-all duration-200 group ${
                    dragOverKnowledgeSetId === knowledgeSet.id
                      ? "ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                      : isActive
                        ? "bg-white/80 dark:bg-white/10 text-neutral-900 dark:text-white shadow-sm"
                        : "text-neutral-600 hover:bg-white/50 dark:hover:bg-white/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  <FolderIcon
                    className={`h-4 w-4 shrink-0 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-neutral-400 group-hover:text-neutral-500"}`}
                  />
                  <span className="truncate flex-1 text-left">
                    {knowledgeSet.name}
                  </span>
                  <span className="text-xs text-neutral-400 shrink-0 group-hover:hidden">
                    {knowledgeSet.file_count}
                  </span>
                  <span
                    onClick={(e) => handleDeleteClick(e, knowledgeSet)}
                    className="hidden group-hover:flex shrink-0 p-1 rounded-lg hover:bg-white/80 dark:hover:bg-neutral-700 text-neutral-400 hover:text-red-500 transition-colors"
                    title={t("knowledge.sidebar.deleteKnowledgeSet")}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
            {knowledgeSets.length === 0 && (
              <div className="px-3 py-2 text-xs text-neutral-400 italic">
                {t("knowledge.sidebar.noKnowledgeSets")}
              </div>
            )}
          </div>
        </div>

        {/* Locations */}
        <div>
          <h3 className="mb-1.5 px-2 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
            {t("knowledge.sidebar.groups.locations")}
          </h3>
          <div className="space-y-0.5">
            <button
              onClick={() => onTabChange("trash")}
              className={`flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium transition-all duration-200 ${
                activeTab === "trash"
                  ? "bg-white/80 dark:bg-white/10 text-neutral-900 dark:text-white shadow-sm"
                  : "text-neutral-600 hover:bg-white/50 dark:hover:bg-white/5 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              <TrashIcon
                className={`h-4 w-4 ${activeTab === "trash" ? "text-red-500" : "text-neutral-500 dark:text-neutral-400"}`}
              />
              {t("knowledge.titles.trash")}
            </button>
          </div>
        </div>
      </nav>

      <ConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        onClose={() =>
          setDeleteConfirmation({ isOpen: false, knowledgeSet: null })
        }
        onConfirm={handleDeleteConfirm}
        title={t("knowledge.sidebar.deleteTitle")}
        message={t("knowledge.sidebar.deleteConfirm", {
          name: deleteConfirmation.knowledgeSet?.name ?? "",
        })}
        confirmLabel={t("knowledge.sidebar.deleteConfirmButton")}
        cancelLabel={t("common.cancel")}
        destructive
      />
    </div>
  );
};

export const Sidebar = React.memo(SidebarComp);
