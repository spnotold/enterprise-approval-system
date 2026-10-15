// 仅 Web 端：移动端用 uni.uploadFile 另行实现
import { fetchBlob, uploadFile } from '../http'
import type { AttachmentMeta, AttachmentRefType } from '../types'

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
export const MAX_FILE_BYTES = 10 * 1024 * 1024

export const files = {
  upload: (file: File, refType: AttachmentRefType, onProgress?: (p: number) => void) =>
    uploadFile<AttachmentMeta>('/files', file, { refType }, onProgress),
  /** 内容地址需带令牌访问，页面中用 blob URL 预览 */
  blob: (id: number) => fetchBlob(`/files/${id}/content`),
  contentUrl: (id: number, download = false) => `/api/files/${id}/content${download ? '?download=1' : ''}`,
}
