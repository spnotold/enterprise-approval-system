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
import { inputValue, type UniInputEvent } from '@/utils/uniEvent'

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
// 票据号输入框聚焦的行（-1 为无）；小程序没有 :focus，用事件切换样式类
const focusedNo = ref(-1)
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

let docLabel = '聊天文件'
// #ifdef H5
docLabel = '选择文件'
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
  const ok = await confirm({
    title: '删除附件',
    content: `删除附件“${list.value[index].originalName}”？`,
    danger: true,
    confirmText: '删除',
  })
  if (!ok) return
  list.value.splice(index, 1)
  nos.value.splice(index, 1)
  commit()
}

function onInvoiceNo(index: number, e: Event | UniInputEvent): void {
  while (nos.value.length < list.value.length) nos.value.push('')
  nos.value[index] = inputValue(e)
  emit('update:invoiceNos', [...nos.value])
}

/** 长按已上传的附件：与“删除”按钮走同一个入口（先确认再删除）；只读时不响应 */
function onLongPress(index: number): void {
  if (props.readonly) return
  void remove(index)
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
        <view
          class="att-main"
          hover-class="is-pressed"
          :hover-stay-time="60"
          @tap="preview(m)"
          @longpress="onLongPress(i)"
        >
          <view class="att-icon" :class="isPdf(m.contentType) ? 'pdf' : 'img'">
            {{ isPdf(m.contentType) ? 'PDF' : '图' }}
          </view>
          <view class="flex1">
            <view class="att-name ellipsis">{{ m.originalName }}</view>
            <view class="att-meta">
              <text>{{ formatSize(m.sizeBytes) }}</text>
              <text class="att-hint">点击预览</text>
              <text v-if="!readonly" class="att-hint">长按删除</text>
            </view>
          </view>
        </view>
        <view v-if="!readonly" class="link-btn danger" hover-class="is-pressed" :hover-stay-time="60" @tap="remove(i)">删除</view>
      </view>
      <input
        v-if="withInvoiceNo && !readonly"
        class="input att-no"
        :class="{ 'is-focus': focusedNo === i }"
        :value="nos[i] ?? ''"
        placeholder="票据号（选填，用于查重）"
        placeholder-class="placeholder"
        maxlength="64"
        @input="onInvoiceNo(i, $event)"
        @focus="focusedNo = i"
        @blur="focusedNo = -1"
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
        <view v-if="p.status === 'failed'" class="link-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="retry(p)">重试</view>
        <view class="link-btn danger" hover-class="is-pressed" :hover-stay-time="60" @tap="dropPending(p)">{{
          p.status === 'uploading' ? '取消' : '移除'
        }}</view>
      </view>
    </view>

    <view v-if="!readonly && remaining > 0" class="att-actions">
      <view v-if="allowImage" class="att-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="pickImage('camera')">
        <uni-icons type="camera" size="20" color="var(--eas-primary)" />
        <text>拍照</text>
      </view>
      <view v-if="allowImage" class="att-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="pickImage('album')">
        <uni-icons type="image" size="20" color="var(--eas-primary)" />
        <text>相册</text>
      </view>
      <view v-if="allowPdf" class="att-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="pickDocument">
        <uni-icons type="paperclip" size="20" color="var(--eas-primary)" />
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
  border-bottom: 1rpx solid var(--eas-rule);
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
  border-radius: var(--eas-radius-control);
}

.att-icon {
  width: 72rpx;
  height: 64rpx;
  border-radius: var(--eas-radius-control);
  margin-right: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--eas-fs-xs);
  font-weight: 600;
  flex-shrink: 0;
}

.att-icon.pdf {
  background: var(--eas-danger-tint);
  color: var(--eas-danger);
}

.att-icon.img {
  background: var(--eas-primary-tint);
  color: var(--eas-primary);
}

.att-name {
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink);
}

.att-meta {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}

.att-hint {
  margin-left: 20rpx;
}

.att-no {
  margin: 8rpx 0;
  height: 88rpx;
  font-size: var(--eas-fs-sm);
  background: var(--eas-paper);
  border: 2rpx solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
}

.att-no.is-focus {
  border-color: var(--eas-primary);
}

.att-warn {
  font-size: var(--eas-fs-xs);
  color: var(--eas-warning-text);
  background: var(--eas-warning-tint);
  border-radius: var(--eas-radius-control);
  padding: 8rpx 12rpx;
  margin: 4rpx 0 8rpx;
}

.att-progress {
  height: 8rpx;
  background: var(--eas-paper-deep);
  border-radius: var(--eas-radius-tag);
  margin-top: 12rpx;
  overflow: hidden;
}

.att-progress-bar {
  height: 100%;
  background: var(--eas-primary);
  transition: width var(--eas-dur) var(--eas-ease);
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
  border: 2rpx dashed var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
  color: var(--eas-primary);
  font-size: var(--eas-fs-sm);
}

.att-btn:last-child {
  margin-right: 0;
}

.att-btn text {
  margin-left: 8rpx;
}
</style>
