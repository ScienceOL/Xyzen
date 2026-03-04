export function Video({
  src,
  alt,
  width = 800,
  height = 450,
  controls = true,
  autoplay = false,
  loop = false,
  muted = false,
}: {
  src: string
  alt?: string
  width?: number
  height?: number
  controls?: boolean
  autoplay?: boolean
  loop?: boolean
  muted?: boolean
}) {
  return (
    <div className="my-8 h-fit relative max-w-3xl">
      <video
        src={src}
        width={width}
        height={height}
        controls={controls}
        autoPlay={autoplay}
        loop={loop}
        muted={muted}
        className="h-auto w-full rounded-lg border object-contain
                   border-gray-100/60 shadow-md transition-all
                   duration-200 hover:border-gray-200/80 hover:shadow-lg
                   dark:border-neutral-700/80 dark:shadow-neutral-900/30
                   dark:hover:border-neutral-600"
      >
        您的浏览器不支持视频播放。
      </video>
      {alt && (
        <p
          className=" absolute -bottom-16 inset-x-0 text-center text-sm font-light italic text-gray-500
                      dark:text-neutral-400"
        >
          {alt}
        </p>
      )}
    </div>
  )
}
