import { createStore, useStore } from 'zustand'
import { createJSONStorage, persist, subscribeWithSelector, type StateStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { AuthTokens } from '../routes/settings/provider/chatbox-ai/-components/types'
import platform from '@/platform'
import { getSecureValue, removeSecureValue, setSecureValue } from '@/platform/mobile_secure_storage'

interface AuthTokensState {
  accessToken: string | null
  refreshToken: string | null
}

interface AuthTokensActions {
  setTokens: (tokens: AuthTokens) => void
  clearTokens: () => void
  getTokens: () => AuthTokens | null
}

const initialState: AuthTokensState = {
  accessToken: null,
  refreshToken: null,
}

const AUTH_TOKENS_KEY = 'chatbox.auth.tokens'
const authStorage: StateStorage = {
  async getItem(name) {
    if (platform.type === 'mobile') {
      const secureValue = await getSecureValue(AUTH_TOKENS_KEY)
      if (secureValue !== null) return secureValue

      // Migrate tokens written by older mobile builds that used localStorage.
      try {
        const legacyValue = localStorage.getItem(name)
        if (legacyValue !== null) {
          await setSecureValue(AUTH_TOKENS_KEY, legacyValue)
          localStorage.removeItem(name)
        }
        return legacyValue
      } catch {
        return null
      }
    }
    return localStorage.getItem(name)
  },
  async setItem(name, value) {
    if (platform.type === 'mobile') {
      await setSecureValue(AUTH_TOKENS_KEY, value)
      return
    }
    localStorage.setItem(name, value)
  },
  async removeItem(name) {
    if (platform.type === 'mobile') {
      await removeSecureValue(AUTH_TOKENS_KEY)
      return
    }
    localStorage.removeItem(name)
  },
}

export const authInfoStore = createStore<AuthTokensState & AuthTokensActions>()(
  subscribeWithSelector(
    persist(
      immer((set, get) => ({
        ...initialState,

        setTokens: (tokens: AuthTokens) => {
          set((state) => {
            state.accessToken = tokens.accessToken
            state.refreshToken = tokens.refreshToken
          })
        },

        clearTokens: () => {
          set((state) => {
            state.accessToken = null
            state.refreshToken = null
          })
        },

        getTokens: () => {
          const state = get()
          if (state.accessToken && state.refreshToken) {
            return {
              accessToken: state.accessToken,
              refreshToken: state.refreshToken,
            }
          }
          return null
        },
      })),
      {
        name: 'chatbox-ai-auth-info',
        version: 0,
        storage: createJSONStorage(() => authStorage),
        partialize: (state) => ({
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
        }),
      }
    )
  )
)

export function useAuthInfoStore<U>(selector: Parameters<typeof useStore<typeof authInfoStore, U>>[1]) {
  return useStore<typeof authInfoStore, U>(authInfoStore, selector)
}

export const useAuthTokens = () => {
  return useAuthInfoStore((state) => ({
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    setTokens: state.setTokens,
    clearTokens: state.clearTokens,
    getTokens: state.getTokens,
  }))
}
