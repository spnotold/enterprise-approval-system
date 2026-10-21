<script setup lang="ts">
import '@/components/admin/admin.css'
// 用户管理：启用 / 停用、解锁、调整部门、角色授予与回收、角色主办人、重置密码。
// 管理端写操作均需填写原因，写入审计日志。
import { computed, h, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox, type FormInstance, type FormItemRule, type FormRules } from 'element-plus'
import { ArrowDown, Search, UserFilled } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { ApiError } from '@/lib/http'
import type { AdminUser, RoleBrief, RoleCode, UserStatus } from '@/lib/types'
import { ROLE_CODES, ROLE_LABEL, USER_STATUS_LABEL, USER_STATUS_TAG, toOptions } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { showError } from '@/lib/errors'
import { promptReason, type ReasonPromptOptions } from '@/lib/prompt'
import { useListQuery } from '@/composables/useListQuery'
import { useAction } from '@/composables/useAction'
import { useDictStore } from '@/stores/dict'
import { useAuthStore } from '@/stores/auth'
import ListEmpty from '@/components/ListEmpty.vue'
import ServerErrorAlert from '@/components/admin/ServerErrorAlert.vue'

type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger'

const router = useRouter()
const dict = useDictStore()
const auth = useAuthStore()
const { loading: acting, run } = useAction()

const { filters, records, total, page, size, loading, hasFilters, search, reset, onPageChange, onSizeChange, load } =
  useListQuery({
    defaults: {
      status: null as UserStatus | null,
      deptId: null as number | null,
      keyword: null as string | null,
    },
    numberKeys: ['deptId'],
    fetch: (q) => api.admin.users.list(q),
  })

const statusOptions = toOptions(USER_STATUS_LABEL)

onMounted(() => {
  dict.loadDepartments().catch((e) => showError(e))
})

const SYS_ADMIN_NOTE = '系统管理员只有管理类权限，不能审批'

const ROLE_HINT: Partial<Record<RoleCode, string>> = {
  DEPT_HEAD: '部门负责人一般在“部门管理 → 设置负责人”中指定，会同步授予本角色并绑定负责的部门。',
  FINANCE_APPROVER: '按角色单人审批的节点由该角色的主办人处理；授予后可在角色标签上设为主办人。',
  ENTERPRISE_HEAD: '按角色单人审批的节点由该角色的主办人处理；授予后可在角色标签上设为主办人。',
  SYS_ADMIN: `${SYS_ADMIN_NOTE}，默认也不能查看业务正文（需另行授予 BIZ_CONTENT_READ）。`,
}

function sortedRoles(roles: RoleBrief[]): RoleBrief[] {
  return [...roles].sort((a, b) => ROLE_CODES.indexOf(a.code) - ROLE_CODES.indexOf(b.code))
}

function roleTagType(code: RoleCode): TagType {
  if (code === 'SYS_ADMIN') return 'danger'
  if (code === 'EMPLOYEE') return 'info'
  return 'primary'
}

/** 主办人只对参与审批的角色有意义 */
function canBePrimary(code: RoleCode): boolean {
  return code !== 'EMPLOYEE' && code !== 'SYS_ADMIN'
}

function isLocked(u: AdminUser): boolean {
  return !!u.lockedUntil && Date.parse(u.lockedUntil) > Date.now()
}

function isSelf(u: AdminUser): boolean {
  return auth.me?.id === u.id
}

/** 对话框内显示参数 / 业务规则校验错误，其余错误走统一提示 */
function captureFormError(target: { error: ApiError | null }) {
  return (e: ApiError) => {
    if (e.code === 40000 || e.code === 42201) {
      target.error = e
      return true
    }
    return false
  }
}

/** 弹窗填写原因后执行写操作，成功后刷新列表 */
async function withReason(opts: ReasonPromptOptions, action: (reason: string) => Promise<unknown>, success: string) {
  const reason = await promptReason(opts)
  if (reason === null) return
  const ok = await run({
    action: async () => {
      await action(reason)
      return true
    },
    success,
  })
  if (ok) await load()
}

// ---------- 行操作 ----------

function onCommand(u: AdminUser, cmd: string | number | object) {
  switch (cmd) {
    case 'dept':
      openDept(u)
      break
    case 'unlock':
      void unlock(u)
      break
    case 'reset':
      void resetPassword(u)
      break
    case 'disable':
      void disable(u)
      break
    case 'enable':
      void enable(u)
      break
  }
}

function onRoleCommand(u: AdminUser, r: RoleBrief, cmd: string | number | object) {
  if (cmd === 'primary') void setPrimary(u, r)
  if (cmd === 'revoke') void revokeRole(u, r)
}

function disable(u: AdminUser) {
  const self = isSelf(u) ? '这是您自己的账号，停用后将立即无法登录。' : ''
  return withReason(
    {
      title: `停用账号：${u.realName}`,
      message: `${self}停用后该用户立即无法登录；其名下未处理的待办需在“待办监控”中转办。请填写原因（将写入审计日志）。`,
      confirmText: '停用',
      danger: true,
    },
    (reason) => api.admin.users.disable(u.id, { reason }),
    '账号已停用',
  )
}

function enable(u: AdminUser) {
  return withReason(
    { title: `启用账号：${u.realName}`, confirmText: '启用' },
    (reason) => api.admin.users.enable(u.id, { reason }),
    '账号已启用',
  )
}

function unlock(u: AdminUser) {
  return withReason(
    {
      title: `解除锁定：${u.realName}`,
      message: `该账号因连续登录失败被锁定至 ${fmtDateTime(u.lockedUntil)}。解除后可立即重新登录。请填写原因（将写入审计日志）。`,
      confirmText: '解除锁定',
    },
    (reason) => api.admin.users.unlock(u.id, { reason }),
    '已解除锁定',
  )
}

async function resetPassword(u: AdminUser) {
  const reason = await promptReason({
    title: `重置密码：${u.realName}`,
    message: '将为该用户生成一次性临时密码，原密码随即失效。请填写原因（将写入审计日志）。',
    confirmText: '重置密码',
    danger: true,
  })
  if (reason === null) return
  const r = await run({ action: () => api.admin.users.resetPassword(u.id, { reason }) })
  if (!r) return
  void load()
  await ElMessageBox.alert(
    h('div', [
      h('p', { style: 'margin:0 0 8px' }, `「${u.realName}」（${u.username}）的临时密码：`),
      h(
        'code',
        {
          style:
            'display:block;padding:8px 12px;font-size:16px;letter-spacing:1px;user-select:all;' +
            'background:var(--el-fill-color-light);border-radius:var(--eas-radius-control);word-break:break-all',
        },
        r.tempPassword,
      ),
      h(
        'p',
        { style: 'margin:8px 0 0;color:var(--eas-warning-text);font-size:var(--eas-fs-sm)' },
        '请通过安全渠道告知用户，仅显示一次。',
      ),
    ]),
    '密码已重置',
    {
      type: 'success',
      confirmButtonText: '我已记录',
      closeOnPressEscape: false,
      closeOnClickModal: false,
    },
  ).catch(() => undefined)
}

function revokeRole(u: AdminUser, r: RoleBrief) {
  const label = ROLE_LABEL[r.code] ?? r.name
  const extra: string[] = []
  if (r.code === 'DEPT_HEAD') extra.push('部门负责人角色与部门的负责人设置联动，建议在“部门管理”中更换负责人。')
  if (r.code === 'SYS_ADMIN' && isSelf(u)) extra.push('这是您自己的管理员角色，回收后将失去管理权限。')
  if (r.primaryHandler) extra.push('该用户是此角色的主办人，回收后该角色将没有主办人。')
  return withReason(
    {
      title: `回收角色：${u.realName}（${label}）`,
      message: `${extra.join('')}请填写原因（将写入审计日志）。`,
      confirmText: '回收',
      danger: true,
    },
    (reason) => api.admin.users.revokeRole(u.id, r.code, { reason }),
    `已回收“${label}”角色`,
  )
}

function setPrimary(u: AdminUser, r: RoleBrief) {
  const label = ROLE_LABEL[r.code] ?? r.name
  return withReason(
    {
      title: `设为主办人：${u.realName}（${label}）`,
      message: '每个角色至多一名主办人，原主办人自动取消；按角色单人审批的节点由主办人处理。请填写原因（将写入审计日志）。',
      confirmText: '设为主办人',
    },
    (reason) => api.admin.users.setPrimary(u.id, r.code, { reason }),
    `已设为“${label}”主办人`,
  )
}

// ---------- 调整部门 ----------

const reasonRules: FormItemRule[] = [
  { required: true, whitespace: true, message: '请填写原因', trigger: 'blur' },
  { max: 500, message: '不能超过 500 字', trigger: 'blur' },
]

const deptFormRef = ref<FormInstance>()
const deptDlg = reactive({
  visible: false,
  user: null as AdminUser | null,
  deptId: null as number | null,
  reason: '',
  error: null as ApiError | null,
})
const deptRules: FormRules = {
  deptId: [
    { required: true, message: '请选择部门', trigger: 'change' },
    {
      validator: (_r, v: number | null, cb) =>
        v !== null && v === deptDlg.user?.deptId ? cb(new Error('与当前部门相同')) : cb(),
      trigger: 'change',
    },
  ],
  reason: reasonRules,
}

function openDept(u: AdminUser) {
  Object.assign(deptDlg, { visible: true, user: u, deptId: u.deptId, reason: '', error: null })
  deptFormRef.value?.clearValidate()
}

async function submitDept() {
  const u = deptDlg.user
  if (!u || !(await deptFormRef.value?.validate().catch(() => false))) return
  deptDlg.error = null
  const deptId = deptDlg.deptId as number
  const ok = await run({
    action: async () => {
      await api.admin.users.changeDept(u.id, { deptId, reason: deptDlg.reason.trim() })
      return true
    },
    success: '部门已调整',
    onError: captureFormError(deptDlg),
  })
  if (ok) {
    deptDlg.visible = false
    await load()
  }
}

// ---------- 授予角色 ----------

const grantFormRef = ref<FormInstance>()
const grantDlg = reactive({
  visible: false,
  user: null as AdminUser | null,
  roleCode: null as RoleCode | null,
  reason: '',
  error: null as ApiError | null,
})
const grantRules: FormRules = {
  roleCode: [{ required: true, message: '请选择角色', trigger: 'change' }],
  reason: reasonRules,
}
const grantableRoles = computed(() => {
  const u = grantDlg.user
  if (!u) return []
  return ROLE_CODES.filter((c) => !u.roles.some((r) => r.code === c))
})

function openGrant(u: AdminUser) {
  Object.assign(grantDlg, { visible: true, user: u, roleCode: null, reason: '', error: null })
  grantFormRef.value?.clearValidate()
}

async function submitGrant() {
  const u = grantDlg.user
  if (!u || !(await grantFormRef.value?.validate().catch(() => false))) return
  grantDlg.error = null
  const roleCode = grantDlg.roleCode as RoleCode
  const ok = await run({
    action: async () => {
      await api.admin.users.grantRole(u.id, { roleCode, reason: grantDlg.reason.trim() })
      return true
    },
    success: `已授予“${ROLE_LABEL[roleCode]}”角色`,
    onError: captureFormError(grantDlg),
  })
  if (ok) {
    grantDlg.visible = false
    await load()
  }
}
</script>

<template>
  <div class="page admin-page">
    <header class="sheet-head">
      <div>
        <h2 class="sheet-title">用户管理</h2>
        <p class="sheet-sub">系统管理员只有管理类权限，不能审批；写操作需填写原因并写入审计日志。</p>
      </div>
      <div class="head-actions">
        <el-button :icon="UserFilled" @click="router.push('/admin/registrations')">注册审核</el-button>
      </div>
    </header>

    <div class="toolbar list-filters">
      <el-input
        v-model="filters.keyword"
        placeholder="用户名 / 姓名 / 邮箱"
        clearable
        :prefix-icon="Search"
        @keyup.enter="search"
        @clear="search"
      />
      <el-select v-model="filters.status" placeholder="账号状态" clearable @change="search">
        <el-option v-for="o in statusOptions" :key="o.value" :value="o.value" :label="o.label" />
      </el-select>
      <el-select v-model="filters.deptId" placeholder="所属部门" clearable filterable @change="search">
        <el-option v-for="d in dict.departments" :key="d.id" :value="d.id" :label="d.name" />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button link type="primary" @click="reset">重置</el-button>
    </div>

    <p v-if="filters.status === 'PENDING'" class="page-note">
      待审核用户请在<el-link type="primary" @click="router.push('/admin/registrations')">注册审核</el-link>中通过或拒绝。
    </p>

    <el-table v-loading="loading" :data="records" row-key="id" class="users-table eas-row-table">
        <el-table-column label="用户名" width="84">
          <template #default="{ row }"><span class="cell-ellipsis" :title="row.username">{{ row.username }}</span></template>
        </el-table-column>
        <el-table-column label="姓名" width="92">
          <template #default="{ row }"><span class="cell-nowrap" :title="row.realName">{{ row.realName }}</span></template>
        </el-table-column>
        <el-table-column label="邮箱" width="110">
          <template #default="{ row }"><span class="cell-ellipsis" :title="row.email">{{ row.email }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="96">
          <template #default="{ row }">
            <el-tag class="admin-status" :type="USER_STATUS_TAG[row.status as UserStatus]" disable-transitions>
              {{ USER_STATUS_LABEL[row.status as UserStatus] ?? row.status }}
            </el-tag>
            <el-tag v-if="isLocked(row as AdminUser)" type="danger" effect="plain" class="ml4" disable-transitions>已锁定</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="部门" width="78">
          <template #default="{ row }"><span class="cell-ellipsis" :title="row.deptName ?? ''">{{ row.deptName ?? '—' }}</span></template>
        </el-table-column>
        <el-table-column label="角色" width="96">
          <template #default="{ row }">
            <div class="role-tags">
              <el-dropdown
                v-for="r in sortedRoles(row.roles)"
                :key="r.code"
                trigger="click"
                :disabled="row.status === 'REJECTED' || row.status === 'PENDING'"
                @command="(c: string | number | object) => onRoleCommand(row as AdminUser, r, c)"
              >
                <el-tag :type="roleTagType(r.code)" class="role-tag" disable-transitions>
                  {{ ROLE_LABEL[r.code] ?? r.name }}
                  <span v-if="r.primaryHandler" class="primary-badge">主办</span>
                  <el-icon class="role-caret"><ArrowDown /></el-icon>
                </el-tag>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="r.code === 'SYS_ADMIN'" disabled>{{ SYS_ADMIN_NOTE }}</el-dropdown-item>
                    <el-dropdown-item v-if="canBePrimary(r.code)" command="primary" :disabled="r.primaryHandler">
                      {{ r.primaryHandler ? '已是主办人' : '设为主办人' }}
                    </el-dropdown-item>
                    <el-dropdown-item command="revoke" :divided="r.code !== 'EMPLOYEE'">
                      <span class="text-danger">回收该角色</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <span v-if="row.roles.length === 0" class="muted">—</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最近登录" width="136" class="mono">
          <template #default="{ row }"><span class="cell-nowrap">{{ fmtDateTime(row.lastLoginAt) }}</span></template>
        </el-table-column>
        <el-table-column label="锁定至" width="136">
          <template #default="{ row }">
            <span v-if="!row.lockedUntil" class="muted">—</span>
            <span v-else class="cell-nowrap" :class="isLocked(row as AdminUser) ? 'text-danger' : 'muted'">{{ fmtDateTime(row.lockedUntil) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="112">
          <template #default="{ row }">
            <span v-if="row.status === 'PENDING'" class="row-actions">
              <el-button link type="primary" @click="router.push('/admin/registrations')">去审核</el-button>
            </span>
            <span v-else-if="row.status === 'REJECTED'" class="muted small">注册已拒绝</span>
            <span v-else class="row-actions">
              <el-button link type="primary" :disabled="acting" @click="openGrant(row as AdminUser)">授予角色</el-button>
              <el-dropdown trigger="click" @command="(c: string | number | object) => onCommand(row as AdminUser, c)">
                <el-button link type="primary" :disabled="acting">
                  更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="dept">调整部门</el-dropdown-item>
                    <el-dropdown-item v-if="isLocked(row as AdminUser)" command="unlock">解除锁定</el-dropdown-item>
                    <el-dropdown-item command="reset">重置密码</el-dropdown-item>
                    <el-dropdown-item v-if="row.status === 'ACTIVE'" command="disable" divided>
                      <span class="text-danger">停用账号</span>
                    </el-dropdown-item>
                    <el-dropdown-item v-else command="enable" divided>启用账号</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </span>
          </template>
        </el-table-column>
        <template #empty>
          <ListEmpty :filtered="hasFilters" @reset="reset" />
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

    <!-- 调整部门 -->
    <el-dialog v-model="deptDlg.visible" title="调整部门" width="min(480px, 94vw)" :close-on-click-modal="false">
      <ServerErrorAlert :error="deptDlg.error" />
      <el-form ref="deptFormRef" :model="deptDlg" :rules="deptRules" label-position="top" @submit.prevent>
        <el-form-item label="用户">
          <span>{{ deptDlg.user?.realName }}（{{ deptDlg.user?.username }}）</span>
          <span class="muted small ml8">当前部门：{{ deptDlg.user?.deptName ?? '无' }}</span>
        </el-form-item>
        <el-form-item label="新部门" prop="deptId">
          <el-select v-model="deptDlg.deptId" placeholder="选择部门" filterable style="width: 100%">
            <el-option v-for="d in dict.departments" :key="d.id" :value="d.id" :label="d.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="原因" prop="reason">
          <el-input
            v-model="deptDlg.reason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="将写入审计日志"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="deptDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submitDept">确定</el-button>
      </template>
    </el-dialog>

    <!-- 授予角色 -->
    <el-dialog v-model="grantDlg.visible" title="授予角色" width="min(520px, 94vw)" :close-on-click-modal="false">
      <ServerErrorAlert :error="grantDlg.error" />
      <el-form ref="grantFormRef" :model="grantDlg" :rules="grantRules" label-position="top" @submit.prevent>
        <el-form-item label="用户">
          <span>{{ grantDlg.user?.realName }}（{{ grantDlg.user?.username }}）</span>
          <span class="muted small ml8">
            已有：{{ (grantDlg.user?.roles ?? []).map((r) => ROLE_LABEL[r.code] ?? r.name).join('、') || '无' }}
          </span>
        </el-form-item>
        <el-form-item label="角色" prop="roleCode">
          <el-select
            v-model="grantDlg.roleCode"
            placeholder="选择要授予的角色"
            style="width: 100%"
            :no-data-text="'该用户已拥有全部角色'"
          >
            <el-option v-for="c in grantableRoles" :key="c" :value="c" :label="ROLE_LABEL[c]">
              <span>{{ ROLE_LABEL[c] }}</span>
              <span class="muted small ml8">{{ c }}</span>
              <span v-if="c === 'SYS_ADMIN'" class="text-warning small ml8">{{ SYS_ADMIN_NOTE }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-alert
          v-if="grantDlg.roleCode && ROLE_HINT[grantDlg.roleCode]"
          :type="grantDlg.roleCode === 'SYS_ADMIN' ? 'warning' : 'info'"
          :closable="false"
          show-icon
          class="dialog-tip"
        >
          <template #title>{{ ROLE_HINT[grantDlg.roleCode] }}</template>
        </el-alert>
        <el-form-item label="原因" prop="reason">
          <el-input
            v-model="grantDlg.reason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="将写入审计日志"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="grantDlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="acting" :disabled="grantableRoles.length === 0" @click="submitGrant">
          授予
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.users-table {
  width: 100%;
}
.users-table :deep(.cell) {
  padding-right: 6px;
  padding-left: 6px;
}
.cell-ellipsis {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-nowrap {
  white-space: nowrap;
}
.users-table .row-actions {
  flex-wrap: nowrap;
  white-space: nowrap;
}
.role-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.role-tag {
  cursor: pointer;
  gap: 2px;
  height: 22px;
  padding: 0 6px;
  font-size: var(--eas-fs-xs);
}
.primary-badge {
  margin-left: 2px;
  padding: 0 4px;
  border-radius: var(--eas-radius-tag);
  font-size: var(--eas-fs-xs);
  line-height: 16px;
  color: var(--eas-warning-text);
  background: var(--eas-warning-tint);
}
.role-caret {
  margin-left: 2px;
  font-size: 10px;
}
.ml4 {
  margin-left: 4px;
}
.dialog-tip {
  margin-bottom: 16px;
}
</style>
