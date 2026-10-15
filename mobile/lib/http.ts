// 移动端 HTTP 封装：与 Web 端 frontend/src/lib/http.ts 导出同样的 http 对象与 ApiError，
// 让从 Web 端复制来的 lib/api/*.ts 无需修改即可使用。底层用 uni.request（H5 与小程序通用）。
//
// 语义与 Web 端一致：
// 1. 请求时带上访问令牌；所有请求带 X-Client: mobile
// 2. 收到 40102 时刷新令牌并重放原请求，并发请求只刷新一次；刷新失败回到登录页
// 3. 统一把 ApiResponse 拆成 data，或抛出带 code、errors、traceId 的 ApiError

import type { ApiResponse, FieldError } from './types'
import { API_BASE, CLIENT_HEADERS } from './config'

/** 后端返回 code !== 0、HTTP 失败或网络异常时抛出 */
export class ApiError extends Error {
  readonly code: number
  readonly errors: FieldError[]
  readonly traceId: string | null
  readonly httpStatus: number | null

  constructor(body: Partial<ApiResponse<unknown>>, httpStatus: number | null) {
    super(body.message || '请求失败')
    // 小程序开发者工具会把 class 转成 ES5，继承 Error 时原型链会丢失，这里手动修正
    Object.setPrototypeOf(this, ApiError.prototype)
    this.name = 'ApiError'
    this.code = body.code ?? -1
    this.errors = body.errors ?? []
    this.traceId = body.traceId ?? null
    this.httpStatus = httpStatus
  }

  /** 409 类：状态已变化 / 待办已被处理 / 草稿在别处修改 / 模板已更新 */
  get isConflict(): boolean {
    return this.code >= 40900 && this.code < 41000
  }

  /** 网络异常（未收到任何响应），可用同一幂等键重试 */
  get isNetwork(): boolean {
    return this.code === -1 && this.httpStatus === null
  }
}

export function isApiError(e: unknown): e is ApiError {
  return (
    e instanceof ApiError ||
    (!!e && typeof e === 'object' && typeof (e as ApiError).code === 'number' && Array.isArray((e as ApiError).errors))
  )
}

export function toApiError(e: unknown): ApiError {
  if (isApiError(e)) return e
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return new ApiError({ code: -1, message: msg || '请求失败' }, null)
}

export interface RequestOptions {
  params?: Record<string, unknown>
  headers?: Record<string, string>
}

// ---------- 与认证状态的衔接（由 stores/auth.ts 注入，避免循环依赖） ----------

interface AuthHooks {
  getAccessToken(): string | null
  /** 用刷新令牌换新令牌；失败时 reject */
  refresh(): Promise<void>
  /** 令牌彻底失效：清空本地状态并回到登录页 */
  onAuthFailure(): void
}

let hooks: AuthHooks = {
  getAccessToken: () => null,
  refresh: () => Promise.reject(new Error('未登录')),
  onAuthFailure: () => {},
}

export function setAuthHooks(h: AuthHooks): void {
  hooks = h
}

let refreshing: Promise<void> | null = null

/** 多个请求同时过期时只刷新一次 */
export function refreshOnce(): Promise<void> {
  if (!refreshing) {
    refreshing = hooks.refresh().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

export function authFailed(): void {
  hooks.onAuthFailure()
}

/** 上传 / 下载等不走 http 对象的请求使用的公共请求头 */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...CLIENT_HEADERS, ...extra }
  const token = hooks.getAccessToken()
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

export function currentAccessToken(): string | null {
  return hooks.getAccessToken()
}

// ---------- 请求 ----------

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

function encodeParams(params?: Record<string, unknown>): string {
  if (!params) return ''
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    const values = Array.isArray(v) ? v : [v]
    for (const item of values) {
      if (item === undefined || item === null) continue
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`)
    }
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

export function apiUrl(path: string, params?: Record<string, unknown>): string {
  return `${API_BASE}${path}${encodeParams(params)}`
}

/** 解析 uni.request / uni.uploadFile 的响应 */
export function parseResponse<T>(statusCode: number, raw: unknown): T {
  let body = raw
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      // 非 JSON 响应（如网关返回的 HTML 错误页）
    }
  }
  if (body && typeof body === 'object' && 'code' in (body as object)) {
    const r = body as ApiResponse<T>
    if (r.code === 0) return r.data
    throw new ApiError(r, statusCode)
  }
  if (statusCode >= 200 && statusCode < 300) return body as T
  throw new ApiError({ code: -1, message: `请求失败（HTTP ${statusCode}）` }, statusCode)
}

function send<T>(method: Method, url: string, body: unknown, opts: RequestOptions): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const header: Record<string, string> = authHeaders({ 'Content-Type': 'application/json', ...opts.headers })
    uni.request({
      url: apiUrl(url, opts.params),
      method,
      data: body === undefined ? undefined : (body as UniApp.RequestOptions['data']),
      header,
      timeout: 30_000,
      dataType: 'json',
      success: (res) => {
        try {
          resolve(parseResponse<T>(res.statusCode, res.data))
        } catch (e) {
          reject(e)
        }
      },
      fail: () => reject(new ApiError({ code: -1, message: '网络异常，请检查连接' }, null)),
    })
  })
}

/**
 * 登录、注册、刷新、退出等接口：返回 401 类错误码时不刷新、不跳转登录页。
 * /auth/sse-ticket 需要访问令牌，按普通接口处理。
 */
function isPublicAuthUrl(url: string): boolean {
  return /^\/auth\/(login|register|refresh|logout|availability)\b/.test(url) || url.startsWith('/public/')
}

async function request<T>(method: Method, url: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
  const tokenAtSend = hooks.getAccessToken()
  try {
    return await send<T>(method, url, body, opts)
  } catch (err) {
    const e = toApiError(err)
    if (e.code === 40102 && !isPublicAuthUrl(url)) {
      // 发出请求后令牌已被其他请求刷新过，直接重放即可
      const current = hooks.getAccessToken()
      if (!current || current === tokenAtSend) {
        try {
          await refreshOnce()
        } catch {
          hooks.onAuthFailure()
          throw e
        }
      }
      try {
        return await send<T>(method, url, body, opts)
      } catch (err2) {
        const e2 = toApiError(err2)
        if (e2.code === 40101 || e2.code === 40102) hooks.onAuthFailure()
        throw e2
      }
    }
    if (e.code === 40101 && !isPublicAuthUrl(url)) hooks.onAuthFailure()
    throw e
  }
}

/** 已把 ApiResponse 拆成 data，这里只做类型标注 */
export const http = {
  get<T>(url: string, opts: RequestOptions = {}): Promise<T> {
    return request<T>('GET', url, undefined, opts)
  },
  post<T>(url: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return request<T>('POST', url, body, opts)
  },
  put<T>(url: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return request<T>('PUT', url, body, opts)
  },
  del<T>(url: string, opts: RequestOptions = {}): Promise<T> {
    return request<T>('DELETE', url, undefined, opts)
  },
}
