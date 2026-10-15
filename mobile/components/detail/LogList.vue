<script setup lang="ts">
// 审批日志：按时间顺序展示提交、同意、驳回、撤回、转办
import type { ApprovalLogView } from '@/lib/types'
import { APP_STATUS_LABEL, LOG_ACTION_LABEL } from '@/utils/labels'
import { fmtDateTime } from '@/utils/time'

defineProps<{ logs: ApprovalLogView[] }>()
</script>

<template>
  <view v-if="!logs.length" class="muted">暂无审批记录</view>
  <view v-else>
    <view v-for="l in logs" :key="l.id" class="log">
      <view class="row between">
        <text>
          <text class="bold">{{ l.operatorName }}</text>
          <text :class="{ 'text-danger': l.action === 'REJECT', 'text-success': l.action === 'APPROVE' }">
            {{ LOG_ACTION_LABEL[l.action] ?? l.action }}
          </text>
          <text v-if="l.nodeName" class="muted"> · {{ l.nodeName }}</text>
        </text>
        <text class="muted">{{ fmtDateTime(l.createdAt) }}</text>
      </view>
      <view v-if="l.fromStatus && l.toStatus" class="muted">
        {{ APP_STATUS_LABEL[l.fromStatus] }} → {{ APP_STATUS_LABEL[l.toStatus] }}
        <text v-if="l.templateVersionNo"> · 模板 v{{ l.templateVersionNo }}</text>
      </view>
      <view v-if="l.comment" class="log-comment break" :class="{ 'text-danger': l.action === 'REJECT' }">
        {{ l.comment }}
      </view>
    </view>
  </view>
</template>

<style scoped>
.log {
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f0f1f2;
  font-size: 26rpx;
}

.log:last-child {
  border-bottom: none;
}

.log-comment {
  margin-top: 6rpx;
  padding: 10rpx 14rpx;
  background: #f7f8fa;
  border-radius: 8rpx;
}
</style>
