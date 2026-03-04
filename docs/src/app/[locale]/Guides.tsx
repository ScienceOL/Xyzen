import { Button } from '@/components/Button'
import { Heading } from '@/components/Heading'

const guides = [
  {
    href: '/quickstart',
    name: 'Quickstart',
    description:
      'Learn how to get Protocol set up in your project in under thirty minutes or it is free.',
  },
  {
    href: '/sdks',
    name: 'SDKs',
    description:
      'Install one of our official SDKs in your favorite programming language and start making API calls.',
  },
  {
    href: '/authentication',
    name: 'Authentication',
    description:
      'Learn how to authenticate your API requests with our powerful token-based system.',
  },
  {
    href: '/pagination',
    name: 'Pagination',
    description:
      'Understand how to work with paginated responses and navigate through large data sets.',
  },
]

export function Guides() {
  return (
    <div className="my-16 xl:max-w-none">
      <Heading level={2} id="guides" anchor>
        Guides
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
