"use client";
import clsx from 'clsx'
import { Link } from '@/i18n/navigation'

import { Feedback } from '@/components/Feedback'
import { Heading } from '@/components/Heading'
import { Mermaid } from '@/components/Mermaid'
import { Prose } from '@/components/Prose'
import { StackedVideosLayout } from '@/components/StackedVideosLayout'
import { Video } from '@/components/Video'

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/solid'
import React, { useState } from 'react'


export const a = Link
export { Button } from '@/components/Button'
export { Code as code, CodeGroup, Pre as pre } from '@/components/Code'
export { Mermaid, StackedVideosLayout, Video}

// 覆盖 Markdown 图片语法，使其使用 Img 组件样式
export function img({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  if (!src) return null
  return <Img src={src} alt={alt || ''} />
}

export function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <article className="flex h-full flex-col pb-10 pt-16">
      <Prose className="flex-auto">{children}</Prose>
      <footer className="mx-auto mt-16 w-full max-w-2xl lg:max-w-5xl">
        <Feedback />
      </footer>
    </article>
  )
}

export const h2 = function H2(
  props: Omit<React.ComponentPropsWithoutRef<typeof Heading>, 'level'>,
) {
  return <Heading level={2} {...props} />
}

export const h3 = function H3(
  props: Omit<React.ComponentPropsWithoutRef<typeof Heading>, 'level'>,
) {
  return <Heading level={3} {...props} />
}

export const h4 = function H4(
  props: Omit<React.ComponentPropsWithoutRef<typeof Heading>, 'level'>,
) {
  return <Heading level={4} {...props} />
}

function InfoIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <circle cx="8" cy="8" r="8" strokeWidth="0" />
      <path
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M6.75 7.75h1.5v3.5"
      />
      <circle cx="8" cy="4" r=".5" fill="none" />
    </svg>
  )
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 flex gap-2.5 rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-4 leading-6 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-emerald-200 dark:[--tw-prose-links-hover:theme(colors.emerald.300)] dark:[--tw-prose-links:theme(colors.white)]">
      <InfoIcon className="mt-1 h-4 w-4 flex-none fill-emerald-500 stroke-white dark:fill-emerald-200/20 dark:stroke-emerald-200" />
      <div className="[&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  )
}

export function Img({ src, alt }: { src: string; alt: string }) {
  return (
    <>
      <img
        src={src}
        alt={alt || ''}
        className="my-4 h-auto w-full max-w-3xl rounded-lg border border-gray-200/60 shadow-md
                   transition-all duration-200
                   hover:border-gray-300/80 hover:shadow-lg
                   dark:border-gray-700/80 dark:shadow-gray-900/30
                   dark:hover:border-gray-600"
        loading="lazy"
        decoding="async"
      />
      {alt && (
        <span className="block text-center text-sm font-light italic text-gray-500 dark:text-gray-400">
          {alt}
        </span>
      )}
    </>
  )
}

export function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 flex gap-2.5 rounded-2xl border border-yellow-500/20 bg-yellow-50/50 p-4 leading-6 text-yellow-900 dark:border-yellow-500/30 dark:bg-yellow-500/5 dark:text-yellow-200 dark:[--tw-prose-links-hover:theme(colors.yellow.300)] dark:[--tw-prose-links:theme(colors.white)]">
      <ExclamationTriangleIcon className="mt-1 h-4 w-4 flex-none fill-yellow-500 stroke-white dark:fill-yellow-200/20 dark:stroke-yellow-200" />
      <div className="[&>:first-child]:mt-0 [&>:last-child]:mb-0">
        {children}
      </div>
    </div>
  )
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-16 gap-y-10 xl:max-w-none xl:grid-cols-2">
      {children}
    </div>
  )
}

export function Col({
  children,
  sticky = false,
}: {
  children: React.ReactNode
  sticky?: boolean
}) {
  return (
    <div
      className={clsx(
        '[&>:first-child]:mt-0 [&>:last-child]:mb-0',
        sticky && 'xl:sticky xl:top-24',
      )}
    >
      {children}
    </div>
  )
}

export function Properties({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6">
      <ul
        role="list"
        className="m-0 max-w-[calc(theme(maxWidth.lg)-theme(spacing.8))] list-none divide-y divide-zinc-900/5 p-0 dark:divide-white/5"
      >
        {children}
      </ul>
    </div>
  )
}

export function Property({
  name,
  children,
  type,
}: {
  name: string
  children: React.ReactNode
  type?: string
}) {
  return (
    <li className="m-0 px-0 py-4 first:pt-0 last:pb-0">
      <dl className="m-0 flex flex-wrap items-center gap-x-3 gap-y-2">
        <dt className="sr-only">Name</dt>
        <dd>
          <code>{name}</code>
        </dd>
        {type && (
          <>
            <dt className="sr-only">Type</dt>
            <dd className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
              {type}
            </dd>
          </>
        )}
        <dt className="sr-only">Description</dt>
        <dd className="w-full flex-none [&>:first-child]:mt-0 [&>:last-child]:mb-0">
          {children}
        </dd>
      </dl>
    </li>
  )
}

export function ImageGallery({ children }: { children: React.ReactNode }) {
  const [currentIndex, setCurrentIndex] = useState(0)

  // 提取所有 img 元素并添加样式
  const images = React.Children.toArray(children).filter(
    (child): child is React.ReactElement =>
      React.isValidElement(child) && child.type === 'img'
  )

  const imageCount = images.length

  if (imageCount === 0) return null

  // 统一的图片样式类
  const imageClasses = `
    rounded-lg border border-gray-200/60 shadow-md
    transition-all duration-200
    hover:border-gray-300/80 hover:shadow-lg
    dark:border-gray-700/80 dark:shadow-gray-900/30
    dark:hover:border-gray-600
    w-full h-auto object-cover
  `.trim()

  // 为图片添加样式
  const styledImages = images.map((img, idx) =>
    React.cloneElement(img, {
      ...img.props,
      className: clsx(img.props.className, imageClasses),
      key: idx,
    })
  )

  // 轮播控制
  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? imageCount - 1 : prev - 1))
  }

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === imageCount - 1 ? 0 : prev + 1))
  }

  // 1张图：居中展示
  if (imageCount === 1) {
    return (
      <div className="my-4 flex justify-center">
        <div className="max-w-3xl w-full">
          {styledImages[0]}
        </div>
      </div>
    )
  }

  // 2张图：并排展示
  if (imageCount === 2) {
    return (
      <div className="my-4 flex justify-center gap-4">
        {styledImages.map((img, idx) => (
          <div key={idx} className="flex-1 max-w-md">
            {img}
          </div>
        ))}
      </div>
    )
  }

  // 3张图：三列展示
  if (imageCount === 3) {
    return (
      <div className="my-4 grid grid-cols-3 gap-3 max-w-5xl mx-auto">
        {styledImages.map((img, idx) => (
          <div key={idx} className="w-full">
            {img}
          </div>
        ))}
      </div>
    )
  }

  // 4张及以上：轮播展示
  return (
    <div className="my-4 max-w-4xl mx-auto">
      <div className="relative group">
        {/* 主图区域 */}
        <div className="relative overflow-hidden rounded-lg">
          {styledImages[currentIndex]}
        </div>

        {/* 左右箭头 */}
        <button
          onClick={goToPrevious}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg
                     opacity-0 group-hover:opacity-100 transition-opacity duration-200
                     hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800"
          aria-label="上一张"
        >
          <ChevronLeftIcon className="h-6 w-6 text-gray-800 dark:text-gray-200" />
        </button>

        <button
          onClick={goToNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 shadow-lg
                     opacity-0 group-hover:opacity-100 transition-opacity duration-200
                     hover:bg-white dark:bg-gray-800/90 dark:hover:bg-gray-800"
          aria-label="下一张"
        >
          <ChevronRightIcon className="h-6 w-6 text-gray-800 dark:text-gray-200" />
        </button>

        {/* 指示器 */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
          {styledImages.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={clsx(
                'h-2 rounded-full transition-all duration-200',
                idx === currentIndex
                  ? 'w-8 bg-white dark:bg-gray-200'
                  : 'w-2 bg-white/50 dark:bg-gray-400/50 hover:bg-white/75 dark:hover:bg-gray-300/75'
              )}
              aria-label={`跳转到第 ${idx + 1} 张`}
            />
          ))}
        </div>

        {/* 图片计数 */}
        <div className="absolute top-4 right-4 rounded-full bg-black/50 px-3 py-1 text-sm text-white backdrop-blur-sm">
          {currentIndex + 1} / {imageCount}
        </div>
      </div>

      {/* 缩略图 */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {styledImages.map((img, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={clsx(
              'flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all duration-200',
              idx === currentIndex
                ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            )}
          >
            <div className="w-full h-full">
              {img}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
