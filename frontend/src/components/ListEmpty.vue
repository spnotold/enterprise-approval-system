<script setup lang="ts">
// 空结果：无筛选时“暂无数据”；有筛选时“没有符合条件的记录” + “清空筛选”
withDefaults(
  defineProps<{
    filtered?: boolean
    description?: string
    imageSize?: number
  }>(),
  { filtered: false, imageSize: 64 },
)
defineEmits<{ reset: [] }>()
</script>

<template>
  <el-empty
    class="list-empty"
    :image-size="imageSize"
    :description="description ?? (filtered ? '没有符合条件的记录' : '暂无数据')"
  >
    <el-button v-if="filtered" @click="$emit('reset')">清空筛选</el-button>
    <slot />
  </el-empty>
</template>

<style scoped>
.list-empty {
  --el-empty-padding: 32px 0;
  --el-empty-description-margin-top: 8px;
}
.list-empty :deep(.el-empty__description p) {
  color: var(--eas-ink-2);
}
</style>
