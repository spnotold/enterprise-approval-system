<script setup lang="ts">
// 按模板 form_schema 动态渲染自定义表单：编辑与只读两种模式。
// 值的格式：TEXT/TEXTAREA 字符串；NUMBER 十进制字符串；AMOUNT 整数分；DATE YYYY-MM-DD；RADIO 选项值；ATTACHMENT 附件 ID 数组。
import type { AttachmentMeta, FormField, FormSchema } from '@/lib/types'
import { DEFAULT_MAX_LENGTH } from '@/lib/formSchema'
import { resolveDateToken, todayShanghai } from '@/lib/datetime'
import AmountInput from './AmountInput.vue'
import MoneyText from './MoneyText.vue'
import AttachmentUploader from './AttachmentUploader.vue'

const values = defineModel<Record<string, unknown>>({ required: true })
/** ATTACHMENT 字段的附件元数据（字段 key -> 附件），用于显示与预览 */
const attachments = defineModel<Record<string, AttachmentMeta[]>>('attachments', { default: () => ({}) })

const props = withDefaults(
  defineProps<{
    schema: FormSchema
    readonly?: boolean
    error?: (path: string) => string | undefined
    /** 错误路径前缀，默认 formValues. */
    prefix?: string
    /** 只读模式下是否可查看附件 */
    showAttachments?: boolean
    labelWidth?: string
  }>(),
  { readonly: false, error: () => undefined, prefix: 'formValues.', showAttachments: true, labelWidth: '120px' },
)

function fieldError(f: FormField): string {
  return props.error(`${props.prefix}${f.key}`) ?? props.error(f.key) ?? ''
}

function setValue(key: string, v: unknown) {
  values.value = { ...values.value, [key]: v }
}

function str(key: string): string {
  const v = values.value[key]
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function amount(key: string): number | null {
  const v = values.value[key]
  return typeof v === 'number' ? v : null
}

// NUMBER：内部值为十进制字符串，el-input-number 只用于输入
function numberValue(key: string): number | undefined {
  const v = values.value[key]
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function onNumber(f: FormField, v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) {
    setValue(f.key, null)
    return
  }
  setValue(f.key, v.toFixed(f.rules?.precision ?? 4))
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function disabledDate(f: FormField) {
  const today = todayShanghai()
  const earliest = resolveDateToken(f.rules?.earliest, today)
  const latest = resolveDateToken(f.rules?.latest, today)
  if (!earliest && !latest) return undefined
  return (d: Date) => {
    const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    return (!!earliest && s < earliest) || (!!latest && s > latest)
  }
}

function radioLabel(f: FormField): string {
  const v = values.value[f.key]
  if (v === null || v === undefined || v === '') return '—'
  return f.options?.find((o) => o.value === v)?.label ?? String(v)
}

function metas(key: string): AttachmentMeta[] {
  return attachments.value[key] ?? []
}

function onAttachments(key: string, list: AttachmentMeta[]) {
  attachments.value = { ...attachments.value, [key]: list }
  setValue(
    key,
    list.map((a) => a.id),
  )
}

function attachmentCount(key: string): number {
  const v = values.value[key]
  return Array.isArray(v) ? v.length : metas(key).length
}

function maxLength(f: FormField): number {
  const type = f.type === 'TEXTAREA' ? 'TEXTAREA' : 'TEXT'
  return Math.min(f.rules?.maxLength ?? DEFAULT_MAX_LENGTH[type], DEFAULT_MAX_LENGTH[type])
}
</script>

<template>
  <el-form class="form-renderer" :label-width="labelWidth" label-position="right" @submit.prevent>
    <el-empty v-if="schema.fields.length === 0" :image-size="60" description="该模板没有表单字段" />
    <el-form-item
      v-for="f in schema.fields"
      :key="f.key"
      :label="f.label"
      :required="!readonly && !!f.required"
      :error="readonly ? '' : fieldError(f)"
      :data-field="`${prefix}${f.key}`"
    >
      <!-- 只读 -->
      <template v-if="readonly">
        <span v-if="f.type === 'TEXT' || f.type === 'TEXTAREA'" class="pre-wrap">{{ str(f.key) || '—' }}</span>
        <span v-else-if="f.type === 'NUMBER' || f.type === 'DATE'">{{ str(f.key) || '—' }}</span>
        <MoneyText v-else-if="f.type === 'AMOUNT'" :cents="amount(f.key)" />
        <span v-else-if="f.type === 'RADIO'">{{ radioLabel(f) }}</span>
        <template v-else-if="f.type === 'ATTACHMENT'">
          <AttachmentUploader v-if="showAttachments" :model-value="metas(f.key)" ref-type="CUSTOM_FIELD" readonly />
          <span v-else class="muted small">{{ attachmentCount(f.key) }} 个附件（无权查看）</span>
        </template>
      </template>

      <!-- 编辑 -->
      <template v-else>
        <div class="field-body">
          <el-input
            v-if="f.type === 'TEXT'"
            :model-value="str(f.key)"
            :maxlength="maxLength(f)"
            :placeholder="f.placeholder ?? ''"
            @update:model-value="setValue(f.key, $event === '' ? null : $event)"
          />
          <el-input
            v-else-if="f.type === 'TEXTAREA'"
            :model-value="str(f.key)"
            type="textarea"
            :rows="4"
            :maxlength="maxLength(f)"
            show-word-limit
            :placeholder="f.placeholder ?? ''"
            @update:model-value="setValue(f.key, $event === '' ? null : $event)"
          />
          <el-input-number
            v-else-if="f.type === 'NUMBER'"
            :model-value="numberValue(f.key)"
            :precision="f.rules?.precision ?? 4"
            :step="f.rules?.step ? Number(f.rules.step) : 1"
            controls-position="right"
            :value-on-clear="null"
            :placeholder="f.placeholder ?? ''"
            style="width: 220px"
            @update:model-value="onNumber(f, $event)"
          />
          <AmountInput
            v-else-if="f.type === 'AMOUNT'"
            :cents="amount(f.key)"
            style="width: 220px"
            @update:cents="setValue(f.key, $event)"
          />
          <el-date-picker
            v-else-if="f.type === 'DATE'"
            :model-value="str(f.key) || null"
            type="date"
            value-format="YYYY-MM-DD"
            :disabled-date="disabledDate(f)"
            :placeholder="f.placeholder ?? '选择日期'"
            @update:model-value="setValue(f.key, $event || null)"
          />
          <el-radio-group
            v-else-if="f.type === 'RADIO'"
            :model-value="str(f.key)"
            @update:model-value="setValue(f.key, $event === '' ? null : $event)"
          >
            <el-radio v-for="o in f.options ?? []" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
          </el-radio-group>
          <AttachmentUploader
            v-else-if="f.type === 'ATTACHMENT'"
            :model-value="metas(f.key)"
            ref-type="CUSTOM_FIELD"
            :max-count="f.rules?.maxCount ?? 10"
            :allowed-types="f.rules?.allowedTypes?.length ? f.rules.allowedTypes : undefined"
            :max-size-mb="Math.min(f.rules?.maxSizeMb ?? 10, 10)"
            @update:model-value="onAttachments(f.key, $event)"
          />
          <div v-if="f.help" class="muted small help">{{ f.help }}</div>
        </div>
      </template>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.field-body {
  width: 100%;
}
.help {
  line-height: 1.5;
  margin-top: 2px;
}
@media (max-width: 768px) {
  .form-renderer :deep(.el-form-item) {
    flex-direction: column;
  }
  .form-renderer :deep(.el-form-item__label) {
    justify-content: flex-start;
    width: auto !important;
  }
}
</style>
