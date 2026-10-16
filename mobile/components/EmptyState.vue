<script setup lang="ts">
// 空结果：无数据显示“暂无数据”；有筛选条件时显示“没有符合条件的记录”和“清空筛选”
defineProps<{
  text?: string
  actionText?: string
}>()
const emit = defineEmits<{ action: [] }>()
</script>

<template>
  <view class="empty">
    <uni-icons type="info" size="36" color="var(--eas-rule-strong)" />
    <view class="empty-text">{{ text || '暂无数据' }}</view>
    <view v-if="actionText" class="link-btn" @tap="emit('action')">{{ actionText }}</view>
  </view>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 0 48rpx;
}

.empty-text {
  margin-top: 12rpx;
  color: var(--eas-ink-3);
  font-size: 26rpx;
}
</style>
