import { NavGroup } from '@/@types/navigation'

const navigation: Array<NavGroup> = [
  {
    title: 'Xyzen',
    links: [
      { title: '总览', href: `/` },
      { title: '快速开始', href: `/quickstart` },
      { title: '示例演示', href: `/demo` },
      { title: '路线图', href: `/roadmap` },
      { title: '架构', href: `/architecture` },
    ],
  },
  {
    title: '用户指南',
    links: [
      { title: '自定义 MCP 服务', href: `/mcp` },
      { title: '常见问题', href: `/faq` },
      { title: '高级功能', href: `/advanced` },
    ],
  },
  {
    title: '私有化部署',
    links: [
      { title: '部署使用', href: `/deploy/primary_deploy` },
      { title: '与前端项目集成', href: `/deploy/frontend_integration` },
      { title: '创建图 Agent', href: `/deploy/graph_agent` },
    ],
  },
  {
    title: 'Contribution',
    links: [
      { title: '贡献与开发', href: `/dev` },
      { title: 'UI 设计规范', href: `/design` },
    ],
  },
]

export default navigation
