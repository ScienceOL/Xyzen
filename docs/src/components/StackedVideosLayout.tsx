'use client'

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { useState } from 'react'

interface VideoItem {
  src: string
  alt?: string
}

interface StackedVideosLayoutProps {
  videos: VideoItem[]
  title?: string
  className?: string
}

export function StackedVideosLayout({
  videos,
  title,
  className,
}: StackedVideosLayoutProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null)

  const handleVideoClick = (index: number) => {
    if (index !== activeIndex) {
      setActiveIndex(index)
    }
  }

  const handleDotClick = (index: number) => {
    setActiveIndex(index)
  }

  const handlePrevVideo = () => {
    setActiveIndex((prev) => (prev - 1 + videos.length) % videos.length)
  }

  const handleNextVideo = () => {
    setActiveIndex((prev) => (prev + 1) % videos.length)
  }

  const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget
    if (video.videoWidth && video.videoHeight) {
      setVideoAspectRatio(video.videoWidth / video.videoHeight)
    }
  }

  if (!videos || videos.length === 0) {
    return null
  }

  // 根据宽高比计算容器高度
  let containerClassName = 'group/videos relative w-full'

  if (videoAspectRatio) {

    if (videoAspectRatio < 1) {
      containerClassName += ' max-w-sm mx-auto'
    }
  }

  return (
    <div className={clsx('my-8 px-8 lg:max-w-3xl lg:px-12', className)}>
      {/* 视频堆叠容器 */}
      <div className={containerClassName} style={videoAspectRatio ? { aspectRatio: videoAspectRatio } : { height: '500px' }}>
        {/* 整体组件标题 - 显示在顶部 */}
        {title && (
          <div className="mb-2 text-center">
            <h3 className="text-base font-medium text-gray-900 dark:text-white">
              {title}
            </h3>
          </div>
        )}
        {videos.map((video, index) => {
          const isActive = index === activeIndex
          const stackOffset = index - activeIndex

          return (
            <div
              key={index}
              className={clsx(
                'absolute inset-0 transition-all duration-500 ease-in-out',
                {
                  'z-30': isActive,
                  'z-20': stackOffset === 1,
                  'z-10': stackOffset === 2,
                  'z-0': Math.abs(stackOffset) > 2,
                },
              )}
              style={{
                transform: `translateX(${stackOffset * 8}%) translateY(${Math.abs(stackOffset) * 4}px) scale(${1 - Math.abs(stackOffset) * 0.03})`,
                opacity: Math.abs(stackOffset) > 1 ? 0 : 1,
              }}
            >
              <video
                src={video.src}
                controls={isActive}
                muted
                onLoadedMetadata={handleVideoMetadata}
                className={clsx(
                  'h-full w-full rounded-lg border bg-black object-contain shadow-lg transition-all duration-300',
                  'border-gray-100/60 dark:border-neutral-700/80',
                  {
                    'shadow-md': !isActive,
                    'cursor-pointer': !isActive,
                  },
                )}
                onClick={() => handleVideoClick(index)}
              >
                您的浏览器不支持视频播放。
              </video>

              {/* 右侧点击区域 - 仅在非活跃视频上显示 */}
              {!isActive && stackOffset > 0 && (
                <div
                  className="absolute right-0 top-0 h-full w-[8%] cursor-pointer bg-transparent transition-colors duration-200"
                  onClick={handleNextVideo}
                  title="点击查看下一个视频"
                />
              )}
            </div>
          )
        })}

        {/* 左右切换按钮 - 只在鼠标悬停时显示 */}
        {videos.length > 1 && (
          <>
            <button
              onClick={handlePrevVideo}
              className="absolute left-4 top-1/2 z-40 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity duration-200 hover:bg-black/70 group-hover/videos:opacity-100"
              aria-label="上一个视频"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
            <button
              onClick={handleNextVideo}
              className="absolute right-4 top-1/2 z-40 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white opacity-0 transition-opacity duration-200 hover:bg-black/70 group-hover/videos:opacity-100"
              aria-label="下一个视频"
            >
              <ChevronRightIcon className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      {/* 当前视频标题 - 使用 alt 作为标题 */}
      {videos[activeIndex]?.alt && (
        <p className="mt-8 text-center text-sm font-light italic text-gray-500 dark:text-neutral-400">
          {videos[activeIndex].alt}
        </p>
      )}

      {/* 底部圆点导航 */}
      <div className="mt-6 flex justify-center space-x-2">
        {videos.map((_, index) => (
          <button
            key={index}
            onClick={() => handleDotClick(index)}
            className={clsx(
              'h-2 w-2 rounded-full transition-all duration-300',
              {
                'scale-125 bg-green-500': index === activeIndex,
                'bg-gray-300 hover:bg-gray-400 dark:bg-neutral-600 dark:hover:bg-neutral-500':
                  index !== activeIndex,
              },
            )}
            aria-label={`切换到第 ${index + 1} 个视频`}
          />
        ))}
      </div>
    </div>
  )
}
