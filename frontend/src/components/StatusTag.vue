<script setup lang="ts">
// 申请状态：列表里是「圆点 + 文字」，详情页单据头用描边小框（variant="box"）
// 草稿 / 已撤回灰、审批中主色（可附当前节点与审批人）、已通过绿、已驳回赭红
import { computed } from 'vue'
import type { AppStatus, CurrentNode } from '@/lib/types'
import { APP_STATUS_LABEL } from '@/lib/labels'

const props = withDefaults(
  defineProps<{
    status: AppStatus
    currentNode?: CurrentNode | null
    /** 审批中时是否显示当前节点与审批人 */
    showNode?: boolean
    /** large 为 16px；default / small 为 14px，与表格正文一致 */
    size?: 'large' | 'default' | 'small'
    /** dot：圆点 + 文字（列表）；box：描边小框（详情页单据头） */
    variant?: 'dot' | 'box'
  }>(),
  { currentNode: null, showNode: true, size: 'default', variant: 'dot' },
)

const TONE: Record<AppStatus, 'muted' | 'primary' | 'success' | 'danger'> = {
  DRAFT: 'muted',
  IN_APPROVAL: 'primary',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'muted',
}

const tone = computed(() => TONE[props.status] ?? 'muted')
// 节点名与审批人分开显示，不用符号拼接
const nodeParts = computed(() => {
  if (!props.showNode || props.status !== 'IN_APPROVAL' || !props.currentNode) return []
  const n = props.currentNode
  return n.assigneeName ? [n.name, n.assigneeName] : [n.name]
})
</script>

<template>
  <span class="status-tag" :class="[`is-${variant}`, `tone-${tone}`, `size-${size}`, { hollow: status === 'DRAFT' }]">
    <i v-if="variant === 'dot'" class="dot" aria-hidden="true" />
    <span class="label">{{ APP_STATUS_LABEL[status] ?? status }}</span>
    <span v-if="nodeParts.length" class="node">
      <span v-for="(part, i) in nodeParts" :key="i" class="node-part">{{ part }}</span>
    </span>
  </span>
</template>

<style scoped>
.status-tag {
  --tone: var(--eas-muted);
  --tone-text: var(--eas-ink-2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  white-space: nowrap;
  font-size: var(--eas-fs-sm);
  line-height: 1.4;
  vertical-align: middle;
}
.size-large {
  font-size: var(--eas-fs-md);
}
.tone-primary {
  --tone: var(--eas-primary);
  --tone-text: var(--eas-primary);
}
.tone-success {
  --tone: var(--eas-success);
  --tone-text: var(--eas-success);
}
.tone-danger {
  --tone: var(--eas-danger);
  --tone-text: var(--eas-danger);
}

.label {
  flex: none;
}
.node {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--eas-ink-2);
}
.node-part + .node-part {
  margin-left: 6px;
}

/* 圆点 + 文字：文字用墨色，状态由圆点颜色表达；草稿用空心点与已撤回区分 */
.is-dot .dot {
  flex: none;
  box-sizing: border-box;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tone);
}
.is-dot.size-large .dot {
  width: 8px;
  height: 8px;
}
.is-dot.hollow .dot {
  background: transparent;
  border: 1.5px solid var(--tone);
}
.is-dot .label {
  color: var(--eas-ink);
}

/* 描边小框 */
.is-box {
  padding: 1px 8px;
  border: 1px solid var(--tone);
  border-radius: var(--eas-radius-tag);
  color: var(--tone-text);
  font-weight: 500;
}
.is-box.size-small {
  padding: 0 6px;
  font-size: var(--eas-fs-xs);
}
.is-box .label {
  color: var(--tone-text);
}
</style>
