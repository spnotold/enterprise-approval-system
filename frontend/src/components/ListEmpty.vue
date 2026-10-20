<script setup lang="ts">
// 空结果：无筛选时“暂无数据”；有筛选时“没有符合条件的记录” + “清空筛选”。
// 只有文字，没有插画；下一步的操作放 action 插槽（默认插槽同样可用，兼容旧写法）。
withDefaults(
  defineProps<{
    filtered?: boolean
    description?: string
    /** 已不再显示插画，保留属性只为兼容旧调用 */
    imageSize?: number
  }>(),
  { filtered: false },
)
defineEmits<{ reset: [] }>()
</script>

<template>
  <el-empty class="list-empty" :description="description ?? (filtered ? '没有符合条件的记录' : '暂无数据')">
    <template #image><span /></template>
    <template v-if="filtered || $slots.default || $slots.action" #default>
      <el-button v-if="filtered" @click="$emit('reset')">清空筛选</el-button>
      <slot name="action" />
      <slot />
    </template>
  </el-empty>
</template>

<style scoped>
.list-empty {
  --el-empty-padding: 40px 24px;
}
.list-empty :deep(.el-empty__description p) {
  color: var(--eas-ink-2);
}
.list-empty :deep(.el-empty__bottom) {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}
.list-empty :deep(.el-empty__bottom .el-button + .el-button) {
  margin-left: 0;
}
</style>
