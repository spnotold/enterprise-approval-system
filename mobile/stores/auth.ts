// 认证状态：访问令牌、刷新令牌、当前用户。
// 移动端登录与刷新都带 X-Client: mobile，刷新令牌在响应体中返回（Web 端在 HttpOnly Cookie 中）。
// 令牌存储：H5 sessionStorage；小程序 uni.setStorageSync（见 utils/storage.ts）。

import { reactive } from 'vue'
import { api } from '@/lib/api'
import { setAuthHooks } from '@/lib/http'
import { CLIENT_HEADERS } from '@/lib/config'
import type { Me } from '@/lib/types'
import { getItem, setItem } from '@/utils/storage'
import { currentUrl, goLogin, LOGIN_PAGE } from '@/utils/nav'

const AT_KEY = 'eas_at'
const RT_KEY = 'eas_rt'
const UID_KEY = 'eas_uid'

function storedUserId(): number | null {
  const v = Number(getItem(UID_KEY))
  return Number.isInteger(v) && v > 0 ? v : null
}

const state = reactive({
  accessToken: getItem(AT_KEY),
  refreshToken: getItem(RT_KEY),
  /** 令牌所属用户；刷新时作为 expectedUserId 发送，防止令牌串号 */
  userId: storedUserId(),
  me: null as Me | null,
})

// 会话代次：开始登录、登录成功与清空时递增，丢弃旧会话的晚到响应。
let generation = 0
export const sessionGeneration = () => generation

export class SessionChangedError extends Error {
  constructor() {
    super('登录状态已变化，请重新登录')
    Object.setPrototypeOf(this, SessionChangedError.prototype)
    this.name = 'SessionChangedError'
  }
}

let meLoading: Promise<Me | null> | null = null
const logoutListeners: (() => void)[] = []
const loginListeners: (() => void)[] = []

function setTokens(at: string | null, rt: string | null): void {
  state.accessToken = at
  state.refreshToken = rt
  setItem(AT_KEY, at)
  setItem(RT_KEY, rt)
}

function setUserId(id: number | null): void {
  state.userId = id
  setItem(UID_KEY, id === null ? null : String(id))
}

function clearLocal(): void {
  generation++
  setTokens(null, null)
  setUserId(null)
  state.me = null
  meLoading = null
  logoutListeners.forEach((fn) => fn())
}

function onLoginPage(): boolean {
  const url = currentUrl()
  return url.startsWith(LOGIN_PAGE) || url.startsWith('/pages/register/')
}

let redirecting = false

export const auth = {
  state,

  get isLoggedIn(): boolean {
    return !!state.accessToken
  },

  /** 只决定入口和按钮是否显示，真正的权限检查在后端 */
  can(perm: string): boolean {
    return !!state.me?.permissions.includes(perm)
  },

  hasRole(role: string): boolean {
    return !!state.me?.roles.some((r) => r.code === role)
  },

  get isDeptHead(): boolean {
    return (state.me?.headDeptIds.length ?? 0) > 0
  },

  /** 只有系统管理员角色：移动端不提供管理功能，提示去 Web 端 */
  get isAdminOnly(): boolean {
    const me = state.me
    if (!me) return false
    return me.roles.length > 0 && me.roles.every((r) => r.code === 'SYS_ADMIN')
  },

  onLogin(fn: () => void): void {
    loginListeners.push(fn)
  },

  onLogout(fn: () => void): void {
    logoutListeners.push(fn)
  },

  async login(account: string, password: string): Promise<Me> {
    const gen = ++generation
    const r = await api.auth.login({ account, password }, CLIENT_HEADERS)
    if (gen !== generation) throw new SessionChangedError()
    const loginGen = ++generation
    state.me = null
    meLoading = null
    setTokens(r.accessToken, r.refreshToken ?? null)
    setUserId(r.userId ?? null)
    redirecting = false
    const me = await api.me.get()
    if (loginGen !== generation) throw new SessionChangedError()
    state.me = me
    setUserId(me.id)
    loginListeners.forEach((fn) => fn())
    return me
  },

  /**
   * 用刷新令牌换新的访问令牌（由 lib/http.ts 的 refreshOnce 单飞调用）。
   * 刷新令牌每次使用后轮换，保存响应中的新令牌；返回的用户与本地记录不一致时视为失败。
   */
  async refresh(): Promise<void> {
    const gen = generation
    const rt = state.refreshToken
    if (!rt) throw new Error('没有刷新令牌')
    const expected = state.me?.id ?? state.userId
    const r = await api.auth.refresh({ refreshToken: rt, expectedUserId: expected }, CLIENT_HEADERS)
    if (gen !== generation) throw new SessionChangedError()
    if (expected !== null && r.userId !== undefined && r.userId !== null && r.userId !== expected) {
      throw new Error('刷新令牌与当前用户不一致')
    }
    setTokens(r.accessToken, r.refreshToken ?? rt)
    if (r.userId) setUserId(r.userId)
  },

  /** 有令牌时拉取当前用户（多处同时调用只请求一次）；未登录返回 null */
  ensureMe(): Promise<Me | null> {
    if (!state.accessToken) return Promise.resolve(null)
    if (state.me) return Promise.resolve(state.me)
    if (!meLoading) {
      const gen = generation
      const loading = api.me
        .get()
        .then((me) => {
          if (gen !== generation) return null
          state.me = me
          setUserId(me.id)
          return me
        })
        .catch(() => null)
        .finally(() => {
          if (meLoading === loading) meLoading = null
        })
      meLoading = loading
    }
    return meLoading
  },

  async reloadMe(): Promise<void> {
    const gen = generation
    const me = await api.me.get()
    if (gen !== generation) throw new SessionChangedError()
    state.me = me
  },

  setMe(me: Me): void {
    state.me = me
  },

  /** /auth/logout 以请求体中的刷新令牌认证，访问令牌过期也能调用；无论结果如何都清空本地状态 */
  async logout(): Promise<void> {
    const rt = state.refreshToken
    clearLocal()
    const gen = generation
    if (rt) await api.auth.logout(rt).catch(() => {})
    if (gen !== generation) return
    uni.reLaunch({ url: LOGIN_PAGE })
  },

  /** 修改密码等场景：服务端已撤销全部令牌，只清本地状态 */
  clearLocal,

  /** 令牌失效：清空本地状态并回到登录页（保留当前地址以便登录后返回） */
  clearAndRedirect(): void {
    if (redirecting) return
    redirecting = true
    const back = currentUrl()
    clearLocal()
    if (!onLoginPage()) goLogin(back || undefined)
    setTimeout(() => (redirecting = false), 1500)
  },
}

setAuthHooks({
  getAccessToken: () => state.accessToken,
  sessionGeneration,
  refresh: () => auth.refresh(),
  onAuthFailure: () => auth.clearAndRedirect(),
})

/**
 * 受保护页面在 onLoad 中调用：未登录时跳转登录页并返回 false。
 * 已登录时等待当前用户信息加载完成。
 */
export async function requireLogin(): Promise<boolean> {
  if (!state.accessToken) {
    goLogin(currentUrl() || undefined)
    return false
  }
  await auth.ensureMe()
  // 拉取用户信息失败（如网络异常）时仍允许页面加载自己的数据，由页面显示错误
  return !!state.accessToken
}
