<script setup lang="ts">
import '@/components/admin/admin.css'
// 费用类型：新建、编辑（名称、启用、排序；编码不可修改）、删除（已被报销明细引用的只能停用）
import { computed, onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { ApiError } from '@/lib/http'
import type { ExpenseTypeAdmin } from '@/lib/types'
import { showError } from '@/lib/errors'
import { useAction } from '@/composables/useAction'
import { useDictStore } from '@/stores/dict'
import ListEmpty from '@/components/ListEmpty.vue'
import ServerErrorAlert from '@/components/admin/ServerErrorAlert.vue'

const dict = useDictStore()
const { loading: acting, run } = useAction()

const list = ref<ExpenseTypeAdmin[]>([])
const loading = ref(false)

const sorted = computed(() => [...list.value].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id))

async function load() {
  loading.value = true
  try {
    list.value = await api.admin.expenseTypes.list()
  } catch (e) {
    showError(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function changed() {
  dict.invalidate('expenseTypes')
  await load()
}

// ---------- 新建 / 编辑 ----------

const formRef = ref<FormInstance>()
const form = reactive({
  visible: false,
  id: null as number | null,
  code: '',
  name: '',
  enabled: true,
  sortOrder: 0,
  referenced: false,
  error: null as ApiError | null,
})
const isCreate = computed(() => form.id === null)
const rules: FormRules = {
  code: [
    { required: true, whitespace: true, message: '请填写编码', trigger: 'blur' },
    { pattern: /^[A-Za-z][A-Za-z0-9_]{0,31}$/, message: '字母开头，1-32 位字母、数字或下划线', trigger: 'blur' },
  ],
  name: [
    { required: true, whitespace: true, message: '请填写名称', trigger: 'blur' },
    { max: 50, message: '不能超过 50 字', trigger: 'blur' },
  ],
}

function openCreate() {
  const maxSort = list.value.reduce((m, t) => Math.max(m, t.sortOrder), 0)
  Object.assign(form, {
    visible: true,
    id: null,
    code: '',
    name: '',
    enabled: true,
    sortOrder: maxSort + 10,
    referenced: false,
    error: null,
  })
  formRef.value?.clearValidate()
}

function openEdit(t: ExpenseTypeAdmin) {
  Object.assign(form, {
    visible: true,
    id: t.id,
    code: t.code,
    name: t.name,
    enabled: t.enabled,
    sortOrder: t.sortOrder,
    referenced: t.referenced,
    error: null,
  })
  formRef.value?.clearValidate()
}

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  form.error = null
  const id = form.id
  const name = form.name.trim()
  const sortOrder = form.sortOrder
  const enabled = form.enabled
  const ok = await run({
    action: async () => {
      if (id === null) await api.admin.expenseTypes.create({ code: form.code.trim(), name, sortOrder })
      else await api.admin.expenseTypes.update(id, { name, enabled, sortOrder })
      return true
    },
    success: id === null ? '费用类型已创建' : '费用类型已更新',
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
    await changed()
  }
}

// ---------- 启用 / 停用、删除 ----------

async function toggle(t: ExpenseTypeAdmin) {
  const enabling = !t.enabled
  const ok = await run({
    confirm: enabling
      ? null
      : {
          title: `停用费用类型：${t.name}`,
          message: '停用后填写报销明细时不能再选择该类型，可随时重新启用。',
          confirmText: '停用',
          danger: true,
        },
    action: async () => {
      await api.admin.expenseTypes.update(t.id, { name: t.name, enabled: enabling, sortOrder: t.sortOrder })
      return true
    },
    success: enabling ? '已启用' : '已停用',
  })
  if (ok) await changed()
}

async function remove(t: ExpenseTypeAdmin) {
  if (t.referenced) return
  const ok = await run({
    confirm: {
      title: `删除费用类型：${t.name}`,
      message: `确定删除“${t.name}”（${t.code}）？删除后不可恢复。`,
      confirmText: '删除',
      danger: true,
    },
    action: async () => {
      await api.admin.expenseTypes.remove(t.id)
      return true
    },
    success: '费用类型已删除',
  })
  if (ok) await changed()
}
</script>

<template>
  <div class="page admin-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">费用类型</h2>
        <div class="page-subtitle">报销明细可选的费用类型。已被报销明细引用的类型不能删除，只能停用。</div>
      </div>
      <div class="toolbar">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建费用类型</el-button>
      </div>
    </div>

    <el-card shadow="never">
      <el-table v-loading="loading" :data="sorted" row-key="id" class="eas-row-table" style="width: 100%">
        <el-table-column prop="code" label="编码" min-width="120" />
        <el-table-column prop="name" label="名称" min-width="120" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'" disable-transitions>
              {{ row.enabled ? '启用' : '已停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sortOrder" label="排序" width="80" align="right" />
        <el-table-column label="引用" min-width="150">
          <template #default="{ row }">
            <span v-if="row.referenced" class="text-warning small">已被引用，只能停用</span>
            <span v-else class="muted small">未被引用</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="170">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="acting" @click="openEdit(row as ExpenseTypeAdmin)">编辑</el-button>
            <el-button
              link
              :type="row.enabled ? 'danger' : 'success'"
              :disabled="acting"
              @click="toggle(row as ExpenseTypeAdmin)"
            >
              {{ row.enabled ? '停用' : '启用' }}
            </el-button>
            <el-tooltip :disabled="!row.referenced" content="已被引用，只能停用" placement="top">
              <span class="btn-wrap">
                <el-button
                  link
                  type="danger"
                  :disabled="acting || row.referenced"
                  @click="remove(row as ExpenseTypeAdmin)"
                >
                  删除
                </el-button>
              </span>
            </el-tooltip>
          </template>
        </el-table-column>
        <template #empty>
          <ListEmpty description="暂无费用类型" />
        </template>
      </el-table>
    </el-card>

    <el-dialog
      v-model="form.visible"
      :title="isCreate ? '新建费用类型' : '编辑费用类型'"
      width="min(460px, 94vw)"
      :close-on-click-modal="false"
    >
      <ServerErrorAlert :error="form.error" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="编码" prop="code">
          <el-input v-model="form.code" :disabled="!isCreate" maxlength="32" placeholder="如 TRANSPORT" />
          <div class="muted small">编码创建后不可修改，报销明细按编码引用</div>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item v-if="!isCreate" label="状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="form.sortOrder" :min="0" :max="99999" :step="10" controls-position="right" />
          <span class="muted small ml8">数值小的排在前面</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="form.visible = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.btn-wrap {
  display: inline-flex;
  margin-left: 12px;
}
.ml8 {
  margin-left: 8px;
}
</style>
