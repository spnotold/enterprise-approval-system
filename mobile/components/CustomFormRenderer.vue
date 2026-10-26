<script setup lang="ts">
// 自定义表单的移动端渲染：TEXT / TEXTAREA / NUMBER / AMOUNT / DATE / RADIO / ATTACHMENT 七种字段。
// values、attachments 为父页面持有的响应式对象，这里直接按字段 key 写入。
import { nextTick, reactive, ref } from 'vue'
import type { AttachmentMeta, FormField, FormSchema } from '@/lib/types'
import AttachmentPicker from '@/components/AttachmentPicker.vue'
import FormItem from '@/components/FormItem.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import type { FieldErrors } from '@/composables/useFieldErrors'
import { dateRange } from '@/utils/customForm'
import { sanitizeDecimalInput } from '@/utils/decimal'
import { inputValue, pickerValue, type UniInputEvent, type UniPickerChangeEvent } from '@/utils/uniEvent'

const props = defineProps<{
  schema: FormSchema
  values: Record<string, unknown>
  attachments: Record<string, AttachmentMeta[]>
  errors: FieldErrors
}>()

const emit = defineEmits<{ busy: [value: boolean] }>()

const busyMap = reactive<Record<string, boolean>>({})
// 当前聚焦的字段 key；小程序没有 :focus，用 @focus / @blur 切换样式类
const focusKey = ref('')

function ic(key: string): Record<string, boolean> {
  return { 'is-error': !!props.errors.get(key), 'is-focus': focusKey.value === key }
}

function setValue(key: string, v: unknown): void {
  // eslint-disable-next-line vue/no-mutating-props
  props.values[key] = v
  props.errors.clearField(key)
}

function str(key: string): string {
  const v = props.values[key]
  return v === null || v === undefined ? '' : String(v)
}

function cents(key: string): number | null {
  const v = props.values[key]
  return typeof v === 'number' ? v : null
}

function onText(f: FormField, e: Event | UniInputEvent): void {
  setValue(f.key, inputValue(e))
}

function onNumber(f: FormField, e: Event | UniInputEvent): void {
  const allowNeg = !f.rules?.min || f.rules.min.trim().startsWith('-')
  const v = sanitizeDecimalInput(inputValue(e), allowNeg, f.rules?.precision ?? 4)
  // 先回写原输入，下一帧归一化，保证多输入的小数位也会在原生输入框中清掉。
  setValue(f.key, inputValue(e))
  void nextTick(() => setValue(f.key, v === '' ? null : v))
}

function onDate(f: FormField, e: Event | UniPickerChangeEvent): void {
  setValue(f.key, String(pickerValue(e)))
}

function onAttachments(f: FormField, list: AttachmentMeta[]): void {
  // eslint-disable-next-line vue/no-mutating-props
  props.attachments[f.key] = list
  setValue(
    f.key,
    list.map((m) => m.id),
  )
}

function onBusy(key: string, v: boolean): void {
  busyMap[key] = v
  emit(
    'busy',
    Object.values(busyMap).some((x) => x),
  )
}

function textMax(f: FormField): number {
  return f.rules?.maxLength ?? (f.type === 'TEXTAREA' ? 2000 : 200)
}
</script>

<template>
  <view>
    <FormItem
      v-for="f in schema.fields"
      :key="f.key"
      :label="f.label"
      :required="!!f.required"
      :help="f.help"
      :error="errors.get(f.key)"
    >
      <input
        v-if="f.type === 'TEXT'"
        class="input"
        :class="ic(f.key)"
        :type="f.rules?.patternPreset === 'MOBILE' ? 'number' : 'text'"
        :value="str(f.key)"
        :placeholder="f.placeholder || '请输入' + f.label"
        placeholder-class="placeholder"
        :maxlength="textMax(f)"
        @input="onText(f, $event)"
        @focus="focusKey = f.key"
        @blur="focusKey = ''"
      />
      <textarea
        v-else-if="f.type === 'TEXTAREA'"
        class="textarea"
        :class="ic(f.key)"
        :value="str(f.key)"
        :placeholder="f.placeholder || '请输入' + f.label"
        placeholder-class="placeholder"
        :maxlength="textMax(f)"
        :auto-height="true"
        :show-confirm-bar="false"
        @input="onText(f, $event)"
        @focus="focusKey = f.key"
        @blur="focusKey = ''"
      />
      <input
        v-else-if="f.type === 'NUMBER'"
        class="input"
        :class="ic(f.key)"
        type="digit"
        :value="str(f.key)"
        :placeholder="
          f.placeholder ||
          (f.rules?.min || f.rules?.max ? `范围 ${f.rules?.min ?? '不限'} ~ ${f.rules?.max ?? '不限'}` : '请输入数字')
        "
        placeholder-class="placeholder"
        @input="onNumber(f, $event)"
        @focus="focusKey = f.key"
        @blur="focusKey = ''"
      />
      <MoneyInput
        v-else-if="f.type === 'AMOUNT'"
        :model-value="cents(f.key)"
        :error="!!errors.get(f.key)"
        @update:model-value="setValue(f.key, $event)"
      />
      <picker
        v-else-if="f.type === 'DATE'"
        mode="date"
        :value="str(f.key)"
        :start="dateRange(f).start"
        :end="dateRange(f).end"
        @change="onDate(f, $event)"
      >
        <view class="picker-value" :class="{ 'is-error': !!errors.get(f.key) }" hover-class="is-pressed" :hover-stay-time="60">
          <text :class="{ placeholder: !str(f.key) }">{{ str(f.key) || f.placeholder || '请选择日期' }}</text>
          <uni-icons type="calendar" size="18" color="var(--eas-ink-3)" />
        </view>
      </picker>
      <view v-else-if="f.type === 'RADIO'" class="radio-list">
        <view
          v-for="o in f.options || []"
          :key="o.value"
          class="radio-item"
          :class="{ checked: values[f.key] === o.value }"
          hover-class="is-pressed"
          :hover-stay-time="60"
          @tap="setValue(f.key, o.value)"
        >
          <view class="radio-dot" />
          <text class="radio-label">{{ o.label }}</text>
        </view>
      </view>
      <AttachmentPicker
        v-else-if="f.type === 'ATTACHMENT'"
        :model-value="attachments[f.key] || []"
        ref-type="CUSTOM_FIELD"
        :max-count="f.rules?.maxCount ?? 10"
        :allowed-types="f.rules?.allowedTypes ?? []"
        :max-size-mb="f.rules?.maxSizeMb ?? 10"
        @update:model-value="onAttachments(f, $event)"
        @busy="onBusy(f.key, $event)"
      />
    </FormItem>
  </view>
</template>

<style scoped>
@import '../styles/form.css';

.radio-list {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 0 8rpx 8rpx 0;
}

.radio-item {
  display: flex;
  align-items: center;
  min-height: 88rpx;
  padding: 0 28rpx 0 20rpx;
  max-width: 100%;
  background: var(--eas-tab);
  border-radius: var(--eas-radius-pill);
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink);
}

.radio-item.checked {
  background-color: var(--eas-ink);
  background-image: var(--eas-grain);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
  color: var(--eas-sheet);
  box-shadow: var(--eas-offset-mark);
}

.radio-item.checked.is-pressed {
  background-color: var(--eas-ink) !important;
}

.radio-dot {
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  border: 2rpx solid var(--eas-rule-strong);
  margin-right: 12rpx;
  box-sizing: border-box;
  flex-shrink: 0;
}

.radio-item.checked .radio-dot {
  border: 10rpx solid var(--eas-sheet);
}

/* 小程序自定义组件里只认类选择器 */
.radio-label {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
