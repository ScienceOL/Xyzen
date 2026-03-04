'use client'
import { NavGroup } from '@/@types/navigation'
import { useAuthServiceContext } from '@/auth/AuthContext'
import clsx from 'clsx'
import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import { Link, usePathname } from '@/i18n/navigation'
import { useRef } from 'react'

import { Button } from '@/components/Button'
import { useIsInsideMobileNavigation } from '@/components/MobileNavigation'
import { type Section, useSectionStore } from '@/components/SectionProvider'
import { Tag } from '@/components/Tag'
import { remToPx } from '@/lib/remToPx'
import { PrimarySite } from '@/config'

// 将平铺的 sections 转换为嵌套的树形结构
function buildSectionTree(sections: Section[]): Section[] {
  const tree: Section[] = []
  const stack: Section[] = []

  sections.forEach((section) => {
    const newSection = { ...section }
    const level = section.level || 2

    // 移除所有比当前级别高或相等的节点
    while (stack.length > 0 && (stack[stack.length - 1].level || 2) >= level) {
      stack.pop()
    }

    if (stack.length === 0) {
      // 顶级节点 (h2)
      tree.push(newSection)
    } else {
      // 子节点
      const parent = stack[stack.length - 1]
      if (!parent.children) {
        parent.children = []
      }
      parent.children.push(newSection)
    }

    stack.push(newSection)
  })

  return tree
}

// 递归渲染 section 及其子级
function renderSectionTree(
  sections: Section[],
  linkHref: string,
): React.ReactNode {
  return sections.map((section) => (
    <li key={section.id}>
      <NavLink
        href={`${linkHref}#${section.id}`}
        tag={section.tag}
        isAnchorLink
        level={section.level || 2}
      >
        {section.title}
      </NavLink>
      {section.children && section.children.length > 0 && (
        <ul role="list" className="mt-1">
          {renderSectionTree(section.children, linkHref)}
        </ul>
      )}
    </li>
  ))
}

function useInitialValue<T>(value: T, condition = true) {
  let initialValue = useRef(value).current
  return condition ? initialValue : value
}

function TopLevelNavItem({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <li className="md:hidden">
      <Link
        href={href}
        className="block py-1 text-sm text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      >
        {children}
      </Link>
    </li>
  )
}

function NavLink({
  href,
  children,
  tag,
  active = false,
  isAnchorLink = false,
  level = 2,
}: {
  href: string
  children: React.ReactNode
  tag?: string
  active?: boolean
  isAnchorLink?: boolean
  level?: number
}) {
  // 根据层级计算缩进
  const getPaddingLeft = () => {
    if (!isAnchorLink) return 'pl-4'
    if (level === 2) return 'pl-7'
    if (level === 3) return 'pl-10'
    if (level === 4) return 'pl-14'
    return 'pl-7'
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={clsx(
        'flex justify-between gap-2 py-1 pr-3 text-sm transition',
        getPaddingLeft(),
        active
          ? 'text-zinc-900 dark:text-white'
          : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white',
      )}
    >
      <span className="truncate">{children}</span>
      {tag && (
        <Tag variant="small" color="zinc">
          {tag}
        </Tag>
      )}
    </Link>
  )
}

function VisibleSectionHighlight({
  group,
  pathname,
}: {
  group: NavGroup
  pathname: string
}) {
  let [sections, visibleSections] = useInitialValue(
    [
      useSectionStore((s) => s.sections),
      useSectionStore((s) => s.visibleSections),
    ],
    useIsInsideMobileNavigation(),
  )

  let isPresent = useIsPresent()
  let firstVisibleSectionIndex = Math.max(
    0,
    [{ id: '_top' }, ...sections].findIndex(
      (section) => section.id === visibleSections[0],
    ),
  )
  let itemHeight = remToPx(2)
  let height = isPresent
    ? Math.max(1, visibleSections.length) * itemHeight
    : itemHeight
  let top =
    group.links.findIndex((link) => link.href === pathname) * itemHeight +
    firstVisibleSectionIndex * itemHeight

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.2 } }}
      exit={{ opacity: 0 }}
      className="absolute inset-x-0 top-0 bg-black/2.5 will-change-transform dark:bg-white/2.5"
      style={{ borderRadius: 8, height, top }}
    />
  )
}

function ActivePageMarker({
  group,
  pathname,
}: {
  group: NavGroup
  pathname: string
}) {
  let itemHeight = remToPx(2)
  let offset = remToPx(0.25)
  let activePageIndex = group.links.findIndex((link) => link.href === pathname)
  let top = offset + activePageIndex * itemHeight

  return (
    <motion.div
      layout
      className="absolute left-2 h-6 w-px bg-emerald-500"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.2 } }}
      exit={{ opacity: 0 }}
      style={{ top }}
    />
  )
}

function NavigationGroup({
  group,
  className,
}: {
  group: NavGroup
  className?: string
}) {

  // If this is the mobile navigation then we always render the initial
  // state, so that the state does not change during the close animation.
  // The state will still update when we re-open (re-render) the navigation.
  let isInsideMobileNavigation = useIsInsideMobileNavigation()
  let pathname = useInitialValue(usePathname(), isInsideMobileNavigation)
  // Don't freeze sections - they need to update when the page loads
  let sections = useSectionStore((s) => s.sections)

  // 添加调试日志（同时支持开发和生产环境）
  if (typeof window !== 'undefined') {
    console.log('[Navigation Debug]', {
      pathname,
      sectionsCount: sections.length,
      sections: sections.map(s => ({ title: s.title, level: s.level, id: s.id }))
    })
  }

  // 构建树形结构
  const sectionTree = buildSectionTree(sections)

  // 调试树形结构
  if (typeof window !== 'undefined') {
    console.log('[Navigation Tree]', sectionTree)
  }

  let isActiveGroup =
    group.links.findIndex((link) => link.href === pathname) !== -1

  return (
    <li className={clsx('relative mt-6', className)}>
      <motion.h2
        layout="position"
        className="text-xs font-semibold text-zinc-900 dark:text-white"
      >
        {group.title}
      </motion.h2>
      <div className="relative mt-3 pl-2">
        <AnimatePresence initial={!isInsideMobileNavigation}>
          {isActiveGroup && (
            <VisibleSectionHighlight group={group} pathname={pathname} />
          )}
        </AnimatePresence>
        <motion.div
          layout
          className="absolute inset-y-0 left-2 w-px bg-zinc-900/10 dark:bg-white/5"
        />
        <AnimatePresence initial={false}>
          {isActiveGroup && (
            <ActivePageMarker group={group} pathname={pathname} />
          )}
        </AnimatePresence>
        <ul role="list" className="border-l border-transparent">
          {group.links.map((link) => (
            <motion.li key={link.href} layout="position" className="relative">
              <NavLink href={link.href} active={link.href === pathname}>
                {link.title}
              </NavLink>
              <AnimatePresence mode="popLayout" initial={false}>
                {link.href === pathname && sectionTree.length > 0 && (
                  <motion.ul
                    role="list"
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      transition: { delay: 0.1 },
                    }}
                    exit={{
                      opacity: 0,
                      transition: { duration: 0.15 },
                    }}
                  >
                    {renderSectionTree(sectionTree, link.href)}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </ul>
      </div>
    </li>
  )
}

interface NavigationProps extends React.ComponentPropsWithoutRef<'nav'> {
  navigation: NavGroup[]
}

// Mobile Navigation
export function Navigation({ navigation, ...props }: NavigationProps) {
  const { isLogged, userInfo, checkIsLogged } = useAuthServiceContext()

  return (
    <nav {...props}>
      <ul role="list">
        {navigation.map((group, groupIndex) => (
          <NavigationGroup
            key={group.title}
            group={group}
            className={groupIndex === 0 ? 'md:mt-0' : ''}
          />
        ))}
        {isLogged ? (
          ''
        ) : (
          <li className="sticky bottom-0 z-10 mt-6 min-[416px]:hidden">
            <Button
              href={`${PrimarySite}/login`}
              variant="filled"
              className="w-full"
            >
              Sign in
            </Button>
          </li>
        )}
      </ul>
    </nav>
  )
}
