import { Button } from '@/components/Button'
import { Heading } from '@/components/Heading'

const guides = [
  {
    href: '/quickstart',
    name: 'Quickstart',
    description:
      'Get Xyzen running locally with Docker Compose and chat with your first AI agent in under 5 minutes.',
  },
  {
    href: '/agents',
    name: 'Agents',
    description:
      'Learn about ReAct, Deep Research, and custom agent types. Create and configure agents for your tasks.',
  },
  {
    href: '/tools',
    name: 'Tools',
    description:
      'Explore 40+ builtin tools for web search, code execution, knowledge management, and more.',
  },
  {
    href: '/deployment',
    name: 'Deployment',
    description:
      'Deploy Xyzen to production with Docker Compose or Kubernetes. Configure scaling and high availability.',
  },
]

export function Guides() {
  return (
    <div className="my-16 xl:max-w-none">
      <Heading level={2} id="getting-started" anchor>
        Getting Started
      </Heading>
      <div className="not-prose mt-4 grid grid-cols-1 gap-8 border-t border-zinc-900/5 pt-10 dark:border-white/5 sm:grid-cols-2 xl:grid-cols-4">
        {guides.map((guide) => (
          <div key={guide.href}>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              {guide.name}
            </h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {guide.description}
            </p>
            <p className="mt-4">
              <Button href={guide.href} variant="text" arrow="right">
                Read more
              </Button>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
