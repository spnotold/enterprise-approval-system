// 移动端附件接口：对应 Web 端 lib/api/files.ts（那个文件依赖 File / Blob / axios，不复制）。
// 上传：uni.uploadFile 逐个上传到 POST /api/files，表单字段 refType，返回 AttachmentMeta。
// 预览 / 下载：GET /api/files/{id}/content 需要带令牌，先 uni.downloadFile（带 Authorization）
//   到临时文件，再用 uni.previewImage / uni.openDocument 打开。

import { API_BASE } from './config'
import { ApiError, authFailed, authHeaders, currentAccessToken, parseResponse, refreshOnce, toApiError } from './http'
import type { AttachmentMeta, AttachmentRefType } from './types'

export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
export const MAX_FILE_BYTES = 10 * 1024 * 1024

/** 已选中、待上传的本地文件 */
export interface LocalFile {
  /** 小程序为临时文件路径；H5 为 blob URL */
  path: string
  /** 原始文件名（小程序拍照 / 相册时为临时文件名） */
  name: string
  size: number
  kind: 'image' | 'pdf'
  /** 仅 H5：浏览器 File 对象，上传时保留原始文件名 */
  file?: File
}

export interface UploadHandle {
  promise: Promise<AttachmentMeta>
  abort(): void
}

export function contentUrl(id: number, download = false): string {
  return `${API_BASE}/files/${id}/content${download ? '?download=1' : ''}`
}

export function isImage(contentType: string | null | undefined): boolean {
  return !!contentType && contentType.startsWith('image/')
}

export function isPdf(contentType: string | null | undefined): boolean {
  return contentType === 'application/pdf'
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  // 两位小数的 MB，用整数运算避免浮点显示误差
  const hundredths = Math.round((bytes * 100) / (1024 * 1024))
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')} MB`
}

function uploadOnce(
  local: LocalFile,
  refType: AttachmentRefType,
  onProgress: ((p: number) => void) | undefined,
  setTask: (t: UniApp.UploadTask) => void,
): Promise<AttachmentMeta> {
  return new Promise<AttachmentMeta>((resolve, reject) => {
    const options: UniApp.UploadFileOption = {
      url: `${API_BASE}/files`,
      name: 'file',
      formData: { refType },
      header: authHeaders(),
      timeout: 120_000,
      success: (res) => {
        try {
          resolve(parseResponse<AttachmentMeta>(res.statusCode, res.data))
        } catch (e) {
          reject(e)
        }
      },
      fail: (err) => {
        const aborted = !!err && /abort/i.test(String((err as { errMsg?: string }).errMsg ?? ''))
        reject(new ApiError({ code: -1, message: aborted ? '已取消上传' : '上传失败，请检查网络后重试' }, null))
      },
    }
    // #ifdef H5
    if (local.file) {
      // 传 File 对象，multipart 中保留原始文件名（后端会校验扩展名与真实类型一致）
      ;(options as UniApp.UploadFileOption & { file: File }).file = local.file
    } else {
      options.filePath = local.path
    }
    // #endif
    // #ifndef H5
    options.filePath = local.path
    // #endif
    const task = uni.uploadFile(options)
    setTask(task)
    if (onProgress) task.onProgressUpdate((r) => onProgress(r.progress))
  })
}

/** 上传单个文件；访问令牌过期时刷新后重传一次 */
export function uploadFile(
  local: LocalFile,
  refType: AttachmentRefType,
  onProgress?: (percent: number) => void,
): UploadHandle {
  let task: UniApp.UploadTask | null = null
  let aborted = false
  const setTask = (t: UniApp.UploadTask) => {
    task = t
    if (aborted) t.abort()
  }
  const run = async (): Promise<AttachmentMeta> => {
    const tokenAtSend = currentAccessToken()
    try {
      return await uploadOnce(local, refType, onProgress, setTask)
    } catch (err) {
      const e = toApiError(err)
      if (e.code !== 40102 || aborted) throw e
      const current = currentAccessToken()
      if (!current || current === tokenAtSend) {
        try {
          await refreshOnce()
        } catch {
          authFailed()
          throw e
        }
      }
      return uploadOnce(local, refType, onProgress, setTask)
    }
  }
  return {
    promise: run(),
    abort() {
      aborted = true
      task?.abort()
    },
  }
}

/** 带令牌下载到临时文件，返回临时路径（H5 为 blob URL） */
export async function downloadAttachment(id: number, download = false): Promise<string> {
  const once = () =>
    new Promise<{ statusCode: number; tempFilePath: string }>((resolve, reject) => {
      uni.downloadFile({
        url: contentUrl(id, download),
        header: authHeaders(),
        timeout: 120_000,
        success: (res) => resolve({ statusCode: res.statusCode, tempFilePath: res.tempFilePath }),
        fail: () => reject(new ApiError({ code: -1, message: '下载失败，请检查网络后重试' }, null)),
      })
    })
  const tokenAtSend = currentAccessToken()
  let res = await once()
  if (res.statusCode === 401) {
    // 下载响应体是文件流，拿不到错误码；401 统一按令牌过期处理，刷新后重试一次
    const current = currentAccessToken()
    if (!current || current === tokenAtSend) {
      try {
        await refreshOnce()
      } catch {
        authFailed()
        throw new ApiError({ code: 40102, message: '登录已过期，请重新登录' }, 401)
      }
    }
    res = await once()
  }
  if (res.statusCode === 403 || res.statusCode === 404) {
    throw new ApiError({ code: 40401, message: '无权查看或附件已不存在' }, res.statusCode)
  }
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new ApiError({ code: -1, message: `下载失败（HTTP ${res.statusCode}）` }, res.statusCode)
  }
  return res.tempFilePath
}

/**
 * 预览附件：图片用 uni.previewImage，PDF 用 uni.openDocument（小程序）或新窗口（H5）。
 * 必须在点击事件中同步调用（H5 需要在用户手势内先打开新窗口，否则会被浏览器拦截）。
 */
export async function previewAttachment(meta: Pick<AttachmentMeta, 'id' | 'contentType' | 'originalName'>): Promise<void> {
  // #ifdef H5
  let win: Window | null = null
  if (!isImage(meta.contentType)) win = window.open('', '_blank')
  // #endif
  uni.showLoading({ title: '加载中', mask: true })
  try {
    const path = await downloadAttachment(meta.id)
    uni.hideLoading()
    if (isImage(meta.contentType)) {
      uni.previewImage({ urls: [path], current: path })
      return
    }
    // #ifdef H5
    if (win) {
      win.location.href = path
    } else {
      // 新窗口被拦截时退化为下载
      const a = document.createElement('a')
      a.href = path
      a.download = meta.originalName || `附件${meta.id}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
    // #endif
    // #ifndef H5
    await new Promise<void>((resolve, reject) => {
      uni.openDocument({
        filePath: path,
        fileType: 'pdf',
        showMenu: true,
        success: () => resolve(),
        fail: () => reject(new ApiError({ code: -1, message: '无法打开该文件' }, null)),
      })
    })
    // #endif
  } catch (e) {
    uni.hideLoading()
    // #ifdef H5
    win?.close()
    // #endif
    throw e
  }
}
