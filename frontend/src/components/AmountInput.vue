<script setup lang="ts">
// 金额输入：内部以字符串保存（不经过 parseFloat），对外通过 v-model:cents 输出整数分
import { ref, watch } from 'vue'
import { centsToYuan, yuanToCents } from '@/lib/money'

const cents = defineModel<number | null>('cents', { default: null })

withDefaults(
  defineProps<{
    placeholder?: string
    disabled?: boolean
    size?: 'large' | 'default' | 'small'
    clearable?: boolean
  }>(),
  { placeholder: '0.00', disabled: false, size: 'default', clearable: false },
)

const emit = defineEmits<{ blur: [] }>()

// 输入过程中允许的中间状态：最多 9 位整数、2 位小数
const PARTIAL = /^\d{0,9}(\.\d{0,2})?$/

const text = ref(cents.value == null ? '' : centsToYuan(cents.value))

function onInput(v: string) {
  const raw = v.replace(/[，,\s]/g, '').replace(/。/g, '.')
  const s = raw.startsWith('.') ? `0${raw}` : raw
  if (!PARTIAL.test(s)) return // 拒绝非法字符，保持原值
  text.value = s
  const normalized = s.replace(/\.$/, '')
  cents.value = normalized === '' ? null : yuanToCents(normalized)
}

function onBlur() {
  // 规范化显示：“12.” -> “12.00”，“.5” 不允许输入
  if (text.value !== '') {
    const c = yuanToCents(text.value.replace(/\.$/, ''))
    if (c !== null) {
      text.value = centsToYuan(c)
      cents.value = c
    }
  }
  emit('blur')
}

// 外部修改（如加载草稿）时同步显示
watch(cents, (c) => {
  const current = text.value === '' ? null : yuanToCents(text.value.replace(/\.$/, ''))
  if (c !== current) text.value = c == null ? '' : centsToYuan(c)
})
</script>

<template>
  <el-input
    :model-value="text"
    :placeholder="placeholder"
    :disabled="disabled"
    :size="size"
    :clearable="clearable"
    inputmode="decimal"
    class="amount-input"
    @update:model-value="onInput"
    @blur="onBlur"
  >
    <template #prefix>¥</template>
  </el-input>
</template>

<style scoped>
.amount-input :deep(input) {
  font-variant-numeric: tabular-nums;
}
</style>
