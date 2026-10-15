<script setup lang="ts">
// 空结果：无筛选时“暂无数据”；有筛选时“没有符合条件的记录” + “清空筛选”
withDefaults(
  defineProps<{
    filtered?: boolean
    description?: string
    imageSize?: number
  }>(),
  { filtered: false, imageSize: 80 },
)
defineEmits<{ reset: [] }>()
</script>

<template>
  <el-empty :image-size="imageSize" :description="description ?? (filtered ? '没有符合条件的记录' : '暂无数据')">
    <el-button v-if="filtered" @click="$emit('reset')">清空筛选</el-button>
    <slot />
  </el-empty>
</template>
