import React, {
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

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
}

interface BackgroundColor {
  id: string;
  name: string;
  color: string;
  gradientStart?: string;
  gradientEnd?: string;
}

/**
 * AvatarPicker 组件 - 仿照 lobe-chat 的头像选择器
 * 支持分类、搜索和水平滚动
 */
export const AvatarPicker: React.FC<AvatarPickerProps> = ({
  value,
  onChange,
  backgroundColor,
  onBackgroundColorChange,
  className = "p-4",
}) => {
  const [avatarOptions, setAvatarOptions] = useState<AvatarOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedBgColor, setSelectedBgColor] = useState<string | null>(
    backgroundColor || null,
  );
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  // 在组件挂载时获取可用的头像列表
  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `${import.meta.env.VITE_BACKEND_URL || "/xyzen/api"}/v1/agents/avatars/available`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch available avatars");
        }

        const data = (await response.json()) as AvatarOption[];
        setAvatarOptions(data);
      } catch (error) {
        console.error("Error fetching avatars:", error);
        const defaultAvatars = getDefaultAvatars();
        setAvatarOptions(defaultAvatars);
      } finally {
        setLoading(false);
      }
    };

    fetchAvatars();
  }, []);

  // 同步外部 backgroundColor 的变化
  useEffect(() => {
    if (backgroundColor) {
      setSelectedBgColor(backgroundColor);
    }
  }, [backgroundColor]);

  // 处理头像悬停 - 播放动画
  const handleMouseEnter = useCallback((avatarName: string) => {
    const videoEl = videoRefs.current[avatarName];
    if (videoEl) {
      videoEl.currentTime = 0;
      videoEl.play().catch(() => {
        // 忽略播放错误
      });
    }
  }, []);

  // 处理鼠标离开 - 暂停动画
  const handleMouseLeave = useCallback((avatarName: string) => {
    const videoEl = videoRefs.current[avatarName];
    if (videoEl) {
      videoEl.pause();
      videoEl.currentTime = 0;
    }
  }, []);

  // 处理头像选择
  const handleSelectAvatar = useCallback(
    (avatarName: string) => {
      onChange?.(avatarName);
    },
    [onChange],
  );

  // 处理背景色选择
  const handleSelectBgColor = useCallback(
    (colorId: string) => {
      try {
        // 获取颜色值
        const colors = getBackgroundColors();
        const bgColor = colors.find((c) => c.id === colorId);
        if (bgColor) {
          const colorValue = bgColor.gradientEnd
            ? `linear-gradient(135deg, ${bgColor.gradientStart}, ${bgColor.gradientEnd})`
            : bgColor.color;
          setSelectedBgColor(colorValue);
          onBackgroundColorChange?.(colorValue);
        }
      } catch (error) {
        console.error("Error selecting background color:", error);
      }
    },
    [onBackgroundColorChange],
  );

  // 处理分类变更 - 添加额外的检查和日志
  const handleCategoryChange = useCallback((categoryId: string | null) => {
    try {
      console.log(`Switching category to: ${categoryId}`);
      setActiveCategory(categoryId);
    } catch (error) {
      console.error("Error changing category:", error);
    }
  }, []);

  // 缓存背景色列表
  const backgroundColors = useMemo(() => {
    return getBackgroundColors();
  }, []);

  // 获取分类和分组的头像
  const categories = useMemo(() => {
    try {
      return getCategories(avatarOptions);
    } catch (error) {
      console.error("Error getting categories:", error);
      return [];
    }
  }, [avatarOptions]);

  // 过滤头像 - 按搜索条件和分类
  const filteredAvatars = useMemo(() => {
    try {
      let filtered = avatarOptions;

      // 按搜索条件过滤
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filtered = filtered.filter(
          (avatar) =>
            avatar.name.toLowerCase().includes(term) ||
            avatar.tags?.some((tag) => tag.toLowerCase().includes(term)),
        );
      }

      // 按分类过滤
      if (activeCategory) {
        filtered = filtered.filter(
          (avatar) => avatar.category === activeCategory,
        );
      }

      return filtered;
    } catch (error) {
      console.error("Error filtering avatars:", error);
      return [];
    }
  }, [avatarOptions, searchTerm, activeCategory]);

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center`}>
        <div className="text-sm text-neutral-500">加载头像中...</div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* 搜索框 */}
      <div className="mb-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="搜索头像：smirk、cold-face、alarm..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-white pl-10 pr-4 py-2 text-sm placeholder-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
          />
        </div>
      </div>

      {/* 分类标签 */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleCategoryChange(null);
          }}
          className={`rounded-full px-4 py-1 text-sm font-medium transition-all ${
            activeCategory === null
              ? "bg-blue-500 text-white"
              : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
          }`}
        >
          全部
        </button>
        {categories &&
          categories.length > 0 &&
          categories.map((category) => (
            <button
              type="button"
              key={category.id}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCategoryChange(category.id);
              }}
              className={`rounded-full px-4 py-1 text-sm font-medium transition-all ${
                activeCategory === category.id
                  ? "bg-blue-500 text-white"
                  : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
              }`}
            >
              {category.label}
            </button>
          ))}
      </div>

      {/* 头像网格 - 水平滚动 */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="flex flex-wrap gap-2">
          {filteredAvatars.length > 0 ? (
            filteredAvatars.map((avatar) => (
              <div
                key={avatar.name}
                className={`
                  relative h-16 w-16 shrink-0 cursor-pointer rounded-lg
                  transition-all duration-200
                  ${
                    value === avatar.name
                      ? "ring-2 ring-blue-500 shadow-md"
                      : "ring-1 ring-neutral-300 hover:ring-blue-400 dark:ring-neutral-600"
                  }
                `}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectAvatar(avatar.name);
                }}
                onMouseEnter={() => handleMouseEnter(avatar.name)}
                onMouseLeave={() => handleMouseLeave(avatar.name)}
                title={avatar.name}
              >
                {/* 显示视频或 emoji */}
                {avatar.url ? (
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current[avatar.name] = el;
                    }}
                    src={avatar.url}
                    loop
                    muted
                    playsInline
                    className="h-full w-full rounded-lg object-cover"
                    onError={(e) => {
                      // 视频加载失败时的处理
                      console.warn(
                        `Failed to load avatar video: ${avatar.name}`,
                      );
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : avatar.emoji ? (
                  <div className="h-full w-full flex items-center justify-center text-4xl rounded-lg bg-neutral-100 dark:bg-neutral-700">
                    {avatar.emoji}
                  </div>
                ) : null}

                {/* 选中指示器 */}
                {value === avatar.name && (
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
            ))
          ) : (
            <div className="w-full text-center py-8 text-sm text-neutral-500">
              未找到匹配的头像
            </div>
          )}
        </div>
      </div>

      {/* 背景色选择 */}
      <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <div className="mb-3">
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            背景色
          </h3>
          <div className="flex flex-wrap gap-2">
            {backgroundColors.map((bgColor) => (
              <button
                type="button"
                key={bgColor.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSelectBgColor(bgColor.id);
                }}
                className={`h-8 w-8 rounded-full ring-2 transition-all ${
                  selectedBgColor?.includes(
                    bgColor.gradientStart || bgColor.color,
                  )
                    ? "ring-blue-500 ring-offset-2"
                    : "ring-neutral-300 dark:ring-neutral-600"
                }`}
                style={{
                  background: bgColor.gradientEnd
                    ? `linear-gradient(135deg, ${bgColor.gradientStart}, ${bgColor.gradientEnd})`
                    : bgColor.color,
                }}
                title={bgColor.name}
              />
            ))}
          </div>
        </div>

        {/* 显示已选择的头像和背景色 */}
        <div className="text-sm text-neutral-600 dark:text-neutral-400">
          {value && (
            <p>
              已选择头像:{" "}
              <span className="font-semibold text-blue-600">{value}</span>
            </p>
          )}
          {selectedBgColor && (
            <p>
              背景色:{" "}
              <span className="font-semibold text-blue-600">
                {selectedBgColor}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * 获取背景色选项
 */
function getBackgroundColors(): BackgroundColor[] {
  return [
    { id: "white", name: "白色", color: "#ffffff" },
    { id: "black", name: "黑色", color: "#000000" },
    { id: "gray", name: "灰色", color: "#f3f4f6" },
    { id: "blue", name: "蓝色", color: "#3b82f6" },
    { id: "pink", name: "粉色", color: "#ec4899" },
    { id: "red", name: "红色", color: "#ef4444" },
    { id: "yellow", name: "黄色", color: "#eab308" },
    { id: "green", name: "绿色", color: "#22c55e" },
    { id: "teal", name: "青色", color: "#14b8a6" },
    { id: "cyan", name: "青蓝", color: "#06b6d4" },
    {
      id: "gradient-sunset",
      name: "夕阳",
      color: "#gradientSunset",
      gradientStart: "#f97316",
      gradientEnd: "#f43f5e",
    },
    {
      id: "gradient-ocean",
      name: "海洋",
      color: "#gradientOcean",
      gradientStart: "#0ea5e9",
      gradientEnd: "#3b82f6",
    },
    {
      id: "gradient-forest",
      name: "森林",
      color: "#gradientForest",
      gradientStart: "#10b981",
      gradientEnd: "#059669",
    },
    {
      id: "gradient-royal",
      name: "皇家",
      color: "#gradientRoyal",
      gradientStart: "#a855f7",
      gradientEnd: "#7c3aed",
    },
  ];
}

/**
 * 获取默认的头像列表（硬编码备用方案）
 */
function getDefaultAvatars(): AvatarOption[] {
  const baseUrl = "https://storage.sciol.ac.cn/library/docs/public";

  return [
    // 黄脸表情
    {
      name: "smirk",
      url: `${baseUrl}/smirk-0.5x.webm`,
      category: "emoji-face",
      tags: ["表情", "黄脸"],
    },
    {
      name: "cold-face",
      url: `${baseUrl}/cold-face-0.5x.webm`,
      category: "emoji-face",
      tags: ["表情", "冷脸"],
    },
    {
      name: "yum",
      url: `${baseUrl}/yum-0.5x.webm`,
      category: "emoji-face",
      tags: ["表情", "美味"],
    },
    {
      name: "bandage-face",
      url: `${baseUrl}/bandage-face-0.5x.webm`,
      category: "emoji-face",
      tags: ["表情", "绷带"],
    },
    {
      name: "mouth-none",
      url: `${baseUrl}/mouth-none-1x.webm`,
      category: "emoji-face",
      tags: ["表情", "无口"],
    },
    {
      name: "pensive",
      url: `${baseUrl}/pensive-0.5x.mp4`,
      category: "emoji-face",
      tags: ["表情", "沮丧"],
    },
    {
      name: "scrunched-eyes",
      url: `${baseUrl}/scrunched-eyes-0.5x.mp4`,
      category: "emoji-face",
      tags: ["表情", "眯眼"],
    },
    {
      name: "zany-face",
      url: `${baseUrl}/zany-face-0.5x.webm`,
      category: "emoji-face",
      tags: ["表情", "疯狂"],
    },
    {
      name: "zipper-face",
      url: `${baseUrl}/zipper-face-1x.webm`,
      category: "emoji-face",
      tags: ["表情", "拉链嘴"],
    },

    // 动物
    {
      name: "rat",
      url: `${baseUrl}/rat-0.5x.webm`,
      category: "animal",
      tags: ["动物", "啮齿"],
    },

    // 交通工具
    {
      name: "airplane",
      url: `${baseUrl}/airplane-departure-2x.webm`,
      category: "transportation",
      tags: ["交通", "飞机"],
    },

    // 日常用品
    {
      name: "alarm",
      url: `${baseUrl}/alarm-clock-1x.mp4`,
      category: "daily",
      tags: ["用品", "时间", "闹钟"],
    },
    {
      name: "light-bulb",
      url: `${baseUrl}/light-bulb-2x.webm`,
      category: "daily",
      tags: ["用品", "灯泡"],
    },
    {
      name: "maracas",
      url: `${baseUrl}/maracas-0.5x.webm`,
      category: "daily",
      tags: ["用品", "乐器"],
    },
    {
      name: "money-with-wings",
      url: `${baseUrl}/money-with-wings-0.5x.webm`,
      category: "daily",
      tags: ["用品", "金钱"],
    },
    {
      name: "wine-glass",
      url: `${baseUrl}/wine-glass-1x.webm`,
      category: "daily",
      tags: ["用品", "酒杯"],
    },

    // 人物角色
    {
      name: "robot",
      url: `${baseUrl}/robot-0.5x.webm`,
      category: "character",
      tags: ["角色", "机器人"],
    },
    {
      name: "alien",
      url: `${baseUrl}/alien-0.5x.webm`,
      category: "character",
      tags: ["角色", "外星人"],
    },
    {
      name: "dancer-woman",
      url: `${baseUrl}/dancer-woman-skin-tone-3-0.5x.webm`,
      category: "character",
      tags: ["角色", "舞者"],
    },

    // 手势和手
    {
      name: "clap-skin-tone",
      url: `${baseUrl}/clap-skin-tone-1-0.5x.mp4`,
      category: "gesture",
      tags: ["手势", "鼓掌"],
    },
    {
      name: "crossed-fingers-skin",
      url: `${baseUrl}/crossed-fingers-skin-tone-4-0.5x.webm`,
      category: "gesture",
      tags: ["手势", "交叉手指"],
    },
    {
      name: "thumbs-up",
      url: `${baseUrl}/thumbs-up-skin-tone-2-0.5x.webm`,
      category: "gesture",
      tags: ["手势", "点赞"],
    },
    {
      name: "victory",
      url: `${baseUrl}/victory-skin-tone-3-0.5x.webm`,
      category: "gesture",
      tags: ["手势", "胜利"],
    },

    // 自然元素
    {
      name: "fire",
      url: `${baseUrl}/fire-0.5x.webm`,
      category: "nature",
      tags: ["自然", "火焰"],
    },

    // 其他
    {
      name: "eye",
      url: `${baseUrl}/eyes-0.5x.webm`,
      category: "other",
      tags: ["其他", "眼睛"],
    },
    {
      name: "biting-lip",
      url: `${baseUrl}/biting-lip-0.5x.webm`,
      category: "other",
      tags: ["其他", "嘴唇"],
    },
  ];
}

/**
 * 获取头像分类
 */
function getCategories(avatars: AvatarOption[]): AvatarCategory[] {
  const categoryMap: Record<string, AvatarCategory> = {
    "emoji-face": {
      id: "emoji-face",
      label: "😊 黄脸表情",
      avatars: [],
    },
    transportation: {
      id: "transportation",
      label: "✈️ 交通工具",
      avatars: [],
    },
    daily: {
      id: "daily",
      label: "⏰ 日常用品",
      avatars: [],
    },
    character: {
      id: "character",
      label: "🤖 人物角色",
      avatars: [],
    },
    nature: {
      id: "nature",
      label: "🔥 自然元素",
      avatars: [],
    },
    animal: {
      id: "animal",
      label: "🐶 动物",
      avatars: [],
    },
    gesture: {
      id: "gesture",
      label: "👍 手势",
      avatars: [],
    },
    other: {
      id: "other",
      label: "📌 其他",
      avatars: [],
    },
  };

  // 将头像分配到对应的分类
  avatars.forEach((avatar) => {
    const category = avatar.category || "other";
    if (categoryMap[category]) {
      categoryMap[category].avatars.push(avatar);
    }
  });

  // 返回只有包含头像的分类
  return Object.values(categoryMap).filter((cat) => cat.avatars.length > 0);
}
