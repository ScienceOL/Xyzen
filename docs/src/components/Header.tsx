/* eslint-disable @next/next/no-img-element */
import { type NavGroup } from '@/@types/navigation'
import { useAuthServiceContext } from '@/auth/AuthContext'
import { Button } from '@/components/Button'
import DropdownMenu from '@/components/DropdownMenu'
import { Logo } from '@/components/Logo'
import {
  MobileNavigation,
  useIsInsideMobileNavigation,
  useMobileNavigationStore,
} from '@/components/MobileNavigation'
import { MobileSearch, Search } from '@/components/Search'
import { ThemeToggle } from '@/components/ThemeToggle'
import { PrimarySite } from '@/config'
// Import icons
import { Menu } from '@headlessui/react'
import clsx from 'clsx'
import { motion, useScroll, useTransform } from 'framer-motion'
import Link from 'next/link'
import { forwardRef } from 'react'
import LangSwitch from './LangSwitch'

export const Header = forwardRef<
  React.ElementRef<'div'>,
  { className?: string; navigation: NavGroup[]; dropdownMenuPosition?: string }
>(function Header({ className, navigation, dropdownMenuPosition }, ref) {
  const { isLogged, userInfo, initiateLogin } = useAuthServiceContext()

  let { isOpen: mobileNavIsOpen } = useMobileNavigationStore()
  let isInsideMobileNavigation = useIsInsideMobileNavigation()

  let { scrollY } = useScroll()
  let bgOpacityLight = useTransform(scrollY, [0, 72], [0.5, 0.9])
  let bgOpacityDark = useTransform(scrollY, [0, 72], [0.2, 0.8])

  return (
    <motion.div
      ref={ref}
      className={clsx(
        className,
        'fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-12 px-4 transition sm:px-6 lg:left-72 lg:z-30 lg:px-8 xl:left-80',
        !isInsideMobileNavigation &&
          'backdrop-blur-sm dark:backdrop-blur lg:left-72 xl:left-80',
        isInsideMobileNavigation
          ? 'bg-white dark:bg-zinc-900'
          : 'bg-white/[var(--bg-opacity-light)] dark:bg-zinc-900/[var(--bg-opacity-dark)]',
      )}
      style={
        {
          '--bg-opacity-light': bgOpacityLight,
          '--bg-opacity-dark': bgOpacityDark,
        } as React.CSSProperties
      }
    >
      <div
        className={clsx(
          'absolute inset-x-0 top-full h-px transition',
          (isInsideMobileNavigation || !mobileNavIsOpen) &&
            'bg-zinc-900/7.5 dark:bg-white/7.5',
        )}
      />
      <Search navigation={navigation} />
      <div className="flex items-center gap-5 lg:hidden">
        <MobileNavigation navigation={navigation} />
        <Link href={`${PrimarySite}`} target="_blank" aria-label="Home">
          <Logo className="h-6" />
        </Link>
      </div>
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-4">
          <MobileSearch navigation={navigation} />
          <LangSwitch />
          <ThemeToggle />
        </div>
        <div className="hidden min-[416px]:contents">
          {isLogged ? (
            <DropdownMenu itemClassName={dropdownMenuPosition}>
              <Menu.Button
                className="-m-1.5 flex items-center rounded-md p-1 text-white
                 duration-300  ease-in-out hover:bg-zinc-100
                   dark:text-emerald-400 dark:ring-emerald-400/20    dark:hover:bg-emerald-400/10
                    dark:hover:text-emerald-300"
              >
                <span className="sr-only">Open user menu</span>
                <img
                  className=" h-5 w-5 rounded-full"
                  src={userInfo?.avatar}
                  alt="avatar"
                />
              </Menu.Button>
            </DropdownMenu>
          ) : (
            <Button onClick={() => initiateLogin()}>
              Sign in
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
})
