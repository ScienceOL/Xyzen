import { AuthServiceProps, UserProps } from '@/auth/auth-service'
import { BASE_URL, IS_CLIENT } from '@/config'
import { safeLocalStorage } from '@/lib/storage'
import axios from 'axios'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
export const useAuthService = (): AuthServiceProps => {
  const router = useRouter()
  const [isLogged, setIsLogged] = useState<boolean>(false)

  const [userInfo, setUserInfo] = useState<UserProps | null>({} as UserProps)

  useEffect(() => {
    if (IS_CLIENT) {
      const userInfo = safeLocalStorage.getItem('userInfo')
      if (userInfo) {
        setUserInfo(JSON.parse(userInfo))
      }
    }
  }, [])

  const checkIsLogged = async () => {
    /**
     * Checks if the user is logged in.
     * If the user is logged in, it sets the `isLogged` state to true and updates the `userInfo`.
     * If the user is not logged in, it sets the `isLogged` state to false.
     * If there is an error during the process, it also sets the `isLogged` state to false.
     */
    try {
      const res = await axios.get(`${BASE_URL}/accounts/`, {
        withCredentials: true,
      })
      if (res.status === 200) {
        setIsLogged(true)
        setUserInfo(res.data)
        if (IS_CLIENT) {
          safeLocalStorage.setItem('userInfo', JSON.stringify(res.data))
        }
      }
    } catch (error: any) {
      const originalRequest = error.config // 获取请求对象
      if (error.response?.status === 401 || error.response?.status === 403) {
        axios.defaults.withCredentials = true
        // 使用 refresh token 获取新的 token
        try {
          const res = await axios.post(`${BASE_URL}/token/refresh/`)
          if (res.status === 200) {
            setIsLogged(true)
          } else {
            setIsLogged(false)
          }
        } catch (refreshError) {
          setIsLogged(false)
        }
      } else {
        setIsLogged(false)
      }
    }
  }

  const emailEval = async (email: string, motive: 'register' | 'forget') => {
    const lowerEmail = email.toLowerCase()
    try {
      const response = await axios.post(`${BASE_URL}/account/email_eval/`, {
        email: lowerEmail,
        motive,
      })
      // console.log(response.data)
      return response
    } catch (error: any) {
      console.error(error)
      return error
    }
  }

  const register = async (
    email: string,
    username: string,
    password: string,
    captcha: string,
    captcha_id: number,
  ) => {
    const lowerEmail = email.toLowerCase()
    try {
      const response = await axios.post(`${BASE_URL}/account/register/`, {
        email: lowerEmail,
        username,
        password,
        captcha,
        captcha_id,
      })

      return response
    } catch (error: any) {
      console.error(error)
      return error
    }
  }

  const resetPassword = async (
    email: string,
    password: string,
    captcha: string,
  ) => {
    const lowerEmail = email.toLowerCase()
    try {
      const response = await axios.post(`${BASE_URL}/account/forget/`, {
        email: lowerEmail,
        password,
        captcha,
      })

      if (response.status === 200) {
        await login(email, password).then((res) => {
          if (res.status === 200) {
            setIsLogged(true)
          } else {
            setIsLogged(false)
          }
        })
      }
      return response
    } catch (error: any) {
      console.error(error)
      return error
    }
  }

  const login = async (email: string, password: string) => {
    const lowerEmail = email.toLowerCase()
    try {
      const res = await axios.post(
        `${BASE_URL}/token/`,
        {
          email: lowerEmail,
          password,
        },
        {
          withCredentials: true,
        },
      )
      if (res.status === 200) {
        await checkIsLogged()
      }
      // await getUserDetails();
      return res
    } catch (error: any) {
      console.error(error)
      setIsLogged(false)
      return error
    }
  }

  const refreshAccessToken = async () => {
    try {
      await axios.post(
        `${BASE_URL}/token/refresh/`,
        {},
        { withCredentials: true },
      )
    } catch (refreshError) {
      return Promise.reject(refreshError)
    }
  }

  const logout = async () => {
    try {
      const res = await axios.post(
        `${BASE_URL}/account/logout/`,
        {},
        { withCredentials: true },
      )
    } catch (error: any) {
      const originalRequest = error.config // 获取请求对象
      if (error.response?.status === 401 || error.response?.status === 403) {
        axios.defaults.withCredentials = true
        // 使用 refresh token 获取新的 token
        try {
          const res = await axios.post(`${BASE_URL}/token/refresh/`)
          if (res.status === 200) {
            return axios(originalRequest)
          } else {
            setIsLogged(false)
          }
        } catch (refreshError) {
          setIsLogged(false)
        }
      }
    } finally {
      setIsLogged(false)

      setUserInfo({} as UserProps)
      if (IS_CLIENT) {
        safeLocalStorage.removeItem('userInfo')
      }
      router.refresh()
    }
  }

  return {
    checkIsLogged,
    login,
    register,
    emailEval,
    logout,
    resetPassword,
    isLogged,
    setUserInfo,
    userInfo,
    refreshAccessToken,
  }
}
