'use client'

import {
  type MotionValue,
  motion,
  useMotionTemplate,
  useMotionValue,
} from 'framer-motion'
import Image from 'next/image'

import { GridPattern } from '@/components/GridPattern'
import { Heading } from '@/components/Heading'



function AdvisorAvatar({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-full bg-zinc-100 shadow-xl ring-4 ring-white/90 dark:bg-zinc-800 dark:ring-zinc-700/90">
      <Image
        src={src}
        alt={alt}
        width={80}
        height={80}
        className="h-full w-full object-cover"
      />
    </div>
  )
}

function AdvisorPattern({
  mouseX,
  mouseY,
  ...gridProps
}: Advisor['pattern'] & {
  mouseX: MotionValue<number>
  mouseY: MotionValue<number>
}) {
  let maskImage = useMotionTemplate`radial-gradient(250px at ${mouseX}px ${mouseY}px, white, transparent)`
  let style = { maskImage, WebkitMaskImage: maskImage }

  return (
    <div className="pointer-events-none">
      <div className="absolute inset-0 rounded-3xl transition-opacity duration-300 [mask-image:linear-gradient(white,transparent)] group-hover:opacity-40">
        <GridPattern
          width={80}
          height={64}
          x="50%"
          className="stroke-black/3 dark:fill-white/0.5 dark:stroke-white/1.5 absolute inset-x-0 inset-y-[-35%] h-[170%] w-full skew-y-[-12deg] fill-black/[0.015]"
          {...gridProps}
        />
      </div>
      <motion.div
        className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[#F8FAFC] via-[#F1F5F9] to-[#E2E8F0] opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-[#0F172A] dark:via-[#1E293B] dark:to-[#334155]"
        style={style}
      />
      <motion.div
        className="absolute inset-0 rounded-3xl opacity-0 mix-blend-overlay transition-opacity duration-300 group-hover:opacity-100"
        style={style}
      >
        <GridPattern
          width={80}
          height={64}
          x="50%"
          className="dark:fill-white/2 dark:stroke-white/8 absolute inset-x-0 inset-y-[-35%] h-[170%] w-full skew-y-[-12deg] fill-black/40 stroke-black/60"
          {...gridProps}
        />
      </motion.div>
    </div>
  )
}

export default function AdvisorCard({ advisor }: { advisor: Advisor }) {
  let mouseX = useMotionValue(0)
  let mouseY = useMotionValue(0)

  function onMouseMove({
    currentTarget,
    clientX,
    clientY,
  }: React.MouseEvent<HTMLDivElement>) {
    let { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  return (
    <div
      key={advisor.name}
      onMouseMove={onMouseMove}
      className="group relative flex rounded-3xl bg-white transition-shadow hover:shadow-2xl hover:shadow-zinc-900/10 dark:bg-zinc-900/50 dark:hover:shadow-black/20"
    >
      <AdvisorPattern {...advisor.pattern} mouseX={mouseX} mouseY={mouseY} />
      <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-zinc-900/5 group-hover:ring-zinc-900/15 dark:ring-white/5 dark:group-hover:ring-white/15" />
      <div className="relative rounded-3xl px-8 pb-8 pt-10">
        <div className="flex flex-col items-start text-left">
          <div className="flex items-center space-x-4">
            <AdvisorAvatar src={advisor.avatar} alt={advisor.name} />
            <div>
              <h3 className="text-xl font-bold leading-8 text-zinc-900 dark:text-white">
                {advisor.name}
              </h3>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {advisor.title}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-center space-x-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"></span>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                {advisor.institution}
              </p>
            </div>
            <p className="ml-3.5 text-sm text-zinc-600 dark:text-zinc-400">
              {advisor.department}
            </p>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              研究领域
            </p>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {advisor.specialization}
            </p>
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {advisor.description}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
