import EMOJI_CONFIGS from "@/utils/emojiAnimationConfig";
import { EMOJI_CATEGORIES } from "@/utils/emojiUtils";
import {
  EllipsisHorizontalCircleIcon,
  FaceSmileIcon,
  MagnifyingGlassIcon,
  BugAntIcon,
  CakeIcon,
  CloudIcon,
  PaperAirplaneIcon,
  CubeIcon,
  AtSymbolIcon,
  HandRaisedIcon,
} from "@heroicons/react/24/outline";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface AvatarOption {
  name: string;
  url: string;
  emoji?: string;
  category?: string;
  tags?: string[];
}

interface AvatarCategory {
  id: string;
  label: string;
  avatars: AvatarOption[];
}

interface AvatarPickerProps {
  value?: string | null;
  onChange?: (value: string) => void;
  backgroundColor?: string | null;
  onBackgroundColorChange?: (color: string) => void;
  className?: string;
  showBackgroundColorPicker?: boolean;
}

interface BackgroundColor {
  id: string;
  name: string;
  color?: string;
  gradientStart?: string;
  gradientEnd?: string;
}

export const AvatarPicker: React.FC<AvatarPickerProps> = ({
  value,
  onChange,
  backgroundColor,
  onBackgroundColorChange,
  className = "p-4",
  showBackgroundColorPicker = true,
}) => {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedBgColor, setSelectedBgColor] = useState<string | null>(
    backgroundColor || null,
  );

  const categoryRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    if (backgroundColor) {
      setSelectedBgColor(backgroundColor);
    }
  }, [backgroundColor]);

  const handleSelectAvatar = useCallback(
    (avatarName: string) => {
      onChange?.(avatarName);
    },
    [onChange],
  );

  const handleSelectBgColor = useCallback(
    (colorId: string) => {
      const colors = getBackgroundColors();
      const bgColor = colors.find((c) => c.id === colorId);
      if (bgColor) {
        const colorValue = bgColor.gradientEnd
          ? `linear-gradient(135deg, ${bgColor.gradientStart}, ${bgColor.gradientEnd})`
          : bgColor.color || "";
        setSelectedBgColor(colorValue);
        onBackgroundColorChange?.(colorValue);
      }
    },
    [onBackgroundColorChange],
  );

  const handleCategoryScroll = useCallback((categoryId: string | null) => {
    const ref = categoryId ? categoryRefs.current[categoryId] : null;
    if (ref) {
      ref.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setActiveCategory(categoryId);
  }, []);

  const backgroundColors = useMemo(() => getBackgroundColors(), []);

  const normalizeEmoji = useCallback((emoji: string): string => {
    return emoji.replace(/\uFE0F/g, "").trim();
  }, []);

  const allAnimatedEmojis = useMemo(() => {
    const emojiSet = new Set<string>();
    EMOJI_CONFIGS.forEach((config) => {
      emojiSet.add(config.unicode);
    });
    return Array.from(emojiSet);
  }, []);

  const emojiToCategoryMap = useMemo(() => {
    const map: Record<string, { id: string; name: string }> = {};
    Object.entries(EMOJI_CATEGORIES).forEach(([id, category]) => {
      category.emojis.forEach((emoji) => {
        map[emoji] = { id, name: category.name };
        const normalized = normalizeEmoji(emoji);
        if (normalized !== emoji) {
          map[normalized] = { id, name: category.name };
        }
      });
    });
    return map;
  }, [normalizeEmoji]);

  const findEmojiCategory = useCallback(
    (emoji: string): { id: string; name: string } | undefined => {
      if (emojiToCategoryMap[emoji]) return emojiToCategoryMap[emoji];
      const normalized = normalizeEmoji(emoji);
      if (emojiToCategoryMap[normalized]) return emojiToCategoryMap[normalized];
      for (const [categoryId, category] of Object.entries(EMOJI_CATEGORIES)) {
        for (const categoryEmoji of category.emojis) {
          if (normalizeEmoji(categoryEmoji) === normalized) {
            return { id: categoryId, name: category.name };
          }
        }
      }
      return undefined;
    },
    [emojiToCategoryMap, normalizeEmoji],
  );

  const allCategories = useMemo(() => {
    const categories: AvatarCategory[] = [];
    const categorySet = new Set<string>();
    let hasOtherCategory = false;
    allAnimatedEmojis.forEach((emoji) => {
      const categoryInfo = findEmojiCategory(emoji);
      if (categoryInfo) {
        if (!categorySet.has(categoryInfo.id)) {
          categorySet.add(categoryInfo.id);
          if (categoryInfo.id !== "other") {
            categories.push({
              id: categoryInfo.id,
              label: categoryInfo.name,
              avatars: [],
            });
          }
        }
      } else {
        hasOtherCategory = true;
      }
    });
    if (hasOtherCategory) {
      categories.push({ id: "other", label: "其他", avatars: [] });
    }
    return categories;
  }, [allAnimatedEmojis, findEmojiCategory]);

  const groupedEmojis = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      const searchResults = allAnimatedEmojis
        .filter((emoji) => {
          if (emoji.toLowerCase().includes(term)) return true;
          const config = EMOJI_CONFIGS.find((c) => c.unicode === emoji);
          if (config && config.name.toLowerCase().includes(term)) return true;
          const categoryInfo = findEmojiCategory(emoji);
          return categoryInfo && categoryInfo.name.toLowerCase().includes(term);
        })
        .map((emoji) => {
          const categoryInfo = findEmojiCategory(emoji) || {
            id: "other",
            name: "其他",
          };
          return {
            name: emoji,
            url: "",
            emoji,
            category: categoryInfo.id,
            tags: [categoryInfo.name],
          };
        });
      return { search: searchResults };
    }

    const grouped: { [key: string]: AvatarOption[] } = {};
    const otherGroup: AvatarOption[] = [];
    const addedEmojis = new Set<string>();
    allAnimatedEmojis.forEach((emoji) => {
      if (addedEmojis.has(emoji)) return;
      const categoryInfo = findEmojiCategory(emoji);
      const group =
        categoryInfo && categoryInfo.id !== "other"
          ? (grouped[categoryInfo.id] = grouped[categoryInfo.id] || [])
          : otherGroup;
      group.push({
        name: emoji,
        url: "",
        emoji,
        category: categoryInfo?.id || "other",
        tags: [categoryInfo?.name || "其他"],
      });
      addedEmojis.add(emoji);
    });
    if (otherGroup.length > 0) {
      grouped["other"] = otherGroup;
    }
    return grouped;
  }, [searchTerm, allAnimatedEmojis, findEmojiCategory]);

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center`}>
        <div className="text-sm text-neutral-500">加载头像中...</div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="mb-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="搜索或输入 emoji：😊、🐶、⏰..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-4 py-2 text-sm placeholder-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
          />
        </div>
        <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          💡 提示：直接粘贴 emoji、输入 emoji 名称或分类名称来搜索
        </div>
      </div>

      <div className="mb-4 flex items-center gap-1 border-b border-neutral-200 pb-2 dark:border-neutral-700">
        {allCategories.map((category) => {
          const categoryIcons: Record<string, React.ReactNode> = {
            "emoji-face": <FaceSmileIcon className="h-5 w-5" />,
            animal: <BugAntIcon className="h-5 w-5" />,
            food: <CakeIcon className="h-5 w-5" />,
            weather: <CloudIcon className="h-5 w-5" />,
            transportation: <PaperAirplaneIcon className="h-5 w-5" />,
            objects: <CubeIcon className="h-5 w-5" />,
            sign: <AtSymbolIcon className="h-5 w-5" />,
            gestures: <HandRaisedIcon className="h-5 w-5" />,
            other: <EllipsisHorizontalCircleIcon className="h-5 w-5" />,
          };
          const categoryIcon = categoryIcons[category.id] || (
            <CubeIcon className="h-5 w-5" />
          );
          return (
            <button
              type="button"
              key={category.id}
              onClick={() => handleCategoryScroll(category.id)}
              className={`
                group relative flex h-10 w-10 items-center justify-center rounded-lg
                transition-all duration-200 ease-out
                ${
                  activeCategory === category.id
                    ? "bg-neutral-200 dark:bg-neutral-700"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }
              `}
              title={category.label}
            >
              <span className="text-neutral-600 dark:text-neutral-300">
                {categoryIcon}
              </span>
              {activeCategory === category.id && (
                <div className="absolute -bottom-2 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 max-h-72 overflow-y-auto">
        <div className="p-3 pr-4">
          {searchTerm ? (
            <div>
              <div className="flex flex-wrap gap-2">
                {groupedEmojis.search && groupedEmojis.search.length > 0 ? (
                  groupedEmojis.search.map((avatar, index) => (
                    <AvatarItem
                      key={`${avatar.emoji || avatar.name}-${index}`}
                      avatar={avatar}
                      isSelected={value === avatar.name}
                      onSelect={handleSelectAvatar}
                    />
                  ))
                ) : (
                  <div className="w-full text-center py-8 text-sm text-neutral-500">
                    未找到匹配的头像
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {allCategories.map((category) => {
                const emojis = groupedEmojis[category.id];
                if (!emojis || emojis.length === 0) return null;
                return (
                  <div
                    key={category.id}
                    ref={(el) => {
                      if (el) categoryRefs.current[category.id] = el;
                    }}
                  >
                    <h4 className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                      {category.label}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {emojis.map((avatar, index) => (
                        <AvatarItem
                          key={`${avatar.emoji || avatar.name}-${index}`}
                          avatar={avatar}
                          isSelected={value === avatar.name}
                          onSelect={handleSelectAvatar}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showBackgroundColorPicker && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            背景颜色
          </h4>
          <div className="flex flex-wrap gap-2">
            {backgroundColors.map((bgColor) => (
              <button
                type="button"
                key={bgColor.id}
                className={`
                  h-8 w-8 rounded-full border-2
                  ${
                    selectedBgColor ===
                    (bgColor.gradientEnd
                      ? `linear-gradient(135deg, ${bgColor.gradientStart}, ${bgColor.gradientEnd})`
                      : bgColor.color)
                      ? "border-blue-500"
                      : "border-transparent"
                  }
                `}
                style={{
                  background: bgColor.gradientEnd
                    ? `linear-gradient(135deg, ${bgColor.gradientStart}, ${bgColor.gradientEnd})`
                    : bgColor.color,
                }}
                onClick={() => handleSelectBgColor(bgColor.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AvatarItem = ({
  avatar,
  isSelected,
  onSelect,
}: {
  avatar: AvatarOption;
  isSelected: boolean;
  onSelect: (name: string) => void;
}) => (
  <div
    className={`
      relative h-12 w-12 flex-shrink-0 cursor-pointer rounded-lg
      transition-all duration-200 overflow-hidden
      ${
        isSelected
          ? "ring-2 ring-blue-500 shadow-md"
          : "ring-1 ring-neutral-300 hover:ring-blue-400 dark:ring-neutral-600"
      }
    `}
    onClick={() => onSelect(avatar.name)}
  >
    <div className="h-full w-full flex items-center justify-center text-2xl rounded-lg bg-neutral-100 dark:bg-neutral-700">
      {avatar.emoji}
    </div>
    {isSelected && (
      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20">
        <div className="rounded-full bg-blue-500 p-1">
          <svg
            className="h-4 w-4 text-white"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
    )}
  </div>
);

const getBackgroundColors = (): BackgroundColor[] => {
  return [
    { id: "red", name: "Red", color: "#EF4444" },
    { id: "orange", name: "Orange", color: "#F97316" },
    { id: "yellow", name: "Yellow", color: "#EAB308" },
    { id: "green", name: "Green", color: "#22C55E" },
    { id: "blue", name: "Blue", color: "#3B82F6" },
    { id: "purple", name: "Purple", color: "#8B5CF6" },
    { id: "pink", name: "Pink", color: "#EC4899" },
    {
      id: "gradient-1",
      name: "Gradient 1",
      gradientStart: "#a855f7",
      gradientEnd: "#3b82f6",
    },
    {
      id: "gradient-2",
      name: "Gradient 2",
      gradientStart: "#f97316",
      gradientEnd: "#fde047",
    },
    {
      id: "gradient-3",
      name: "Gradient 3",
      gradientStart: "#22c55e",
      gradientEnd: "#6ee7b7",
    },
  ];
};

export default AvatarPicker;
