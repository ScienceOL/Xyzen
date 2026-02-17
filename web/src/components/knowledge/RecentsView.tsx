import { MotionCarousel } from "@/components/animate-ui/components/community/motion-carousel";
import {
  knowledgeSetService,
  type KnowledgeSetWithFileCount,
} from "@/service/knowledgeSetService";
import { formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { DATE_FNS_LOCALE_MAP } from "@/lib/formatDate";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileList } from "./FileList";
import type { FileTreeItem } from "@/service/folderService";

interface RecentsViewProps {
  refreshTrigger: number;
  onKnowledgeSetClick: (id: string) => void;
  onCreateKnowledgeSet: () => void;
  onRefresh?: () => void;
  onFileCountChange?: (count: number) => void;
  onStatsUpdate?: (deletedBytes: number, deletedFileCount: number) => void;
  onLoadingChange?: (loading: boolean) => void;
  onUpload?: () => void;
  treeItems?: FileTreeItem[];
  treeLoading?: boolean;
  onRefreshTree?: () => void;
}

/**
 * Animated folder icon with a front flap that opens on hover.
 * Built with two SVG layers (back panel + front flap) for the 3D-open effect.
 */
const AnimatedFolderIcon = () => (
  <div
    className="folder-icon-container relative w-14 h-12"
    style={{ perspective: "200px" }}
  >
    {/* Back panel */}
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 56 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 10C4 7.79086 5.79086 6 8 6H20L24 2H48C50.2091 2 52 3.79086 52 6V42C52 44.2091 50.2091 46 48 46H8C5.79086 46 4 44.2091 4 42V10Z"
        className="fill-amber-400/80 dark:fill-amber-500/70"
      />
    </svg>
    {/* Front flap */}
    <svg
      className="folder-flap absolute inset-0 w-full h-full"
      viewBox="0 0 56 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transformOrigin: "bottom center" }}
    >
      <path
        d="M2 16C2 13.7909 3.79086 12 6 12H50C52.2091 12 54 13.7909 54 16V44C54 46.2091 52.2091 48 50 48H6C3.79086 48 2 46.2091 2 44V16Z"
        className="fill-amber-500 dark:fill-amber-600"
      />
    </svg>
  </div>
);

export const RecentsView = ({
  refreshTrigger,
  onKnowledgeSetClick,
  onCreateKnowledgeSet,
  onRefresh,
  onFileCountChange,
  onStatsUpdate,
  onLoadingChange,
  onUpload,
  treeItems,
  treeLoading,
  onRefreshTree,
}: RecentsViewProps) => {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = useMemo(
    () => DATE_FNS_LOCALE_MAP[i18n.language] ?? enUS,
    [i18n.language],
  );
  const [knowledgeSets, setKnowledgeSets] = useState<
    KnowledgeSetWithFileCount[]
  >([]);
  const [isLoadingKS, setIsLoadingKS] = useState(true);

  const fetchKnowledgeSets = useCallback(async () => {
    setIsLoadingKS(true);
    try {
      const ks = await knowledgeSetService.listKnowledgeSets();
      const sorted = [...ks].sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
      setKnowledgeSets(sorted.slice(0, 8));
    } catch (e) {
      console.error("Failed to fetch knowledge sets", e);
    } finally {
      setIsLoadingKS(false);
    }
  }, []);

  useEffect(() => {
    fetchKnowledgeSets();
  }, [fetchKnowledgeSets, refreshTrigger]);

  return (
    <div className="flex flex-col h-full">
      {/* --- CSS for folder-open hover animation --- */}
      <style>{`
        .knowledge-card:hover .folder-flap {
          transform: rotateX(-35deg);
        }
        .folder-flap {
          transition: transform 0.3s ease;
        }
      `}</style>

      {/* Knowledge Sets Section */}
      <section className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-4">
          {t("knowledge.recents.knowledgeSets")}
        </h2>

        {isLoadingKS ? (
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-32 w-48 flex-shrink-0 rounded-xl bg-neutral-200/50 dark:bg-neutral-800/50 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <MotionCarousel
            showDots={false}
            options={{ align: "start", dragFree: true }}
            slideClassName="basis-[70%] sm:basis-[40%] lg:basis-[25%]"
          >
            {knowledgeSets.map((ks) => (
              <button
                key={ks.id}
                type="button"
                className="knowledge-card group flex flex-col items-center gap-2 p-4 rounded-xl border border-neutral-200 dark:border-neutral-700/50 bg-white/80 dark:bg-neutral-800/80 cursor-pointer text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 w-full"
                onClick={() => onKnowledgeSetClick(ks.id)}
              >
                <div className="flex-shrink-0">
                  <AnimatedFolderIcon />
                </div>
                <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate w-full text-center">
                  {ks.name}
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500 text-center truncate w-full">
                  {t("knowledge.recents.fileCount", { count: ks.file_count })}
                  {" · "}
                  {t("knowledge.recents.updated", {
                    date: formatDistanceToNow(new Date(ks.updated_at), {
                      addSuffix: true,
                      locale: dateFnsLocale,
                    }),
                  })}
                </span>
              </button>
            ))}

            {/* "Create" card as last item */}
            <button
              type="button"
              className="group flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-neutral-300 dark:border-neutral-600 cursor-pointer text-center transition-all duration-200 hover:border-neutral-400 hover:bg-neutral-100/60 dark:hover:border-neutral-500 dark:hover:bg-neutral-800/40 w-full"
              onClick={onCreateKnowledgeSet}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 transition-colors group-hover:bg-neutral-200 group-hover:text-neutral-600 dark:bg-neutral-800 dark:text-neutral-500 dark:group-hover:bg-neutral-700 dark:group-hover:text-neutral-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </div>
              <span className="text-sm font-medium text-neutral-400 dark:text-neutral-500">
                {t("knowledge.recents.createKnowledgeSet")}
              </span>
            </button>
          </MotionCarousel>
        )}
      </section>

      {/* Recent Files Section */}
      <section className="flex-1 flex flex-col min-h-0 px-4 sm:px-6 pt-2 pb-2">
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-4">
          {t("knowledge.recents.recentFiles")}
        </h2>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <FileList
            filter="home"
            viewMode="list"
            refreshTrigger={refreshTrigger}
            onRefresh={onRefresh}
            onFileCountChange={onFileCountChange}
            onStatsUpdate={onStatsUpdate}
            onLoadingChange={onLoadingChange}
            currentFolderId={null}
            onUpload={onUpload}
            treeItems={treeItems}
            treeLoading={treeLoading}
            onRefreshTree={onRefreshTree}
          />
        </div>
      </section>
    </div>
  );
};
