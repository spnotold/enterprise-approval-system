<script setup lang="ts">
import '@/components/admin/admin.css'
// 系统配置：键值列表，修改需填写原因（写入审计日志，可在审计日志中对比前后值）
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { ApiError } from '@/lib/http'
import type { SysConfigItem } from '@/lib/types'
import { fmtDateTime } from '@/lib/datetime'
import { showError } from '@/lib/errors'
import { useAction } from '@/composables/useAction'
import { useAuthStore } from '@/stores/auth'
import ListEmpty from '@/components/ListEmpty.vue'
import ServerErrorAlert from '@/components/admin/ServerErrorAlert.vue'

const router = useRouter()
const auth = useAuthStore()
const { loading: acting, run } = useAction()

const list = ref<SysConfigItem[]>([])
const loading = ref(false)
const keyword = ref('')

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return list.value
  return list.value.filter(
    (c) => c.key.toLowerCase().includes(k) || (c.description ?? '').toLowerCase().includes(k),
  )
})

async function load() {
  loading.value = true
  try {
    list.value = await api.admin.config.list()
  } catch (e) {
    showError(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ---------- 编辑 ----------

const formRef = ref<FormInstance>()
const form = reactive({
  visible: false,
  item: null as SysConfigItem | null,
  value: '',
  reason: '',
  error: null as ApiError | null,
})
const rules: FormRules = {
  reason: [
    { required: true, whitespace: true, message: '请填写修改原因', trigger: 'blur' },
    { max: 500, message: '不能超过 500 字', trigger: 'blur' },
  ],
}
const unchanged = computed(() => form.item !== null && form.value === form.item.value)
const multiline = computed(() => (form.item?.value.length ?? 0) > 60 || (form.item?.value.includes('\n') ?? false))

function openEdit(c: SysConfigItem) {
  Object.assign(form, { visible: true, item: c, value: c.value, reason: '', error: null })
  formRef.value?.clearValidate()
}

async function submit() {
  const item = form.item
  if (!item || unchanged.value || !(await formRef.value?.validate().catch(() => false))) return
  form.error = null
  const value = form.value
  const reason = form.reason.trim()
  const ok = await run({
    action: async () => {
      await api.admin.config.update(item.key, { value, reason })
      return true
    },
    success: '配置已更新',
    onError: (e) => {
      if (e.code === 40000 || e.code === 42201) {
        form.error = e
        return true
      }
      return false
    },
  })
  if (ok) {
    form.visible = false
    await load()
  }
}

function openAudit(c: SysConfigItem) {
  void router.push({ path: '/admin/audit-logs', query: { targetId: c.key } })
}
</script>

<template>
  <div class="page admin-page">
    <header class="sheet-head">
      <div>
        <h2 class="sheet-title">系统配置</h2>
        <p class="sheet-sub">修改需填写原因并写入审计日志；修改前请确认配置值的格式与含义。</p>
      </div>
      <div class="head-actions">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>
    </header>

    <div class="toolbar list-filters">
      <el-input v-model="keyword" placeholder="按键名或说明过滤" clearable :prefix-icon="Search" />
    </div>

    <el-table v-loading="loading" :data="filtered" row-key="key" class="eas-row-table" style="width: 100%">
      <el-table-column label="键" min-width="200">
        <template #default="{ row }"><span class="mono">{{ row.key }}</span></template>
      </el-table-column>
      <el-table-column label="值" min-width="200">
        <template #default="{ row }"><span class="mono pre-wrap">{{ row.value }}</span></template>
      </el-table-column>
      <el-table-column label="说明" min-width="220">
        <template #default="{ row }">
          <span class="pre-wrap">{{ row.description ?? '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="160">
        <template #default="{ row }">{{ fmtDateTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <span class="row-actions">
            <el-button link type="primary" :disabled="acting" @click="openEdit(row as SysConfigItem)">修改</el-button>
            <el-button v-if="auth.can('ADMIN_AUDIT')" link @click="openAudit(row as SysConfigItem)">变更记录</el-button>
          </span>
        </template>
      </el-table-column>
      <template #empty>
        <ListEmpty :filtered="!!keyword.trim()" @reset="keyword = ''" />
      </template>
    </el-table>

    <el-dialog v-model="form.visible" title="修改配置" width="min(560px, 94vw)" :close-on-click-modal="false">
      <ServerErrorAlert :error="form.error" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="键">
          <span class="mono">{{ form.item?.key }}</span>
        </el-form-item>
        <el-form-item v-if="form.item?.description" label="说明">
          <span class="pre-wrap muted">{{ form.item.description }}</span>
        </el-form-item>
        <el-form-item label="当前值">
          <span class="mono pre-wrap">{{ form.item?.value }}</span>
        </el-form-item>
        <el-form-item label="新值">
          <el-input
            v-model="form.value"
            :type="multiline ? 'textarea' : 'text'"
            :autosize="multiline ? { minRows: 3, maxRows: 10 } : undefined"
            class="mono"
          />
        </el-form-item>
        <el-form-item label="修改原因" prop="reason">
          <el-input
            v-model="form.reason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="将写入审计日志"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span v-if="unchanged" class="muted small unchanged-tip">值未修改</span>
        <el-button @click="form.visible = false">取消</el-button>
        <el-button type="primary" :loading="acting" :disabled="unchanged" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.unchanged-tip {
  margin-right: 12px;
}
</style>
