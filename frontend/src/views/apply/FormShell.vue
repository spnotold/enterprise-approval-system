<script setup lang="ts">
// 申请表单外壳：标题、错误汇总、底部操作栏（删除草稿 / 保存草稿 / 提交）
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
      <header class="sheet-head">
        <div class="sheet-main">
          <div class="sheet-meta">
            <span class="sheet-no">{{ appNo || '新建草稿' }}</span>
            <span v-if="dirty" class="sheet-state is-dirty">有未保存的修改</span>
            <span v-else-if="appNo" class="sheet-state is-saved">已保存</span>
          </div>
          <h2 class="sheet-title">{{ title }}</h2>
          <p v-if="description" class="sheet-desc">{{ description }}</p>
          <p class="sheet-hint">草稿保存时只检查格式，提交时检查必填项和业务规则。</p>
        </div>
        <div class="sheet-extra"><slot name="header-extra" /></div>
      </header>

      <el-skeleton v-if="loading" class="sheet-pad" :rows="10" animated />
      <el-result v-else-if="loadError" icon="warning" :title="loadError">
        <template #extra>
          <el-button @click="router.push('/applications/mine')">返回我的申请</el-button>
        </template>
      </el-result>
      <template v-else>
        <div class="sheet-body">
          <el-alert v-if="errors.length" type="error" :closable="false" show-icon title="请修正以下问题后再试">
            <ul class="error-list">
              <li v-for="(e, i) in errors" :key="i">
                <span v-if="e.path" class="error-path">{{ describe(e.path) }}：</span>{{ e.message }}
              </li>
            </ul>
          </el-alert>

          <slot />
        </div>

        <div class="form-actions">
          <el-button text :disabled="busy" @click="back">返回</el-button>
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
.form-shell {
  max-width: 1200px;
}

/* 整张表单是一张单据：单据头与各分节在同一张纸上 */
.sheet {
  background: var(--eas-surface);
  border: 1px solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
}
.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 24px;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--eas-rule);
}
.sheet-main {
  min-width: 0;
  flex: 1 1 360px;
}
.sheet-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  font-size: var(--eas-fs-xs);
  line-height: 1.6;
  color: var(--eas-ink-2);
  font-variant-numeric: tabular-nums;
}
.sheet-state.is-dirty {
  color: var(--eas-warning-text);
}
.sheet-state.is-saved {
  color: var(--eas-success);
}
.sheet-title {
  margin: 4px 0 0;
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-lg);
  font-weight: 600;
  line-height: 1.4;
  color: var(--eas-ink);
}
.sheet-desc {
  margin: 4px 0 0;
  font-size: var(--eas-fs-sm);
  line-height: 1.6;
  color: var(--eas-ink-2);
}
.sheet-hint {
  margin: 4px 0 0;
  font-size: var(--eas-fs-xs);
  line-height: 1.6;
  color: var(--eas-ink-3);
}
.sheet-extra:empty {
  display: none;
}
.sheet-pad {
  padding: 24px;
}

.sheet-body {
  padding: 4px 24px 8px;
}
.sheet-body > .el-alert {
  margin: 16px 0 4px;
}
.error-list {
  margin: 4px 0 0;
  padding-left: 18px;
}
.error-path {
  font-weight: 600;
}

/* 插槽里的 el-card 统一压平成分节：小标题 + 顶部分隔线，不再一组一张卡片 */
.sheet-body :deep(.el-card) {
  overflow: visible;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
  --el-card-padding: 0;
}
.sheet-body :deep(.el-card + .el-card),
.sheet-body :deep(.el-alert + .el-card) {
  border-top: 1px solid var(--eas-rule);
}
.sheet-body :deep(.el-card__header) {
  padding: 20px 0 12px;
  border-bottom: 0;
}
.sheet-body :deep(.el-card__body) {
  padding: 0 0 20px;
  /* Element Plus 默认 overflow:auto，会把贴左边按钮的焦点外框裁掉；宽表格自带横向滚动 */
  overflow: visible;
}
.sheet-body :deep(.el-card__body:first-child) {
  padding-top: 16px;
}
.sheet-body :deep(.el-card__header .section-title),
.sheet-body :deep(.el-card__header .el-card-title) {
  margin: 0;
  font-size: var(--eas-fs-md);
  font-weight: 600;
  line-height: 1.5;
  color: var(--eas-ink);
}
/* 表单内部嵌套的卡片（如关联申请）保持各自样式 */
.sheet-body :deep(.el-card .el-card) {
  border: 1px solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
}

.form-actions {
  align-items: center;
  flex-wrap: wrap;
  padding: 12px 24px;
  border: 0;
  border-top: 1px solid var(--eas-rule);
  border-radius: 0 0 var(--eas-radius-panel) var(--eas-radius-panel);
  background: var(--eas-surface);
  box-shadow: none;
}
/* Element Plus 会给相邻按钮加 12px 左边距，这里交给 gap 控制节奏 */
.form-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
/* 吸底时，el-main 的下内边距处会露出下方内容，用页面底色盖住 */
.form-actions::after {
  content: '';
  position: absolute;
  top: 100%;
  left: -1px;
  right: -1px;
  height: 20px;
  background: var(--eas-paper);
  pointer-events: none;
}
.actions-note {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

@media (max-width: 768px) {
  .sheet-head,
  .sheet-body {
    padding-left: 16px;
    padding-right: 16px;
  }
  .form-actions {
    padding: 12px 16px;
  }
  /* 上传提示单独占一行，排在最前，按钮不被挤散 */
  .actions-note {
    flex-basis: 100%;
    order: -1;
    text-align: right;
  }
}
</style>
