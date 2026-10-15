import { http } from '../http'
import type { Availability, LoginRequest, LoginResult, RefreshBody, RegisterRequest, SseTicket } from '../types'

export const auth = {
  register: (body: RegisterRequest) => http.post<{ userId: number }>('/auth/register', body),
  /** Web 端刷新令牌写入 HttpOnly Cookie；移动端带 X-Client: mobile，刷新令牌在响应体中返回 */
  login: (body: LoginRequest, headers?: Record<string, string>) =>
    http.post<LoginResult>('/auth/login', body, { headers }),
  /** Web 端不传 refreshToken（读 Cookie）；移动端在请求体中传。expectedUserId 用于确认身份未变化 */
  refresh: (body: RefreshBody = {}, headers?: Record<string, string>) =>
    http.post<LoginResult>('/auth/refresh', body, { headers }),
  /** 公开接口，按刷新 Cookie 认证，访问令牌过期也能退出 */
  logout: (refreshToken?: string) => http.post<void>('/auth/logout', refreshToken ? { refreshToken } : {}),
  availability: (params: { username?: string; email?: string }) =>
    http.get<Availability>('/auth/availability', { params }),
  sseTicket: () => http.post<SseTicket>('/auth/sse-ticket'),
}
