import * as mdxClientComponents from '@/components/mdx'
import { wrapper as ServerWrapper } from '@/components/mdx-wrapper'
import { type MDXComponents } from 'mdx/types'

export function useMDXComponents(components: MDXComponents) {
  return {
    ...components,
    ...mdxClientComponents,
    // Override wrapper with server component to avoid passing dynamic route props
    wrapper: ServerWrapper,
  }
}
