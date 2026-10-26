<script setup lang="ts">
// 申请状态：实色胶囊 + 颗粒（docs/ui_design.md 第 2 节状态映射），审批中时后面跟当前节点和审批人。
// 草稿 = 暗纸，审批中 = 天青，已通过 = 鼠尾草，已驳回 = 铁锈（纸色字），已撤回 = 深灰（纸色字）
import { computed } from 'vue'
import type { AppStatus, CurrentNode } from '@/lib/types'
import { APP_STATUS_LABEL } from '@/utils/labels'

const props = defineProps<{
  status: AppStatus
  node?: CurrentNode | null
}>()

const tone = computed(() => ({
  DRAFT: 'draft',
  IN_APPROVAL: 'sky',
  APPROVED: 'sage',
  REJECTED: 'rust',
  WITHDRAWN: 'muted',
})[props.status] ?? 'muted')
const nodeText = computed(() => {
  if (props.status !== 'IN_APPROVAL' || !props.node) return ''
  return props.node.assigneeName ? `${props.node.name} ${props.node.assigneeName}` : props.node.name
})
</script>

<template>
  <view class="status" :class="`tone-${tone}`">
    <text class="pill">{{ APP_STATUS_LABEL[status] }}</text>
    <text v-if="nodeText" class="status-node">{{ nodeText }}</text>
  </view>
</template>

<style scoped>
.status {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
}

.pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 44rpx;
  padding: 0 18rpx;
  border-radius: var(--eas-radius-pill);
  font-size: 24rpx;
  font-weight: 600;
  line-height: 44rpx;
  white-space: nowrap;
  background-color: var(--eas-ink-2);
  background-image: var(--eas-grain-deep);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
  color: var(--eas-sheet);
}

.tone-draft .pill { background-color: var(--eas-tab); background-image: none; color: var(--eas-ink); }
.tone-sky .pill { background-color: var(--eas-sky); background-image: var(--eas-grain); color: var(--eas-ink); }
.tone-sage .pill { background-color: var(--eas-sage); background-image: var(--eas-grain); color: var(--eas-ink); }
.tone-rust .pill { background-color: var(--eas-rust); color: var(--eas-sheet); }

.status-node {
  margin-left: 12rpx;
  font-size: 24rpx;
  color: var(--eas-ink-2);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
