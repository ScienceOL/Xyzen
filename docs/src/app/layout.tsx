import '@/styles/tailwind.css'
import { type Metadata } from 'next'
import { Providers } from './providers'

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:32235',
  ),
  title: {
    template: '%s - Protocol API',
    default: 'Protocol API',
  },
  icons: [
    { rel: 'icon', url: '/@brand/logo/Logo.png' },
    {
      rel: 'icon',
      media: '(prefers-color-scheme: dark)',
      url: '/@brand/logo/Logo-Dark.png',
    },
    { rel: 'apple-touch-icon', url: '/@brand/logo/Logo.png' },
    {
      rel: 'apple-touch-icon',
      media: '(prefers-color-scheme: dark)',
      url: '/@brand/logo/Logo-Dark.png',
    },
  ],
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html className="h-full" suppressHydrationWarning>
      <body className="flex min-h-full bg-white antialiased dark:bg-zinc-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
