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
const canUpload = computed(() => !props.readonly && !props.disabled && remaining.value > 0)
const hint = computed(
  () => props.tip ?? `支持 ${allowedText.value}，单个不超过 ${props.maxSizeMb} MB，最多 ${props.maxCount} 个`,
)

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
  let slots = remaining.value
  for (const f of files) {
    const err = precheck(f)
    if (err) {
      ElMessage.error(err)
      continue
    }
    if (slots <= 0) {
      ElMessage.warning(`最多上传 ${props.maxCount} 个文件`)
      break
    }
    slots -= 1
    pending.value.push({ uid: ++uid, file: f, progress: 0, status: 'waiting', error: null })
    setActive(1)
  }
  void drain()
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
  <div class="uploader">
    <div v-if="!readonly" class="uploader-bar">
      <el-button size="small" :icon="Upload" :disabled="!canUpload" @click="pick">{{ buttonText }}</el-button>
      <span class="muted small">{{ hint }}</span>
      <input ref="input" type="file" :accept="accept" :multiple="maxCount > 1" hidden @change="onSelect" />
    </div>

    <ul v-if="model.length || pending.length" class="file-list">
      <li v-for="(f, i) in model" :key="f.id" class="file-item">
        <el-icon class="file-icon"><Picture v-if="isImage(f)" /><Document v-else /></el-icon>
        <div class="file-main">
          <div class="file-row">
            <el-button link type="primary" class="file-name" :title="f.originalName" @click="preview(f)">
              {{ f.originalName }}
            </el-button>
            <span class="muted small nowrap">{{ fmtSize(f.sizeBytes) }}</span>
            <span class="file-actions">
              <el-button link size="small" @click="preview(f)">预览</el-button>
              <el-button link size="small" :loading="downloadingId === f.id" @click="download(f)">下载</el-button>
              <el-button v-if="!readonly && !disabled" link size="small" type="danger" @click="remove(i)">删除</el-button>
            </span>
          </div>
          <slot name="extra" :file="f" :index="i" />
        </div>
      </li>
      <li v-for="p in pending" :key="`p${p.uid}`" class="file-item pending">
        <el-icon class="file-icon"><Document /></el-icon>
        <div class="file-main">
          <div class="file-row">
            <span class="file-name-text" :title="p.file.name">{{ p.file.name }}</span>
            <span class="muted small nowrap">{{ fmtSize(p.file.size) }}</span>
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
        </div>
      </li>
    </ul>
    <div v-else-if="readonly" class="muted small">无附件</div>

    <FilePreviewDialog v-model="previewVisible" :file="previewFile" />
  </div>
</template>

<style scoped>
.uploader-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.file-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.file-item {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
}
.file-icon {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
}
.file-main {
  flex: 1;
  min-width: 0;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.file-name,
.file-name-text {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}
.file-name :deep(span) {
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-actions {
  margin-left: auto;
  white-space: nowrap;
}
.file-actions .el-button + .el-button {
  margin-left: 4px;
}
</style>
