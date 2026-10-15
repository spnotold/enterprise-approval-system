<script setup lang="ts">
// 金额显示：千分位、两位小数；入参为整数分
import { computed } from 'vue'
import { formatCents } from '@/lib/money'

const props = withDefaults(
  defineProps<{
    cents: number | null | undefined
    /** 是否显示 ¥ 前缀 */
    symbol?: boolean
    strong?: boolean
  }>(),
  { symbol: true, strong: false },
)

const text = computed(() => {
  if (props.cents === null || props.cents === undefined) return '—'
  return `${props.symbol ? '¥' : ''}${formatCents(props.cents)}`
})
</script>

<template>
  <span class="money" :class="{ strong }">{{ text }}</span>
</template>

<style scoped>
.money {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.strong {
  font-weight: 600;
}
</style>
