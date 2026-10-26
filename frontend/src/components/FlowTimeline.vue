<script setup lang="ts">
// 流转记录：单据里的一张登记簿，每个节点一行（时间、节点、审批人、动作、意见）；
// 当前节点浅底，跳过的节点灰色并显示条件。
// 悬停或聚焦某个节点条目时，与上方签批栏对应的格子联动。
import { onBeforeUnmount, watch } from 'vue'
import type { FlowView, FlowNodeView, NodeStatus, TaskStatus } from '@/lib/types'
import { NODE_MODE_LABEL, NODE_STATUS_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { nodeKeyOf, useSlipHover } from '@/components/slip/hover'

const props = defineProps<{ flow: FlowView | null; templateName: string }>()
const hover = useSlipHover()
// 节点消失或时间线卸载时清掉它留下的悬停 / 焦点
watch(() => props.flow?.nodes, (nodes) => {
  const keys = new Set((nodes ?? []).map(nodeKeyOf))
  hover.release('flow', (key) => keys.has(key))
})
onBeforeUnmount(() => hover.release('flow'))

// 节点名前的 6px 圆点
const COLOR: Record<NodeStatus, string> = {
  WAITING: 'var(--eas-ink-3)',
  ACTIVE: 'var(--eas-mustard)',
  APPROVED: 'var(--eas-ink-2)',
  REJECTED: 'var(--eas-danger)',
  CANCELED: 'var(--eas-muted)',
  SKIPPED: 'var(--eas-ink-3)',
  NOT_REACHED: 'var(--eas-ink-3)',
}

// 与签批栏、审批按钮同一套说法
const TASK_TEXT: Record<TaskStatus, string> = {
  PENDING: '待处理',
  APPROVED: '同意',
  REJECTED: '驳回',
  CANCELED: '已取消',
  TRANSFERRED: '已转办',
}

function nodeTime(n: FlowNodeView): { label: string; value: string } | null {
  if (n.finishedAt) return { label: '结束于', value: fmtDateTime(n.finishedAt) }
  if (n.activatedAt) return { label: '开始于', value: fmtDateTime(n.activatedAt) }
  return null
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
    <p v-if="!flow || flow.nodes.length === 0" class="flow-empty">提交后生成审批流程</p>
    <template v-else>
      <div class="flow-meta"><span>模板 {{ templateName }}</span><span>版本 v{{ flow.versionNo }}</span></div>
      <ol class="flow-rows">
        <li v-for="n in flow.nodes" :key="n.seq" class="flow-row">
          <div
            :id="`flow-node-${nodeKeyOf(n)}`"
            class="node"
            :class="{ active: n.status === 'ACTIVE', dim: dim(n), rejected: n.status === 'REJECTED', linked: hover.key.value === nodeKeyOf(n) }"
            :aria-current="n.status === 'ACTIVE' ? 'step' : undefined"
            tabindex="0"
            @mouseenter="hover.enter(nodeKeyOf(n), 'flow', 'pointer')"
            @mouseleave="hover.leave(nodeKeyOf(n), 'pointer')"
            @focus="hover.enter(nodeKeyOf(n), 'flow', 'focus')"
            @blur="hover.leave(nodeKeyOf(n), 'focus')"
          >
            <div class="node-time">
              <template v-if="nodeTime(n)">
                <span class="time-label">{{ nodeTime(n)!.label }}</span>
                <span class="time-value">{{ nodeTime(n)!.value }}</span>
              </template>
            </div>
            <div class="node-body">
              <div class="node-head">
                <span class="node-dot" :class="{ hollow: n.status === 'WAITING' || dim(n) }" :style="{ '--dot': COLOR[n.status] }" aria-hidden="true" />
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
          </div>
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.flow {
  min-width: 0;
}
.flow-empty {
  margin: 0;
  padding: 12px 0;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-sm);
}
.flow-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-bottom: 4px;
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
  font-variant-numeric: tabular-nums;
}
.flow-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--eas-rule-strong);
}
.flow-row {
  border-bottom: 1px solid var(--eas-rule);
}
.flow-row:last-child {
  border-bottom: 0;
}
/* 行内：左边时间列，右边节点内容；--sub 是浅底上也够对比度的辅助文字色 */
.node {
  --sub: var(--eas-ink-3);
  position: relative;
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  column-gap: 16px;
  padding: 12px 12px;
  border-radius: var(--eas-radius-control);
  line-height: var(--eas-lh-body);
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
  --sub: var(--eas-ink-2);
  background: var(--eas-mustard-tint);
}
.node.active::before {
  background: var(--eas-mustard);
}
.node.rejected::before {
  background: var(--eas-danger);
}
.node.linked {
  --sub: var(--eas-ink-2);
  background: var(--eas-row-hover);
}
.node.active.linked {
  background: var(--eas-mustard-tint);
}
.node.linked::before {
  background: var(--eas-ink-2);
}
.node.active.linked::before {
  background: var(--eas-mustard);
}
.node:focus-visible {
  outline: 2px solid var(--eas-ink);
  outline-offset: 2px;
}
.node.dim {
  color: var(--eas-ink-3);
}
.node.linked.dim {
  color: var(--eas-ink-2);
}
.node-time {
  display: flex;
  flex-direction: column;
  color: var(--sub);
  font-size: var(--eas-fs-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.node-body {
  min-width: 0;
}
.node-head {
  display: flex;
  align-items: baseline;
  gap: 4px 12px;
  flex-wrap: wrap;
  margin-bottom: 2px;
}
.node-dot {
  align-self: center;
  flex: none;
  box-sizing: border-box;
  width: 6px;
  height: 6px;
  margin-right: -4px;
  border-radius: 50%;
  background: var(--dot);
}
.node-dot.hollow {
  border: 1px solid var(--eas-ink-3);
  background: transparent;
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
  color: var(--eas-warning-text);
  font-weight: 600;
}
.node-status.is-approved {
  color: var(--eas-ink-2);
}
.node-status.is-rejected {
  color: var(--eas-danger);
}
.node-status.is-skipped,
.node-status.is-not_reached,
.node-status.is-waiting,
.node-status.is-canceled {
  color: var(--sub);
}
.resolve-note {
  margin-top: 2px;
  color: var(--eas-warning-text);
}
.tasks {
  list-style: none;
  padding: 0;
  margin: 6px 0 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.task-head {
  display: flex;
  align-items: baseline;
  gap: 2px 12px;
  flex-wrap: wrap;
}
.task-who {
  min-width: 0;
  overflow-wrap: anywhere;
}
.task-status {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}
.task-approved .task-status {
  color: var(--eas-ink-2);
}
.task-rejected .task-status {
  color: var(--eas-danger);
}
.task-pending .task-status {
  color: var(--eas-warning-text);
}
.task-canceled .task-status {
  color: var(--sub);
}
.task-time {
  color: var(--sub);
  font-size: var(--eas-fs-xs);
  font-variant-numeric: tabular-nums;
}
.comment {
  margin-top: 2px;
  color: var(--eas-ink);
  font-size: var(--eas-fs-note);
  overflow-wrap: anywhere;
}
.task-rejected .comment {
  color: var(--eas-danger);
}
@media (max-width: 640px) {
  .node {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 2px;
  }
  .node-time {
    flex-direction: row;
    gap: 6px;
  }
  .node-time:empty {
    display: none;
  }
}
</style>
