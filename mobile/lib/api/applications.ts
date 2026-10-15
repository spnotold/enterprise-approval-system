// ⚠ 此文件由 mobile/scripts/sync-lib.mjs 从 frontend/src/lib/api/applications.ts 原样复制生成，请勿手动修改。
// 修改请改 Web 端源文件后执行 npm run sync-lib。
import { http } from '../http'
import type {
  ActionBody,
  ActionResult,
  ApplicationDetail,
  ApplicationQuery,
  ApplicationSummary,
  ApprovalLogView,
  CustomSaveRequest,
  DraftSaved,
  DupInvoiceWarning,
  ExpenseSaveRequest,
  LinkableApplication,
  PageResponse,
  PathPreview,
  PurchaseSaveRequest,
  TravelSaveRequest,
} from '../types'

type SaveBodyMap = {
  purchase: PurchaseSaveRequest
  travel: TravelSaveRequest
  expense: ExpenseSaveRequest
  custom: CustomSaveRequest
}
export type TypePath = keyof SaveBodyMap

const idem = (key: string) => ({ headers: { 'Idempotency-Key': key } })

export const applications = {
  /** 新建草稿；custom 需在请求体中带 templateId */
  create: <K extends TypePath>(type: K, body: SaveBodyMap[K]) =>
    http.post<DraftSaved>(`/applications/${type}`, body),
  /** 保存草稿，body.version 必填；版本不一致返回 40905 */
  save: <K extends TypePath>(id: number, type: K, body: SaveBodyMap[K]) =>
    http.put<DraftSaved>(`/applications/${id}/${type}`, body),
  list: (q: ApplicationQuery) =>
    http.get<PageResponse<ApplicationSummary>>('/applications', { params: { ...q } }),
  detail: (id: number) => http.get<ApplicationDetail>(`/applications/${id}`),
  logs: (id: number) => http.get<ApprovalLogView[]>(`/applications/${id}/logs`),
  submit: (id: number, body: ActionBody, idemKey: string) =>
    http.post<ActionResult>(`/applications/${id}/submit`, body, idem(idemKey)),
  withdraw: (id: number, body: ActionBody, idemKey: string) =>
    http.post<ActionResult>(`/applications/${id}/withdraw`, body, idem(idemKey)),
  remove: (id: number) => http.del<void>(`/applications/${id}`),
  /** 复制已驳回 / 已撤回的申请为新草稿 */
  copy: (id: number) => http.post<DraftSaved>(`/applications/${id}/copy`),
  /** 按草稿当前内容预览审批路径 */
  pathPreview: (id: number) => http.get<PathPreview>(`/applications/${id}/path-preview`),
  /** 报销可关联的申请：本人已通过的差旅 / 采购单 */
  linkable: () => http.get<LinkableApplication[]>('/applications/linkable'),
  /** 催办【增强】：同一节点每 4 小时一次 */
  urge: (id: number, idemKey: string) =>
    http.post<{ urged: boolean; nextAllowedAt: string | null }>(`/applications/${id}/urge`, {}, idem(idemKey)),
  /** 跨单重复票据提示【增强】 */
  invoiceDuplicates: (id: number) => http.get<DupInvoiceWarning[]>(`/applications/${id}/invoice-duplicates`),
}
