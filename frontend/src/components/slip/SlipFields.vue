<script setup lang="ts">
// 字段区：两列（窄屏一列），每格左侧字段名 120px、右侧值，行间 1px 线
defineProps<{ columns?: 1 | 2 }>()
</script>

<template>
  <dl class="slip-fields" :class="{ single: columns === 1 }"><slot /></dl>
</template>

<style scoped>
.slip-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 32px;
  margin: 0;
  border-top: 1px solid var(--eas-rule);
}
.slip-fields.single {
  grid-template-columns: minmax(0, 1fr);
}
@media (max-width: 768px) {
  .slip-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
