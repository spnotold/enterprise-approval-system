import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse, FieldError } from './types'
import { SessionChangedError, sessionGeneration, useAuthStore } from '@/stores/auth'

/** 后端返回 code !== 0 时抛出 */
export class ApiError extends Error {
  readonly code: number
  readonly errors: FieldError[]
  readonly traceId: string | null
  readonly httpStatus: number | null

  constructor(body: Partial<ApiResponse<unknown>>, httpStatus: number | null) {
    super(body.message || '请求失败')
    this.code = body.code ?? -1
    this.errors = body.errors ?? []
    this.traceId = body.traceId ?? null
    this.httpStatus = httpStatus
  }

  /** 409 类：状态已变化 / 待办已被处理 / 草稿在别处修改 / 模板已更新 */
  get isConflict(): boolean {
    return this.code >= 40900 && this.code < 41000
  }
}

/** 网络错误等非业务错误也包装为 ApiError，便于统一处理 */
function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  const ax = err as AxiosError<ApiResponse<unknown>>
  const body = ax.response?.data
  if (body && typeof body === 'object' && 'code' in body) {
    return new ApiError(body, ax.response?.status ?? null)
  }
  return new ApiError(
    { code: -1, message: ax.response ? `请求失败（HTTP ${ax.response.status}）` : '网络异常，请检查连接' },
    ax.response?.status ?? null,
  )
}

export interface RequestOptions {
  params?: Record<string, unknown>
  headers?: Record<string, string>
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean; _gen?: number }

// 登录、刷新、退出等认证流程本身失败时不触发自动刷新与跳转（/auth/logout 为公开接口，按刷新 Cookie 认证）；
// 其余 /auth/ 接口（如 /auth/sse-ticket 需要访问令牌）按普通接口处理，过期时同样先刷新再重放
const AUTH_FLOW_URLS = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/register', '/auth/availability']
const isAuthFlow = (url?: string) => !!url && AUTH_FLOW_URLS.some((u) => url.startsWith(u))

const instance = axios.create({ baseURL: '/api', timeout: 30_000 }) // 与后端 context-path 一致

instance.interceptors.request.use((config) => {
  // 记录发出请求时的会话代次；会话切换后旧请求不再刷新重放
  const c = config as RetriableConfig
  c._gen ??= sessionGeneration()
  const token = useAuthStore().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** responseType = blob 时错误体也是 Blob：解析为 JSON，保留 code / message / traceId */
async function parseBlobBody(data: unknown): Promise<unknown> {
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      return JSON.parse(await data.text())
    } catch {
      return undefined
    }
  }
  return data
}

function isApiBody(v: unknown): v is ApiResponse<unknown> {
  return !!v && typeof v === 'object' && 'code' in v
}

instance.interceptors.response.use(
  async (res) => {
    // 文件下载等非 JSON 响应原样返回；若意外收到 JSON 错误体则按业务错误抛出
    if (res.config.responseType === 'blob') {
      const data: unknown = res.data
      if (data instanceof Blob && data.type.includes('application/json')) {
        const body = await parseBlobBody(data)
        if (isApiBody(body) && body.code !== 0) throw new ApiError(body, res.status)
      }
      return res
    }
    const body = res.data as ApiResponse<unknown>
    if (body.code !== 0) throw new ApiError(body, res.status)
    return body.data as never
  },
  async (err: AxiosError<ApiResponse<unknown>>) => {
    const config = err.config as RetriableConfig | undefined
    if (err.response && config?.responseType === 'blob') {
      const parsed = await parseBlobBody(err.response.data)
      if (isApiBody(parsed)) err.response.data = parsed
    }
    const body = err.response?.data
    const auth = useAuthStore()
    const sameSession = config?._gen === sessionGeneration()
    if (body?.code === 40102 && config && !config._retried && !isAuthFlow(config.url)) {
      // 请求发出后会话已切换（退出 / 换账号）：不以新身份重放
      if (!sameSession) throw toApiError(err)
      try {
        // 多个请求同时过期时只刷新一次（与 bootstrap 共用）
        await auth.refresh()
      } catch (e) {
        if (!(e instanceof SessionChangedError)) await auth.clearAndRedirect()
        throw toApiError(err)
      }
      if (config._gen !== sessionGeneration()) throw toApiError(err)
      config._retried = true
      return instance(config)
    }
    if ((body?.code === 40101 || body?.code === 40102) && !isAuthFlow(config?.url) && sameSession) {
      await auth.clearAndRedirect()
    }
    throw toApiError(err)
  },
)

/** 拦截器已把 ApiResponse 拆成 data，这里只做类型标注 */
export const http = {
  get<T>(url: string, opts: RequestOptions = {}): Promise<T> {
    return instance.get(url, { params: opts.params, headers: opts.headers }) as Promise<T>
  },
  post<T>(url: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return instance.post(url, body, { params: opts.params, headers: opts.headers }) as Promise<T>
  },
  put<T>(url: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
    return instance.put(url, body, { params: opts.params, headers: opts.headers }) as Promise<T>
  },
  del<T>(url: string, opts: RequestOptions = {}): Promise<T> {
    return instance.delete(url, { params: opts.params, headers: opts.headers }) as Promise<T>
  },
}

/** 仅 Web 端使用：multipart 上传，带进度回调 */
export function uploadFile<T>(
  url: string,
  file: File,
  fields: Record<string, string>,
  onProgress?: (percent: number) => void,
): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return instance.post(url, form, {
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  }) as Promise<T>
}

/** 仅 Web 端使用：带令牌下载为 Blob（用于预览图片 / PDF） */
export async function fetchBlob(url: string): Promise<Blob> {
  const res = await instance.get(url, { responseType: 'blob' }).catch((e) => {
    throw toApiError(e)
  })
  return (res as unknown as { data: Blob }).data
}

export { toApiError }
