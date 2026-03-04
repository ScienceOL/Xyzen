import { useAuthServiceContext } from '@/auth/AuthContext'
import { Menu, Transition } from '@headlessui/react'
import { PowerIcon } from '@heroicons/react/24/outline'
import { Fragment } from 'react'

interface DropdownMenuProps {
  children: React.ReactNode
  itemClassName?: string
}

export function DropdownMenu({ children, itemClassName }: DropdownMenuProps) {
  const { logout, userInfo } = useAuthServiceContext()

  return (
    <Menu as="div" className="flex justify-end">
      {children}
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items
          className={`font-xs origin-top-center absolute top-full z-50 -mr-1 w-fit divide-y divide-gray-200 rounded-md bg-white py-1 shadow ring-1 ring-neutral-900/5 focus:outline-none dark:divide-gray-700 dark:border-neutral-700 dark:bg-neutral-800 dark:shadow-neutral-600/50 dark:ring-neutral-50/5 lg:py-2 ${itemClassName || ''}`}
        >
          {userInfo?.username && (
            <div className="px-3 py-2 text-sm text-neutral-500 dark:text-neutral-400">
              {userInfo.username}
            </div>
          )}
          <div className="p-2 pb-0">
            <Menu.Item>
              {({ active }) => (
                <button
                  onClick={() => logout()}
                  className={`${active ? 'bg-neutral-50 dark:bg-neutral-900' : ''} flex w-full items-center px-3 py-1 text-sm leading-6 text-red-900 dark:text-red-100`}
                >
                  <div className="mr-2 h-4 w-4">
                    <PowerIcon />
                  </div>
                  Sign out
                </button>
              )}
            </Menu.Item>
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  )
}
export default DropdownMenu
