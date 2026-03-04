'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import clsx from 'clsx'

const localeLabels: Record<string, string> = {
  zh: '中文',
  en: 'EN',
}

function LangSwitch({ className }: { className?: string }) {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()

  function handleSwitch(target: string) {
    if (target !== locale) {
      router.replace(pathname, { locale: target })
    }
  }

  return (
    <div
      className={clsx(
        'inline-flex items-center rounded-full bg-zinc-100 p-0.5 dark:bg-white/10',
        className,
      )}
    >
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          aria-label={`Switch to ${l}`}
          onClick={() => handleSwitch(l)}
          className={clsx(
            'rounded-full px-2.5 py-0.5 text-xs font-medium transition-all',
            l === locale
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-emerald-500/20 dark:text-emerald-400'
              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
          )}
        >
          {localeLabels[l] ?? l}
        </button>
      ))}
    </div>
  )
}

export default LangSwitch
