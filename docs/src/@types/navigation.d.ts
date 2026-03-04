export interface NavGroup {
  title: string
  titleKey?: string
  links: Array<{
    title: string
    titleKey?: string
    href: string
  }>
}
