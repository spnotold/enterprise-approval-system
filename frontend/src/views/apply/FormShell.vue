<script setup lang="ts">
// 申请表单外壳：单据头（类型名展示字 + 说明；草稿时右上「草稿」暗纸胶囊和单号）、错误汇总、底部操作栏（删除草稿 / 保存草稿 / 提交）
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = withDefaults(
  defineProps<{
    title: string
    appNo?: string | null
    /** 模板说明，显示在标题下方 */
    description?: string | null
    loading?: boolean
    loadError?: string | null
    dirty?: boolean
    saving?: boolean
    submitting?: boolean
    /** 正在上传的附件数 */
    uploading?: number
    canDelete?: boolean
    deleting?: boolean
    errors?: { path: string | null; message: string }[]
    /** 错误路径中各段的中文名，如 { items: '采购明细', amountCents: '金额' } */
    labels?: Record<string, string>
  }>(),
  {
    appNo: null,
    description: null,
    loading: false,
    loadError: null,
    dirty: false,
    saving: false,
    submitting: false,
    uploading: 0,
    canDelete: false,
    deleting: false,
    errors: () => [],
    labels: () => ({}),
  },
)

defineEmits<{ save: []; submit: []; delete: [] }>()
const router = useRouter()

const busy = computed(() => props.saving || props.submitting || props.deleting)

function describe(path: string | null): string {
  if (!path) return ''
  const parts = path.match(/[^.[\]]+/g) ?? []
  const out: string[] = []
  for (const p of parts) {
    if (/^\d+$/.test(p) && out.length) out[out.length - 1] += `第 ${Number(p) + 1} 项`
    else out.push(props.labels[p] ?? p)
  }
  return out.join(' ')
}

function back() {
  if (window.history.length > 1) router.back()
  else void router.push('/applications/mine')
}
</script>

<template>
  <div class="form-shell">
    <div class="sheet">
      <header class="form-head">
        <div class="form-head-main">
          <h2 class="form-title">{{ title }}</h2>
          <p v-if="description" class="form-desc">{{ description }}</p>
        </div>
        <div class="form-head-extra">
          <div v-if="appNo" class="form-meta">
            <span class="draft-mark inked">草稿</span><span class="form-no">{{ appNo }}</span>
          </div>
          <span v-if="dirty" class="form-state is-dirty">有未保存的修改</span>
          <span v-else-if="appNo" class="form-state is-saved">已保存</span>
          <slot name="header-extra" />
        </div>
      </header>

      <el-skeleton v-if="loading" class="sheet-pad" :rows="10" animated />
      <el-result v-else-if="loadError" icon="warning" :title="loadError">
        <template #extra>
          <el-button @click="router.push('/applications/mine')">返回我的申请</el-button>
        </template>
      </el-result>
      <template v-else>
        <div class="sheet-body">
          <el-alert v-if="errors.length" type="error" :closable="false" show-icon title="请修正以下问题后再试" class="error-summary">
            <ul class="error-list">
              <li v-for="(e, i) in errors" :key="i">
                <span v-if="e.path" class="error-path">{{ describe(e.path) }}：</span>{{ e.message }}
              </li>
            </ul>
          </el-alert>

          <slot />
        </div>

        <div class="form-actions">
          <el-button :disabled="busy" @click="back">返回</el-button>
          <el-button v-if="canDelete" type="danger" plain :loading="deleting" :disabled="busy" @click="$emit('delete')">
            删除草稿
          </el-button>
          <span class="flex-1" />
          <span v-if="uploading > 0" class="actions-note">附件上传中（{{ uploading }}）…</span>
          <el-button :loading="saving && !submitting" :disabled="busy || uploading > 0" @click="$emit('save')">保存草稿</el-button>
          <el-button type="primary" :loading="submitting" :disabled="busy || uploading > 0" @click="$emit('submit')">提交</el-button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* 表单整体是一张单据：纸色 + 硬投影（全局 .sheet），段间虚线分段（全局 .sheet-section） */
.form-shell { min-width: 0; }
.sheet { min-width: 0; }
/* 单据头：类型名展示字 28 + 一行说明 */
.form-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
  padding: 28px var(--eas-sheet-pad) 22px;
}
.form-head-main { min-width: 0; flex: 1 1 280px; }
.form-title {
  margin: 0;
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-26);
  font-weight: 600;
  line-height: var(--eas-lh-title);
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
  overflow-wrap: anywhere;
}
.form-desc { margin: 8px 0 0; color: var(--eas-ink-2); font-size: var(--eas-fs-note); }
.form-head-extra { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; min-width: 0; }
.form-head-extra:empty { display: none; }
.form-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: var(--eas-fs-12); color: var(--eas-ink-2); }
.form-no { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
/* 草稿：暗纸实色胶囊 */
.draft-mark {
  display: inline-flex;
  align-items: center;
  padding: 0 9px;
  border-radius: var(--eas-radius-pill);
  background-color: var(--eas-tab);
  font-size: var(--eas-fs-12);
  font-weight: 600;
  line-height: 20px;
  color: var(--eas-ink-2);
}
.form-state { font-size: var(--eas-fs-12); }
.is-dirty { color: var(--eas-warning-text); }
.is-saved { color: var(--eas-ink-3); }
.sheet-pad { padding: var(--eas-sheet-pad); box-sizing: border-box; }
.sheet-body { min-width: 0; }
/* 单据头（form-head）不是全局 sheet-head，第一段也应有虚线裁切线；全局 :first-child 规则会去掉，这里补回 */
.sheet-body :deep(.sheet-section:first-child) { border-top: 2px dashed var(--eas-rule); }
.error-summary, .sheet-body > :deep(.el-alert) { margin: 20px var(--eas-sheet-pad); width: auto; }
.error-list { margin: 4px 0 0; padding-left: 18px; }
.error-path { font-weight: 600; }
/* 标签在上、输入框在下；两列网格由各表单用 el-row / FormRenderer 的网格排 */
.sheet-body :deep(.el-form-item) { margin-bottom: 22px; min-width: 0; }
.sheet-body :deep(.el-form-item:last-child) { margin-bottom: 0; }
.sheet-body :deep(.el-form-item__label) { padding: 0; margin-bottom: 8px; line-height: 1.5; }
.sheet-body :deep(.el-form-item__content) { min-width: 0; }
.sheet-body :deep(.el-form-item__error) { position: static; width: 100%; padding-top: 4px; }
.sheet-body :deep(.form-renderer .el-form-item) { margin-bottom: 0; }
.sheet-body :deep(.el-form-item__content > .el-input),
.sheet-body :deep(.el-form-item__content > .el-select),
.sheet-body :deep(.el-form-item__content > .el-date-editor),
.sheet-body :deep(.el-form-item__content > .uploader) { width: 100%; min-width: 0; }
.sheet-body :deep(.el-row) { row-gap: 22px; margin-bottom: 22px; }
.sheet-body :deep(.el-row:last-child) { margin-bottom: 0; }
.sheet-body :deep(.el-col) { min-width: 0; }
.sheet-body :deep(.el-col .el-form-item) { margin-bottom: 0; }
.sheet-body :deep(.el-button--small),
.sheet-body :deep(.el-button.is-link) { min-height: 32px; }
.sheet-body :deep(.el-radio-group) { flex-wrap: wrap; gap: 4px 20px; }
.sheet-body :deep(.el-radio) { margin-right: 0; white-space: normal; height: auto; min-height: 32px; }
.sheet-body :deep(.el-radio__label) { white-space: normal; }
/* 底部操作栏（全局 .form-actions）：纸底 + 上沿硬投影；贴住单据底部圆角 */
.form-actions {
  flex-wrap: wrap;
  padding: 12px var(--eas-sheet-pad);
  border-radius: 0 0 var(--eas-radius-panel) var(--eas-radius-panel);
}
.form-actions :deep(.el-button + .el-button) { margin-left: 0; }
.actions-note { font-size: var(--eas-fs-12); color: var(--eas-ink-3); }
@media (max-width: 767px) {
  .form-head { padding: 24px 16px 18px; }
  .form-head-main { flex-basis: 100%; }
  .form-head-extra { align-items: flex-start; }
  .error-summary, .sheet-body > :deep(.el-alert) { margin: 16px; }
  .form-actions { padding: 12px 16px; gap: 8px; }
  .form-actions :deep(.el-button) { padding-left: 12px; padding-right: 12px; }
  .actions-note { flex-basis: 100%; order: -1; }
}
</style>
