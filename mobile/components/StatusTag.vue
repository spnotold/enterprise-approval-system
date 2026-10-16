<script setup lang="ts">
// 列表状态：圆点与文字；详情页保留各自的单据头样式。
import { computed } from 'vue'
import type { AppStatus, CurrentNode } from '@/lib/types'
import { APP_STATUS_LABEL } from '@/utils/labels'

const props = defineProps<{
  status: AppStatus
  node?: CurrentNode | null
}>()

const statusClass = computed(() => ({
  DRAFT: 'status-tag--muted',
  IN_APPROVAL: 'status-tag--primary',
  APPROVED: 'status-tag--success',
  REJECTED: 'status-tag--danger',
  WITHDRAWN: 'status-tag--muted',
})[props.status])
const nodeText = computed(() => {
  if (props.status !== 'IN_APPROVAL' || !props.node) return ''
  return props.node.assigneeName ? `${props.node.name} ${props.node.assigneeName}` : props.node.name
})
</script>

<template>
  <view class="status" :class="statusClass">
    <view class="status-dot" />
    <text class="status-tag">{{ APP_STATUS_LABEL[status] }}</text>
    <text v-if="nodeText" class="status-node">{{ nodeText }}</text>
  </view>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}

.status-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: currentColor; flex-shrink: 0; margin-right: 10rpx; }
.status-tag { flex-shrink: 0; font-size: 24rpx; }
.status-tag--muted { color: var(--eas-ink-2); }
.status-tag--muted .status-dot { background: var(--eas-muted); }
.status-tag--primary { color: var(--eas-primary); }
.status-tag--success { color: var(--eas-success); }
.status-tag--danger { color: var(--eas-danger); }

.status-node {
  margin-left: 10rpx;
  font-size: 24rpx;
  color: var(--eas-ink-2);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
