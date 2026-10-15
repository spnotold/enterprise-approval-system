// ⚠ 此文件由 mobile/scripts/sync-lib.mjs 从 frontend/src/lib/api/auth.ts 原样复制生成，请勿手动修改。
// 修改请改 Web 端源文件后执行 npm run sync-lib。
import { http } from '../http'
import type { Availability, LoginRequest, LoginResult, RegisterRequest, SseTicket } from '../types'

export const auth = {
  register: (body: RegisterRequest) => http.post<{ userId: number }>('/auth/register', body),
  /** Web 端刷新令牌写入 HttpOnly Cookie；移动端带 X-Client: mobile，刷新令牌在响应体中返回 */
  login: (body: LoginRequest, headers?: Record<string, string>) =>
    http.post<LoginResult>('/auth/login', body, { headers }),
  /** Web 端不传 refreshToken（读 Cookie）；移动端在请求体中传 */
  refresh: (refreshToken?: string, headers?: Record<string, string>) =>
    http.post<LoginResult>('/auth/refresh', refreshToken ? { refreshToken } : {}, { headers }),
  logout: (refreshToken?: string) => http.post<void>('/auth/logout', refreshToken ? { refreshToken } : {}),
  availability: (params: { username?: string; email?: string }) =>
    http.get<Availability>('/auth/availability', { params }),
  sseTicket: () => http.post<SseTicket>('/auth/sse-ticket'),
}
