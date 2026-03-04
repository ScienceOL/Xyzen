import { Layout } from '@/components/Layout'
import glob from 'fast-glob'

import { type Section } from '@/components/SectionProvider'
import { type Metadata } from 'next'
import navigation from './navigation'

export const metadata: Metadata = {
  title: {
    template: '%s - Xyzen Docs',
    default: 'Xyzen Docs',
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let pages = await glob('**/*.mdx', { cwd: 'src/app/(cn)' })

  let allSectionsEntries = (await Promise.all(
    pages.map(async (filename) => [
      '/' + filename.replace(/(^|\/)page\.mdx$/, ''),
      (await import(`./${filename}`)).sections,
    ]),
  )) as Array<[string, Array<Section>]>

  let allSections = Object.fromEntries(allSectionsEntries)

  return (
    <div className="w-full">
      <Layout navigation={navigation} allSections={allSections}>
        {children}
      </Layout>
    </div>
  )
}
