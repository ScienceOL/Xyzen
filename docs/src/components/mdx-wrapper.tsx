import { Feedback } from '@/components/Feedback'
import { Prose } from '@/components/Prose'

// Server Component wrapper for MDX pages to avoid passing dynamic route props
// like `searchParams` across a client boundary, which triggers Next.js 15
// sync dynamic API errors when MDX spreads page props by default.
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
