<script setup lang="ts">
// 金额输入：type="digit" 调起数字键盘，内部以字符串保存（最多两位小数），对外输出整数分。
// 不经过 parseFloat，换算全部交给 lib/money.ts。
import { nextTick, ref, watch } from 'vue'
import { centsToYuan, yuanToCents } from '@/lib/money'

const props = withDefaults(
  defineProps<{
    modelValue: number | null
    placeholder?: string
    error?: boolean
    disabled?: boolean
  }>(),
  { placeholder: '0.00', error: false, disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const text = ref(props.modelValue === null ? '' : centsToYuan(props.modelValue))
const invalid = ref(false)

/** 输入中的 “12.” 按 12 元处理 */
function parse(v: string): number | null {
  const t = v.trim().replace(/\.$/, '')
  return t === '' ? null : yuanToCents(t)
}

watch(
  () => props.modelValue,
  (v) => {
    if (v !== parse(text.value)) {
      text.value = v === null ? '' : centsToYuan(v)
      invalid.value = false
    }
  },
)

function sanitize(raw: string): string {
  let v = raw.replace(/[^\d.]/g, '')
  const dot = v.indexOf('.')
  if (dot >= 0) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2)
  if (dot === 0) v = `0${v}`
  return v
}

function onInput(e: { detail: { value: string } }): void {
  const raw = e.detail.value
  const clean = sanitize(raw)
  text.value = raw
  // 先写入原值再写入清洗后的值，确保小程序输入框内容被替换
  void nextTick(() => {
    text.value = clean
  })
  const cents = parse(clean)
  invalid.value = clean !== '' && cents === null
  emit('update:modelValue', cents)
}

function onBlur(): void {
  if (text.value.endsWith('.')) text.value = text.value.slice(0, -1)
  if (props.modelValue !== null) text.value = centsToYuan(props.modelValue)
}
</script>

<template>
  <view>
  <view class="money" :class="{ 'is-error': error || invalid }">
    <text class="money-unit">¥</text>
    <input
      class="money-input"
      type="digit"
      :value="text"
      :placeholder="placeholder"
      placeholder-class="placeholder"
      :disabled="disabled"
      maxlength="13"
      @input="onInput"
      @blur="onBlur"
    />
    <text class="money-suffix">元</text>
  </view>
  <view v-if="invalid" class="field-err">金额格式不正确，最多两位小数</view>
  </view>
</template>

<style scoped>
.money {
  display: flex;
  align-items: center;
  height: 88rpx;
  padding: 0 20rpx;
  background: #f7f8fa;
  border-radius: 10rpx;
}

.money-unit,
.money-suffix {
  color: #646a73;
  font-size: 28rpx;
}

.money-input {
  flex: 1;
  height: 88rpx;
  padding: 0 12rpx;
  font-size: 32rpx;
}
</style>
