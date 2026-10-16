<script setup lang="ts">
// 流转记录：每个节点的审批人、状态、意见与时间；当前节点高亮，跳过的节点灰色并显示条件。
// 悬停或聚焦某个节点条目时，与上方签批栏对应的格子联动。
import type { FlowView, FlowNodeView, NodeStatus, TaskStatus } from '@/lib/types'
import { NODE_MODE_LABEL, NODE_STATUS_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { nodeKeyOf, useSlipHover } from '@/components/slip/hover'

defineProps<{ flow: FlowView | null }>()
const hover = useSlipHover()

const COLOR: Record<NodeStatus, string> = {
  WAITING: 'var(--eas-rule-strong)',
  ACTIVE: 'var(--eas-primary)',
  APPROVED: 'var(--eas-success)',
  REJECTED: 'var(--eas-danger)',
  CANCELED: 'var(--eas-muted)',
  SKIPPED: 'var(--eas-rule)',
  NOT_REACHED: 'var(--eas-rule)',
}

// 与签批栏、审批按钮同一套说法
const TASK_TEXT: Record<TaskStatus, string> = {
  PENDING: '待处理',
  APPROVED: '同意',
  REJECTED: '驳回',
  CANCELED: '已取消',
  TRANSFERRED: '已转办',
}

function nodeTime(n: FlowNodeView): string {
  if (n.finishedAt) return `结束于 ${fmtDateTime(n.finishedAt)}`
  if (n.activatedAt) return `开始于 ${fmtDateTime(n.activatedAt)}`
  return ''
}

/** 会签 1/3、或签 */
function modeText(n: FlowNodeView): string {
  if (n.mode === 'COUNTERSIGN') return `会签 ${n.approvedCount ?? 0}/${n.requiredCount || n.candidates?.length || 0}`
  if (n.mode === 'OR_SIGN') return `或签（${n.candidates?.length ?? 0} 人任一）`
  return NODE_MODE_LABEL[n.mode]
}

const dim = (n: FlowNodeView) => n.status === 'SKIPPED' || n.status === 'NOT_REACHED' || !n.effective
</script>

<template>
  <div class="flow">
    <el-empty v-if="!flow || flow.nodes.length === 0" :image-size="60" description="提交后生成审批流程" />
    <template v-else>
      <div class="flow-meta"><span>模板 {{ flow.templateCode }}</span><span>版本 v{{ flow.versionNo }}</span></div>
      <el-timeline>
        <el-timeline-item
          v-for="n in flow.nodes"
          :key="n.seq"
          :color="COLOR[n.status]"
          :size="n.status === 'ACTIVE' ? 'large' : 'normal'"
          :hollow="n.status === 'WAITING' || dim(n)"
          :timestamp="nodeTime(n)"
          placement="top"
        >
          <div
            :id="`flow-node-${nodeKeyOf(n)}`"
            class="node"
            :class="{ active: n.status === 'ACTIVE', dim: dim(n), rejected: n.status === 'REJECTED', linked: hover.key.value === nodeKeyOf(n) }"
            tabindex="0"
            @mouseenter="hover.enter(nodeKeyOf(n), 'flow')"
            @mouseleave="hover.leave(nodeKeyOf(n))"
            @focus="hover.enter(nodeKeyOf(n), 'flow')"
            @blur="hover.leave(nodeKeyOf(n))"
          >
            <div class="node-head">
              <span class="node-name">{{ n.seq }}. {{ n.name }}</span>
              <span class="node-status" :class="`is-${n.status.toLowerCase()}`">{{ NODE_STATUS_LABEL[n.status] ?? n.status }}</span>
              <span v-if="n.mode && n.mode !== 'SINGLE'" class="node-mode">{{ modeText(n) }}</span>
            </div>
            <div v-if="n.status === 'SKIPPED' || !n.effective" class="muted small">
              条件不满足，已跳过<template v-if="n.conditionText">：{{ n.conditionText }}</template>
            </div>
            <template v-else>
              <div v-if="n.mode && n.mode !== 'SINGLE' && n.candidates?.length" class="small">
                审批人：<span v-for="(c, k) in n.candidates" :key="c.id"
                  >{{ k > 0 ? '、' : '' }}{{ c.realName }}<span v-if="c.deptName" class="muted">（{{ c.deptName }}）</span></span
                >
              </div>
              <div v-else-if="n.assignee" class="small">
                审批人：{{ n.assignee.realName }}<span v-if="n.assignee.deptName" class="muted">（{{ n.assignee.deptName }}）</span>
              </div>
              <div v-if="n.conditionText" class="muted small">生效条件：{{ n.conditionText }}</div>
            </template>
            <div v-if="n.resolveNote" class="resolve-note small">{{ n.resolveNote }}</div>
            <ul v-if="n.tasks.length" class="tasks">
              <li v-for="t in n.tasks" :key="t.id" class="task" :class="`task-${t.status.toLowerCase()}`">
                <div class="task-head">
                  <span class="task-who">{{ t.assignee.realName }}</span>
                  <span class="task-status">{{ TASK_TEXT[t.status] ?? t.status }}</span>
                  <span class="task-time">{{ fmtDateTime(t.actedAt ?? t.createdAt) }}</span>
                </div>
                <div v-if="t.comment" class="comment pre-wrap">
                  {{ t.status === 'REJECTED' ? '驳回理由：' : '意见：' }}{{ t.comment }}
                </div>
              </li>
            </ul>
          </div>
        </el-timeline-item>
      </el-timeline>
    </template>
  </div>
</template>

<style scoped>
.flow-meta {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
}
.flow :deep(.el-timeline) {
  padding-left: 2px;
}
.flow :deep(.el-timeline-item__timestamp) {
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}
.node {
  position: relative;
  padding: 8px 12px;
  border-radius: var(--eas-radius-control);
  transition: background-color var(--eas-dur-fast) var(--eas-ease);
}
/* 左侧 3px 线：当前节点常显，联动高亮时也显示 */
.node::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 3px;
  border-radius: 2px;
  background: transparent;
  transition: background-color var(--eas-dur-fast) var(--eas-ease);
}
.node.active {
  background: var(--eas-primary-tint);
}
.node.active::before {
  background: var(--eas-primary);
}
.node.rejected::before {
  background: var(--eas-danger);
}
.node.linked {
  background: var(--eas-paper);
}
.node.linked::before {
  background: var(--eas-primary);
}
.node:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
.node.dim {
  color: var(--eas-ink-3);
}
.node-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.node-name {
  font-weight: 600;
}
.node-status,
.node-mode {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}
.node-status.is-active {
  color: var(--eas-primary);
  font-weight: 600;
}
.node-status.is-approved {
  color: var(--eas-success);
}
.node-status.is-rejected {
  color: var(--eas-danger);
}
.node-status.is-skipped,
.node-status.is-not_reached,
.node-status.is-waiting,
.node-status.is-canceled {
  color: var(--eas-ink-3);
}
.resolve-note {
  margin-top: 2px;
  color: var(--eas-warning-text);
}
.tasks {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.task {
  padding: 2px 0 2px 10px;
  border-left: 2px solid var(--eas-rule-strong);
}
.task-approved {
  border-left-color: var(--eas-success);
}
.task-rejected {
  border-left-color: var(--eas-danger);
}
.task-pending {
  border-left-color: var(--eas-primary);
}
.task-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}
.task-status {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}
.task-approved .task-status {
  color: var(--eas-success);
}
.task-rejected .task-status {
  color: var(--eas-danger);
}
.task-pending .task-status {
  color: var(--eas-primary);
}
.task-time {
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
  font-variant-numeric: tabular-nums;
}
.comment {
  margin-top: 2px;
  color: var(--eas-ink);
}
.task-rejected .comment {
  color: var(--eas-danger);
}
</style>
