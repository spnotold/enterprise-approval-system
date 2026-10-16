// ⚠ 此文件由 mobile/scripts/sync-lib.mjs 从 frontend/src/lib/api/dict.ts 原样复制生成，请勿手动修改。
// 修改请改 Web 端源文件后执行 npm run sync-lib。
import { http } from '../http'
import type { DeptOption, ExpenseTypeOption, PublicConfig, UserOption } from '../types'

export const dict = {
  /** 公开接口，登录页据此判断是否展示演示账号 */
  publicConfig: () => http.get<PublicConfig>('/public/config'),
  /** 公开接口，注册页使用 */
  publicDepartments: () => http.get<DeptOption[]>('/public/departments'),
  departments: () => http.get<DeptOption[]>('/dicts/departments'),
  /** 启用的费用类型 */
  expenseTypes: () => http.get<ExpenseTypeOption[]>('/dicts/expense-types'),
  /** 启用用户搜索（同行人员、转办对象、指定审批人），最多返回 20 条 */
  users: (keyword: string) => http.get<UserOption[]>('/dicts/users', { params: { keyword } }),
}
