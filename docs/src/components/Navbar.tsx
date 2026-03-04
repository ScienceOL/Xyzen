'use client'

import navItems from '@/app/navItems'
import Link from 'next/link'

export default function Navbar() {
  return (
    <nav className="hidden md:block">
      <ul role="list" className="flex items-center gap-8">
        {navItems.map((item) => (
          <li key={item.name}>
            <Link
              href={item.href}
              className="px-1 py-2 text-xs font-medium leading-5 text-zinc-600 transition hover:text-teal-600 dark:text-zinc-300 dark:hover:text-teal-400"
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
