export interface UserProps {
  id: string
  username: string
  avatar: string
}

export interface AuthServiceProps {
  isLogged: boolean
  userInfo: UserProps | null
  checkIsLogged: () => Promise<void>
  initiateLogin: () => Promise<void>
  logout: () => void
}
