<script setup lang="ts">
// 申请状态标签：草稿灰、审批中蓝（附当前节点与审批人）、已通过绿、已驳回红、已撤回深灰
import { computed } from 'vue'
import type { AppStatus, CurrentNode } from '@/lib/types'
import { APP_STATUS_LABEL } from '@/lib/labels'

const props = withDefaults(
  defineProps<{
    status: AppStatus
    currentNode?: CurrentNode | null
    /** 审批中时是否显示当前节点与审批人 */
    showNode?: boolean
    size?: 'large' | 'default' | 'small'
  }>(),
  { currentNode: null, showNode: true, size: 'default' },
)

const STYLE: Record<AppStatus, { type: 'primary' | 'success' | 'info' | 'danger'; effect: 'light' | 'dark' | 'plain' }> = {
  DRAFT: { type: 'info', effect: 'plain' },
  IN_APPROVAL: { type: 'primary', effect: 'light' },
  APPROVED: { type: 'success', effect: 'light' },
  REJECTED: { type: 'danger', effect: 'light' },
  WITHDRAWN: { type: 'info', effect: 'dark' },
}

const style = computed(() => STYLE[props.status] ?? STYLE.DRAFT)
const nodeText = computed(() => {
  if (!props.showNode || props.status !== 'IN_APPROVAL' || !props.currentNode) return ''
  const n = props.currentNode
  return n.assigneeName ? `${n.name} · ${n.assigneeName}` : n.name
})
</script>

<template>
  <el-tag :type="style.type" :effect="style.effect" :size="size" disable-transitions class="status-tag">
    {{ APP_STATUS_LABEL[status] ?? status }}<template v-if="nodeText">：{{ nodeText }}</template>
  </el-tag>
</template>

<style scoped>
.status-tag {
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
