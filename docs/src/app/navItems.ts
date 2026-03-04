import { BookOpenIcon } from '@heroicons/react/24/outline'

const navItems = [
  {
    name: 'Xyzen Docs',
    href: `/`,
    icon: BookOpenIcon,
    pattern: {
      y: 16,
      squares: [
        [0, 1],
        [1, 3],
      ],
    },
  },
]

export default navItems
