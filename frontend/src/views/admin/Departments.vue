<script setup lang="ts">
import '@/components/admin/admin.css'
// 部门管理：新建、编辑（编码创建后不可修改）、删除（仍被引用时后端拒绝）、设置负责人（同步授予 / 回收“部门负责人”角色）
import { computed, onMounted, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { ApiError } from '@/lib/http'
import type { AdminDept } from '@/lib/types'
import { fmtDateTime } from '@/lib/datetime'
import { showError } from '@/lib/errors'
import { promptReason } from '@/lib/prompt'
import { useAction } from '@/composables/useAction'
import { useDictStore } from '@/stores/dict'
import ListEmpty from '@/components/ListEmpty.vue'
import UserPicker, { type UserPreset } from '@/components/UserPicker.vue'
import ServerErrorAlert from '@/components/admin/ServerErrorAlert.vue'

const dict = useDictStore()
const { loading: acting, run } = useAction()

const list = ref<AdminDept[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    list.value = await api.admin.departments.list()
  } catch (e) {
    showError(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

/** 部门数据变化后：刷新列表并让字典下次重新加载 */
async function changed() {
  dict.invalidate('departments')
  await load()
}

function captureFormError(target: { error: ApiError | null }) {
  return (e: ApiError) => {
    if (e.code === 40000 || e.code === 42201) {
      target.error = e
      return true
    }
    return false
  }
}

// ---------- 新建 / 编辑 ----------

const editFormRef = ref<FormInstance>()
const edit = reactive({
  visible: false,
  id: null as number | null,
  code: '',
  name: '',
  sortOrder: 0,
  reason: '',
  error: null as ApiError | null,
})
const isCreate = computed(() => edit.id === null)
const editRules: FormRules = {
  code: [
    { required: true, whitespace: true, message: '请填写部门编码', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9_-]{1,32}$/, message: '1-32 位字母、数字、下划线或连字符', trigger: 'blur' },
  ],
  name: [
    { required: true, whitespace: true, message: '请填写部门名称', trigger: 'blur' },
    { max: 50, message: '不能超过 50 字', trigger: 'blur' },
  ],
  reason: [{ max: 500, message: '不能超过 500 字', trigger: 'blur' }],
}

function openCreate() {
  const maxSort = list.value.reduce((m, d) => Math.max(m, d.sortOrder), 0)
  Object.assign(edit, { visible: true, id: null, code: '', name: '', sortOrder: maxSort + 10, reason: '', error: null })
  editFormRef.value?.clearValidate()
}

function openEdit(d: AdminDept) {
  Object.assign(edit, {
    visible: true,
    id: d.id,
    code: d.code,
    name: d.name,
    sortOrder: d.sortOrder,
    reason: '',
    error: null,
  })
  editFormRef.value?.clearValidate()
}

async function submitEdit() {
  if (!(await editFormRef.value?.validate().catch(() => false))) return
  edit.error = null
  const id = edit.id
  const name = edit.name.trim()
  const sortOrder = edit.sortOrder
  const reason = edit.reason.trim() || null
  const ok = await run({
    action: async () => {
      if (id === null) await api.admin.departments.create({ code: edit.code.trim(), name, sortOrder, reason })
      else await api.admin.departments.update(id, { name, sortOrder, reason })
      return true
    },
    success: id === null ? '部门已创建' : '部门已更新',
    onError: captureFormError(edit),
  })
  if (ok) {
    edit.visible = false
    await changed()
  }
}

// ---------- 删除 ----------

async function remove(d: AdminDept) {
  const users = d.userCount > 0 ? `该部门目前有 ${d.userCount} 名用户，` : ''
  const reason = await promptReason({
    title: `删除部门：${d.name}`,
    message: `${users}仍有用户、申请或模板引用该部门时，系统会拒绝删除。确认删除请填写原因（将写入审计日志）。`,
    confirmText: '删除',
    danger: true,
  })
  if (reason === null) return
  const ok = await run({
    action: async () => {
      await api.admin.departments.remove(d.id, { reason })
      return true
    },
    success: '部门已删除',
  })
  if (ok) await changed()
}

// ---------- 设置负责人 ----------

const headFormRef = ref<FormInstance>()
const head = reactive({
  visible: false,
  dept: null as AdminDept | null,
  userId: null as number | null,
  reason: '',
  error: null as ApiError | null,
})
const headRules: FormRules = {
  reason: [
    { required: true, whitespace: true, message: '请填写原因', trigger: 'blur' },
    { max: 500, message: '不能超过 500 字', trigger: 'blur' },
  ],
}
const headPreset = computed<UserPreset[]>(() => {
  const d = head.dept
  return d && d.headUserId != null ? [{ id: d.headUserId, realName: d.headName ?? `#${d.headUserId}` }] : []
})
const headUnchanged = computed(() => (head.dept?.headUserId ?? null) === head.userId)

function onHeadPick(v: number | number[] | null) {
  head.userId = typeof v === 'number' ? v : null
}

function openHead(d: AdminDept) {
  Object.assign(head, { visible: true, dept: d, userId: d.headUserId, reason: '', error: null })
  headFormRef.value?.clearValidate()
}

async function submitHead() {
  const d = head.dept
  if (!d || headUnchanged.value || !(await headFormRef.value?.validate().catch(() => false))) return
  head.error = null
  const userId = head.userId
  const ok = await run({
    action: async () => {
      await api.admin.departments.setHead(d.id, { userId, reason: head.reason.trim() })
      return true
    },
    success: userId === null ? '已清除部门负责人' : '部门负责人已设置',
    onError: captureFormError(head),
  })
  if (ok) {
    head.visible = false
    await changed()
  }
}
</script>

<template>
  <div class="page admin-page">
    <header class="sheet-head">
      <div>
        <h2 class="sheet-title">部门管理</h2>
        <p class="sheet-sub">部门编码创建后不可修改；设置负责人会同步授予 / 回收“部门负责人”角色。</p>
      </div>
      <div class="head-actions">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建部门</el-button>
      </div>
    </header>

    <el-table v-loading="loading" :data="list" row-key="id" class="eas-row-table" style="width: 100%">
      <el-table-column prop="code" label="编码" min-width="110" />
      <el-table-column prop="name" label="名称" min-width="130" />
      <el-table-column label="负责人" min-width="110">
        <template #default="{ row }">
          <span v-if="row.headName">{{ row.headName }}</span>
          <span v-else class="muted">未设置</span>
        </template>
      </el-table-column>
      <el-table-column label="用户数" width="90" align="right">
        <template #default="{ row }"><span class="eas-tnum">{{ row.userCount }}</span></template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" align="center" />
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default="{ row }">
          <span class="row-actions">
            <el-button link type="primary" :disabled="acting" @click="openEdit(row as AdminDept)">编辑</el-button>
            <el-button link type="primary" :disabled="acting" @click="openHead(row as AdminDept)">设置负责人</el-button>
            <el-button link type="danger" :disabled="acting" @click="remove(row as AdminDept)">删除</el-button>
          </span>
        </template>
      </el-table-column>
      <template #empty>
        <ListEmpty description="暂无部门" />
      </template>
    </el-table>

    <!-- 新建 / 编辑 -->
    <el-dialog
      v-model="edit.visible"
      :title="isCreate ? '新建部门' : '编辑部门'"
      width="min(480px, 94vw)"
      :close-on-click-modal="false"
    >
      <ServerErrorAlert :error="edit.error" />
      <el-form ref="editFormRef" :model="edit" :rules="editRules" label-position="top" @submit.prevent>
        <el-form-item label="部门编码" prop="code">
          <el-input v-model="edit.code" :disabled="!isCreate" maxlength="32" placeholder="如 FIN、RD-01" />
          <div class="muted small">编码创建后不可修改</div>
        </el-form-item>
        <el-form-item label="部门名称" prop="name">
          <el-input v-model="edit.name" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="排序" prop="sortOrder">
          <el-input-number v-model="edit.sortOrder" :min="0" :max="99999" :step="10" controls-position="right" />
          <span class="muted small ml8">数值小的排在前面</span>
        </el-form-item>
        <el-form-item label="原因（选填）" prop="reason">
          <el-input v-model="edit.reason" type="textarea" :rows="2" maxlength="500" placeholder="将写入审计日志" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="edit.visible = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 设置负责人 -->
    <el-dialog v-model="head.visible" title="设置部门负责人" width="min(500px, 94vw)" :close-on-click-modal="false">
      <ServerErrorAlert :error="head.error" />
      <el-alert type="info" :closable="false" show-icon class="dialog-tip">
        <template #title>设置负责人会同步授予/回收‘部门负责人’角色；清空选择即清除负责人。</template>
      </el-alert>
      <el-form ref="headFormRef" :model="head" :rules="headRules" label-position="top" @submit.prevent>
        <el-form-item label="部门">
          <span>{{ head.dept?.name }}</span>
          <span class="muted small ml8">当前负责人：{{ head.dept?.headName ?? '未设置' }}</span>
        </el-form-item>
        <el-form-item label="负责人">
          <UserPicker
            :model-value="head.userId"
            :preset="headPreset"
            placeholder="输入姓名或用户名搜索；留空表示清除负责人"
            @update:model-value="onHeadPick"
          />
        </el-form-item>
        <el-form-item label="原因" prop="reason">
          <el-input
            v-model="head.reason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="将写入审计日志"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="head.visible = false">取消</el-button>
        <el-button
          :type="head.userId === null && !headUnchanged ? 'danger' : 'primary'"
          :plain="head.userId === null && !headUnchanged"
          :loading="acting"
          :disabled="headUnchanged"
          @click="submitHead"
        >
          {{ head.userId === null && !headUnchanged ? '清除负责人' : '确定' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ml8 {
  margin-left: 8px;
}
.dialog-tip {
  margin-bottom: 16px;
}
</style>
