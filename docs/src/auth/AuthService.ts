import { AuthServiceProps, UserProps } from '@/auth/auth-service'
import { IS_CLIENT } from '@/config'
import axios from 'axios'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

const TOKEN_KEY = 'access_token'

interface AuthProviderConfig {
  provider: string
  issuer?: string
  audience?: string
}

interface UserInfo {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
}

function mapUserInfo(info: UserInfo): UserProps {
  return {
    id: info.id,
    username: info.display_name || info.username || 'Unknown',
    avatar:
      info.avatar_url ||
      'https://storage.sciol.ac.cn/library/default_avatar.png',
  }
}

export const useAuthService = (): AuthServiceProps => {
  const router = useRouter()
  const [isLogged, setIsLogged] = useState(false)
  const [userInfo, setUserInfo] = useState<UserProps | null>(null)
  const didInit = useRef(false)

  // Exchange OAuth code for token
  const handleOAuthCallback = useCallback(async (): Promise<boolean> => {
    if (!IS_CLIENT) return false
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) return false

    const state = params.get('state')
    const storedState = sessionStorage.getItem('auth_state')
    if (state && storedState && state !== storedState) {
      console.error('[Auth] State mismatch during OAuth callback')
      window.history.replaceState({}, document.title, window.location.pathname)
      return false
    }

    // Clean URL immediately
    window.history.replaceState({}, document.title, window.location.pathname)
    sessionStorage.removeItem('auth_state')

    try {
      const res = await axios.post('/xyzen/api/v1/auth/login/casdoor', {
        code,
        state: state || undefined,
      })
      const { access_token, user_info } = res.data
      localStorage.setItem(TOKEN_KEY, access_token)
      const mapped = mapUserInfo(user_info)
      setUserInfo(mapped)
      setIsLogged(true)
      return true
    } catch (err) {
      console.error('[Auth] Failed to exchange code for token:', err)
      return false
    }
  }, [])

  // Validate existing token
  const validateToken = useCallback(async (): Promise<boolean> => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return false

    try {
      const res = await axios.post(
        '/xyzen/api/v1/auth/validate',
        undefined,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (res.data.success && res.data.user_info) {
        const mapped = mapUserInfo(res.data.user_info)
        setUserInfo(mapped)
        setIsLogged(true)
        return true
      }
    } catch (err) {
      console.error('[Auth] Token validation failed:', err)
      localStorage.removeItem(TOKEN_KEY)
    }
    return false
  }, [])

  // Auto-login on mount: check for OAuth callback, then existing token
  useEffect(() => {
    if (!IS_CLIENT || didInit.current) return
    didInit.current = true
    ;(async () => {
      const handled = await handleOAuthCallback()
      if (!handled) {
        await validateToken()
      }
    })()
  }, [handleOAuthCallback, validateToken])

  const checkIsLogged = useCallback(async () => {
    await validateToken()
  }, [validateToken])

  const initiateLogin = useCallback(async () => {
    try {
      // Check if auth is configured
      const statusRes = await axios.get('/xyzen/api/v1/auth/status')
      const { is_configured, provider } = statusRes.data
      if (!is_configured || !provider) {
        console.error('[Auth] Authentication is not configured')
        return
      }

      // Get provider config
      const configRes = await axios.get('/xyzen/api/v1/auth/config')
      const cfg: AuthProviderConfig = configRes.data

      if (provider === 'casdoor' && cfg.issuer) {
        const state = Math.random().toString(36).substring(7)
        sessionStorage.setItem('auth_state', state)

        const base = cfg.issuer.replace(/\/$/, '')
        const redirectUri = encodeURIComponent(
          `${window.location.origin}${window.location.pathname}`,
        )
        const audience = cfg.audience
          ? encodeURIComponent(cfg.audience)
          : ''

        const url = `${base}/login/oauth/authorize?client_id=${audience}&response_type=code&redirect_uri=${redirectUri}&scope=openid%20profile%20email&state=${state}`
        window.location.href = url
      } else {
        console.error(`[Auth] Unsupported auth provider: ${provider}`)
      }
    } catch (err) {
      console.error('[Auth] Failed to initiate login:', err)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setIsLogged(false)
    setUserInfo(null)
    router.refresh()
  }, [router])

  return {
    isLogged,
    userInfo,
    checkIsLogged,
    initiateLogin,
    logout,
  }
}
