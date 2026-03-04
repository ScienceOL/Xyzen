/**
 * Safe wrappers around Web Storage APIs that are no-ops on the server
 * or when a non-standard/broken global localStorage is present (e.g.,
 * Node started with an invalid --localstorage-file flag).
 */

type GetItem = (key: string) => string | null
type SetItem = (key: string, value: string) => void
type RemoveItem = (key: string) => void

function isBrowser() {
  return typeof window !== 'undefined'
}

function hasFunctional<K extends keyof Storage>(
  storage: Storage | undefined,
  method: K,
) {
  const fn = storage && (storage as any)[method]
  return typeof fn === 'function'
}

export const safeLocalStorage = {
  getItem: ((key: string) => {
    try {
      if (isBrowser() && hasFunctional(window.localStorage, 'getItem')) {
        return window.localStorage.getItem(key)
      }
    } catch {}
    return null
  }) as GetItem,
  setItem: ((key: string, value: string) => {
    try {
      if (isBrowser() && hasFunctional(window.localStorage, 'setItem')) {
        window.localStorage.setItem(key, value)
      }
    } catch {}
  }) as SetItem,
  removeItem: ((key: string) => {
    try {
      if (isBrowser() && hasFunctional(window.localStorage, 'removeItem')) {
        window.localStorage.removeItem(key)
      }
    } catch {}
  }) as RemoveItem,
}
