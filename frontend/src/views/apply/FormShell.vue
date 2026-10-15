<script setup lang="ts">
// 申请表单外壳：标题、错误汇总、底部操作栏（删除草稿 / 保存草稿 / 提交）
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = withDefaults(
  defineProps<{
    title: string
    appNo?: string | null
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
  return out.join(' · ')
}

function back() {
  if (window.history.length > 1) router.back()
  else void router.push('/applications/mine')
}
</script>

<template>
  <div class="page form-shell">
    <div class="page-header">
      <div>
        <h2 class="page-title">
          {{ title }}
          <el-tag v-if="appNo" type="info" effect="plain" class="no-tag" disable-transitions>{{ appNo }}</el-tag>
          <el-tag v-else type="info" effect="plain" class="no-tag" disable-transitions>新建</el-tag>
        </h2>
        <div class="page-subtitle">
          草稿保存时只检查格式，提交时检查必填项和业务规则。
          <span v-if="dirty" class="text-warning">有未保存的修改</span>
          <span v-else-if="appNo" class="text-success">已保存</span>
        </div>
      </div>
      <slot name="header-extra" />
    </div>

    <el-skeleton v-if="loading" :rows="10" animated />
    <el-result v-else-if="loadError" icon="warning" :title="loadError">
      <template #extra>
        <el-button @click="router.push('/applications/mine')">返回我的申请</el-button>
      </template>
    </el-result>
    <template v-else>
      <el-alert v-if="errors.length" type="error" :closable="false" show-icon title="请修正以下问题后再试">
        <ul class="error-list">
          <li v-for="(e, i) in errors" :key="i">
            <span v-if="e.path" class="error-path">{{ describe(e.path) }}：</span>{{ e.message }}
          </li>
        </ul>
      </el-alert>

      <slot />

      <div class="form-actions">
        <el-button :disabled="busy" @click="back">返回</el-button>
        <el-button v-if="canDelete" type="danger" plain :loading="deleting" :disabled="busy" @click="$emit('delete')">
          删除草稿
        </el-button>
        <span class="flex-1" />
        <span v-if="uploading > 0" class="muted small">附件上传中（{{ uploading }}）…</span>
        <el-button :loading="saving && !submitting" :disabled="busy || uploading > 0" @click="$emit('save')">保存草稿</el-button>
        <el-button type="primary" :loading="submitting" :disabled="busy || uploading > 0" @click="$emit('submit')">提交</el-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.no-tag {
  margin-left: 8px;
  vertical-align: middle;
}
.error-list {
  margin: 4px 0 0;
  padding-left: 18px;
}
.error-path {
  font-weight: 600;
}
.form-shell :deep(.el-card) {
  overflow: visible;
}
</style>
