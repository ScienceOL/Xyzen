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



function MemberAvatar({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-full bg-zinc-100 shadow-lg ring-2 ring-white dark:bg-zinc-800 dark:ring-zinc-700">
      <Image
        src={src}
        alt={alt}
        width={64}
        height={64}
        className="h-full w-full object-cover"
      />
    </div>
  )
}

function MemberPattern({
  mouseX,
  mouseY,
  ...gridProps
}: TeamMember['pattern'] & {
  mouseX: MotionValue<number>
  mouseY: MotionValue<number>
}) {
  let maskImage = useMotionTemplate`radial-gradient(200px at ${mouseX}px ${mouseY}px, white, transparent)`
  let style = { maskImage, WebkitMaskImage: maskImage }

  return (
    <div className="pointer-events-none">
      <div className="absolute inset-0 rounded-2xl transition duration-300 [mask-image:linear-gradient(white,transparent)] group-hover:opacity-50">
        <GridPattern
          width={72}
          height={56}
          x="50%"
          className="absolute inset-x-0 inset-y-[-30%] h-[160%] w-full skew-y-[-18deg] fill-black/[0.02] stroke-black/5 dark:fill-white/1 dark:stroke-white/2.5"
          {...gridProps}
        />
      </div>
      <motion.div
        className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#EDF4FF] to-[#E8F5E8] opacity-0 transition duration-300 group-hover:opacity-100 dark:from-[#1E2A3A] dark:to-[#1A2E1A]"
        style={style}
      />
      <motion.div
        className="absolute inset-0 rounded-2xl opacity-0 mix-blend-overlay transition duration-300 group-hover:opacity-100"
        style={style}
      >
        <GridPattern
          width={72}
          height={56}
          x="50%"
          className="absolute inset-x-0 inset-y-[-30%] h-[160%] w-full skew-y-[-18deg] fill-black/50 stroke-black/70 dark:fill-white/2.5 dark:stroke-white/10"
          {...gridProps}
        />
      </motion.div>
    </div>
  )
}

export default function MemberCard({ member }: { member: TeamMember }) {
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
      key={member.name}
      onMouseMove={onMouseMove}
      className="group relative flex rounded-2xl bg-zinc-50 transition-shadow hover:shadow-md hover:shadow-zinc-900/5 dark:bg-white/2.5 dark:hover:shadow-black/5"
    >
      <MemberPattern {...member.pattern} mouseX={mouseX} mouseY={mouseY} />
      <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-zinc-900/7.5 group-hover:ring-zinc-900/10 dark:ring-white/10 dark:group-hover:ring-white/20" />
      <div className="relative rounded-2xl px-6 pb-6 pt-8">
        <div className="flex flex-col items-center text-center">
          <MemberAvatar src={member.avatar} alt={member.name} />

          <div className="mt-4">
            <h3 className="text-lg font-semibold leading-7 text-zinc-900 dark:text-white">
              {member.name}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {member.realName} · {member.age}岁
            </p>
          </div>

          <div className="mt-3 space-y-1 text-center">
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {member.role}
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {member.university}
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {member.education} · {member.specialty}
            </p>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            {member.description}
          </p>
        </div>
      </div>
    </div>
  )
}
