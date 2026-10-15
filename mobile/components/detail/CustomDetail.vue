<script setup lang="ts">
// 自定义申请详情：按提交时的模板 Schema 只读展示各字段
import type { CustomView, FormField } from '@/lib/types'
import { formatCents } from '@/lib/money'
import AttachmentPicker from '@/components/AttachmentPicker.vue'

const props = defineProps<{
  data: CustomView
  canReadAttachments: boolean
}>()

function display(f: FormField): string {
  const v = props.data.formValues[f.key]
  if (v === null || v === undefined || v === '') return '—'
  switch (f.type) {
    case 'AMOUNT':
      return typeof v === 'number' ? `¥${formatCents(v)}` : String(v)
    case 'RADIO':
      return f.options?.find((o) => o.value === v)?.label ?? String(v)
    case 'ATTACHMENT':
      return Array.isArray(v) ? `${v.length} 个附件` : '—'
    default:
      return String(v)
  }
}
</script>

<template>
  <view class="card">
    <view class="card-title">表单内容 <text class="muted">模板 v{{ data.versionNo }}</text></view>
    <view v-for="f in data.formSchema.fields" :key="f.key" class="kv">
      <text class="kv-label">{{ f.label }}</text>
      <view class="kv-value">
        <AttachmentPicker
          v-if="f.type === 'ATTACHMENT' && canReadAttachments"
          :model-value="data.attachments[f.key] || []"
          ref-type="CUSTOM_FIELD"
          readonly
        />
        <text v-else>{{ display(f) }}</text>
      </view>
    </view>
  </view>
</template>
