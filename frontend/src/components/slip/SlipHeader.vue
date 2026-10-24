<script setup lang="ts">
// 单据头：类型、单号（点击复制）、标题（宋体）、申请人 / 部门 / 提交时间 / 金额；终态时右上角盖章。
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { ApplicationDetail } from '@/lib/types'
import { APP_TYPE_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import MoneyText from '@/components/MoneyText.vue'
import StatusTag from '@/components/StatusTag.vue'
import Stamp from './Stamp.vue'

const props = defineProps<{ detail: ApplicationDetail }>()

const typeName = computed(() => (props.detail.type === 'CUSTOM' ? props.detail.templateName : APP_TYPE_LABEL[props.detail.type]))
const stamp = computed(() => {
  if (props.detail.status === 'APPROVED') return { tone: 'success' as const, text: '已通过' }
  if (props.detail.status === 'REJECTED') return { tone: 'danger' as const, text: '已驳回' }
  return null
})

// http 部署（非安全上下文）下没有 navigator.clipboard，退回 execCommand
async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  if (!ok) throw new Error('copy failed')
}

async function copyNo() {
  try {
    await writeClipboard(props.detail.appNo)
    ElMessage.success('已复制单号')
  } catch {
    ElMessage.warning('复制失败，请手动选择单号复制')
  }
}
</script>

<template>
  <header class="slip-header" :class="{ sealed: stamp }">
    <div class="slip-header-main">
      <div class="slip-kind">
        <span>{{ typeName }}</span>
        <el-tooltip content="复制" placement="top" :show-after="200">
          <button type="button" class="slip-no" :aria-label="`复制单号 ${detail.appNo}`" @click="copyNo">{{ detail.appNo }}</button>
        </el-tooltip>
        <StatusTag v-if="!stamp" :status="detail.status" :show-node="false" size="small" />
      </div>
      <h1 class="slip-title pre-wrap">{{ detail.title || detail.templateName }}</h1>
      <dl class="slip-meta">
        <div><dt>申请人</dt><dd>{{ detail.applicant.realName }}</dd></div>
        <div v-if="detail.deptName"><dt class="sr-only">部门</dt><dd>{{ detail.deptName }}</dd></div>
        <div v-if="detail.submittedAt"><dt>提交于</dt><dd class="num">{{ fmtDateTime(detail.submittedAt) }}</dd></div>
        <div v-else><dt>创建于</dt><dd class="num">{{ fmtDateTime(detail.createdAt) }}</dd></div>
      </dl>
    </div>
    <div v-if="stamp || detail.amountCents != null" class="slip-header-aside">
      <Stamp v-if="stamp" :tone="stamp.tone" :text="stamp.text" size="lg" class="slip-stamp" />
      <div v-if="detail.amountCents != null" class="slip-amount"><span class="amount-label">金额</span><MoneyText :cents="detail.amountCents" strong /></div>
    </div>
  </header>
</template>

<style scoped>
.slip-header {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 24px;
  padding: 28px var(--eas-sheet-inset) 24px;
}
.slip-header-main {
  flex: 1;
  min-width: 0;
}
.slip-kind {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-sm);
}
.slip-no {
  position: relative;
  min-height: 32px;
  margin: 0 -4px;
  padding: 2px 4px;
  border: 0;
  border-radius: var(--eas-radius-tag);
  background: none;
  color: var(--eas-ink-2);
  font: inherit;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  cursor: copy;
  transition: background-color var(--eas-dur-fast) var(--eas-ease), color var(--eas-dur-fast) var(--eas-ease);
}
.slip-no:hover {
  background: var(--eas-row-hover);
  color: var(--eas-ink);
}
.slip-no:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
.slip-title {
  margin: 8px 0 12px;
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-26);
  font-weight: 600;
  line-height: 1.4;
  color: var(--eas-ink);
}
.slip-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 28px;
  margin: 0;
  font-size: var(--eas-fs-sm);
}
.slip-meta > div {
  display: flex;
  gap: 6px;
}
.slip-meta dt {
  color: var(--eas-ink-2);
}
.slip-meta dd {
  margin: 0;
  color: var(--eas-ink);
}
.num {
  font-variant-numeric: tabular-nums;
}
.slip-header-aside {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 16px;
  padding-top: 4px;
  align-self: stretch;
  justify-content: flex-end;
  max-width: 100%;
}
.slip-stamp { margin: 2px 6px auto 0; }
.slip-amount { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.amount-label { color: var(--eas-ink-3); font-size: var(--eas-fs-12); }
.slip-amount :deep(.money) {
  font-family: var(--eas-font-serif);
  font-size: calc(var(--eas-fs-26) + 4px);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
@media (max-width: 768px) {
  .slip-header {
    gap: 16px;
    flex-wrap: wrap;
  }
  .slip-header-main { flex-basis: 100%; }
  .sealed .slip-kind { padding-right: 112px; gap: 4px 12px; }
  .sealed .slip-stamp { position: absolute; top: 28px; right: var(--eas-sheet-inset); margin: 0; }
  .slip-header-aside { flex: 1; flex-direction: row; align-items: center; justify-content: flex-end; }
  .slip-amount { margin-left: auto; }
  .slip-title { overflow-wrap: anywhere; }
}
</style>
