import {
  ClockIcon,
  // CloudIcon,
  DocumentIcon,
  FolderIcon,
  PhotoIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import type { KnowledgeTab } from "./types";

interface SidebarProps {
  activeTab: KnowledgeTab;
  onTabChange: (tab: KnowledgeTab) => void;
}

export const Sidebar = ({ activeTab, onTabChange }: SidebarProps) => {
  const navGroups = [
    {
      title: "Favorites",
      items: [
        { id: "home", label: "Recents", icon: ClockIcon },
        { id: "all", label: "All Files", icon: FolderIcon },
      ],
    },
    {
      title: "Media",
      items: [
        { id: "images", label: "Images", icon: PhotoIcon },
        { id: "documents", label: "Documents", icon: DocumentIcon },
      ],
    },
    {
      title: "Locations",
      items: [
        // { id: "cloud", label: "iCloud Drive", icon: CloudIcon, disabled: true },
        { id: "trash", label: "Trash", icon: TrashIcon },
      ],
    },
  ];

  return (
    <div className="flex w-56 flex-col border-r border-neutral-200 bg-neutral-100/80 pt-4 backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/80">
      {/* Navigation */}
      <nav className="flex-1 space-y-6 px-3 overflow-y-auto">
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx}>
            <h3 className="mb-1 px-2 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wide">
              {group.title}
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                const isDisabled = "disabled" in item ? item.disabled : false;

                if (isDisabled) {
                  return (
                    <div
                      key={item.id}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-400 opacity-50 cursor-not-allowed"
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </div>
                  );
                }

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
      </nav>
    </div>
  );
};
