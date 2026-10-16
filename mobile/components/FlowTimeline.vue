<script setup lang="ts">
// 流程时间线（纵向）：每个节点的审批人、状态、意见和时间；当前节点主色，驳回节点赭色。
import type { FlowNodeView, FlowView } from '@/lib/types'
import { NODE_MODE_LABEL, NODE_STATUS_LABEL, TASK_STATUS_LABEL } from '@/utils/labels'
import { fmtDateTime } from '@/utils/time'

defineProps<{
  flow: FlowView | null
}>()

/** 节点状态对应的语气（颜色由样式里的 token 决定） */
function tone(n: FlowNodeView): string {
  switch (n.status) {
    case 'ACTIVE':
      return 'primary'
    case 'APPROVED':
      return 'success'
    case 'REJECTED':
      return 'danger'
    default:
      return 'muted'
  }
}

/** 会签显示进度“会签 1/3”，或签显示“或签” */
function modeText(n: FlowNodeView): string {
  if (n.mode === 'COUNTERSIGN') {
    return n.requiredCount ? `会签 ${n.approvedCount ?? 0}/${n.requiredCount}` : '会签'
  }
  return NODE_MODE_LABEL[n.mode] ?? ''
}

function candidateNames(n: FlowNodeView): string {
  return (n.candidates ?? []).map((c) => c.realName).join('、')
}
</script>

<template>
  <view v-if="!flow || !flow.nodes.length" class="tl-empty">提交后生成审批流程</view>
  <view v-else class="tl">
    <view
      v-for="(n, i) in flow.nodes"
      :key="n.seq"
      class="tl-node"
      :class="[`tone-${tone(n)}`, { dim: n.status === 'SKIPPED' || n.status === 'NOT_REACHED' }]"
    >
      <view class="tl-axis">
        <view class="tl-dot" />
        <view v-if="i < flow.nodes.length - 1" class="tl-line" />
      </view>
      <view class="tl-body">
        <view class="tl-head">
          <text class="tl-name">{{ n.name }}</text>
          <text v-if="modeText(n)" class="tl-mode">{{ modeText(n) }}</text>
          <text class="tl-status">{{ NODE_STATUS_LABEL[n.status] }}</text>
        </view>
        <view v-if="n.mode !== 'SINGLE' && candidateNames(n)" class="tl-text">审批人 {{ candidateNames(n) }}</view>
        <view v-else-if="n.assignee" class="tl-text">
          审批人 {{ n.assignee.realName }}<text v-if="n.assignee.deptName" class="tl-dept">{{ n.assignee.deptName }}</text>
        </view>
        <view v-if="n.resolveNote" class="tl-sub">{{ n.resolveNote }}</view>
        <view v-if="n.conditionText" class="tl-sub">
          条件：{{ n.conditionText }}<text v-if="n.conditionResult === false">（不满足，已跳过）</text>
        </view>
        <view v-for="t in n.tasks" :key="t.id" class="tl-task">
          <view class="tl-task-head">
            <text class="tl-task-who">{{ t.assignee.realName }}</text>
            <text class="tl-task-status">{{ TASK_STATUS_LABEL[t.status] }}</text>
            <text class="tl-time">{{ t.actedAt ? fmtDateTime(t.actedAt) : fmtDateTime(t.createdAt) }}</text>
          </view>
          <view v-if="t.comment" class="tl-comment" :class="{ reject: t.status === 'REJECTED' }">
            {{ t.status === 'REJECTED' ? '驳回理由：' : '意见：' }}{{ t.comment }}
          </view>
        </view>
        <view v-if="n.finishedAt" class="tl-sub num">完成于 {{ fmtDateTime(n.finishedAt) }}</view>
        <view v-else-if="n.activatedAt" class="tl-sub num">到达于 {{ fmtDateTime(n.activatedAt) }}</view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.tl-empty {
  padding-bottom: 20rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.tl {
  padding: 8rpx 0 4rpx;
}

.tl-node {
  display: flex;
  --tone: var(--eas-rule-strong);
}

.tl-node.tone-primary {
  --tone: var(--eas-primary);
}

.tl-node.tone-success {
  --tone: var(--eas-success);
}

.tl-node.tone-danger {
  --tone: var(--eas-danger);
}

.tl-node.dim {
  opacity: 0.6;
}

.tl-axis {
  width: 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.tl-dot {
  width: 16rpx;
  height: 16rpx;
  border-radius: 50%;
  margin-top: 14rpx;
  background: var(--tone);
}

/* 当前节点：空心圈 */
.tl-node.tone-primary .tl-dot {
  background: var(--eas-surface);
  border: 4rpx solid var(--eas-primary);
}

.tl-line {
  flex: 1;
  width: 2rpx;
  background: var(--eas-rule);
  margin: 8rpx 0;
}

.tl-body {
  flex: 1;
  min-width: 0;
  padding: 0 0 28rpx 16rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink);
}

.tl-head {
  display: flex;
  align-items: baseline;
}

.tl-name {
  font-weight: 600;
}

.tl-node.tone-primary .tl-name {
  color: var(--eas-primary);
}

.tl-mode {
  margin-left: 12rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}

.tl-status {
  margin-left: auto;
  padding-left: 16rpx;
  flex-shrink: 0;
  font-size: var(--eas-fs-xs);
  color: var(--tone);
}

.tl-node.tone-muted .tl-status {
  color: var(--eas-ink-3);
}

.tl-text {
  margin-top: 4rpx;
  color: var(--eas-ink-2);
}

.tl-dept {
  margin-left: 12rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.tl-sub {
  margin-top: 4rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.num,
.tl-time {
  font-variant-numeric: tabular-nums;
}

.tl-task {
  margin-top: 12rpx;
  padding: 12rpx 16rpx;
  background: var(--eas-paper);
  border-radius: var(--eas-radius-control);
}

.tl-task-head {
  display: flex;
  align-items: baseline;
}

.tl-task-status {
  margin-left: 12rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}

.tl-time {
  margin-left: auto;
  padding-left: 16rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.tl-comment {
  margin-top: 6rpx;
  color: var(--eas-ink);
  line-height: 1.6;
  word-break: break-all;
  white-space: pre-wrap;
}

.tl-comment.reject {
  color: var(--eas-danger);
}
</style>
