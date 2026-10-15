// 附件预览与下载：/api/files/{id}/content 需要 Authorization 头，
// 先用 axios 取成 Blob，再生成 blob URL 预览或下载（保留原始文件名）。
import { inject, provide, ref, type InjectionKey, type Ref } from 'vue'
import { api } from './api'
import type { AttachmentMeta } from './types'

export const MIME_LABEL: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'application/pdf': 'PDF',
}

export const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
}

export function isImage(meta: Pick<AttachmentMeta, 'contentType'>): boolean {
  return meta.contentType.startsWith('image/')
}

export function isPdf(meta: Pick<AttachmentMeta, 'contentType'>): boolean {
  return meta.contentType === 'application/pdf'
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 取附件内容并生成 blob URL；调用方负责 URL.revokeObjectURL */
export async function attachmentObjectUrl(meta: AttachmentMeta): Promise<string> {
  const blob = await api.files.blob(meta.id)
  // 以服务端识别的类型为准，便于浏览器内联显示 PDF / 图片
  const typed = blob.type === meta.contentType ? blob : new Blob([blob], { type: meta.contentType })
  return URL.createObjectURL(typed)
}

/** 下载附件，文件名保持原始文件名 */
export async function downloadAttachment(meta: AttachmentMeta): Promise<void> {
  const url = await attachmentObjectUrl(meta)
  const a = document.createElement('a')
  a.href = url
  a.download = meta.originalName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ---------- 上传进度跟踪：表单在附件上传期间禁用保存 / 提交 ----------

const TRACKER: InjectionKey<Ref<number>> = Symbol('upload-tracker')

/** 在表单页面调用，返回正在上传的文件数 */
export function provideUploadTracker(): Ref<number> {
  const count = ref(0)
  provide(TRACKER, count)
  return count
}

export function injectUploadTracker(): Ref<number> | null {
  return inject(TRACKER, null)
}
