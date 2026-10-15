// ⚠ 此文件由 mobile/scripts/sync-lib.mjs 从 frontend/src/lib/api/templates.ts 原样复制生成，请勿手动修改。
// 修改请改 Web 端源文件后执行 npm run sync-lib。
import { http } from '../http'
import type { TemplateDetail, TemplateOption } from '../types'

export const templates = {
  /** 当前用户可发起的模板：三个内置模板 + 已启用且适用于本部门的自定义模板 */
  available: () => http.get<TemplateOption[]>('/templates/available'),
  /** 模板当前发布版本（自定义表单渲染用） */
  current: (templateId: number) => http.get<TemplateDetail>(`/templates/${templateId}/current`),
}
