<script setup lang="ts">
// 状态标签：草稿灰、审批中蓝（可附当前节点与审批人）、已通过绿、已驳回红、已撤回深灰
import { computed } from 'vue'
import type { AppStatus, CurrentNode } from '@/lib/types'
import { APP_STATUS_COLOR, APP_STATUS_LABEL } from '@/utils/labels'

const props = defineProps<{
  status: AppStatus
  node?: CurrentNode | null
}>()

const color = computed(() => APP_STATUS_COLOR[props.status] ?? '#8f959e')
const nodeText = computed(() => {
  if (props.status !== 'IN_APPROVAL' || !props.node) return ''
  return props.node.assigneeName ? `${props.node.name} · ${props.node.assigneeName}` : props.node.name
})
</script>

<template>
  <view class="status">
    <text class="status-tag" :style="{ color: color, borderColor: color }">{{ APP_STATUS_LABEL[status] }}</text>
    <text v-if="nodeText" class="status-node">{{ nodeText }}</text>
  </view>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}

.status-tag {
  flex-shrink: 0;
  height: 40rpx;
  line-height: 36rpx;
  padding: 0 12rpx;
  font-size: 22rpx;
  border: 2rpx solid;
  border-radius: 8rpx;
}

.status-node {
  margin-left: 10rpx;
  font-size: 22rpx;
  color: #646a73;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
