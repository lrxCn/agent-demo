import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { loginApi } from '../api/modules/auth'
import { fetchUserById } from '../api/modules/user'
import type { AuthUserSummary, UserDetailPayload } from '../types'

const LS_ACCESS = 'access_token'
const LS_REFRESH = 'refresh_token'
const LS_USER = 'auth_user'

function collectPermissionsFromDetail(detail: UserDetailPayload): string[] {
  const set = new Set<string>()
  for (const role of detail.roles ?? []) {
    for (const p of role.permissions ?? []) {
      set.add(p.code)
    }
  }
  return [...set]
}

function persistUserSnapshot(u: AuthUserSummary | null): void {
  if (!u) {
    localStorage.removeItem(LS_USER)
    return
  }
  localStorage.setItem(LS_USER, JSON.stringify(u))
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const refreshToken = ref('')
  const user = ref<AuthUserSummary | null>(null)
  const initialized = ref(false)
  /** 本会话是否已与后端同步过用户信息（避免路由每次跳转都打 GET） */
  const profileSynced = ref(false)

  const permissions = computed(() => user.value?.permissions ?? [])

  const isLoggedIn = computed(() => Boolean(token.value && user.value))

  function hasPermission(code: string): boolean {
    const list = permissions.value
    if (list.includes('*')) {
      return true
    }
    return list.includes(code)
  }

  function initFromStorage(): void {
    token.value = localStorage.getItem(LS_ACCESS) ?? ''
    refreshToken.value = localStorage.getItem(LS_REFRESH) ?? ''
    const raw = localStorage.getItem(LS_USER)
    if (raw) {
      try {
        user.value = JSON.parse(raw) as AuthUserSummary
      } catch {
        user.value = null
      }
    }
    profileSynced.value = false
    initialized.value = true
  }

  async function login(username: string, password: string): Promise<void> {
    const data = await loginApi(username, password)
    token.value = data.access_token
    refreshToken.value = data.refresh_token
    user.value = data.user
    localStorage.setItem(LS_ACCESS, data.access_token)
    localStorage.setItem(LS_REFRESH, data.refresh_token)
    persistUserSnapshot(data.user)
    profileSynced.value = true
  }

  async function logout(): Promise<void> {
    token.value = ''
    refreshToken.value = ''
    user.value = null
    profileSynced.value = false
    localStorage.removeItem(LS_ACCESS)
    localStorage.removeItem(LS_REFRESH)
    localStorage.removeItem(LS_USER)
  }

  async function fetchUserInfo(): Promise<void> {
    if (profileSynced.value) {
      return
    }
    const uid = user.value?.id
    if (!uid || !token.value) {
      return
    }
    const detail = await fetchUserById(uid)
    const fromRoles = collectPermissionsFromDetail(detail)
    const nextPermissions = fromRoles.length > 0 ? fromRoles : (user.value?.permissions ?? [])
    const roleNames = (detail.roles ?? []).map((r) => r.name)
    const next: AuthUserSummary = {
      id: detail.id,
      username: detail.username,
      nickname: detail.nickname,
      roles: roleNames.length > 0 ? roleNames : (user.value?.roles ?? []),
      permissions: nextPermissions,
    }
    user.value = next
    persistUserSnapshot(next)
    profileSynced.value = true
  }

  return {
    token,
    refreshToken,
    user,
    initialized,
    profileSynced,
    permissions,
    isLoggedIn,
    hasPermission,
    initFromStorage,
    login,
    logout,
    fetchUserInfo,
  }
})
