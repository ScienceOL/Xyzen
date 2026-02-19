import {
  RippleButton,
  RippleButtonRipples,
} from "@/components/animate-ui/components/buttons/ripple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CheckIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// ============ Constants ============

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
export const buildAvatarUrl = (
  style: string,
  seed: string,
  backendUrl?: string,
): string => {
  if (backendUrl) {
    return `${backendUrl}/xyzen/api/v1/avatar/${style}/svg?seed=${encodeURIComponent(seed)}`;
  }
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
};

const generatePresetAvatars = (backendUrl?: string) => {
  const avatars: { url: string; seed: string; style: string }[] = [];
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

/** Extract the seed query-param from a DiceBear-style avatar URL. */
const parseSeedFromAvatar = (url?: string): string => {
  if (!url) return "";
  try {
    const seedParam = new URL(url).searchParams.get("seed");
    return seedParam ? decodeURIComponent(seedParam) : "";
  } catch {
    const match = url.match(/[?&]seed=([^&]*)/);
    return match ? decodeURIComponent(match[1]) : "";
  }
};

// ============ Component ============

interface AvatarSelectorProps {
  currentAvatar?: string;
  onSelect: (avatarUrl: string) => void;
  backendUrl?: string;
}

export function AvatarSelector({
  currentAvatar,
  onSelect,
  backendUrl,
}: AvatarSelectorProps) {
  const { t } = useTranslation();
  const [selectedStyle, setSelectedStyle] =
    useState<(typeof DICEBEAR_STYLES)[number]>("avataaars");
  const [customSeed, setCustomSeed] = useState(() =>
    parseSeedFromAvatar(currentAvatar),
  );

  // Keep the seed input in sync when the avatar changes externally
  useEffect(() => {
    const seed = parseSeedFromAvatar(currentAvatar);
    setCustomSeed(seed);
  }, [currentAvatar]);
  const [isLoading, setIsLoading] = useState(false);

  const presetAvatars = useMemo(
    () => generatePresetAvatars(backendUrl),
    [backendUrl],
  );

  const filteredAvatars = presetAvatars.filter(
    (a) => a.style === selectedStyle,
  );

  const generateRandom = useCallback(async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const seed = Math.random().toString(36).slice(2, 10);
    const url = buildAvatarUrl(selectedStyle, seed, backendUrl);
    onSelect(url);
    setIsLoading(false);
  }, [selectedStyle, onSelect, backendUrl]);

  const generateFromSeed = useCallback(async () => {
    if (!customSeed.trim()) return;
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const url = buildAvatarUrl(selectedStyle, customSeed.trim(), backendUrl);
    onSelect(url);
    setIsLoading(false);
  }, [selectedStyle, customSeed, onSelect, backendUrl]);

  const handlePresetSelect = useCallback(
    async (avatarUrl: string) => {
      setIsLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      onSelect(avatarUrl);
      setIsLoading(false);
    },
    [onSelect],
  );

  return (
    <div className="space-y-5">
      {/* Current Avatar Preview */}
      <div className="flex items-center justify-center py-4">
        <motion.div
          className="relative group"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          {/* Glow effect */}
          <div className="absolute -inset-1.5 bg-linear-to-tr from-indigo-500 via-purple-500 to-pink-500 rounded-full opacity-40 group-hover:opacity-70 blur-lg transition-opacity duration-500" />

          {/* Loading overlay */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-black/50 rounded-full"
              >
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </motion.div>
            )}
          </AnimatePresence>

          <img
            src={
              currentAvatar ||
              buildAvatarUrl("avataaars", "default", backendUrl)
            }
            alt="Current avatar"
            className="relative w-28 h-28 rounded-full bg-white dark:bg-neutral-800 border-4 border-white dark:border-neutral-700 shadow-2xl"
          />
          {currentAvatar && !isLoading && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute bottom-0.5 right-0.5 w-8 h-8 bg-green-500 border-3 border-white dark:border-neutral-800 rounded-full flex items-center justify-center shadow-lg"
            >
              <CheckIcon className="w-4 h-4 text-white" />
            </motion.div>
          )}
        </motion.div>
      </div>

      <div className="space-y-4">
        {/* Style Selector */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 pl-1">
            {t("agents.sessionSettings.avatar.style")}
          </label>
          <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto p-1 -mx-1 scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-700">
            {DICEBEAR_STYLES.map((style) => (
              <Button
                key={style}
                type="button"
                variant={selectedStyle === style ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-8 text-xs px-3 rounded-full transition-all duration-300",
                  selectedStyle === style
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-md shadow-indigo-500/25"
                    : "text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                )}
                onClick={() => setSelectedStyle(style)}
              >
                {style}
              </Button>
            ))}
          </div>
        </div>

        {/* Preset Avatars Grid */}
        <div className="grid grid-cols-6 gap-2.5">
          {filteredAvatars.map((avatar, i) => (
            <motion.button
              key={i}
              type="button"
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handlePresetSelect(avatar.url)}
              className={cn(
                "aspect-square rounded-full overflow-hidden border-2 transition-colors duration-200 shadow-sm hover:shadow-lg",
                currentAvatar === avatar.url
                  ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900 shadow-indigo-500/30"
                  : "border-transparent hover:border-neutral-300 dark:hover:border-neutral-600 bg-neutral-50 dark:bg-neutral-800",
              )}
            >
              <img
                src={avatar.url}
                alt={`Avatar option ${i + 1}`}
                className="w-full h-full object-cover"
              />
            </motion.button>
          ))}
        </div>
      </div>

      {/* Random & Custom Seed */}
      <div className="flex gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
        <RippleButton
          type="button"
          variant="outline"
          onClick={generateRandom}
          disabled={isLoading}
          className="shrink-0 gap-2 h-10 w-28 text-sm font-medium"
        >
          <SparklesIcon className="w-4 h-4 text-indigo-500" />
          <span className="truncate">
            {isLoading
              ? t("agents.sessionSettings.avatar.loading")
              : t("agents.sessionSettings.avatar.random")}
          </span>
          <RippleButtonRipples />
        </RippleButton>
        <div className="flex-1 flex gap-2">
          <Input
            type="text"
            placeholder={t("agents.sessionSettings.avatar.seedPlaceholder")}
            value={customSeed}
            onChange={(e) => setCustomSeed(e.target.value)}
            className="flex-1 h-10 text-sm bg-neutral-50 dark:bg-neutral-800/50"
            onKeyDown={(e) => e.key === "Enter" && generateFromSeed()}
          />
          <Button
            type="button"
            size="default"
            onClick={generateFromSeed}
            disabled={!customSeed.trim() || isLoading}
            className="h-10 px-4 transition-all hover:shadow-md"
          >
            {t("agents.sessionSettings.avatar.apply")}
          </Button>
        </div>
      </div>
    </div>
  );
}
