// ⚠ 此文件由 mobile/scripts/sync-lib.mjs 从 frontend/src/lib/api/stats.ts 原样复制生成，请勿手动修改。
// 修改请改 Web 端源文件后执行 npm run sync-lib。
import { http } from '../http'
import type { DateRange, DeptStats, EnterpriseStats, FinanceStats, PersonalStats } from '../types'

export const stats = {
  personal: () => http.get<PersonalStats>('/stats/personal'),
  /** 部门负责人；负责多个部门时用 deptId 指定 */
  dept: (q: DateRange & { deptId?: number | null } = {}) => http.get<DeptStats>('/stats/dept', { params: { ...q } }),
  /** 需授权 FIN_STATS_READ */
  finance: (q: DateRange = {}) => http.get<FinanceStats>('/stats/finance', { params: { ...q } }),
  /** 需授权 APP_READ@ALL */
  enterprise: (q: DateRange = {}) => http.get<EnterpriseStats>('/stats/enterprise', { params: { ...q } }),
}
