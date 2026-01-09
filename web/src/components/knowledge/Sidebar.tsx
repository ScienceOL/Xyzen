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
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KnowledgeTab } from "./types";

interface SidebarProps {
  activeTab: KnowledgeTab;
  currentKnowledgeSetId: string | null;
  onTabChange: (tab: KnowledgeTab, knowledgeSetId?: string | null) => void;
  refreshTrigger?: number;
  onCreateKnowledgeSet: () => void;
}

const SidebarComp = ({
  activeTab,
  currentKnowledgeSetId,
  onTabChange,
  refreshTrigger,
  onCreateKnowledgeSet,
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
    <div className="flex h-full w-56 flex-col border-r border-neutral-200 bg-neutral-100/80 pt-4 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-950">
      {/* Navigation */}
      <nav className="flex-1 space-y-6 px-3 overflow-y-auto custom-scrollbar">
        {/* Static Groups */}
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx}>
            <h3 className="mb-1 px-2 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
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
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-neutral-300/50 text-neutral-900 dark:bg-white/10 dark:text-white"
                        : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
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
          <div className="mb-1 flex items-center justify-between px-2 pr-1">
            <h3 className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
              {t("knowledge.titles.knowledgeBase")}
            </h3>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateKnowledgeSet();
              }}
              className="rounded p-0.5 hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
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
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors group ${
                    isActive
                      ? "bg-neutral-300/50 text-neutral-900 dark:bg-white/10 dark:text-white"
                      : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
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
                    className="hidden group-hover:flex shrink-0 p-0.5 rounded hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-400 hover:text-red-500"
                    title={t("knowledge.sidebar.deleteKnowledgeSet")}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
            {knowledgeSets.length === 0 && (
              <div className="px-2 py-1 text-xs text-neutral-400 italic">
                {t("knowledge.sidebar.noKnowledgeSets")}
              </div>
            )}
          </div>
        </div>

        {/* Locations */}
        <div>
          <h3 className="mb-1 px-2 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
            {t("knowledge.sidebar.groups.locations")}
          </h3>
          <div className="space-y-0.5">
            <button
              onClick={() => onTabChange("trash")}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                activeTab === "trash"
                  ? "bg-neutral-300/50 text-neutral-900 dark:bg-white/10 dark:text-white"
                  : "text-neutral-600 hover:bg-neutral-200/50 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
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
