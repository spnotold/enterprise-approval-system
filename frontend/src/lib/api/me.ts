import { http } from '../http'
import type { ChangePasswordRequest, Me } from '../types'

export const me = {
  get: () => http.get<Me>('/me'),
  /** 成功后其他设备上的登录失效，当前端需重新登录 */
  changePassword: (body: ChangePasswordRequest) => http.put<void>('/me/password', body),
  updatePreferences: (body: { emailNotify: boolean }) => http.put<Me>('/me/preferences', body),
}
