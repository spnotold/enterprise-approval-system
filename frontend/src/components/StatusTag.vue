<script setup lang="ts">
// 申请状态：实色胶囊 + 颗粒（docs/ui_design.md 第 2 节状态映射）
// 草稿 = 暗纸，审批中 = 天青（可附当前节点与审批人），已通过 = 鼠尾草，已驳回 = 铁锈（纸上字），已撤回 = muted
import { computed } from 'vue'
import type { AppStatus, CurrentNode } from '@/lib/types'
import { APP_STATUS_LABEL } from '@/lib/labels'

const props = withDefaults(
  defineProps<{
    status: AppStatus
    currentNode?: CurrentNode | null
    /** 审批中时是否在胶囊后附当前节点与审批人 */
    showNode?: boolean
    /** large 为 16px；default 14px；small 12px */
    size?: 'large' | 'default' | 'small'
    /** 保留兼容旧调用：v3 起两种变体都是实色胶囊 */
    variant?: 'dot' | 'box'
  }>(),
  { currentNode: null, showNode: true, size: 'default', variant: 'dot' },
)

type Tone = 'draft' | 'sky' | 'sage' | 'rust' | 'muted'
const TONE: Record<AppStatus, Tone> = {
  DRAFT: 'draft',
  IN_APPROVAL: 'sky',
  APPROVED: 'sage',
  REJECTED: 'rust',
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
  <span class="status-tag" :class="[`tone-${tone}`, `size-${size}`]">
    <span class="pill">{{ APP_STATUS_LABEL[status] ?? status }}</span>
    <span v-if="nodeParts.length" class="node">
      <span v-for="(part, i) in nodeParts" :key="i" class="node-part">{{ part }}</span>
    </span>
  </span>
</template>

<style scoped>
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  min-width: 0;
  white-space: nowrap;
  font-size: var(--eas-fs-sm);
  line-height: 1.4;
  vertical-align: middle;
}

/* 实色胶囊：墨块叠颗粒；色块上的字按第 2 节配色 */
.pill {
  --pill-bg: var(--eas-muted);
  --pill-text: var(--eas-sheet);
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 26px;
  padding: 0 12px;
  border-radius: var(--eas-radius-pill);
  background-color: var(--pill-bg);
  background-image: var(--eas-grain);
  background-blend-mode: multiply;
  color: var(--pill-text);
  font-weight: 600;
}
.tone-draft .pill {
  --pill-bg: var(--eas-tab);
  --pill-text: var(--eas-ink-2);
  background-image: none;
}
.tone-sky .pill {
  --pill-bg: var(--eas-sky);
  --pill-text: var(--eas-ink);
}
.tone-sage .pill {
  --pill-bg: var(--eas-sage);
  --pill-text: var(--eas-ink);
}
.tone-rust .pill {
  --pill-bg: var(--eas-rust);
  --pill-text: var(--eas-sheet);
}
.size-small {
  font-size: var(--eas-fs-xs);
}
.size-small .pill {
  height: 22px;
  padding: 0 10px;
  font-size: var(--eas-fs-xs);
}
.size-large {
  font-size: var(--eas-fs-md);
}
.size-large .pill {
  height: 30px;
  padding: 0 14px;
}

/* 审批中附在胶囊后的当前节点与审批人 */
.node {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--eas-ink-2);
}
.node-part + .node-part {
  margin-left: 6px;
}
</style>
