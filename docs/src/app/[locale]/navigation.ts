import { NavGroup } from '@/@types/navigation'

// Navigation structure with translation keys
// Titles are resolved at render time via useTranslations('navigation')
const navigation: Array<NavGroup> = [
  {
    titleKey: 'guides',
    title: 'Guides',
    links: [
      { titleKey: 'introduction', title: 'Introduction', href: `/` },
      { titleKey: 'quickstart', title: 'Quickstart', href: `/quickstart` },
      { titleKey: 'sdks', title: 'SDKs', href: `/sdks` },
      {
        titleKey: 'authentication',
        title: 'Authentication',
        href: `/authentication`,
      },
      { titleKey: 'pagination', title: 'Pagination', href: `/pagination` },
      { titleKey: 'errors', title: 'Errors', href: `/errors` },
      { titleKey: 'webhooks', title: 'Webhooks', href: `/webhooks` },
    ],
  },
  {
    titleKey: 'resources',
    title: 'Resources',
    links: [
      { titleKey: 'contacts', title: 'Contacts', href: `/contacts` },
      {
        titleKey: 'conversations',
        title: 'Conversations',
        href: `/conversations`,
      },
      { titleKey: 'messages', title: 'Messages', href: `/messages` },
      { titleKey: 'groups', title: 'Groups', href: `/groups` },
      { titleKey: 'attachments', title: 'Attachments', href: `/attachments` },
    ],
  },
]

export default navigation
