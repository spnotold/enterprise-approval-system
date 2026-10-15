// ⚠ 此文件由 mobile/scripts/sync-lib.mjs 从 frontend/src/lib/api/admin.ts 原样复制生成，请勿手动修改。
// 修改请改 Web 端源文件后执行 npm run sync-lib。
import { http } from '../http'
import type {
  AdminDept,
  AdminUser,
  AdminUserQuery,
  AuditLogQuery,
  AuditLogView,
  DeliveryView,
  DraftVersionRequest,
  ExpenseTypeAdmin,
  GrantCreateRequest,
  GrantView,
  MonitorTask,
  MonitorTaskQuery,
  PageQuery,
  PageResponse,
  RoleCode,
  RoleView,
  SysConfigItem,
  TemplateAdminDetail,
  TemplateAdminItem,
  TemplateCreateRequest,
  TemplateUpdateRequest,
  TemplateVersionDetail,
  TransferRequest,
  ValidationIssue,
} from '../types'

// 管理端写操作均需填写原因（reason），写入审计日志
export const admin = {
  users: {
    list: (q: AdminUserQuery = {}) => http.get<PageResponse<AdminUser>>('/admin/users', { params: { ...q } }),
    get: (id: number) => http.get<AdminUser>(`/admin/users/${id}`),
    /** 注册审核通过：确认所属部门，自动授予 EMPLOYEE */
    approve: (id: number, body: { deptId: number; reason?: string | null }) =>
      http.post<AdminUser>(`/admin/users/${id}/approve`, body),
    reject: (id: number, body: { reason: string }) => http.post<AdminUser>(`/admin/users/${id}/reject`, body),
    disable: (id: number, body: { reason: string }) => http.post<AdminUser>(`/admin/users/${id}/disable`, body),
    enable: (id: number, body: { reason: string }) => http.post<AdminUser>(`/admin/users/${id}/enable`, body),
    changeDept: (id: number, body: { deptId: number; reason: string }) =>
      http.put<AdminUser>(`/admin/users/${id}/dept`, body),
    grantRole: (id: number, body: { roleCode: RoleCode; reason: string }) =>
      http.post<AdminUser>(`/admin/users/${id}/roles`, body),
    revokeRole: (id: number, roleCode: RoleCode, body: { reason: string }) =>
      http.post<AdminUser>(`/admin/users/${id}/roles/${roleCode}/revoke`, body),
    /** 设为该角色主办人（每个角色至多一名，原主办人自动取消） */
    setPrimary: (id: number, roleCode: RoleCode, body: { reason: string }) =>
      http.post<AdminUser>(`/admin/users/${id}/roles/${roleCode}/primary`, body),
    /** 返回一次性临时密码 */
    resetPassword: (id: number, body: { reason: string }) =>
      http.post<{ tempPassword: string }>(`/admin/users/${id}/reset-password`, body),
    unlock: (id: number, body: { reason: string }) => http.post<AdminUser>(`/admin/users/${id}/unlock`, body),
  },
  departments: {
    list: () => http.get<AdminDept[]>('/admin/departments'),
    create: (body: { code: string; name: string; sortOrder?: number; reason?: string | null }) =>
      http.post<AdminDept>('/admin/departments', body),
    update: (id: number, body: { name: string; sortOrder?: number; reason?: string | null }) =>
      http.put<AdminDept>(`/admin/departments/${id}`, body),
    /** 仍有用户、申请、模板引用时拒绝 */
    remove: (id: number, body: { reason: string }) =>
      http.post<void>(`/admin/departments/${id}/delete`, body),
    /** 设置负责人（userId 为 null 表示清除），同步授予 / 回收 DEPT_HEAD */
    setHead: (id: number, body: { userId: number | null; reason: string }) =>
      http.put<AdminDept>(`/admin/departments/${id}/head`, body),
  },
  roles: {
    list: () => http.get<RoleView[]>('/admin/roles'),
  },
  grants: {
    list: (q: PageQuery & { userId?: number | null; activeOnly?: boolean } = {}) =>
      http.get<PageResponse<GrantView>>('/admin/grants', { params: { ...q } }),
    create: (body: GrantCreateRequest) => http.post<GrantView>('/admin/grants', body),
    revoke: (id: number, body: { reason: string }) => http.post<GrantView>(`/admin/grants/${id}/revoke`, body),
  },
  templates: {
    list: () => http.get<TemplateAdminItem[]>('/admin/templates'),
    get: (id: number) => http.get<TemplateAdminDetail>(`/admin/templates/${id}`),
    /** 新建自定义模板，同时生成空的 v1 草稿 */
    create: (body: TemplateCreateRequest) => http.post<TemplateAdminDetail>('/admin/templates', body),
    update: (id: number, body: TemplateUpdateRequest) => http.put<TemplateAdminDetail>(`/admin/templates/${id}`, body),
    enable: (id: number, body: { reason: string }) => http.post<TemplateAdminDetail>(`/admin/templates/${id}/enable`, body),
    disable: (id: number, body: { reason: string }) =>
      http.post<TemplateAdminDetail>(`/admin/templates/${id}/disable`, body),
    /** 复制当前发布版本生成草稿（已有草稿时直接返回） */
    createDraft: (id: number) => http.post<TemplateVersionDetail>(`/admin/templates/${id}/draft`),
    saveDraft: (id: number, body: DraftVersionRequest) =>
      http.put<TemplateVersionDetail>(`/admin/templates/${id}/draft`, body),
    discardDraft: (id: number) => http.del<void>(`/admin/templates/${id}/draft`),
    /** 发布前校验，一次返回全部问题；空数组表示可发布 */
    validate: (id: number) => http.post<ValidationIssue[]>(`/admin/templates/${id}/validate`),
    /** 校验失败返回 42201，errors[].field 为 path、rule 为校验码 */
    publish: (id: number, body: { changeNote: string }) =>
      http.post<TemplateAdminDetail>(`/admin/templates/${id}/publish`, body),
  },
  expenseTypes: {
    list: () => http.get<ExpenseTypeAdmin[]>('/admin/expense-types'),
    create: (body: { code: string; name: string; sortOrder?: number }) =>
      http.post<ExpenseTypeAdmin>('/admin/expense-types', body),
    update: (id: number, body: { name: string; enabled: boolean; sortOrder?: number }) =>
      http.put<ExpenseTypeAdmin>(`/admin/expense-types/${id}`, body),
    /** 被引用的类型不能删除，只能停用 */
    remove: (id: number) => http.del<void>(`/admin/expense-types/${id}`),
  },
  config: {
    list: () => http.get<SysConfigItem[]>('/admin/config'),
    update: (key: string, body: { value: string; reason: string }) =>
      http.put<SysConfigItem>(`/admin/config/${encodeURIComponent(key)}`, body),
  },
  tasks: {
    /** 待办监控：只返回单据元数据 */
    list: (q: MonitorTaskQuery = {}) => http.get<PageResponse<MonitorTask>>('/admin/tasks', { params: { ...q } }),
    transfer: (taskId: number, body: TransferRequest) => http.post<void>(`/admin/tasks/${taskId}/transfer`, body),
  },
  auditLogs: {
    list: (q: AuditLogQuery = {}) => http.get<PageResponse<AuditLogView>>('/admin/audit-logs', { params: { ...q } }),
  },
  deliveries: {
    list: (q: PageQuery & { status?: string | null } = {}) =>
      http.get<PageResponse<DeliveryView>>('/admin/deliveries', { params: { ...q } }),
  },
}
