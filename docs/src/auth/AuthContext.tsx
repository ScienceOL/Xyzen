import React, { createContext, useContext } from 'react'
import { AuthServiceProps } from './auth-service'
import { useAuthService } from './AuthService'

// 这里是创建了一个全局的 React Context 对象，存储当前用户的登录状态和登录信息。
// AuthServiceProps 是一个类型，用来定义 AuthServiceContext 的所有量的类型。
const AuthServiceContext = createContext<AuthServiceProps | null>(null)

export const AuthServiceProvider = (props: React.PropsWithChildren<{}>) => {
  // 这里定义了 AuthServiceContext 的 Provider，用于在全局范围内提供登录服务。
  // 使用了 AuthServiceContext 的 Provider 其实使用的是它的返回值。
  // 所以将 useAuthService() 的返回值传递给了 AuthServiceContext。
  // 那么在全局范围内，只要在这个 Provider 内部，其实就可以获取到 useAuthService() 中定义的所有功能。
  const authService = useAuthService()
  return (
    <AuthServiceContext.Provider value={authService}>
      {props.children}
    </AuthServiceContext.Provider>
  )
}

export const useAuthServiceContext = () => {
  // 最后为了在使用 AuthServiceContext 的 Provider，定义了一个 Hook
  // 这个 Hook 使用 useContext() 来获取 AuthServiceContext 的值。
  // 也就是上面定义的 authService，即 useAuthService() 的所有功能。
  // 所以，调用这个 Hook，其实本质上就是调用 useAuthService()
  // 中间加的这些过程，只是为了在全局范围内提供登录服务。
  const context = useContext(AuthServiceContext)
  if (!context) {
    throw new Error(
      'useAuthServiceContext must be used within a AuthServiceProvider',
    )
  }
  return context
}

export default AuthServiceContext
