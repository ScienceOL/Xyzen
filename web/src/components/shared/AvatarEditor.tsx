import { AvatarComponent } from "@/components/shared/AvatarComponent";
import { AvatarPicker } from "@/components/shared/AvatarPicker";
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";

interface AvatarEditorProps {
  avatarName?: string;
  avatarBackgroundColor?: string;
  onAvatarChange: (name: string) => void;
  onBackgroundColorChange: (color: string) => void;
}

/**
 * 显示当前头像，点击打开浮层选择器
 */
export const AvatarEditor: React.FC<AvatarEditorProps> = ({
  avatarName = "smirk",
  avatarBackgroundColor,
  onAvatarChange,
  onBackgroundColorChange,
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsPickerOpen(false);
      }
    };

    if (isPickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isPickerOpen]);

  // 获取背景色样式
  const getBackgroundStyle = (): React.CSSProperties => {
    if (!avatarBackgroundColor) {
      return { backgroundColor: "#f3f4f6" };
    }

    if (avatarBackgroundColor.startsWith("linear-gradient")) {
      return { background: avatarBackgroundColor };
    }

    return { backgroundColor: avatarBackgroundColor };
  };

  // 判断是否是emoji（不包含"-"的纯emoji）
  const isEmoji = !avatarName.includes("-") && avatarName.length <= 2;

  return (
    <div ref={containerRef} className="relative">
      {/* 头像编辑框 */}
      <div className="flex items-center gap-4">
        {/* 头像显示框 */}
        <div
          onClick={() => setIsPickerOpen(!isPickerOpen)}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          className="relative h-24 w-24 cursor-pointer rounded-xl border-2 border-neutral-300 transition-all hover:border-blue-500 hover:shadow-md dark:border-neutral-600 dark:hover:border-blue-400 flex items-center justify-center"
          style={getBackgroundStyle()}
        >
          <AvatarComponent
            avatar={avatarName}
            backgroundColor={avatarBackgroundColor ?? undefined}
            className="h-full w-full"
            isAnimating={isHovering}
          />

          {/* 编辑提示 */}
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 opacity-0 transition-all hover:bg-black/10 hover:opacity-100">
            <span className="text-sm font-medium text-white drop-shadow">
              点击编辑
            </span>
          </div>
        </div>

        {/* 信息面板 */}
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            当前头像
          </p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {isEmoji ? avatarName : avatarName.replace(/-/g, " ")}
          </p>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            点击头像框来编辑或更换头像
          </p>
        </div>
      </div>

      {/* 浮层选择器 */}
      <AnimatePresence>
        {isPickerOpen && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[1001] bg-black/20 dark:bg-black/40"
              onClick={() => setIsPickerOpen(false)}
            />

            {/* 选择器浮层 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute left-0 top-full z-[1002] mt-2 max-h-[600px] w-full min-w-[500px] overflow-auto rounded-lg border border-neutral-200 bg-white p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
            >
              <AvatarPicker
                value={avatarName}
                onChange={(value) => {
                  onAvatarChange(value);
                }}
                backgroundColor={avatarBackgroundColor}
                onBackgroundColorChange={onBackgroundColorChange}
                showBackgroundColorPicker={false}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
