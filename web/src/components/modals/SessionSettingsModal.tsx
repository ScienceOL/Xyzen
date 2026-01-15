import { Modal } from "@/components/animate-ui/components/animate/modal";
import { cn } from "@/lib/utils";
import { useXyzen } from "@/store";
import {
  ArrowsPointingOutIcon,
  CheckIcon,
  Cog6ToothIcon,
  SparklesIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// Preset DiceBear styles and seeds for avatar selection
const DICEBEAR_STYLES = [
  "adventurer",
  "avataaars",
  "bottts",
  "fun-emoji",
  "lorelei",
  "micah",
  "miniavs",
  "notionists",
  "open-peeps",
  "personas",
  "pixel-art",
  "shapes",
  "thumbs",
] as const;

/**
 * Build avatar URL - uses backend proxy if available for better China access.
 * Falls back to direct DiceBear API if backend URL is not configured.
 */
const buildAvatarUrl = (
  style: string,
  seed: string,
  backendUrl?: string,
): string => {
  // Use backend proxy for better accessibility in China
  if (backendUrl) {
    return `${backendUrl}/xyzen/api/v1/avatar/${style}/svg?seed=${encodeURIComponent(seed)}`;
  }
  // Fallback to direct DiceBear API
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
};

// Generate a set of preset avatars using different styles and random seeds
const generatePresetAvatars = (backendUrl?: string) => {
  const avatars: { url: string; seed: string; style: string }[] = [];

  // Generate 3 avatars for each style
  DICEBEAR_STYLES.forEach((style) => {
    for (let i = 0; i < 3; i++) {
      const seed = `${style}_${i}_preset`;
      avatars.push({
        url: buildAvatarUrl(style, seed, backendUrl),
        seed,
        style,
      });
    }
  });

  return avatars;
};

interface GridResizerProps {
  currentW?: number;
  currentH?: number;
  onResize: (w: number, h: number) => void;
}

function GridResizer({
  currentW = 1,
  currentH = 1,
  onResize,
}: GridResizerProps) {
  const [hover, setHover] = useState<{ w: number; h: number } | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center">
        <div
          className="grid grid-cols-3 gap-1.5"
          onMouseLeave={() => setHover(null)}
        >
          {Array.from({ length: 9 }).map((_, i) => {
            const x = (i % 3) + 1;
            const y = Math.floor(i / 3) + 1;
            const isHovered = hover && x <= hover.w && y <= hover.h;
            const isSelected = !hover && x <= currentW && y <= currentH;

            return (
              <div
                key={i}
                className={cn(
                  "h-8 w-8 cursor-pointer rounded border-2 transition-all duration-200",
                  isHovered || isSelected
                    ? "border-indigo-500 bg-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-400/20"
                    : "border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800",
                )}
                onMouseEnter={() => setHover({ w: x, h: y })}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onResize(x, y);
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="text-center text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {hover ? `${hover.w} × ${hover.h}` : `${currentW} × ${currentH}`}
      </div>
    </div>
  );
}

interface AvatarSelectorProps {
  currentAvatar?: string;
  onSelect: (avatarUrl: string) => void;
  backendUrl?: string;
}

function AvatarSelector({
  currentAvatar,
  onSelect,
  backendUrl,
}: AvatarSelectorProps) {
  const [selectedStyle, setSelectedStyle] =
    useState<(typeof DICEBEAR_STYLES)[number]>("avataaars");
  const [customSeed, setCustomSeed] = useState("");

  // Generate preset avatars with backend URL
  const presetAvatars = useMemo(
    () => generatePresetAvatars(backendUrl),
    [backendUrl],
  );

  // Filter avatars by selected style
  const filteredAvatars = presetAvatars.filter(
    (a) => a.style === selectedStyle,
  );

  // Generate random avatar
  const generateRandom = useCallback(() => {
    const seed = Math.random().toString(36).slice(2, 10);
    const url = buildAvatarUrl(selectedStyle, seed, backendUrl);
    onSelect(url);
  }, [selectedStyle, onSelect, backendUrl]);

  // Generate from custom seed
  const generateFromSeed = useCallback(() => {
    if (!customSeed.trim()) return;
    const url = buildAvatarUrl(selectedStyle, customSeed.trim(), backendUrl);
    onSelect(url);
  }, [selectedStyle, customSeed, onSelect, backendUrl]);

  // Handle preset avatar selection
  const handlePresetSelect = useCallback(
    (avatarUrl: string) => {
      onSelect(avatarUrl);
    },
    [onSelect],
  );

  return (
    <div className="space-y-4">
      {/* Current Avatar Preview */}
      <div className="flex items-center justify-center gap-4">
        <div className="relative">
          <img
            src={
              currentAvatar ||
              buildAvatarUrl("avataaars", "default", backendUrl)
            }
            alt="Current avatar"
            className="w-20 h-20 rounded-full bg-neutral-100 dark:bg-neutral-800 border-2 border-white dark:border-neutral-700 shadow-md"
          />
          {currentAvatar && (
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
              <CheckIcon className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Style Selector */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Style
        </label>
        <div className="flex flex-wrap gap-1">
          {DICEBEAR_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => setSelectedStyle(style)}
              className={cn(
                "px-2 py-1 text-xs rounded-md transition-colors",
                selectedStyle === style
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700",
              )}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      {/* Preset Avatars Grid */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Select Avatar
        </label>
        <div className="grid grid-cols-6 gap-2 max-h-32 overflow-y-auto p-1">
          {filteredAvatars.map((avatar, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handlePresetSelect(avatar.url)}
              className={cn(
                "w-10 h-10 rounded-full overflow-hidden border-2 transition-all hover:scale-110",
                currentAvatar === avatar.url
                  ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900"
                  : "border-transparent hover:border-neutral-300 dark:hover:border-neutral-600",
              )}
            >
              <img
                src={avatar.url}
                alt={`Avatar option ${i + 1}`}
                className="w-full h-full bg-neutral-100 dark:bg-neutral-800"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Random & Custom Seed */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={generateRandom}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 transition-colors"
        >
          <SparklesIcon className="w-3.5 h-3.5" />
          Random
        </button>
        <div className="flex-1 flex gap-1">
          <input
            type="text"
            value={customSeed}
            onChange={(e) => setCustomSeed(e.target.value)}
            placeholder="Custom seed..."
            className="flex-1 px-2 py-1.5 text-xs border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400"
          />
          <button
            type="button"
            onClick={generateFromSeed}
            disabled={!customSeed.trim()}
            className="px-2 py-1 text-xs font-medium bg-neutral-100 text-neutral-600 rounded-md hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

interface SessionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  agentId: string;
  agentName: string;
  currentAvatar?: string;
  currentGridSize?: { w: number; h: number };
  onAvatarChange: (avatarUrl: string) => void;
  onGridSizeChange: (w: number, h: number) => void;
  onOpenAgentSettings?: () => void;
  onDelete?: () => void;
}

const SessionSettingsModal: React.FC<SessionSettingsModalProps> = ({
  isOpen,
  onClose,
  agentName,
  currentAvatar,
  currentGridSize,
  onAvatarChange,
  onGridSizeChange,
  onOpenAgentSettings,
  onDelete,
}) => {
  const { t } = useTranslation();
  const backendUrl = useXyzen((state) => state.backendUrl);
  const [activeSection, setActiveSection] = useState<"avatar" | "size">(
    "avatar",
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${agentName} Settings`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {/* Section Tabs */}
        <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-700 pb-2">
          <button
            type="button"
            onClick={() => setActiveSection("avatar")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeSection === "avatar"
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
            )}
          >
            <SparklesIcon className="w-4 h-4" />
            Avatar
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("size")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeSection === "size"
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
            )}
          >
            <ArrowsPointingOutIcon className="w-4 h-4" />
            Size
          </button>
        </div>

        {/* Content */}
        {activeSection === "avatar" && (
          <AvatarSelector
            currentAvatar={currentAvatar}
            onSelect={onAvatarChange}
            backendUrl={backendUrl}
          />
        )}

        {activeSection === "size" && (
          <div className="py-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4 text-center">
              Adjust the widget size in the spatial workspace
            </p>
            <GridResizer
              currentW={currentGridSize?.w}
              currentH={currentGridSize?.h}
              onResize={onGridSizeChange}
            />
          </div>
        )}

        {/* Open Agent Settings */}
        {onOpenAgentSettings && (
          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700">
            <button
              type="button"
              onClick={onOpenAgentSettings}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 rounded-md transition-colors"
            >
              <Cog6ToothIcon className="w-4 h-4" />
              {t("agents.editTitle", { name: agentName })}
            </button>
          </div>
        )}

        {/* Delete Agent */}
        {onDelete && (
          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700">
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 rounded-md transition-colors"
              >
                <TrashIcon className="w-4 h-4" />
                {t("common.delete")}
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-center text-neutral-600 dark:text-neutral-400">
                  {t("agents.deleteConfirm", { name: agentName })}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 rounded-md transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      onClose();
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 rounded-md transition-colors"
                  >
                    {t("common.delete")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default SessionSettingsModal;
