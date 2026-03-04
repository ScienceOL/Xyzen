'use client'

import {
  type MotionValue,
  motion,
  useMotionTemplate,
  useMotionValue,
} from 'framer-motion'
import { Link } from '@/i18n/navigation'

import { GridPattern } from '@/components/GridPattern'
import { Heading } from '@/components/Heading'
import {
  BoltIcon,
  BookOpenIcon,
  BriefcaseIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CpuChipIcon,
  LightBulbIcon,
  ServerStackIcon,
  ShareIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'

interface Resource {
  href: string
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  pattern: Omit<
    React.ComponentPropsWithoutRef<typeof GridPattern>,
    'width' | 'height' | 'x'
  >
}

const productResources: Array<Resource> = [
  {
    href: '/skills',
    name: 'Skills',
    description:
      'Create reusable instruction packages with the SKILL.md format. Teach agents specialized capabilities.',
    icon: LightBulbIcon,
    pattern: { y: 16, squares: [[0, 1], [1, 3]] },
  },
  {
    href: '/knowledge',
    name: 'Knowledge Bases',
    description:
      'Upload documents for retrieval-augmented generation. Give agents access to your data.',
    icon: BookOpenIcon,
    pattern: { y: -6, squares: [[-1, 2], [1, 3]] },
  },
  {
    href: '/mcp',
    name: 'MCP Servers',
    description:
      'Connect external tool providers using the Model Context Protocol. Extend agent capabilities.',
    icon: ServerStackIcon,
    pattern: { y: 32, squares: [[0, 2], [1, 4]] },
  },
  {
    href: '/sandbox',
    name: 'Sandbox',
    description:
      'Isolated code execution environments for running code, managing files, and previewing results.',
    icon: CommandLineIcon,
    pattern: { y: 22, squares: [[0, 1]] },
  },
  {
    href: '/marketplace',
    name: 'Marketplace',
    description:
      'Publish, discover, and fork agents and skills. Share your creations with the community.',
    icon: BriefcaseIcon,
    pattern: { y: 24, squares: [[0, 2], [1, 3]] },
  },
]

const developerResources: Array<Resource> = [
  {
    href: '/configuration',
    name: 'Configuration',
    description:
      'Complete environment variable reference for auth, databases, LLM providers, and all services.',
    icon: WrenchScrewdriverIcon,
    pattern: { y: 10, squares: [[0, 1], [1, 2]] },
  },
  {
    href: '/api-reference',
    name: 'API Reference',
    description:
      'REST endpoints, authentication, and SSE streaming events for building integrations.',
    icon: CodeBracketIcon,
    pattern: { y: -4, squares: [[-1, 1], [1, 3]] },
  },
  {
    href: '/custom-agents',
    name: 'Custom Agents',
    description:
      'Build custom agent workflows using the graph builder, reusable components, and compilation pipeline.',
    icon: CpuChipIcon,
    pattern: { y: 28, squares: [[0, 2], [1, 4]] },
  },
  {
    href: '/custom-tools',
    name: 'Custom Tools',
    description:
      'Extend Xyzen with builtin Python tools or external MCP servers.',
    icon: BoltIcon,
    pattern: { y: 18, squares: [[0, 1]] },
  },
  {
    href: '/contributing',
    name: 'Contributing',
    description:
      'Development setup, code style, testing, and pull request workflow.',
    icon: ShareIcon,
    pattern: { y: 20, squares: [[0, 2], [1, 3]] },
  },
]

function ResourceIcon({ icon: Icon }: { icon: Resource['icon'] }) {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/5 ring-1 ring-zinc-900/25 backdrop-blur-[2px] transition duration-300 group-hover:bg-white/50 group-hover:ring-zinc-900/25 dark:bg-white/7.5 dark:ring-white/15 dark:group-hover:bg-emerald-300/10 dark:group-hover:ring-emerald-400">
      <Icon className="h-5 w-5 fill-zinc-700/10 stroke-zinc-700 transition-colors duration-300 group-hover:stroke-zinc-900 dark:fill-white/10 dark:stroke-zinc-400 dark:group-hover:fill-emerald-300/10 dark:group-hover:stroke-emerald-400" />
    </div>
  )
}

function ResourcePattern({
  mouseX,
  mouseY,
  ...gridProps
}: Resource['pattern'] & {
  mouseX: MotionValue<number>
  mouseY: MotionValue<number>
}) {
  let maskImage = useMotionTemplate`radial-gradient(180px at ${mouseX}px ${mouseY}px, white, transparent)`
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
        className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#D7EDEA] to-[#F4FBDF] opacity-0 transition duration-300 group-hover:opacity-100 dark:from-[#202D2E] dark:to-[#303428]"
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

function Resource({ resource }: { resource: Resource }) {
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
      key={resource.href}
      onMouseMove={onMouseMove}
      className="group relative flex rounded-2xl bg-zinc-50 transition-shadow hover:shadow-md hover:shadow-zinc-900/5 dark:bg-white/2.5 dark:hover:shadow-black/5"
    >
      <ResourcePattern {...resource.pattern} mouseX={mouseX} mouseY={mouseY} />
      <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-zinc-900/7.5 group-hover:ring-zinc-900/10 dark:ring-white/10 dark:group-hover:ring-white/20" />
      <div className="relative rounded-2xl px-4 pb-4 pt-16">
        <ResourceIcon icon={resource.icon} />
        <h3 className="mt-4 text-sm font-semibold leading-7 text-zinc-900 dark:text-white">
          <Link href={resource.href}>
            <span className="absolute inset-0 rounded-2xl" />
            {resource.name}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {resource.description}
        </p>
      </div>
    </div>
  )
}

export function Resources() {
  return (
    <>
      <div className="my-16 xl:max-w-none">
        <Heading level={2} id="product-guide" anchor>
          Product Guide
        </Heading>
        <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 dark:border-white/5 sm:grid-cols-2 xl:grid-cols-4">
          {productResources.map((resource) => (
            <Resource key={resource.href} resource={resource} />
          ))}
        </div>
      </div>
      <div className="my-16 xl:max-w-none">
        <Heading level={2} id="developer-guide" anchor>
          Developer Guide
        </Heading>
        <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 dark:border-white/5 sm:grid-cols-2 xl:grid-cols-4">
          {developerResources.map((resource) => (
            <Resource key={resource.href} resource={resource} />
          ))}
        </div>
      </div>
    </>
  )
}
