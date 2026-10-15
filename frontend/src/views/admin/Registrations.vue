<script setup lang="ts">
// 注册审核：待审核（PENDING）用户。通过时确认所属部门并自动授予“员工”角色；拒绝需填写原因（终态）
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { Search, User } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { ApiError } from '@/lib/http'
import type { AdminUser } from '@/lib/types'
import { fmtDateTime } from '@/lib/datetime'
import { showError } from '@/lib/errors'
import { promptReason } from '@/lib/prompt'
import { useListQuery } from '@/composables/useListQuery'
import { useAction } from '@/composables/useAction'
import { useDictStore } from '@/stores/dict'
import ListEmpty from '@/components/ListEmpty.vue'
import ServerErrorAlert from '@/components/admin/ServerErrorAlert.vue'

const router = useRouter()
const dict = useDictStore()
const { loading: acting, run } = useAction()

const { filters, records, total, page, size, loading, hasFilters, search, reset, onPageChange, onSizeChange, load } =
  useListQuery({
    defaults: { keyword: null as string | null },
    fetch: (q) => api.admin.users.list({ ...q, status: 'PENDING' }),
  })

onMounted(() => {
  dict.loadDepartments().catch((e) => showError(e))
})

// ---------- 通过 ----------

const formRef = ref<FormInstance>()
const dlg = reactive({
  visible: false,
  user: null as AdminUser | null,
  deptId: null as number | null,
  note: '',
  error: null as ApiError | null,
})
const rules: FormRules = {
  deptId: [{ required: true, message: '请选择所属部门', trigger: 'change' }],
  note: [{ max: 500, message: '不能超过 500 字', trigger: 'blur' }],
}

function openApprove(u: AdminUser) {
  // 申请的部门已不存在（被删除）时让管理员重新选择
  const requested = u.requestedDeptId
  const exists = requested != null && (!dict.departmentsLoaded || dict.departments.some((d) => d.id === requested))
  Object.assign(dlg, { visible: true, user: u, deptId: exists ? requested : null, note: '', error: null })
  formRef.value?.clearValidate()
}

async function submitApprove() {
  const u = dlg.user
  if (!u || !(await formRef.value?.validate().catch(() => false))) return
  dlg.error = null
  const deptId = dlg.deptId as number
  const note = dlg.note.trim()
  const ok = await run({
    action: async () => {
      await api.admin.users.approve(u.id, { deptId, reason: note || null })
      return true
    },
    success: `已通过“${u.realName}”的注册`,
    onError: (e) => {
      if (e.code === 40000 || e.code === 42201) {
        dlg.error = e
        return true
      }
      return false
    },
  })
  if (ok) {
    dlg.visible = false
    await load()
  }
}

// ---------- 拒绝 ----------

async function reject(u: AdminUser) {
  const reason = await promptReason({
    title: `拒绝注册：${u.realName}（${u.username}）`,
    message: '拒绝后该注册不可恢复（终态），账号无法登录。请填写拒绝原因（将写入审计日志）。',
    confirmText: '拒绝注册',
    danger: true,
  })
  if (reason === null) return
  const ok = await run({
    action: async () => {
      await api.admin.users.reject(u.id, { reason })
      return true
    },
    success: '已拒绝该注册',
  })
  if (ok) await load()
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <div>
        <h2 class="page-title">注册审核</h2>
        <div class="page-subtitle">新注册用户审核通过后才能登录；通过时确认所属部门，系统自动授予“员工”角色。</div>
      </div>
      <el-button :icon="User" @click="router.push('/admin/users')">用户管理</el-button>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="filters.keyword"
          placeholder="用户名 / 姓名 / 邮箱"
          clearable
          :prefix-icon="Search"
          @keyup.enter="search"
          @clear="search"
        />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        <el-button text @click="load">刷新</el-button>
      </div>

      <el-table v-loading="loading" :data="records" row-key="id" class="reg-table">
        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column prop="realName" label="姓名" min-width="90" />
        <el-table-column prop="email" label="邮箱" min-width="200" show-overflow-tooltip />
        <el-table-column label="申请加入部门" min-width="130">
          <template #default="{ row }">{{ row.requestedDeptName ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="注册时间" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="140">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="acting" @click="openApprove(row as AdminUser)">通过</el-button>
            <el-button link type="danger" :disabled="acting" @click="reject(row as AdminUser)">拒绝</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <ListEmpty :filtered="hasFilters" :description="hasFilters ? undefined : '暂无待审核的注册'" @reset="reset" />
        </template>
      </el-table>

      <el-pagination
        class="pager"
        layout="total, sizes, prev, pager, next"
        :total="total"
        :current-page="page"
        :page-size="size"
        background
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </el-card>

    <el-dialog v-model="dlg.visible" title="通过注册" width="min(500px, 94vw)" :close-on-click-modal="false">
      <ServerErrorAlert :error="dlg.error" />
      <el-descriptions v-if="dlg.user" :column="1" border size="small" class="user-info">
        <el-descriptions-item label="姓名">{{ dlg.user.realName }}</el-descriptions-item>
        <el-descriptions-item label="用户名">{{ dlg.user.username }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ dlg.user.email }}</el-descriptions-item>
        <el-descriptions-item label="申请加入">{{ dlg.user.requestedDeptName ?? '—' }}</el-descriptions-item>
      </el-descriptions>
      <el-form ref="formRef" :model="dlg" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="所属部门" prop="deptId">
          <el-select v-model="dlg.deptId" placeholder="选择部门" filterable style="width: 100%">
            <el-option v-for="d in dict.departments" :key="d.id" :value="d.id" :label="d.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注（选填）" prop="note">
          <el-input
            v-model="dlg.note"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="将写入审计日志"
          />
        </el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" show-icon>
        <template #title>通过后自动授予‘员工’角色，并以邮件 / 站内通知告知用户。其他角色请在用户管理中另行授予。</template>
      </el-alert>
      <template #footer>
        <el-button @click="dlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submitApprove">确认通过</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.reg-table {
  margin-top: 12px;
  width: 100%;
}
.user-info {
  margin-bottom: 16px;
}
</style>
