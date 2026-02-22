import {
  RippleButton,
  RippleButtonRipples,
} from "@/components/animate-ui/components/buttons/ripple";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/base/Input";
import { cn } from "@/lib/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
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
    for (let i = 0; i < 6; i++) {
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
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    <div className="flex gap-5">
      {/* Left: Avatar Preview */}
      <div className="flex shrink-0 items-start pt-6 px-2">
        <motion.div
          className="group relative"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          {/* Glow effect */}
          <div className="absolute -inset-1 rounded-full bg-linear-to-tr from-indigo-500 via-purple-500 to-pink-500 opacity-40 blur-md transition-opacity duration-500 group-hover:opacity-70" />

          {/* Loading overlay */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-white/50 dark:bg-black/50"
              >
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
              </motion.div>
            )}
          </AnimatePresence>

          <img
            src={
              currentAvatar ||
              buildAvatarUrl("avataaars", "default", backendUrl)
            }
            alt="Current avatar"
            className="relative h-20 w-20 rounded-full border-[3px] border-white bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-800"
          />
          {currentAvatar && !isLoading && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-green-500 shadow dark:border-neutral-800"
            >
              <CheckIcon className="h-3 w-3 text-white" />
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Right: Controls */}
      <div className="min-w-0 flex-1 space-y-3">
        {/* Style Selector */}
        <div className="space-y-1.5">
          <label className="pl-0.5 text-[13px] font-medium text-neutral-600 dark:text-neutral-400">
            {t("agents.sessionSettings.avatar.style")}
          </label>
          <div className="custom-scrollbar -mx-1 flex max-h-16 flex-wrap gap-1.5 overflow-y-auto p-1">
            {DICEBEAR_STYLES.map((style) => (
              <Button
                key={style}
                type="button"
                variant={selectedStyle === style ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-7 rounded-full px-2.5 text-xs transition-all duration-300",
                  selectedStyle === style
                    ? "border-transparent bg-indigo-600 text-white shadow-md shadow-indigo-500/25 hover:bg-indigo-700"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800",
                )}
                onClick={() => setSelectedStyle(style)}
              >
                {style}
              </Button>
            ))}
          </div>
        </div>

        {/* Preset Avatars Grid */}
        <div className="grid grid-cols-8 gap-2">
          {filteredAvatars.map((avatar, i) => (
            <motion.button
              key={i}
              type="button"
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handlePresetSelect(avatar.url)}
              className={cn(
                "aspect-square h-16 rounded-full overflow-hidden border-2 transition-colors duration-200 shadow-sm hover:shadow-lg",
                currentAvatar === avatar.url
                  ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900 shadow-indigo-500/30"
                  : "border-transparent hover:border-neutral-300 dark:hover:border-neutral-600 bg-neutral-50 dark:bg-neutral-800",
              )}
            >
              <img
                src={avatar.url}
                alt={`Avatar option ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </motion.button>
          ))}
        </div>

        {/* Action Row */}
        <div className="flex items-center gap-2">
          <RippleButton
            type="button"
            variant="outline"
            onClick={generateRandom}
            disabled={isLoading}
            className="h-8 shrink-0 gap-1.5 px-3 text-xs font-medium"
          >
            <SparklesIcon className="h-3.5 w-3.5 text-indigo-500" />
            <span className="truncate">
              {isLoading
                ? t("agents.sessionSettings.avatar.loading")
                : t("agents.sessionSettings.avatar.random")}
            </span>
            <RippleButtonRipples />
          </RippleButton>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-neutral-400 transition-colors hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            {t("agents.sessionSettings.avatar.advanced")}
            <ChevronDownIcon
              className={cn(
                "h-3 w-3 transition-transform duration-200",
                showAdvanced && "rotate-180",
              )}
            />
          </button>
        </div>

        {/* Collapsible Seed Input */}
        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex gap-2 p-1">
                <div className="flex-1">
                  <Input
                    type="text"
                    placeholder={t(
                      "agents.sessionSettings.avatar.seedPlaceholder",
                    )}
                    value={customSeed}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setCustomSeed(e.target.value)
                    }
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) =>
                      e.key === "Enter" && generateFromSeed()
                    }
                    className="text-xs"
                    wrapperClassName="h-8"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={generateFromSeed}
                  disabled={!customSeed.trim() || isLoading}
                  className="h-8 px-3 text-xs transition-all hover:shadow-md"
                >
                  {t("agents.sessionSettings.avatar.apply")}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
