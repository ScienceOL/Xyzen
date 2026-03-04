import { getLocale } from 'next-intl/server'

import En from './en.mdx'
import Zh from './zh.mdx'

export { metadata } from './en.mdx'

export default async function Page() {
  const locale = await getLocale()
  return locale === 'zh' ? <Zh /> : <En />
}
