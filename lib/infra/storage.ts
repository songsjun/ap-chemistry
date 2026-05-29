const USER_ID_KEY = 'ap_chem_user_id'
const API_KEY_KEY = 'ap_chem_api_key'
const THEME_KEY = 'ap_chem_theme'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ThemePreference = 'light' | 'dark' | 'system'

export const StorageService = {
  userId: {
    get(): string | null {
      if (typeof window === 'undefined') return null
      const v = localStorage.getItem(USER_ID_KEY)
      return v && UUID_RE.test(v) ? v : null
    },
    init(): string {
      const existing = localStorage.getItem(USER_ID_KEY)
      if (existing && UUID_RE.test(existing)) return existing
      const id = crypto.randomUUID()
      localStorage.setItem(USER_ID_KEY, id)
      return id
    },
  },
  apiKey: {
    get(): string | null {
      if (typeof window === 'undefined') return null
      return localStorage.getItem(API_KEY_KEY)
    },
    save(key: string): void {
      localStorage.setItem(API_KEY_KEY, key)
    },
    clear(): void {
      localStorage.removeItem(API_KEY_KEY)
    },
  },
  theme: {
    get(): ThemePreference {
      if (typeof window === 'undefined') return 'system'
      const v = localStorage.getItem(THEME_KEY)
      if (v === 'light' || v === 'dark' || v === 'system') return v
      return 'system'
    },
    save(t: ThemePreference): void {
      localStorage.setItem(THEME_KEY, t)
    },
  },
}
