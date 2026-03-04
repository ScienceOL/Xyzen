import { Layout } from '@/components/Layout'
import { routing } from '@/i18n/routing'
import glob from 'fast-glob'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { type Section } from '@/components/SectionProvider'
import { type Metadata } from 'next'
import navigation from './navigation'

export const metadata: Metadata = {
  title: {
    template: '%s - Xyzen Docs',
    default: 'Xyzen Docs',
  },
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = await getMessages()

  let pages = await glob('**/en.mdx', { cwd: 'src/app/[locale]' })

  let allSectionsEntries = (await Promise.all(
    pages.map(async (filename) => [
      '/' + filename.replace(/(^|\/)en\.mdx$/, ''),
      (await import(`./${filename}`)).sections,
    ]),
  )) as Array<[string, Array<Section>]>

  let allSections = Object.fromEntries(allSectionsEntries)

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="w-full">
        <Layout
          navigation={navigation}
          allSections={allSections}
          locale={locale}
        >
          {children}
        </Layout>
      </div>
    </NextIntlClientProvider>
  )
}
