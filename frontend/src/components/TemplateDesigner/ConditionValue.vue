<script setup lang="ts">
// 条件的比较值（一律保存为字符串）：金额为整数分字符串，数字为十进制字符串，日期为 YYYY-MM-DD，单选为选项值
import { computed } from 'vue'
import type { FieldOption } from '@/lib/types'
import { parseDecimal } from '@/lib/formSchema'
import AmountInput from '@/components/AmountInput.vue'
import type { VarKind } from './utils'

const model = defineModel<string | null | undefined>()

const props = withDefaults(
  defineProps<{
    kind?: VarKind
    options?: FieldOption[]
    readonly?: boolean
  }>(),
  { kind: undefined, options: () => [], readonly: false },
)

const cents = computed<number | null>({
  get: () => (model.value != null && /^\d+$/.test(model.value) ? Number(model.value) : null),
  set: (v) => (model.value = v == null ? null : String(v)),
})

const text = computed<string>({
  get: () => model.value ?? '',
  // 日期选择器清空时传入 null
  set: (v) => (model.value = v ? String(v).trim() || null : null),
})

const numberInvalid = computed(
  () => props.kind === 'NUMBER' && !!model.value && parseDecimal(model.value) === null,
)
</script>

<template>
  <div class="cond-value" :class="{ 'cell-error': numberInvalid }">
    <AmountInput v-if="kind === 'AMOUNT'" v-model:cents="cents" :disabled="readonly" placeholder="金额" />
    <el-date-picker
      v-else-if="kind === 'DATE'"
      v-model="text"
      type="date"
      value-format="YYYY-MM-DD"
      placeholder="选择日期"
      :disabled="readonly"
      style="width: 100%"
    />
    <el-select v-else-if="kind === 'RADIO'" v-model="text" placeholder="选择选项" :disabled="readonly" style="width: 100%">
      <el-option v-for="o in options" :key="o.value" :value="o.value" :label="o.label || o.value" />
    </el-select>
    <el-input
      v-else
      v-model="text"
      inputmode="decimal"
      class="mono"
      :placeholder="kind ? '数值，如 3' : '先选择变量'"
      :disabled="readonly || !kind"
      :title="numberInvalid ? '请输入数字' : undefined"
    />
  </div>
</template>

<style scoped>
.cond-value {
  min-width: 0;
  width: 100%;
}
.cond-value :deep(.el-date-editor) {
  width: 100%;
}
</style>
