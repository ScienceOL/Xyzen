import { getVideoAnimationsMap } from "@/utils/emojiAnimationConfig";
import { mapEmojiToCartoon } from "@/utils/emojiUtils";
import React, { useEffect, useMemo, useRef } from "react";

interface AvatarComponentProps {
  avatar?: string | null;
  backgroundColor?: string | null;
  alt?: string;
  className?: string;
  containerClassName?: string;
  disableVideo?: boolean; // 禁用视频，显示为静态（用于预览）
  isAnimating?: boolean; // 外部控制动画播放状态
}

/**
 * Avatar Component - 将用户选择的 emoji 映射为动态图
 * 1. 如果 avatar 是 emoji -> 通过 mapEmojiToCartoon 映射到卡通名称 -> 查找对应的视频动画
 * 2. 如果有视频动画 -> 显示视频（hover 时播放）
 * 3. 如果没有视频动画 -> 显示静态 emoji
 * 4. 如果 avatar 是图片 URL -> 显示图片
 */
export const AvatarComponent: React.FC<AvatarComponentProps> = ({
  avatar,
  backgroundColor,
  alt = "avatar",
  className = "h-10 w-10 rounded-full border border-neutral-200 object-cover dark:border-neutral-700",
  containerClassName = "h-10 w-10 flex-shrink-0 avatar-glow",
  disableVideo = false,
  isAnimating,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // 根据外部 isAnimating 控制视频播放
  useEffect(() => {
    if (isAnimating !== undefined && videoRef.current) {
      if (isAnimating) {
        videoRef.current.play().catch(() => {
          // 忽略播放错误
        });
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isAnimating]);

  // 从统一的配置派生：emoji 名称到视频动画的映射
  const videoAnimations = useMemo(() => getVideoAnimationsMap(), []);

  // 检查 avatar 是否是原生 emoji（单个 unicode 字符）
  const isNativeEmoji =
    avatar && avatar.length <= 2 && /\p{Emoji}/u.test(avatar);

  // 将 emoji 映射到卡通名称，然后查找对应的视频 URL
  const videoUrl = useMemo(() => {
    if (!avatar) return undefined;

    // 如果是 emoji，先映射到卡通名称
    if (isNativeEmoji) {
      const cartoonName = mapEmojiToCartoon(avatar);
      return videoAnimations[cartoonName];
    }

    // 如果不是 emoji，直接检查是否是已知的动画名称
    return videoAnimations[avatar];
  }, [avatar, isNativeEmoji, videoAnimations]);

  // 检查是否有视频动画
  const hasVideo = !!videoUrl && !disableVideo;

  // 处理鼠标进入容器
  const handleMouseEnter = () => {
    if (videoRef.current && hasVideo) {
      videoRef.current.play().catch(() => {
        // 忽略播放错误（可能是自动播放限制）
      });
    }
  };

  // 处理鼠标离开容器
  const handleMouseLeave = () => {
    if (videoRef.current && hasVideo) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0; // 重置到第一帧
    }
  };

  return (
    <div
      className={containerClassName + " relative"}
      style={
        backgroundColor
          ? {
              background: backgroundColor,
              overflow: "hidden",
            }
          : {
              overflow: "hidden",
            }
      }
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {hasVideo ? (
        // 有视频动画 - 显示视频，hover 时播放
        <video
          ref={videoRef}
          src={videoUrl}
          loop
          muted
          playsInline
          preload="metadata"
          className={className}
          title={avatar ?? undefined}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      ) : isNativeEmoji ? (
        // 原生 emoji 但没有视频动画 - 显示静态 emoji
        <div
          className={className + " flex items-center justify-center"}
          style={{
            fontSize: "clamp(30px, 0.75vw, 48px)",
            backgroundColor: "transparent",
          }}
          title={avatar ?? undefined}
        >
          {avatar}
        </div>
      ) : avatar ? (
        // avatar 是图片 URL - 显示图片
        <img src={avatar} alt={alt} className={className} />
      ) : null}
    </div>
  );
};

export default AvatarComponent;
