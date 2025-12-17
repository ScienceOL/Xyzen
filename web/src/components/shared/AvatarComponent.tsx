import React, { useMemo, useRef } from "react";

interface AvatarComponentProps {
  avatar?: string | null;
  fallbackEmoji?: string;
  fallbackImageSrc?: string;
  backgroundColor?: string | null;
  alt?: string;
  className?: string;
  containerClassName?: string;
  disableVideo?: boolean; // 禁用视频，显示为静态（用于预览）
}

/**
 * Avatar Component 支持动画视频(WebM/MP4)、静态emoji和图片三种显示方式
 * 视频动画：鼠标悬停时才播放，否则显示视频的第一帧（静态）
 * 1. 如果 avatar 是已知的动画名称（如 fire, star 等）-> 从 MinIO 加载视频文件(WebM/MP4)
 * 2. 否则如果是原生 emoji -> 显示 emoji 字符或对应的 Unicode emoji
 * 3. 否则作为图片 URL 显示
 */
export const AvatarComponent: React.FC<AvatarComponentProps> = ({
  avatar,
  fallbackEmoji: passedFallbackEmoji,
  fallbackImageSrc = "/defaults/agents/avatar2.png",
  backgroundColor,
  alt = "avatar",
  className = "h-10 w-10 rounded-full border border-neutral-200 object-cover dark:border-neutral-700",
  containerClassName = "h-10 w-10 flex-shrink-0 avatar-glow",
  disableVideo = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [imageFailed, setImageFailed] = React.useState(false);
  const [videoFrameUrl, setVideoFrameUrl] = React.useState<string | null>(null);

  // emoji 名称到 MinIO 视频动画的映射（支持 WebM 和 MP4 格式）
  // 基础 URL: https://storage.sciol.ac.cn/library/docs/public/
  const videoAnimations = useMemo(
    () => ({
      // 黄脸表情 (9)
      smirk: "https://storage.sciol.ac.cn/library/docs/public/smirk-0.5x.webm",
      "cold-face":
        "https://storage.sciol.ac.cn/library/docs/public/cold-face-0.5x.webm",
      yum: "https://storage.sciol.ac.cn/library/docs/public/yum-0.5x.webm",
      "bandage-face":
        "https://storage.sciol.ac.cn/library/docs/public/bandage-face-0.5x.webm",
      "mouth-none":
        "https://storage.sciol.ac.cn/library/docs/public/mouth-none-1x.webm",
      pensive:
        "https://storage.sciol.ac.cn/library/docs/public/pensive-0.5x.mp4",
      "scrunched-eyes":
        "https://storage.sciol.ac.cn/library/docs/public/scrunched-eyes-0.5x.mp4",
      "zany-face":
        "https://storage.sciol.ac.cn/library/docs/public/zany-face-0.5x.webm",
      "zipper-face":
        "https://storage.sciol.ac.cn/library/docs/public/zipper-face-1x.webm",
      // 动物 (1)
      rat: "https://storage.sciol.ac.cn/library/docs/public/rat-0.5x.webm",
      // 交通工具 (1)
      airplane:
        "https://storage.sciol.ac.cn/library/docs/public/airplane-departure-2x.webm",
      // 日常用品 (5)
      alarm:
        "https://storage.sciol.ac.cn/library/docs/public/alarm-clock-1x.mp4",
      "light-bulb":
        "https://storage.sciol.ac.cn/library/docs/public/light-bulb-2x.webm",
      maracas:
        "https://storage.sciol.ac.cn/library/docs/public/maracas-0.5x.webm",
      "money-with-wings":
        "https://storage.sciol.ac.cn/library/docs/public/money-with-wings-0.5x.webm",
      "wine-glass":
        "https://storage.sciol.ac.cn/library/docs/public/wine-glass-1x.webm",
      // 人物角色 (3)
      robot: "https://storage.sciol.ac.cn/library/docs/public/robot-0.5x.webm",
      alien: "https://storage.sciol.ac.cn/library/docs/public/alien-0.5x.webm",
      "dancer-woman":
        "https://storage.sciol.ac.cn/library/docs/public/dancer-woman-skin-tone-3-0.5x.webm",
      // 手势 (4)
      "clap-skin-tone":
        "https://storage.sciol.ac.cn/library/docs/public/clap-skin-tone-1-0.5x.mp4",
      "crossed-fingers-skin":
        "https://storage.sciol.ac.cn/library/docs/public/crossed-fingers-skin-tone-4-0.5x.webm",
      "thumbs-up":
        "https://storage.sciol.ac.cn/library/docs/public/thumbs-up-skin-tone-2-0.5x.webm",
      victory:
        "https://storage.sciol.ac.cn/library/docs/public/victory-skin-tone-3-0.5x.webm",
      // 自然元素 (1)
      fire: "https://storage.sciol.ac.cn/library/docs/public/fire-0.5x.webm",
      // 其他 (2)
      eye: "https://storage.sciol.ac.cn/library/docs/public/eyes-0.5x.webm",
      "biting-lip":
        "https://storage.sciol.ac.cn/library/docs/public/biting-lip-0.5x.webm",
    }),
    [],
  );

  // 检查 avatar 是否在视频动画映射中
  const isVideoAnimation = avatar && avatar in videoAnimations;

  // 检查 avatar 是否是原生 emoji（单个 unicode 字符）
  const isNativeEmoji =
    avatar && avatar.length <= 2 && /\p{Emoji}/u.test(avatar);

  // emoji 名称到 Unicode emoji 的映射（作为后备方案）
  const emojiMap: Record<string, string> = {
    // 黄脸表情
    smirk: "😏",
    "cold-face": "🥶",
    yum: "😋",
    "bandage-face": "🤕",
    "mouth-none": "🫢",
    pensive: "😔",
    "scrunched-eyes": "😖",
    "zany-face": "🤪",
    "zipper-face": "🤐",
    // 动物
    rat: "🐀",
    // 交通工具
    airplane: "✈️",
    // 日常用品
    alarm: "⏰",
    "light-bulb": "💡",
    maracas: "🪇",
    "money-with-wings": "💸",
    "wine-glass": "🍷",
    // 人物角色
    robot: "🤖",
    alien: "👽",
    "dancer-woman": "💃",
    // 手势
    "clap-skin-tone": "👏",
    "crossed-fingers-skin": "🤞",
    "thumbs-up": "👍",
    victory: "✌️",
    // 自然元素
    fire: "🔥",
    // 其他
    eye: "👀",
    "biting-lip": "🫦",
  };

  const fallbackEmoji =
    avatar && avatar in emojiMap
      ? emojiMap[avatar as keyof typeof emojiMap]
      : (passedFallbackEmoji ?? null);

  // 从视频中提取第一帧作为静态图像
  React.useEffect(() => {
    if (disableVideo && isVideoAnimation && !videoFrameUrl) {
      const videoUrl = videoAnimations[avatar as keyof typeof videoAnimations];
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = videoUrl;
      video.preload = "auto";
      video.style.display = "none";
      document.body.appendChild(video);

      const extractFrame = () => {
        try {
          const canvas = document.createElement("canvas");
          const width = video.videoWidth || 100;
          const height = video.videoHeight || 100;

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (ctx && width > 0 && height > 0) {
            ctx.drawImage(video, 0, 0, width, height);
            const frameUrl = canvas.toDataURL("image/png");
            if (frameUrl && frameUrl !== "data:image/png;base64,") {
              setVideoFrameUrl(frameUrl);
              console.log("Successfully extracted video frame for:", avatar);
            }
          }
        } catch (error) {
          console.warn("Failed to extract video frame:", error);
        } finally {
          document.body.removeChild(video);
        }
      };

      const handleLoadedMetadata = () => {
        // 等待一点时间让视频真正加载数据
        setTimeout(extractFrame, 100);
      };

      video.addEventListener("loadedmetadata", handleLoadedMetadata, {
        once: true,
      });
      video.addEventListener("error", (e) => {
        console.warn("Failed to load video for frame extraction:", avatar, e);
        document.body.removeChild(video);
      });

      // 超时保护
      const timeoutId = setTimeout(() => {
        if (document.body.contains(video)) {
          console.warn("Video loading timeout for:", avatar);
          document.body.removeChild(video);
        }
      }, 5000);

      return () => clearTimeout(timeoutId);
    }
  }, [disableVideo, isVideoAnimation, avatar, videoFrameUrl]);

  // 处理鼠标进入容器
  const handleMouseEnter = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // 忽略播放错误（可能是自动播放限制）
      });
    }
  };

  // 处理鼠标离开容器
  const handleMouseLeave = () => {
    if (videoRef.current) {
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
      {isVideoAnimation && !disableVideo ? (
        <video
          ref={videoRef}
          src={videoAnimations[avatar as keyof typeof videoAnimations]}
          loop
          muted
          playsInline
          preload="metadata"
          className={className}
          title={avatar ?? undefined}
          style={{ width: "100%", height: "100%", display: "block" }}
          onError={() => {
            console.warn(`Failed to load video for avatar: ${avatar}`);
            setImageFailed(true);
          }}
        />
      ) : isVideoAnimation && disableVideo && videoFrameUrl ? (
        // 显示从视频提取的第一帧
        <img
          src={videoFrameUrl}
          alt={alt}
          className={className}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      ) : avatar && !isVideoAnimation && !isNativeEmoji && !imageFailed ? (
        // avatar 是图片 URL
        <img
          src={avatar}
          alt={alt}
          className={className}
          onError={() => {
            setImageFailed(true);
          }}
        />
      ) : isVideoAnimation && disableVideo && !videoFrameUrl ? (
        // 视频帧还在加载中，显示 fallback emoji
        <div
          className={className + " flex items-center justify-center"}
          style={{
            fontSize: "clamp(10px, 50%, 20px)",
            backgroundColor: "transparent",
          }}
          title={avatar ?? undefined}
        >
          {fallbackEmoji || avatar}
        </div>
      ) : fallbackEmoji || isNativeEmoji ? (
        <div
          className={className + " flex items-center justify-center"}
          style={{
            fontSize: "clamp(10px, 50%, 20px)",
            backgroundColor: "transparent",
          }}
          title={avatar ?? undefined}
        >
          {fallbackEmoji || avatar}
        </div>
      ) : (
        <img src={fallbackImageSrc} alt={alt} className={className} />
      )}
    </div>
  );
};

export default AvatarComponent;
