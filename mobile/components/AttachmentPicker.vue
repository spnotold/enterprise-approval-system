<script setup lang="ts">
// 附件选择与上传：拍照 / 相册 / PDF（小程序从聊天记录选择，H5 用文件选择框），
// 逐个上传并显示进度，失败可重试；点击已上传的附件预览。
// 报销票据模式（withInvoiceNo）下每个附件可填写票据号，通过 v-model:invoiceNos 同步。
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import type { AttachmentMeta, AttachmentRefType } from '@/lib/types'
import { ALLOWED_TYPES, MAX_FILE_BYTES, formatSize, isPdf, previewAttachment, uploadFile } from '@/lib/files'
import type { LocalFile, UploadHandle } from '@/lib/files'
import { toApiError } from '@/lib/http'
import { chooseDocuments, chooseImages, type ChooseResult } from '@/utils/chooseFiles'
import { confirm, showError, toast } from '@/utils/feedback'

const props = withDefaults(
  defineProps<{
    modelValue: AttachmentMeta[]
    refType: AttachmentRefType
    maxCount?: number
    allowedTypes?: string[]
    maxSizeMb?: number
    readonly?: boolean
    withInvoiceNo?: boolean
    invoiceNos?: string[]
    /** 附件 ID → 提示文字（如跨单疑似重复票据） */
    warnings?: Record<number, string>
    error?: string
    emptyText?: string
  }>(),
  {
    maxCount: 10,
    allowedTypes: () => [],
    maxSizeMb: 10,
    readonly: false,
    withInvoiceNo: false,
    invoiceNos: () => [],
    warnings: () => ({}),
    error: '',
    emptyText: '暂无附件',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: AttachmentMeta[]]
  'update:invoiceNos': [value: string[]]
  busy: [value: boolean]
}>()

interface Pending {
  key: number
  local: LocalFile
  progress: number
  status: 'uploading' | 'failed'
  message: string
  handle: UploadHandle | null
}

// 本地镜像：多个上传几乎同时完成时，props 还没来得及更新，直接读 props 会互相覆盖
const list = ref<AttachmentMeta[]>([...props.modelValue])
const nos = ref<string[]>([...props.invoiceNos])
const pending = reactive<Pending[]>([])
let seq = 0

watch(
  () => props.modelValue,
  (v) => {
    const same = v.length === list.value.length && v.every((m, i) => m.id === list.value[i]?.id)
    if (!same) list.value = [...v]
  },
)
watch(
  () => props.invoiceNos,
  (v) => {
    if (v.join('\u0001') !== nos.value.join('\u0001')) nos.value = [...v]
  },
)

const allowed = computed(() => (props.allowedTypes.length ? props.allowedTypes : ALLOWED_TYPES))
const allowImage = computed(() => allowed.value.some((t) => t.startsWith('image/')))
const allowPdf = computed(() => allowed.value.includes('application/pdf'))
const maxBytes = computed(() => Math.min(props.maxSizeMb * 1024 * 1024, MAX_FILE_BYTES))
const remaining = computed(() => props.maxCount - list.value.length - pending.length)
const uploading = computed(() => pending.some((p) => p.status === 'uploading'))

const typeHint = computed(() => {
  const parts: string[] = []
  if (allowed.value.includes('image/jpeg')) parts.push('JPG')
  if (allowed.value.includes('image/png')) parts.push('PNG')
  if (allowPdf.value) parts.push('PDF')
  return `支持 ${parts.join(' / ')}，单个不超过 ${props.maxSizeMb} MB，最多 ${props.maxCount} 个`
})

// #ifdef H5
const docLabel = '选择文件'
// #endif
// #ifndef H5
const docLabel = '聊天文件'
// #endif

watch(uploading, (v) => emit('busy', v))

function commit(): void {
  emit('update:modelValue', [...list.value])
  if (props.withInvoiceNo) emit('update:invoiceNos', [...nos.value])
}

function start(p: Pending): void {
  p.status = 'uploading'
  p.progress = 0
  p.message = ''
  const handle = uploadFile(p.local, props.refType, (v) => {
    p.progress = v
  })
  p.handle = handle
  handle.promise.then(
    (meta) => {
      const i = pending.indexOf(p)
      if (i < 0) return // 已被移除
      pending.splice(i, 1)
      list.value.push(meta)
      nos.value.push('')
      commit()
    },
    (err) => {
      p.status = 'failed'
      p.message = toApiError(err).message
      p.handle = null
    },
  )
}

function handleChosen(r: ChooseResult): void {
  if (r.errors.length) {
    if (r.errors.length === 1 && !r.files.length) toast(r.errors[0])
    else uni.showModal({ title: '部分文件未添加', content: r.errors.join('\n'), showCancel: false })
  }
  for (const local of r.files) {
    const p = reactive<Pending>({ key: ++seq, local, progress: 0, status: 'uploading', message: '', handle: null })
    pending.push(p)
    start(pending[pending.length - 1])
  }
}

function limits() {
  return { count: remaining.value, allowedTypes: allowed.value, maxBytes: maxBytes.value }
}

function pickImage(source: 'camera' | 'album'): void {
  if (remaining.value <= 0) return toast(`最多 ${props.maxCount} 个附件`)
  void chooseImages(source, limits()).then(handleChosen)
}

function pickDocument(): void {
  if (remaining.value <= 0) return toast(`最多 ${props.maxCount} 个附件`)
  // H5 需要在点击事件中同步打开文件选择框
  void chooseDocuments(limits()).then(handleChosen)
}

function retry(p: Pending): void {
  start(p)
}

function dropPending(p: Pending): void {
  p.handle?.abort()
  const i = pending.indexOf(p)
  if (i >= 0) pending.splice(i, 1)
}

async function remove(index: number): Promise<void> {
  const ok = await confirm({ content: `删除附件“${list.value[index].originalName}”？`, danger: true, confirmText: '删除' })
  if (!ok) return
  list.value.splice(index, 1)
  nos.value.splice(index, 1)
  commit()
}

function onInvoiceNo(index: number, e: { detail: { value: string } }): void {
  while (nos.value.length < list.value.length) nos.value.push('')
  nos.value[index] = e.detail.value
  emit('update:invoiceNos', [...nos.value])
}

function preview(meta: AttachmentMeta): void {
  previewAttachment(meta).catch((e) => showError(e))
}

onUnmounted(() => {
  for (const p of pending) p.handle?.abort()
})
</script>

<template>
  <view class="att">
    <view v-if="!list.length && !pending.length && readonly" class="muted">{{ emptyText }}</view>

    <view v-for="(m, i) in list" :key="m.id" class="att-item">
      <view class="att-row">
        <view class="att-main" @tap="preview(m)">
          <view class="att-icon" :class="isPdf(m.contentType) ? 'pdf' : 'img'">
            {{ isPdf(m.contentType) ? 'PDF' : '图' }}
          </view>
          <view class="flex1">
            <view class="att-name ellipsis">{{ m.originalName }}</view>
            <view class="muted">{{ formatSize(m.sizeBytes) }} · 点击预览</view>
          </view>
        </view>
        <view v-if="!readonly" class="link-btn danger" @tap="remove(i)">删除</view>
      </view>
      <input
        v-if="withInvoiceNo && !readonly"
        class="input att-no"
        :value="nos[i] ?? ''"
        placeholder="票据号（选填，用于查重）"
        placeholder-class="placeholder"
        maxlength="64"
        @input="onInvoiceNo(i, $event)"
      />
      <view v-else-if="withInvoiceNo && nos[i]" class="muted">票据号：{{ nos[i] }}</view>
      <view v-if="warnings[m.id]" class="att-warn">{{ warnings[m.id] }}</view>
    </view>

    <view v-for="p in pending" :key="p.key" class="att-item">
      <view class="att-row">
        <view class="att-main">
          <view class="att-icon" :class="p.local.kind === 'pdf' ? 'pdf' : 'img'">
            {{ p.local.kind === 'pdf' ? 'PDF' : '图' }}
          </view>
          <view class="flex1">
            <view class="att-name ellipsis">{{ p.local.name }}</view>
            <view v-if="p.status === 'uploading'" class="att-progress">
              <view class="att-progress-bar" :style="{ width: p.progress + '%' }" />
            </view>
            <view v-else class="field-err">{{ p.message || '上传失败' }}</view>
          </view>
        </view>
        <view v-if="p.status === 'failed'" class="link-btn" @tap="retry(p)">重试</view>
        <view class="link-btn danger" @tap="dropPending(p)">{{ p.status === 'uploading' ? '取消' : '移除' }}</view>
      </view>
    </view>

    <view v-if="!readonly && remaining > 0" class="att-actions">
      <view v-if="allowImage" class="att-btn" @tap="pickImage('camera')">
        <uni-icons type="camera" size="20" color="#2f6bff" />
        <text>拍照</text>
      </view>
      <view v-if="allowImage" class="att-btn" @tap="pickImage('album')">
        <uni-icons type="image" size="20" color="#2f6bff" />
        <text>相册</text>
      </view>
      <view v-if="allowPdf" class="att-btn" @tap="pickDocument">
        <uni-icons type="paperclip" size="20" color="#2f6bff" />
        <text>{{ docLabel }}</text>
      </view>
    </view>
    <view v-if="!readonly" class="field-help">{{ typeHint }}</view>
    <view v-if="error" class="field-err">{{ error }}</view>
  </view>
</template>

<style scoped>
.att-item {
  padding: 8rpx 0;
  border-bottom: 1rpx solid #f0f1f2;
}

.att-row {
  display: flex;
  align-items: center;
}

.att-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  min-height: 88rpx;
}

.att-icon {
  width: 64rpx;
  height: 64rpx;
  border-radius: 10rpx;
  margin-right: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20rpx;
  font-weight: 600;
  flex-shrink: 0;
}

.att-icon.pdf {
  background: #fdecec;
  color: #e5484d;
}

.att-icon.img {
  background: #e8efff;
  color: #2f6bff;
}

.att-name {
  font-size: 28rpx;
}

.att-no {
  margin: 8rpx 0;
  height: 72rpx;
  font-size: 26rpx;
}

.att-warn {
  font-size: 24rpx;
  color: #ad6800;
  background: #fff7e6;
  border-radius: 8rpx;
  padding: 8rpx 12rpx;
  margin: 4rpx 0 8rpx;
}

.att-progress {
  height: 8rpx;
  background: #eef0f3;
  border-radius: 4rpx;
  margin-top: 12rpx;
  overflow: hidden;
}

.att-progress-bar {
  height: 100%;
  background: #2f6bff;
  transition: width 0.2s;
}

.att-actions {
  display: flex;
  margin-top: 16rpx;
}

.att-btn {
  flex: 1;
  height: 88rpx;
  margin-right: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx dashed #b6c7f5;
  border-radius: 12rpx;
  color: #2f6bff;
  font-size: 26rpx;
}

.att-btn:last-child {
  margin-right: 0;
}

.att-btn text {
  margin-left: 8rpx;
}
</style>
