// 前后端共享的数据结构。移动端 mobile/lib/types.ts 由 scripts/sync-lib 原样复制。
// 约定：金额一律为整数分（*Cents）；时间为带偏移的 ISO 8601 字符串；日期为 YYYY-MM-DD。

// ---------- 通用 ----------

export interface FieldError {
  field: string // 如 items[2].amountCents
  rule: string // 规则码，如 EXP_ITEM_AMOUNT
  message: string
}

export interface ApiResponse<T> {
  code: number // 0 成功
  message: string
  data: T
  traceId: string
  errors?: FieldError[] | null
}

export interface PageResponse<T> {
  records: T[]
  total: number
  page: number // 从 1 开始
  size: number
}

export interface PageQuery {
  page?: number
  size?: number
}

export type AppType = 'PURCHASE' | 'TRAVEL' | 'EXPENSE' | 'CUSTOM'
export type AppStatus = 'DRAFT' | 'IN_APPROVAL' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'
export type NodeStatus =
  | 'WAITING'
  | 'ACTIVE'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELED'
  | 'SKIPPED'
  | 'NOT_REACHED'
export type TaskStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED' | 'TRANSFERRED'
export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'REJECTED'
export type RoleCode = 'EMPLOYEE' | 'DEPT_HEAD' | 'FINANCE_APPROVER' | 'ENTERPRISE_HEAD' | 'SYS_ADMIN'
export type AppAction =
  | 'EDIT'
  | 'DELETE'
  | 'SUBMIT'
  | 'WITHDRAW'
  | 'COPY'
  | 'APPROVE'
  | 'REJECT'
  | 'URGE'
export type ScopeType = 'DEPT' | 'ALL'
/** 数据范围授权的权限点 */
export type GrantPermission = 'APP_READ' | 'FIN_STATS_READ' | 'BIZ_CONTENT_READ'

/**
 * 功能权限点（me.permissions 中的取值）：
 * APP_CREATE 发起申请；TASK_HANDLE 处理待办；APP_READ_DEPT 查看本人负责部门的申请；STATS_DEPT 本部门统计；
 * ADMIN_USER / ADMIN_DEPT / ADMIN_GRANT / ADMIN_TEMPLATE / ADMIN_CONFIG / ADMIN_AUDIT / ADMIN_TRANSFER 管理端。
 * 另外由有效授权派生：FIN_STATS（财务统计）、ENTERPRISE_STATS（企业统计，APP_READ@ALL）、APP_READ_GRANTED（授权范围查询）。
 */
export type Permission = string

export interface UserBrief {
  id: number
  realName: string
  deptName?: string | null
}

// ---------- 认证与个人 ----------

export interface LoginRequest {
  account: string // 用户名或邮箱
  password: string
}

export interface LoginResult {
  accessToken: string
  expiresIn: number // 秒
  /** 令牌所属用户；刷新时前端据此确认身份未变化 */
  userId: number
  /** 仅移动端（请求头 X-Client: mobile）返回；Web 端在 HttpOnly Cookie 中 */
  refreshToken?: string | null
}

/** 刷新令牌请求体 */
export interface RefreshBody {
  /** 仅移动端：刷新令牌放在请求体中；Web 端读 HttpOnly Cookie */
  refreshToken?: string | null
  /** 当前标签页认为的登录用户；Cookie 属于其他用户时服务端返回 40101 且不轮换 */
  expectedUserId?: number | null
}

export interface RegisterRequest {
  username: string
  realName: string
  email: string
  password: string
  requestedDeptId: number
}

export interface Availability {
  usernameAvailable?: boolean | null
  emailAvailable?: boolean | null
}

export interface SseTicket {
  ticket: string
  expiresIn: number
}

export interface RoleBrief {
  code: RoleCode
  name: string
  primaryHandler: boolean
}

export interface GrantBrief {
  permissionCode: GrantPermission
  scopeType: ScopeType
  deptId: number | null
  deptName: string | null
  validUntil: string | null
}

export interface Me {
  id: number
  username: string
  realName: string
  email: string
  deptId: number | null
  deptName: string | null
  roles: RoleBrief[]
  permissions: Permission[]
  headDeptIds: number[]
  grants: GrantBrief[]
  emailNotify: boolean
}

export interface ChangePasswordRequest {
  oldPassword: string
  newPassword: string
}

// ---------- 字典 ----------

export interface DeptOption {
  id: number
  code: string
  name: string
}

export interface ExpenseTypeOption {
  id: number
  code: string
  name: string
  enabled: boolean
}

export interface UserOption {
  id: number
  username: string
  realName: string
  deptName: string | null
}

// ---------- 附件 ----------

/** 上传时的用途，决定前端预检规则；后端统一按 JPEG / PNG / PDF、≤ 10 MB 校验 */
export type AttachmentRefType =
  | 'PURCHASE_ATTACHMENT'
  | 'PURCHASE_QUOTE'
  | 'SINGLE_SOURCE'
  | 'TRAVEL_ATTACHMENT'
  | 'EXPENSE_INVOICE'
  | 'CUSTOM_FIELD'

export interface AttachmentMeta {
  id: number
  originalName: string
  contentType: string
  sizeBytes: number
  sha256: string
  createdAt: string
}

// ---------- 模板（员工端） ----------

export type FieldType = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'AMOUNT' | 'DATE' | 'RADIO' | 'ATTACHMENT'

export interface FieldOption {
  value: string
  label: string
}

export interface FieldRules {
  // TEXT / TEXTAREA
  minLength?: number
  maxLength?: number
  patternPreset?: 'MOBILE' | 'EMAIL' | null
  pattern?: string | null
  patternMessage?: string | null
  // NUMBER（十进制字符串）
  min?: string | null
  max?: string | null
  precision?: number // 0-4
  step?: string | null
  // AMOUNT（整数分）
  minCents?: number | null
  maxCents?: number | null
  // DATE：YYYY-MM-DD、TODAY、TODAY+30、TODAY-7
  earliest?: string | null
  latest?: string | null
  notBefore?: string | null // 另一个 DATE 字段的 key
  // ATTACHMENT
  maxCount?: number // 1-10
  allowedTypes?: string[] // MIME，取自 image/jpeg、image/png、application/pdf
  maxSizeMb?: number // ≤ 10
}

export interface FormField {
  key: string
  label: string
  type: FieldType
  required?: boolean
  placeholder?: string | null
  help?: string | null
  options?: FieldOption[] // 仅 RADIO
  rules?: FieldRules
  statAmount?: boolean // 仅 AMOUNT，至多一个字段，作为申请统计金额
}

export interface FormSchema {
  /** 内置模板为 PURCHASE / TRAVEL / EXPENSE，表单固定；自定义模板为 null */
  builtin?: AppType | null
  fields: FormField[]
}

export type ApproverRuleType = 'SPECIFIED_USER' | 'APPLICANT_DEPT_HEAD' | 'ROLE'
export type NodeMode = 'SINGLE' | 'COUNTERSIGN' | 'OR_SIGN'
export type ConditionOp = 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IN'

export interface ApproverRule {
  type: ApproverRuleType
  userId?: number | null // SPECIFIED_USER（单人）
  userIds?: number[] | null // SPECIFIED_USER（会签 / 或签多人）
  roleCode?: RoleCode | null // ROLE：单人模式取主办人，会签 / 或签取全部持有人
}

export interface ConditionRule {
  var: string // 字段 key，或系统变量 amountCents / naturalDays
  op: ConditionOp
  value?: string | null
  values?: string[] | null // 仅 IN
}

export interface Condition {
  logic: 'AND' | 'OR'
  rules: ConditionRule[]
}

export interface NodeDef {
  nodeKey: string
  name: string
  approverRule: ApproverRule
  fallbackRule?: ApproverRule | null
  condition?: Condition | null
  mode?: NodeMode
  timeoutHours?: number | null
}

export interface NodeConfig {
  nodes: NodeDef[]
}

export interface TemplateOption {
  id: number
  code: string
  name: string
  description: string | null
  category: 'BUILTIN' | 'CUSTOM'
  bizType: AppType
}

export interface TemplateDetail extends TemplateOption {
  versionId: number
  versionNo: number
  formSchema: FormSchema
}

// ---------- 申请 ----------

export interface CurrentNode {
  seq: number
  name: string
  assigneeName: string | null
}

export interface ApplicationSummary {
  id: number
  appNo: string
  type: AppType
  title: string | null
  status: AppStatus
  templateName: string
  applicant: UserBrief
  deptName: string | null
  amountCents: number | null
  currentNode: CurrentNode | null
  submittedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export type ListScope = 'mine' | 'dept' | 'granted'

export interface ApplicationQuery extends PageQuery {
  scope: ListScope
  type?: AppType | null
  status?: AppStatus | null
  from?: string | null // 提交日期起，YYYY-MM-DD（上海时区，含）
  to?: string | null // 提交日期止（含）
  keyword?: string | null // 编号或标题
  deptId?: number | null // scope=dept 时可指定负责的某个部门
}

export interface DraftSaved {
  id: number
  appNo: string
  version: number
}

export interface AppLink {
  id: number
  appNo: string
  status: AppStatus
}

// 采购

export interface PurchaseItemInput {
  name: string | null
  spec: string | null
  unit: string | null
  quantity: string | null // 十进制字符串，最多 3 位小数
  unitPriceCents: number | null
  remark: string | null
}

export interface PurchaseItemView extends PurchaseItemInput {
  amountCents: number | null // 服务端按 round(quantity × unitPriceCents) 计算
}

export interface PurchaseQuoteInput {
  supplierName: string | null
  channel: 'ONLINE' | 'OFFLINE'
  quoteAmountCents: number | null
  url: string | null // 线上报价必填
  description: string | null // 报价明细说明
  attachmentIds: number[] // 报价单 / 截图
}

export interface PurchaseQuoteView extends PurchaseQuoteInput {
  attachments: AttachmentMeta[]
  lowest: boolean
}

export interface PurchaseSaveRequest {
  version?: number // 新建时不传
  title: string | null
  reason: string | null
  budgetLimitCents: number | null
  expectedArrivalDate: string | null
  singleSource: boolean
  singleSourceReason: string | null
  singleSourceAttachmentIds: number[]
  selectedQuoteIndex: number | null // 拟选报价在 quotes 中的下标
  selectionReason: string | null
  notLowestReason: string | null
  items: PurchaseItemInput[]
  quotes: PurchaseQuoteInput[]
  attachmentIds: number[]
}

export interface PurchaseView
  extends Omit<PurchaseSaveRequest, 'version' | 'items' | 'quotes' | 'title'> {
  items: PurchaseItemView[]
  quotes: PurchaseQuoteView[]
  itemsTotalCents: number
  selectedAmountCents: number | null
  notLowest: boolean
  singleSourceAttachments: AttachmentMeta[]
  attachments: AttachmentMeta[]
}

// 差旅

export interface CompanionInput {
  userId: number | null // 系统用户与 name 二选一
  name: string | null
}

export interface CompanionView extends CompanionInput {
  userName: string | null
  deptName: string | null
}

export interface TravelSaveRequest {
  version?: number
  title: string | null
  origin: string | null
  destination: string | null
  startTime: string | null // ISO 8601
  endTime: string | null
  transport: 'PLANE' | 'TRAIN' | 'BUS' | 'CAR' | 'OTHER' | null
  purpose: string | null
  budgetCents: number | null
  companions: CompanionInput[]
  attachmentIds: number[]
}

export interface TravelView extends Omit<TravelSaveRequest, 'version' | 'companions' | 'title'> {
  naturalDays: number | null
  durationHours: string | null // "15.0"
  companions: CompanionView[]
  lateReport: boolean // 开始时间早于提交时间（事后补报）
  attachments: AttachmentMeta[]
}

// 报销

export interface InvoiceInput {
  attachmentId: number
  invoiceNo: string | null
}

export interface ExpenseItemInput {
  expenseTypeCode: string | null
  occurDate: string | null
  purpose: string | null
  amountCents: number | null
  noInvoice: boolean
  noInvoiceReason: string | null
  invoices: InvoiceInput[]
}

export interface DupInvoiceWarning {
  attachmentId: number
  invoiceNo: string | null
  /** 查看者为申请人本人时以下三项为 null（只显示通用的黄色提示）；审批人 / 财务可见编号与状态 */
  otherApplicationId: number | null
  otherAppNo: string | null
  otherStatus: AppStatus | null
}

export interface InvoiceView extends InvoiceInput {
  attachment: AttachmentMeta
  /** 跨单疑似重复（申请人本人查看时 duplicates 中不含对方单号） */
  suspectedDuplicate: boolean
  duplicates: DupInvoiceWarning[] // 跨单疑似重复（只提示）
}

export interface ExpenseItemView extends Omit<ExpenseItemInput, 'invoices'> {
  expenseTypeName: string | null
  invoices: InvoiceView[]
}

export interface ExpenseSaveRequest {
  version?: number
  title: string | null
  description: string | null
  relatedApplicationIds: number[]
  independentReason: string | null
  items: ExpenseItemInput[]
}

export interface LinkedTravelSummary {
  origin: string | null
  destination: string | null
  startTime: string | null
  endTime: string | null
  naturalDays: number | null
  budgetCents: number | null
}

export interface LinkedPurchaseSummary {
  selectedSupplier: string | null
  selectedAmountCents: number | null
  itemCount: number
}

export interface LinkableApplication {
  id: number
  appNo: string
  type: 'TRAVEL' | 'PURCHASE'
  title: string | null
  amountCents: number | null
  finishedAt: string | null
  travel?: LinkedTravelSummary | null
  purchase?: LinkedPurchaseSummary | null
}

export interface ExpenseView extends Omit<ExpenseSaveRequest, 'version' | 'items' | 'title'> {
  totalAmountCents: number
  items: ExpenseItemView[]
  related: LinkableApplication[]
  noInvoiceCount: number
  noInvoiceAmountCents: number
}

// 自定义

export interface CustomSaveRequest {
  version?: number
  templateId?: number // 仅新建时需要
  /** 表单渲染所用的模板版本（TemplateDetail.versionId）；新建和每次保存都带上。
   *  40906 后按新版本重新渲染，用户确认后带新的 versionId 保存（只接受当前发布版本，否则仍返回 40906） */
  templateVersionId?: number | null
  title: string | null
  formValues: Record<string, unknown>
}

export interface CustomView {
  templateId: number
  templateVersionId: number
  versionNo: number
  formSchema: FormSchema
  formValues: Record<string, unknown>
  attachments: Record<string, AttachmentMeta[]> // 字段 key -> 附件
  /** 草稿所用版本已不是当前发布版本时为 true，前端需按新版本重新渲染 */
  outdated: boolean
}

// 流程

export interface TaskView {
  id: number
  assignee: UserBrief
  status: TaskStatus
  comment: string | null
  createdAt: string
  actedAt: string | null
}

export interface FlowNodeView {
  seq: number
  nodeKey: string
  name: string
  status: NodeStatus
  mode: NodeMode
  effective: boolean
  conditionResult: boolean | null
  conditionText: string | null // 如 “金额 ≥ 10,000.00 元”
  assignee: UserBrief | null
  /** 提交时确定的全部审批人；单人节点为 [assignee] */
  candidates: UserBrief[]
  /** 会签 / 或签：需要同意的人数与已同意人数（如“会签 1/3”） */
  requiredCount: number
  approvedCount: number
  resolveNote: string | null // 如 “申请人为本部门负责人，按替代规则由企业负责人审批”
  activatedAt: string | null
  finishedAt: string | null
  tasks: TaskView[]
}

export interface FlowView {
  templateCode: string
  versionNo: number
  nodes: FlowNodeView[]
}

export type LogAction = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'WITHDRAW' | 'TRANSFER'

export interface ApprovalLogView {
  id: number
  action: LogAction
  operatorName: string
  nodeName: string | null
  comment: string | null
  fromStatus: AppStatus | null
  toStatus: AppStatus | null
  appVersion: number
  templateVersionNo: number | null
  createdAt: string
}

export interface ApplicationDetail {
  id: number
  appNo: string
  type: AppType
  title: string | null
  status: AppStatus
  version: number
  templateId: number
  templateName: string
  templateVersionNo: number | null
  applicant: UserBrief
  deptId: number | null
  deptName: string | null
  amountCents: number | null
  currentNodeSeq: number | null
  submittedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
  source: AppLink | null // 复制来源单
  followUps: AppLink[] // 由本单复制出的后续单
  /** FULL：完整内容；LINKED：作为报销关联单只读查看（摘要与流程结果，不含附件） */
  viewMode: 'FULL' | 'LINKED'
  /** viewMode = LINKED 时的摘要；此时 purchase/travel/expense/custom 为 null、logs 为 []、待办不含意见 */
  linked?: LinkableApplication | null
  canReadAttachments: boolean
  purchase?: PurchaseView | null
  travel?: TravelView | null
  expense?: ExpenseView | null
  custom?: CustomView | null
  flow: FlowView | null
  logs: ApprovalLogView[]
  allowedActions: AppAction[]
  myTaskId: number | null // 当前用户在本单上的 PENDING 待办
}

export interface ActionResult {
  applicationId: number
  status: AppStatus
  appVersion: number
  currentNode: CurrentNode | null
}

export interface PathPreviewNode {
  seq: number
  name: string
  mode: NodeMode
  candidates: UserBrief[]
  effective: boolean
  conditionText: string | null
  assignee: UserBrief | null
  resolveNote: string | null
}

export interface PathPreview {
  nodes: PathPreviewNode[]
  errors: string[] // 如审批人无法解析
}

// ---------- 待办 ----------

export interface TaskItem {
  taskId: number
  applicationId: number
  appNo: string
  type: AppType
  title: string | null
  templateName: string
  applicant: UserBrief
  deptName: string | null
  amountCents: number | null
  nodeName: string
  status: TaskStatus
  comment: string | null
  appStatus: AppStatus
  appVersion: number
  submittedAt: string | null
  createdAt: string
  actedAt: string | null
  overdue: boolean
}

export interface TaskQuery extends PageQuery {
  type?: AppType | null
  keyword?: string | null
}

export interface ApproveBody {
  appVersion: number
  comment?: string | null
}

export interface RejectBody {
  appVersion: number
  comment: string // 5-500 字
}

export interface ActionBody {
  appVersion: number
}

// ---------- 通知 ----------

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'NODE_APPROVED'
  | 'APP_APPROVED'
  | 'APP_REJECTED'
  | 'TASK_CANCELED'
  | 'TASK_TRANSFERRED'
  | 'REGISTRATION_APPROVED'
  | 'URGE'
  | 'TASK_OVERDUE'

export interface NotificationItem {
  id: number
  type: NotificationType
  title: string
  content: string | null
  applicationId: number | null
  linkPath: string | null
  read: boolean
  createdAt: string
}

/** SSE event: notification 的 data */
export interface NoticeEvent {
  id: number
  type: NotificationType
  title: string
  linkPath: string | null
  applicationId: number | null
  unreadCount: number
}

export interface NotificationChanges {
  items: NotificationItem[] // id > since，按 id 升序
  unreadCount: number
}

// ---------- 统计 ----------

export interface DateRange {
  from?: string | null
  to?: string | null
}

export interface PersonalStats {
  statusCounts: Record<AppStatus, number>
  pendingTaskCount: number
  approvedAmountCents: number
  approvedCount: number
}

export interface TypeStatusRow {
  type: AppType
  status: AppStatus
  count: number
  approvedAmountCents: number
  inProgressAmountCents: number
}

export interface StatsTotals {
  count: number
  approvedCount: number
  rejectedCount: number
  inApprovalCount: number
  approvedAmountCents: number
  inProgressAmountCents: number
  approvalRate: number | null // 0-1；分母为 0 时为 null
  avgApprovalHours: number | null
}

export interface MonthlyRow {
  month: string // YYYY-MM
  count: number
  approvedAmountCents: number
}

export interface DeptStats {
  deptId: number
  deptName: string
  from: string
  to: string
  byTypeStatus: TypeStatusRow[]
  totals: StatsTotals
  monthly: MonthlyRow[]
}

export interface FinanceStats {
  from: string
  to: string
  byExpenseType: { code: string; name: string; approvedAmountCents: number; itemCount: number }[]
  noInvoice: { count: number; amountCents: number; ratio: number | null }
  byDept: {
    deptId: number
    deptName: string
    expenseAmountCents: number
    purchaseAmountCents: number
  }[]
}

export interface EnterpriseStats {
  from: string
  to: string
  byDept: ({ deptId: number; deptName: string } & StatsTotals)[]
}

// ---------- 管理端 ----------

export interface AdminUser {
  id: number
  username: string
  realName: string
  email: string
  status: UserStatus
  deptId: number | null
  deptName: string | null
  requestedDeptId: number | null
  requestedDeptName: string | null
  roles: RoleBrief[]
  createdAt: string
  lastLoginAt: string | null
  lockedUntil: string | null
}

export interface AdminUserQuery extends PageQuery {
  status?: UserStatus | null
  deptId?: number | null
  keyword?: string | null
}

export interface AdminDept {
  id: number
  code: string
  name: string
  headUserId: number | null
  headName: string | null
  userCount: number
  sortOrder: number
  createdAt: string
}

export interface RoleView {
  id: number
  code: RoleCode
  name: string
  description: string | null
  permissions: { code: string; name: string }[]
  members: { userId: number; realName: string; deptName: string | null; primaryHandler: boolean }[]
}

export interface GrantView {
  id: number
  userId: number
  userName: string
  permissionCode: GrantPermission
  scopeType: ScopeType
  deptId: number | null
  deptName: string | null
  validFrom: string
  validUntil: string | null
  reason: string
  grantedByName: string
  createdAt: string
  revokedAt: string | null
  revokedByName: string | null
  active: boolean
}

export interface GrantCreateRequest {
  userId: number
  permissionCode: GrantPermission
  scopeType: ScopeType
  deptId?: number | null
  validFrom?: string | null
  validUntil?: string | null
  reason: string
}

export interface TemplateAdminItem {
  id: number
  code: string
  name: string
  description: string | null
  category: 'BUILTIN' | 'CUSTOM'
  bizType: AppType
  enabled: boolean
  deptIds: number[]
  deptNames: string[]
  currentVersionNo: number | null
  hasDraft: boolean
  usageCount: number
  updatedAt: string
}

export interface TemplateVersionBrief {
  id: number
  versionNo: number
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  changeNote: string | null
  createdAt: string
  publishedAt: string | null
  publishedByName: string | null
}

export interface TemplateVersionDetail extends TemplateVersionBrief {
  formSchema: FormSchema
  nodeConfig: NodeConfig
}

export interface TemplateAdminDetail extends TemplateAdminItem {
  versions: TemplateVersionBrief[]
  published: TemplateVersionDetail | null
  draft: TemplateVersionDetail | null
}

export interface TemplateCreateRequest {
  code: string
  name: string
  description?: string | null
  deptIds: number[]
}

export interface TemplateUpdateRequest {
  name: string
  description?: string | null
  deptIds: number[]
}

export interface DraftVersionRequest {
  formSchema: FormSchema
  nodeConfig: NodeConfig
}

export interface ValidationIssue {
  code: string // TPL_*
  path: string | null // 如 fields[2].rules.min、nodes[1].approverRule
  message: string
}

export interface MonitorTask {
  taskId: number
  applicationId: number
  appNo: string
  type: AppType
  templateName: string
  applicantName: string
  deptName: string | null
  nodeName: string
  assignee: { id: number; realName: string; status: UserStatus }
  createdAt: string
  pendingHours: number
  overdue: boolean
}

export interface MonitorTaskQuery extends PageQuery {
  assigneeStatus?: UserStatus | null // 如 DISABLED：已停用审批人名下的待办
  keyword?: string | null
}

export interface TransferRequest {
  toUserId: number
  reason: string
}

export interface AuditLogView {
  id: number
  operatorName: string | null
  action: string
  targetType: string
  targetId: string | null
  beforeData: unknown
  afterData: unknown
  reason: string | null
  ip: string | null
  createdAt: string
}

export interface AuditLogQuery extends PageQuery {
  action?: string | null
  targetType?: string | null
  targetId?: string | null
  operatorId?: number | null
  from?: string | null
  to?: string | null
}

export interface SysConfigItem {
  key: string
  value: string
  description: string | null
  updatedAt: string
}

export interface ExpenseTypeAdmin extends ExpenseTypeOption {
  sortOrder: number
  referenced: boolean
}

export interface DeliveryView {
  id: number
  notificationId: number
  recipientEmail: string
  title: string
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED'
  attempts: number
  nextRetryAt: string | null
  lastError: string | null
  sentAt: string | null
  createdAt: string
}

/** 带原因的管理操作请求体 */
export interface ReasonBody {
  reason: string
}
