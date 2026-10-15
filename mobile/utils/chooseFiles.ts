// 选择附件：
// - 图片：uni.chooseImage，拍照或相册，sizeType 选压缩；超过上限的图片先压缩
//   （小程序 uni.compressImage；H5 没有该接口，用 canvas 重新编码为 JPEG）
// - PDF：小程序用 wx.chooseMessageFile（从聊天记录选择）；H5 用 <input type="file" accept="image/*,application/pdf">
// - PDF 超过上限直接提示
// 注意：H5 必须在点击事件中同步调用（浏览器要求文件选择由用户手势触发）。

import { ALLOWED_TYPES, MAX_FILE_BYTES, type LocalFile } from '@/lib/files'

export interface ChooseResult {
  files: LocalFile[]
  /** 被拒绝的文件及原因 */
  errors: string[]
}

export interface ChooseLimits {
  count: number
  /** 允许的 MIME，默认 JPEG / PNG / PDF */
  allowedTypes?: string[]
  /** 单个文件上限（字节），默认 10 MB */
  maxBytes?: number
}

function baseName(path: string): string {
  const clean = path.split('?')[0]
  return clean.substring(clean.lastIndexOf('/') + 1) || clean
}

function mimeOf(name: string, mime?: string): string | null {
  if (mime && ALLOWED_TYPES.includes(mime)) return mime
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'pdf') return 'application/pdf'
  return null
}

function sizeText(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`
}

function isCancel(err: unknown): boolean {
  return /cancel/i.test(String((err as { errMsg?: string } | undefined)?.errMsg ?? ''))
}

// ---------- 压缩 ----------

// #ifndef H5
function compressOnce(src: string, quality: number): Promise<{ path: string; size: number }> {
  return new Promise((resolve, reject) => {
    uni.compressImage({
      src,
      quality,
      success: (r) => {
        uni.getFileInfo({
          filePath: r.tempFilePath,
          success: (info) => resolve({ path: r.tempFilePath, size: info.size }),
          fail: reject,
        })
      },
      fail: reject,
    })
  })
}
// #endif

// #ifdef H5
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片无法解码'))
    }
    img.src = url
  })
}

async function compressH5(file: File, maxBytes: number): Promise<File> {
  const img = await loadImage(file)
  let maxSide = 4096
  let quality = 0.82
  for (let attempt = 0; attempt < 5; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) break
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
    if (blob && blob.size <= maxBytes) {
      const name = file.name.replace(/\.[^.]*$/, '') + '.jpg'
      return new File([blob], name, { type: 'image/jpeg' })
    }
    maxSide = Math.round(maxSide * 0.75)
    quality = Math.max(0.5, quality - 0.1)
  }
  throw new Error('压缩后仍超过大小限制')
}
// #endif

/** 图片超限时压缩；失败返回 null */
async function ensureImageSize(f: LocalFile, maxBytes: number): Promise<LocalFile | null> {
  if (f.size <= maxBytes) return f
  try {
    // #ifdef H5
    if (f.file) {
      const c = await compressH5(f.file, maxBytes)
      return { path: URL.createObjectURL(c), name: c.name, size: c.size, kind: 'image', file: c }
    }
    return null
    // #endif
    // #ifndef H5
    for (const q of [60, 30]) {
      const c = await compressOnce(f.path, q)
      if (c.size <= maxBytes) return { ...f, path: c.path, size: c.size }
    }
    return null
    // #endif
  } catch {
    return null
  }
}

async function finalize(
  raw: { path: string; name: string; size: number; mime?: string; file?: File }[],
  limits: ChooseLimits,
): Promise<ChooseResult> {
  const allowed = limits.allowedTypes?.length ? limits.allowedTypes : ALLOWED_TYPES
  const maxBytes = Math.min(limits.maxBytes ?? MAX_FILE_BYTES, MAX_FILE_BYTES)
  const files: LocalFile[] = []
  const errors: string[] = []
  for (const r of raw.slice(0, limits.count)) {
    const mime = mimeOf(r.name, r.mime)
    if (!mime || !allowed.includes(mime)) {
      errors.push(`${r.name}：不支持的文件类型`)
      continue
    }
    const kind = mime === 'application/pdf' ? 'pdf' : 'image'
    const f: LocalFile = { path: r.path, name: r.name, size: r.size, kind, file: r.file }
    if (kind === 'pdf') {
      if (f.size > maxBytes) errors.push(`${r.name}：PDF 超过 ${sizeText(maxBytes)}，请压缩后再上传`)
      else files.push(f)
      continue
    }
    const ok = await ensureImageSize(f, maxBytes)
    if (ok) files.push(ok)
    else errors.push(`${r.name}：图片超过 ${sizeText(maxBytes)} 且无法压缩`)
  }
  if (raw.length > limits.count) errors.push(`最多还能添加 ${limits.count} 个文件，多余的已忽略`)
  return { files, errors }
}

/** 拍照或从相册选择图片 */
export function chooseImages(source: 'camera' | 'album', limits: ChooseLimits): Promise<ChooseResult> {
  return new Promise((resolve) => {
    uni.chooseImage({
      count: Math.max(1, Math.min(limits.count, 9)),
      sizeType: ['compressed'],
      sourceType: [source],
      success: (res) => {
        const list = (Array.isArray(res.tempFiles) ? res.tempFiles : [res.tempFiles]) as (
          | File
          | { path: string; size: number; name?: string }
        )[]
        const raw = list.map((t) => {
          // #ifdef H5
          if (t instanceof File) {
            return { path: (t as File & { path: string }).path, name: t.name, size: t.size, mime: t.type, file: t }
          }
          // #endif
          const x = t as { path: string; size: number; name?: string }
          return { path: x.path, name: x.name || baseName(x.path), size: x.size }
        })
        finalize(raw, limits).then(resolve)
      },
      fail: (err) => resolve({ files: [], errors: isCancel(err) ? [] : ['无法打开相机或相册'] }),
    })
  })
}

/** 选择 PDF（H5 同时可选图片） */
export function chooseDocuments(limits: ChooseLimits): Promise<ChooseResult> {
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    const allowed = limits.allowedTypes?.length ? limits.allowedTypes : ALLOWED_TYPES
    const withImages = allowed.some((t) => t.startsWith('image/'))
    wx.chooseMessageFile({
      count: Math.max(1, Math.min(limits.count, 10)),
      type: withImages ? 'all' : 'file',
      extension: withImages ? ['pdf', 'jpg', 'jpeg', 'png'] : ['pdf'],
      success: (res) => {
        const raw = res.tempFiles.map((t) => ({ path: t.path, name: t.name || baseName(t.path), size: t.size }))
        finalize(raw, limits).then(resolve)
      },
      fail: (err) => resolve({ files: [], errors: isCancel(err) ? [] : ['无法选择文件'] }),
    })
    // #endif
    // #ifdef H5
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,application/pdf'
    input.multiple = limits.count > 1
    input.style.display = 'none'
    input.addEventListener('change', () => {
      const picked = Array.from(input.files ?? [])
      document.body.removeChild(input)
      const raw = picked.map((f) => ({ path: URL.createObjectURL(f), name: f.name, size: f.size, mime: f.type, file: f }))
      finalize(raw, limits).then(resolve)
    })
    document.body.appendChild(input)
    input.click()
    // #endif
  })
}
