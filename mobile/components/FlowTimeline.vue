<script setup lang="ts">
// 流程时间线（纵向）：每个节点的审批人、状态、意见和时间，当前节点高亮，驳回节点标红。
import type { FlowNodeView, FlowView } from '@/lib/types'
import { NODE_MODE_LABEL, NODE_STATUS_COLOR, NODE_STATUS_LABEL, TASK_STATUS_LABEL } from '@/utils/labels'
import { fmtDateTime } from '@/utils/time'

defineProps<{
  flow: FlowView | null
}>()

function nodeColor(n: FlowNodeView): string {
  return NODE_STATUS_COLOR[n.status] ?? '#c0c4cc'
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
  <view v-if="!flow || !flow.nodes.length" class="muted">提交后生成审批流程</view>
  <view v-else class="tl">
    <view class="muted tl-ver">模板版本 v{{ flow.versionNo }}</view>
    <view
      v-for="(n, i) in flow.nodes"
      :key="n.seq"
      class="tl-node"
      :class="{ active: n.status === 'ACTIVE', dim: n.status === 'SKIPPED' || n.status === 'NOT_REACHED' }"
    >
      <view class="tl-axis">
        <view class="tl-dot" :style="{ background: nodeColor(n) }" />
        <view v-if="i < flow.nodes.length - 1" class="tl-line" />
      </view>
      <view class="tl-body">
        <view class="row between">
          <view class="tl-name">
            {{ n.name }}
            <text v-if="modeText(n)" class="tag tag-blue tl-mode">{{ modeText(n) }}</text>
          </view>
          <text class="tl-status" :style="{ color: nodeColor(n) }">{{ NODE_STATUS_LABEL[n.status] }}</text>
        </view>
        <view v-if="n.mode !== 'SINGLE' && candidateNames(n)" class="tl-line-text">审批人：{{ candidateNames(n) }}</view>
        <view v-else-if="n.assignee" class="tl-line-text">
          审批人：{{ n.assignee.realName }}<text v-if="n.assignee.deptName" class="muted">（{{ n.assignee.deptName }}）</text>
        </view>
        <view v-if="n.resolveNote" class="muted">{{ n.resolveNote }}</view>
        <view v-if="n.conditionText" class="muted">
          条件：{{ n.conditionText }}
          <text v-if="n.conditionResult === false">（不满足，已跳过）</text>
        </view>
        <view v-for="t in n.tasks" :key="t.id" class="tl-task">
          <view class="row between">
            <text>{{ t.assignee.realName }} · {{ TASK_STATUS_LABEL[t.status] }}</text>
            <text class="muted">{{ t.actedAt ? fmtDateTime(t.actedAt) : fmtDateTime(t.createdAt) }}</text>
          </view>
          <view v-if="t.comment" class="tl-comment break" :class="{ reject: t.status === 'REJECTED' }">
            {{ t.status === 'REJECTED' ? '驳回理由：' : '意见：' }}{{ t.comment }}
          </view>
        </view>
        <view v-if="n.finishedAt" class="muted">完成于 {{ fmtDateTime(n.finishedAt) }}</view>
        <view v-else-if="n.activatedAt" class="muted">到达于 {{ fmtDateTime(n.activatedAt) }}</view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.tl-ver {
  margin-bottom: 12rpx;
}

.tl-node {
  display: flex;
}

.tl-node.dim {
  opacity: 0.6;
}

.tl-axis {
  width: 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.tl-dot {
  width: 22rpx;
  height: 22rpx;
  border-radius: 50%;
  margin-top: 12rpx;
}

.tl-node.active .tl-dot {
  box-shadow: 0 0 0 8rpx rgba(47, 107, 255, 0.18);
}

.tl-line {
  flex: 1;
  width: 2rpx;
  background: #e5e6eb;
  margin: 8rpx 0;
}

.tl-body {
  flex: 1;
  min-width: 0;
  padding: 0 0 28rpx 16rpx;
  font-size: 26rpx;
}

.tl-name {
  font-size: 28rpx;
  font-weight: 600;
}

.tl-node.active .tl-name {
  color: #2f6bff;
}

.tl-mode {
  margin-left: 8rpx;
}

.tl-status {
  font-size: 24rpx;
  flex-shrink: 0;
}

.tl-line-text {
  margin-top: 4rpx;
}

.tl-task {
  margin-top: 10rpx;
  padding: 12rpx 16rpx;
  background: #f7f8fa;
  border-radius: 10rpx;
}

.tl-comment {
  margin-top: 6rpx;
  color: #1f2329;
}

.tl-comment.reject {
  color: #e5484d;
}
</style>
