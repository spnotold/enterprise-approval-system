<script setup lang="ts">
// 流程时间线：每个节点的审批人、状态、意见与时间；当前节点高亮，跳过的节点灰色并显示条件
import type { FlowView, FlowNodeView, NodeStatus } from '@/lib/types'
import { NODE_MODE_LABEL, NODE_STATUS_LABEL, TASK_STATUS_LABEL, TASK_STATUS_TAG } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'

defineProps<{ flow: FlowView | null }>()

const COLOR: Record<NodeStatus, string> = {
  WAITING: 'var(--el-border-color)',
  ACTIVE: 'var(--el-color-primary)',
  APPROVED: 'var(--el-color-success)',
  REJECTED: 'var(--el-color-danger)',
  CANCELED: 'var(--el-text-color-secondary)',
  SKIPPED: 'var(--el-border-color-light)',
  NOT_REACHED: 'var(--el-border-color-light)',
}

const TAG: Record<NodeStatus, 'primary' | 'success' | 'danger' | 'info' | 'warning'> = {
  WAITING: 'info',
  ACTIVE: 'primary',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELED: 'info',
  SKIPPED: 'info',
  NOT_REACHED: 'info',
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
      <div class="muted small flow-meta">模板 {{ flow.templateCode }} · 版本 v{{ flow.versionNo }}</div>
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
          <div class="node" :class="{ active: n.status === 'ACTIVE', dim: dim(n), rejected: n.status === 'REJECTED' }">
            <div class="node-head">
              <span class="node-name">{{ n.seq }}. {{ n.name }}</span>
              <el-tag size="small" :type="TAG[n.status]" :effect="n.status === 'ACTIVE' ? 'dark' : 'light'" disable-transitions>
                {{ NODE_STATUS_LABEL[n.status] ?? n.status }}
              </el-tag>
              <el-tag v-if="n.mode && n.mode !== 'SINGLE'" size="small" type="warning" effect="plain" disable-transitions>
                {{ modeText(n) }}
              </el-tag>
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
              <li v-for="t in n.tasks" :key="t.id" class="task" :class="{ 'task-rejected': t.status === 'REJECTED' }">
                <div class="task-head">
                  <span>{{ t.assignee.realName }}</span>
                  <el-tag size="small" :type="TASK_STATUS_TAG[t.status]" effect="plain" disable-transitions>
                    {{ TASK_STATUS_LABEL[t.status] ?? t.status }}
                  </el-tag>
                  <span class="muted small">{{ fmtDateTime(t.actedAt ?? t.createdAt) }}</span>
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
  margin-bottom: 8px;
}
.node {
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid transparent;
}
.node.active {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}
.node.rejected {
  border-color: var(--el-color-danger-light-5);
  background: var(--el-color-danger-light-9);
}
.node.dim {
  color: var(--el-text-color-placeholder);
}
.node-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.node-name {
  font-weight: 600;
}
.resolve-note {
  margin-top: 2px;
  color: var(--el-color-warning-dark-2);
}
.tasks {
  list-style: none;
  padding: 0;
  margin: 6px 0 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.task {
  padding: 4px 8px;
  border-left: 2px solid var(--el-border-color);
}
.task-rejected {
  border-left-color: var(--el-color-danger);
}
.task-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.comment {
  margin-top: 2px;
  font-size: 13px;
}
.task-rejected .comment {
  color: var(--el-color-danger);
}
</style>
