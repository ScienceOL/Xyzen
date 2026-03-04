import { NavGroup } from '@/@types/navigation'

// Navigation structure with translation keys
// Titles are resolved at render time via useTranslations('navigation')
const navigation: Array<NavGroup> = [
  {
    titleKey: 'overview',
    title: 'Overview',
    links: [
      { titleKey: 'introduction', title: 'Introduction', href: `/` },
      { titleKey: 'quickstart', title: 'Quickstart', href: `/quickstart` },
      { titleKey: 'philosophy', title: 'Philosophy', href: `/philosophy` },
      {
        titleKey: 'architecture',
        title: 'Architecture',
        href: `/architecture`,
      },
      { titleKey: 'roadmap', title: 'Roadmap', href: `/roadmap` },
    ],
  },
  {
    titleKey: 'product_guide',
    title: 'Product Guide',
    links: [
      { titleKey: 'agents', title: 'Agents', href: `/agents` },
      { titleKey: 'tools', title: 'Tools', href: `/tools` },
      { titleKey: 'skills', title: 'Skills', href: `/skills` },
      { titleKey: 'knowledge', title: 'Knowledge Bases', href: `/knowledge` },
      { titleKey: 'memory', title: 'Memory', href: `/memory` },
      { titleKey: 'mcp', title: 'MCP Servers', href: `/mcp` },
      { titleKey: 'sandbox', title: 'Sandbox', href: `/sandbox` },
      {
        titleKey: 'marketplace',
        title: 'Marketplace',
        href: `/marketplace`,
      },
      {
        titleKey: 'scheduled_tasks',
        title: 'Scheduled Tasks',
        href: `/scheduled-tasks`,
      },
      { titleKey: 'sharing', title: 'Sharing', href: `/sharing` },
    ],
  },
  {
    titleKey: 'developer_guide',
    title: 'Developer Guide',
    links: [
      { titleKey: 'deployment', title: 'Deployment', href: `/deployment` },
      {
        titleKey: 'configuration',
        title: 'Configuration',
        href: `/configuration`,
      },
      {
        titleKey: 'api_reference',
        title: 'API Reference',
        href: `/api-reference`,
      },
      {
        titleKey: 'frontend_integration',
        title: 'Frontend Integration',
        href: `/frontend-integration`,
      },
      {
        titleKey: 'custom_agents',
        title: 'Custom Agents',
        href: `/custom-agents`,
      },
      {
        titleKey: 'custom_tools',
        title: 'Custom Tools',
        href: `/custom-tools`,
      },
      {
        titleKey: 'contributing',
        title: 'Contributing',
        href: `/contributing`,
      },
    ],
  },
]

export default navigation
