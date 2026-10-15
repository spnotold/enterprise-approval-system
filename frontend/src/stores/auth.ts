import { defineStore } from 'pinia'
import { api } from '@/lib/api'
import type { Me } from '@/lib/types'
import router from '@/router'

// 会话代次：登录、退出、清空时递增。
// 进行中的刷新若代次已变则丢弃结果；旧会话发出的请求不会在新会话下被重放。
let generation = 0
export const sessionGeneration = () => generation
const bumpGeneration = () => {
  generation += 1
}

/** 刷新结果被丢弃（会话已切换）或身份不一致：调用方不应再清空当前会话 */
export class SessionChangedError extends Error {
  constructor(message = '登录状态已变化，请重新登录') {
    super(message)
    this.name = 'SessionChangedError'
  }
}

// 单飞刷新：40102 拦截器与 bootstrap 共用同一个进行中的刷新请求
let refreshPromise: Promise<void> | null = null

const AT_KEY = 'at'
const UID_KEY = 'uid'

function storedUserId(): number | null {
  const n = Number(sessionStorage.getItem(UID_KEY))
  return Number.isInteger(n) && n > 0 ? n : null
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // 访问令牌放 sessionStorage，关闭标签页即失效；刷新令牌在 HttpOnly Cookie 中，JS 读不到
    accessToken: sessionStorage.getItem(AT_KEY) as string | null,
    me: null as Me | null,
  }),
  getters: {
    isLoggedIn: (s) => !!s.accessToken,
    // 只决定菜单和按钮是否显示，真正的权限检查在后端
    can: (s) => (perm: string) => !!s.me?.permissions.includes(perm),
    hasRole: (s) => (role: string) => !!s.me?.roles.some((r) => r.code === role),
    isDeptHead: (s) => (s.me?.headDeptIds.length ?? 0) > 0,
  },
  actions: {
    async login(account: string, password: string) {
      bumpGeneration() // 丢弃进行中的旧会话刷新
      const r = await api.auth.login({ account, password })
      this.setToken(r.accessToken)
      this.setUserId(r.userId)
      this.me = await api.me.get()
      this.setUserId(this.me.id)
    },
    /** 用刷新 Cookie 换新的访问令牌；并发调用共享同一次请求 */
    refresh(): Promise<void> {
      refreshPromise ??= this.doRefresh().finally(() => {
        refreshPromise = null
      })
      return refreshPromise
    },
    async doRefresh() {
      const gen = generation
      // 多个标签页共用一个刷新 Cookie，但各自有访问令牌：带上本页认为的用户，服务端不一致时返回 40101 且不轮换
      const expected = this.me?.id ?? storedUserId()
      const r = await api.auth.refresh(expected != null ? { expectedUserId: expected } : {})
      if (gen !== generation) throw new SessionChangedError()
      if (expected != null && r.userId !== expected) {
        // 绝不以另一个身份重放原请求
        await this.clearAndRedirect()
        throw new SessionChangedError('登录身份已变化，请重新登录')
      }
      this.setToken(r.accessToken)
      this.setUserId(r.userId)
    },
    /** 页面首次加载：有令牌则拉取用户信息；没有则尝试用 Cookie 中的刷新令牌静默登录 */
    async bootstrap(): Promise<boolean> {
      try {
        if (!this.accessToken) await this.refresh()
        this.me = await api.me.get()
        this.setUserId(this.me.id)
        return true
      } catch {
        this.clearLocal()
        return false
      }
    },
    async reloadMe() {
      this.me = await api.me.get()
      this.setUserId(this.me.id)
    },
    setToken(t: string | null) {
      this.accessToken = t
      if (t) sessionStorage.setItem(AT_KEY, t)
      else sessionStorage.removeItem(AT_KEY)
    },
    setUserId(id: number | null | undefined) {
      if (id) sessionStorage.setItem(UID_KEY, String(id))
      else sessionStorage.removeItem(UID_KEY)
    },
    /** 清空本地登录状态（不跳转） */
    clearLocal() {
      bumpGeneration()
      this.setToken(null)
      this.setUserId(null)
      this.me = null
    },
    async logout() {
      bumpGeneration()
      // /auth/logout 为公开接口，按刷新 Cookie 认证；无论成功与否都清空本地状态
      await api.auth.logout().catch(() => {})
      this.clearLocal()
      await router.push('/login')
    },
    /** 令牌失效：清空本地状态并回到登录页（保留当前地址以便登录后返回） */
    async clearAndRedirect() {
      this.clearLocal()
      const current = router.currentRoute.value
      // 首次导航尚未完成时（matched 为空）由路由守卫负责跳转，避免在守卫中嵌套导航丢失 redirect
      if (!current.meta.public && current.matched.length > 0) {
        await router.push({ path: '/login', query: { redirect: current.fullPath } })
      }
    },
  },
})
