<script setup lang="ts">
// 附件上传：前端预检类型 / 大小 / 数量，逐个上传（一次请求一个文件），显示进度，失败可重试；
// 预览与下载通过带令牌的 blob URL，下载保留原始文件名。
import { computed, onBeforeUnmount, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Picture, Upload } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import { ALLOWED_TYPES } from '@/lib/api/files'
import type { AttachmentMeta, AttachmentRefType } from '@/lib/types'
import { EXT_MIME, MIME_LABEL, downloadAttachment, fmtSize, injectUploadTracker, isImage } from '@/lib/fileView'
import { errorText } from '@/lib/errors'
import FilePreviewDialog from './FilePreviewDialog.vue'

const model = defineModel<AttachmentMeta[]>({ default: () => [] })

const props = withDefaults(
  defineProps<{
    refType: AttachmentRefType
    maxCount?: number
    /** 允许的 MIME，取自 image/jpeg、image/png、application/pdf */
    allowedTypes?: string[]
    maxSizeMb?: number
    readonly?: boolean
    disabled?: boolean
    buttonText?: string
    tip?: string | null
  }>(),
  {
    maxCount: 10,
    allowedTypes: () => ALLOWED_TYPES,
    maxSizeMb: 10,
    readonly: false,
    disabled: false,
    buttonText: '上传文件',
    tip: null,
  },
)

const emit = defineEmits<{ uploaded: [file: AttachmentMeta]; removed: [file: AttachmentMeta] }>()

defineSlots<{
  /** 每个已上传文件行的附加内容（如票据号输入框） */
  extra?: (p: { file: AttachmentMeta; index: number }) => unknown
}>()

interface Pending {
  uid: number
  file: File
  progress: number
  status: 'waiting' | 'uploading' | 'error'
  error: string | null
}

const tracker = injectUploadTracker()
const pending = ref<Pending[]>([])
const input = ref<HTMLInputElement | null>(null)
const previewFile = ref<AttachmentMeta | null>(null)
const previewVisible = ref(false)
const downloadingId = ref<number | null>(null)
let uid = 0
let running = false
let activeCount = 0

const allowed = computed(() => props.allowedTypes.filter((t) => ALLOWED_TYPES.includes(t)))
const allowedText = computed(() => allowed.value.map((t) => MIME_LABEL[t] ?? t).join('、'))
const accept = computed(() => {
  const exts = Object.entries(EXT_MIME)
    .filter(([, mime]) => allowed.value.includes(mime))
    .map(([ext]) => `.${ext}`)
  return [...exts, ...allowed.value].join(',')
})
const remaining = computed(() => props.maxCount - model.value.length - pending.value.length)
const uploadBlockReason = computed(() => {
  if (props.readonly) return '当前附件为只读，无法上传文件'
  if (props.disabled) return '当前已禁用上传，请稍后再试'
  if (remaining.value <= 0) return `最多上传 ${props.maxCount} 个文件，已达到数量上限`
  if (!allowed.value.length) return '当前未配置可上传的文件类型'
  return null
})
const canUpload = computed(() => !uploadBlockReason.value)
const hint = computed(
  () => props.tip ?? `可将文件拖到此处。支持 ${allowedText.value}，单个不超过 ${props.maxSizeMb} MB，最多 ${props.maxCount} 个`,
)
const dragging = ref(false)
let dragDepth = 0
let dragWarningShown = false

function setActive(delta: number) {
  activeCount += delta
  if (tracker) tracker.value += delta
}

function mimeOf(f: File): string | null {
  if (allowed.value.includes(f.type)) return f.type
  const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
  const byExt = EXT_MIME[ext]
  return byExt && allowed.value.includes(byExt) ? byExt : null
}

function precheck(f: File): string | null {
  if (!mimeOf(f)) return `“${f.name}”的类型不支持，仅支持 ${allowedText.value}`
  if (f.size === 0) return `“${f.name}”是空文件`
  if (f.size > props.maxSizeMb * 1024 * 1024) return `“${f.name}”超过 ${props.maxSizeMb} MB`
  return null
}

function pick() {
  if (canUpload.value) input.value?.click()
}

function onSelect(e: Event) {
  const el = e.target as HTMLInputElement
  const files = Array.from(el.files ?? [])
  el.value = '' // 允许再次选择同一文件
  addFiles(files)
}

// 选择文件与拖入文件共用：预检类型 / 大小 / 数量后加入上传队列
function addFiles(files: File[], fromDrop = false) {
  let slots = remaining.value
  for (const f of files) {
    const err = precheck(f)
    if (err) {
      if (fromDrop) warnDrag(err)
      else ElMessage.error(err)
      continue
    }
    if (slots <= 0) {
      const message = `最多上传 ${props.maxCount} 个文件`
      if (fromDrop) warnDrag(message)
      else ElMessage.warning(message)
      break
    }
    slots -= 1
    pending.value.push({ uid: ++uid, file: f, progress: 0, status: 'waiting', error: null })
    setActive(1)
  }
  void drain()
}

// 拖放：用计数器抵消子元素的 dragenter / dragleave 抖动；只响应带文件的拖动。
// 带文件的拖放一律先 preventDefault（只读、禁用、已满时也是），否则浏览器会直接打开文件、离开当前页面；
// 能否接收再按 readonly / disabled / 剩余数量决定。
function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

// dragenter / dragover / drop 以及多个不合规文件共用一次提示额度。
function warnDrag(message: string) {
  if (dragWarningShown) return
  dragWarningShown = true
  ElMessage.warning(message)
}

function onDragEnter(e: DragEvent) {
  // 只读附件区没有上传入口，但仍要拦住浏览器默认的「拖入即打开文件」
  if (props.readonly) {
    if (hasFiles(e)) {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    }
    return
  }
  if (!hasFiles(e)) return
  e.preventDefault()
  if (dragDepth === 0) dragWarningShown = false
  dragDepth += 1
  if (canUpload.value) dragging.value = true
}

function onDragOver(e: DragEvent) {
  if (props.readonly) {
    if (hasFiles(e)) {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    }
    return
  }
  if (!hasFiles(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = canUpload.value ? 'copy' : 'none'
}

function onDragLeave(e: DragEvent) {
  if (props.readonly || !hasFiles(e)) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    dragging.value = false
    dragWarningShown = false
  }
}

function onDrop(e: DragEvent) {
  if (props.readonly) {
    if (hasFiles(e)) e.preventDefault()
    return
  }
  if (!hasFiles(e)) return
  e.preventDefault()
  dragDepth = 0
  dragging.value = false
  // 真正放下时才提示原因；拖拽经过不打断用户
  if (uploadBlockReason.value) warnDrag(uploadBlockReason.value)
  else addFiles(Array.from(e.dataTransfer?.files ?? []), true)
  dragWarningShown = false
}

// 逐个上传：单次请求只带一个文件
async function drain() {
  if (running) return
  running = true
  try {
    for (;;) {
      const next = pending.value.find((p) => p.status === 'waiting')
      if (!next) break
      next.status = 'uploading'
      next.progress = 0
      try {
        const meta = await api.files.upload(next.file, props.refType, (p) => (next.progress = p))
        pending.value = pending.value.filter((p) => p.uid !== next.uid)
        model.value = [...model.value, meta]
        emit('uploaded', meta)
        setActive(-1)
      } catch (e) {
        next.status = 'error'
        next.error = errorText(e, '上传失败')
        setActive(-1)
      }
    }
  } finally {
    running = false
  }
}

function retry(p: Pending) {
  p.status = 'waiting'
  p.error = null
  setActive(1)
  void drain()
}

function dropPending(p: Pending) {
  pending.value = pending.value.filter((x) => x.uid !== p.uid)
}

function remove(index: number) {
  const [f] = model.value.slice(index, index + 1)
  model.value = model.value.filter((_, i) => i !== index)
  if (f) emit('removed', f)
}

function preview(f: AttachmentMeta) {
  previewFile.value = f
  previewVisible.value = true
}

async function download(f: AttachmentMeta) {
  downloadingId.value = f.id
  try {
    await downloadAttachment(f)
  } catch (e) {
    ElMessage.error(errorText(e, '下载失败'))
  } finally {
    downloadingId.value = null
  }
}

onBeforeUnmount(() => {
  // 卸载时归还计数，避免表单一直显示“上传中”
  if (activeCount && tracker) tracker.value -= activeCount
})
</script>

<template>
  <div
    class="uploader"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div v-if="!readonly" class="uploader-bar" :class="{ 'is-dragging': dragging, 'is-disabled': !canUpload }">
      <el-button size="small" :icon="Upload" :disabled="!canUpload" @click="pick">{{ buttonText }}</el-button>
      <span class="uploader-hint">{{ hint }}</span>
      <input ref="input" type="file" :accept="accept" :multiple="maxCount > 1" hidden @change="onSelect" />
    </div>

    <ul v-if="model.length || pending.length" class="file-list">
      <li v-for="(f, i) in model" :key="f.id" class="file-item">
        <div class="file-chip">
          <el-icon class="file-icon"><Picture v-if="isImage(f)" /><Document v-else /></el-icon>
          <el-button link type="primary" class="file-name" :title="f.originalName" @click="preview(f)">
            {{ f.originalName }}
          </el-button>
          <span class="file-size">{{ fmtSize(f.sizeBytes) }}</span>
          <span class="file-actions">
            <el-button link size="small" @click="preview(f)">预览</el-button>
            <el-button link size="small" :loading="downloadingId === f.id" @click="download(f)">下载</el-button>
            <el-button v-if="!readonly && !disabled" link size="small" type="danger" @click="remove(i)">删除</el-button>
          </span>
        </div>
        <slot name="extra" :file="f" :index="i" />
      </li>
      <li v-for="p in pending" :key="`p${p.uid}`" class="file-item pending">
        <div class="file-chip">
          <el-icon class="file-icon"><Document /></el-icon>
          <span class="file-name-text" :title="p.file.name">{{ p.file.name }}</span>
          <span class="file-size">{{ fmtSize(p.file.size) }}</span>
          <span v-if="p.status === 'error'" class="file-actions">
            <el-button link size="small" type="primary" @click="retry(p)">重试</el-button>
            <el-button link size="small" type="danger" @click="dropPending(p)">移除</el-button>
          </span>
        </div>
        <el-progress
          v-if="p.status !== 'error'"
          :percentage="p.progress"
          :stroke-width="4"
          :show-text="false"
          :indeterminate="p.status === 'waiting'"
        />
        <div v-else class="field-error-msg">{{ p.error }}</div>
      </li>
    </ul>
    <div v-else-if="readonly" class="file-empty">无附件</div>

    <FilePreviewDialog v-model="previewVisible" :file="previewFile" />
  </div>
</template>

<style scoped>
.uploader {
  width: 100%;
  min-width: 0;
}
.uploader :deep(.el-button) {
  min-height: 32px;
}
/* 上传栏即拖放区：虚线框像纸上裁切线；拖入文件时虚线变藏青、底色变天青浅 */
.uploader-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 12px 16px;
  border: 1.5px dashed var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
  background: var(--eas-field);
  transition:
    border-color var(--eas-dur-fast) var(--eas-ease),
    background-color var(--eas-dur-fast) var(--eas-ease);
}
.uploader-bar.is-dragging {
  border-color: var(--eas-primary);
  background: var(--eas-sky-tint);
}
.uploader-bar.is-disabled:not(.is-dragging) {
  background: var(--eas-tab);
}
.uploader-hint {
  flex: 1 1 200px;
  min-width: 0;
  font-size: var(--eas-fs-xs);
  line-height: 1.5;
  color: var(--eas-ink-3);
}
/* 拖入 / 禁用时底色变深，ink-3 不到 4.5:1 */
.uploader-bar.is-dragging .uploader-hint,
.uploader-bar.is-disabled .uploader-hint {
  color: var(--eas-ink-2);
}
/* 文件小行：纸色胶囊 + 一层纸影，行间留空 */
.file-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.file-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.file-chip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
  min-height: 34px;
  padding: 4px 14px 4px 12px;
  background: var(--eas-sheet);
  border-radius: var(--eas-radius-pill);
  box-shadow: 2px 2px 0 var(--eas-shade);
}
.file-icon {
  color: var(--eas-ink-3);
}
.file-name,
.file-name-text {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}
.file-name-text {
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink);
}
.file-item.pending :deep(.el-progress) {
  margin-top: 2px;
}
.file-name :deep(span) {
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-size {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.file-empty {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}
.file-actions {
  margin-left: auto;
  white-space: nowrap;
}
.file-actions .el-button + .el-button {
  margin-left: 4px;
}
@media (prefers-reduced-motion: reduce) {
  .uploader-bar {
    transition: none;
  }
}
</style>
