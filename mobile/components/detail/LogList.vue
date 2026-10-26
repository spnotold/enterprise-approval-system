<script setup lang="ts">
// 审批日志：按时间顺序展示提交、同意、驳回、撤回、转办
import type { ApprovalLogView } from '@/lib/types'
import { APP_STATUS_LABEL, LOG_ACTION_LABEL } from '@/utils/labels'
import { fmtDateTime } from '@/utils/time'

defineProps<{ logs: ApprovalLogView[] }>()
</script>

<template>
  <view v-if="!logs.length" class="log-empty">暂无审批记录</view>
  <view v-else>
    <view v-for="(l, i) in logs" :key="l.id" class="log">
      <view class="log-axis">
        <view class="log-dot" :class="{ submit: l.action === 'SUBMIT', approve: l.action === 'APPROVE', reject: l.action === 'REJECT' }" />
        <view v-if="i < logs.length - 1" class="log-line" />
      </view>
      <view class="log-body">
      <view class="log-main">
        <text class="log-who">{{ l.operatorName }}</text>
        <text class="log-action" :class="{ reject: l.action === 'REJECT', approve: l.action === 'APPROVE' }">
          {{ LOG_ACTION_LABEL[l.action] ?? l.action }}
        </text>
        <text v-if="l.nodeName" class="log-node">{{ l.nodeName }}</text>
        <text class="log-time">{{ fmtDateTime(l.createdAt) }}</text>
      </view>
      <view v-if="l.fromStatus && l.toStatus" class="log-meta">
        <text>{{ APP_STATUS_LABEL[l.fromStatus] }} → {{ APP_STATUS_LABEL[l.toStatus] }}</text>
        <text v-if="l.templateVersionNo" class="log-ver">模板 v{{ l.templateVersionNo }}</text>
      </view>
      <view v-if="l.comment" class="log-comment" :class="{ reject: l.action === 'REJECT' }">{{ l.comment }}</view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.log-empty {
  padding-bottom: 20rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.log {
  display: flex;
  padding: 4rpx 0 0;
  font-size: var(--eas-fs-sm);
}

.log-axis {
  width: 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.log-dot {
  width: 16rpx;
  height: 16rpx;
  margin-top: 14rpx;
  border-radius: 50%;
  background: var(--eas-ink-3);
}

.log-dot.submit {
  background: var(--eas-primary);
}

.log-dot.approve {
  background: var(--eas-sage);
}

.log-dot.reject {
  background: var(--eas-rust);
}

.log-line {
  flex: 1;
  width: 4rpx;
  min-height: 24rpx;
  margin: 8rpx 0;
  background: var(--eas-rule);
}

.log-body {
  flex: 1;
  min-width: 0;
  padding: 0 0 24rpx 16rpx;
}

.log-main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
}

.log-who {
  font-weight: 600;
  color: var(--eas-ink);
  margin-right: 12rpx;
}

.log-action {
  color: var(--eas-ink-2);
}

.log-action.approve {
  color: var(--eas-success);
}

.log-action.reject {
  color: var(--eas-danger);
}

.log-node {
  margin-left: 16rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.log-time {
  margin-left: auto;
  padding-left: 16rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}

.log-meta {
  margin-top: 4rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.log-ver {
  margin-left: 24rpx;
}

.log-comment {
  margin-top: 8rpx;
  padding: 12rpx 16rpx;
  background: var(--eas-paper);
  border-radius: 20rpx;
  color: var(--eas-ink);
  line-height: 1.6;
  word-break: break-all;
  white-space: pre-wrap;
}

.log-comment.reject {
  background: var(--eas-danger-tint);
  color: var(--eas-danger);
}
</style>
