<script setup lang="ts">
import '@/components/admin/admin.css'
// 数据范围授权：权限点 + 范围（指定部门 / 全部部门）+ 有效期 + 原因；回收只记录回收时间，不删除
import { computed, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { ApiError } from '@/lib/http'
import type { GrantPermission, GrantView, ScopeType, UserOption } from '@/lib/types'
import { GRANT_PERMISSION_LABEL, SCOPE_TYPE_LABEL, toOptions } from '@/lib/labels'
import { addDays, fmtDate, fmtDateTime, shanghaiWallToIso, todayShanghai } from '@/lib/datetime'
import { showError } from '@/lib/errors'
import { promptReason } from '@/lib/prompt'
import { useListQuery } from '@/composables/useListQuery'
import { useAction } from '@/composables/useAction'
import { useDictStore } from '@/stores/dict'
import ListEmpty from '@/components/ListEmpty.vue'
import UserPicker, { type UserPreset } from '@/components/UserPicker.vue'
import ServerErrorAlert from '@/components/admin/ServerErrorAlert.vue'

type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger'

const dict = useDictStore()
const { loading: acting, run } = useAction()

const { filters, records, total, page, size, loading, hasFilters, search, reset, onPageChange, onSizeChange, load } =
  useListQuery({
    defaults: { userId: null as number | null, activeOnly: false },
    numberKeys: ['userId'],
    fetch: (q) => api.admin.grants.list(q),
  })

const permissionOptions = toOptions(GRANT_PERMISSION_LABEL)
const scopeOptions = toOptions(SCOPE_TYPE_LABEL)

const PERM_MEANING: Record<GrantPermission, string> = {
  APP_READ: '全部部门：企业范围查询与统计；指定部门：查询该部门的申请',
  FIN_STATS_READ: '财务统计',
  BIZ_CONTENT_READ: '管理员查看业务正文（每次访问留痕）',
}

// ---------- 筛选：用户 ----------

const pickedUsers = ref<UserPreset[]>([])
const filterPreset = computed<UserPreset[]>(() => {
  const id = filters.userId
  if (id == null) return []
  const picked = pickedUsers.value.find((u) => u.id === id)
  if (picked) return [picked]
  const g = records.value.find((r) => r.userId === id)
  return g ? [{ id, realName: g.userName }] : []
})

function toPresets(users: UserOption[]): UserPreset[] {
  return users.map((u) => ({ id: u.id, realName: u.realName, username: u.username, deptName: u.deptName }))
}

function onFilterUser(v: number | number[] | null) {
  filters.userId = typeof v === 'number' ? v : null
  void search()
}

// ---------- 状态 ----------

type GrantState = 'REVOKED' | 'ACTIVE' | 'NOT_STARTED' | 'EXPIRED'

const GRANT_STATE: Record<GrantState, { label: string; type: TagType }> = {
  REVOKED: { label: '已回收', type: 'info' },
  ACTIVE: { label: '有效', type: 'success' },
  NOT_STARTED: { label: '未生效', type: 'primary' },
  EXPIRED: { label: '已过期', type: 'warning' },
}

function grantState(g: GrantView): GrantState {
  if (g.revokedAt) return 'REVOKED'
  if (g.active) return 'ACTIVE'
  if (fmtDate(g.validFrom) > todayShanghai()) return 'NOT_STARTED'
  return 'EXPIRED'
}

/** 已回收、已过期的授权无需再回收 */
function canRevoke(g: GrantView): boolean {
  const s = grantState(g)
  return s === 'ACTIVE' || s === 'NOT_STARTED'
}

/** validUntil 存为次日 00:00（含所选当天，见 toEndIso）；列表展示最后有效日，与所选失效日期一致 */
function fmtGrantUntil(iso: string): string {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? fmtDate(iso) : fmtDate(new Date(t - 1000).toISOString())
}

async function revoke(g: GrantView) {
  const reason = await promptReason({
    title: `回收授权：${g.userName}（${GRANT_PERMISSION_LABEL[g.permissionCode] ?? g.permissionCode}）`,
    message: '回收后立即生效（记录回收时间与回收人，不删除授权记录）。请填写原因（将写入审计日志）。',
    confirmText: '回收',
    danger: true,
  })
  if (reason === null) return
  const ok = await run({
    action: async () => {
      await api.admin.grants.revoke(g.id, { reason })
      return true
    },
    success: '授权已回收',
  })
  if (ok) await load()
}

// ---------- 新建授权 ----------

const formRef = ref<FormInstance>()
const form = reactive({
  visible: false,
  userId: null as number | null,
  permissionCode: null as GrantPermission | null,
  scopeType: 'ALL' as ScopeType,
  deptId: null as number | null,
  validFrom: null as string | null,
  validUntil: null as string | null,
  reason: '',
  error: null as ApiError | null,
})
const formUserPreset = ref<UserPreset[]>([])

const rules: FormRules = {
  userId: [{ required: true, message: '请选择被授权用户', trigger: 'change' }],
  permissionCode: [{ required: true, message: '请选择权限点', trigger: 'change' }],
  scopeType: [{ required: true, message: '请选择范围', trigger: 'change' }],
  deptId: [
    {
      validator: (_r, v: number | null, cb) =>
        form.scopeType === 'DEPT' && v == null ? cb(new Error('请选择部门')) : cb(),
      trigger: 'change',
    },
  ],
  validUntil: [
    {
      validator: (_r, v: string | null, cb) => {
        if (!v) return cb()
        if (v < todayShanghai()) return cb(new Error('失效日期不能早于今天'))
        if (form.validFrom && v < form.validFrom) return cb(new Error('失效日期不能早于生效日期'))
        cb()
      },
      trigger: 'change',
    },
  ],
  reason: [
    { required: true, whitespace: true, message: '请填写授权原因', trigger: 'blur' },
    { max: 500, message: '不能超过 500 字', trigger: 'blur' },
  ],
}

const meaning = computed(() => {
  const p = form.permissionCode
  if (!p) return ''
  if (p === 'APP_READ') return form.scopeType === 'ALL' ? '企业范围查询与统计' : '查询指定部门的申请'
  return PERM_MEANING[p]
})

function pad(n: number) {
  return String(n).padStart(2, '0')
}
/** 日历格子的日期（按格子本身的年月日，与浏览器时区无关） */
function cellDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const disableBeforeToday = (d: Date) => cellDate(d) < todayShanghai()
const disableUntil = (d: Date) => {
  const day = cellDate(d)
  return day < todayShanghai() || (!!form.validFrom && day < form.validFrom)
}

function onFormUser(v: number | number[] | null) {
  form.userId = typeof v === 'number' ? v : null
}

function revalidateUntil() {
  if (form.validUntil) void formRef.value?.validateField('validUntil').catch(() => undefined)
}

function onScopeChange() {
  if (form.scopeType === 'ALL') form.deptId = null
  formRef.value?.clearValidate('deptId')
}

async function openCreate() {
  Object.assign(form, {
    visible: true,
    userId: filters.userId,
    permissionCode: null,
    scopeType: 'ALL',
    deptId: null,
    validFrom: null,
    validUntil: null,
    reason: '',
    error: null,
  })
  formUserPreset.value = filterPreset.value
  formRef.value?.clearValidate()
  try {
    await dict.loadDepartments()
  } catch (e) {
    showError(e)
  }
}

// 授权日期折算成带 +08:00 偏移的 ISO 时间（服务端是 OffsetDateTime，收不了纯日期）：
// 生效日取当天 00:00；失效日含当天，存次日 00:00——与后端 valid_until > now 的严格比较一致
// （对应服务端 Times.endExclusive 的语义）。
function toStartIso(date: string | null): string | null {
  return date ? shanghaiWallToIso(`${date}T00:00:00`) : null
}
function toEndIso(date: string | null): string | null {
  return date ? shanghaiWallToIso(`${addDays(date, 1)}T00:00:00`) : null
}

async function submit() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  form.error = null
  const body = {
    userId: form.userId as number,
    permissionCode: form.permissionCode as GrantPermission,
    scopeType: form.scopeType,
    deptId: form.scopeType === 'DEPT' ? form.deptId : null,
    validFrom: toStartIso(form.validFrom),
    validUntil: toEndIso(form.validUntil),
    reason: form.reason.trim(),
  }
  const ok = await run({
    action: async () => {
      await api.admin.grants.create(body)
      return true
    },
    success: '授权已创建',
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
</script>

<template>
  <div class="page admin-page">
    <header class="sheet-head">
      <div>
        <h2 class="sheet-title">授权管理</h2>
        <p class="sheet-sub">按权限点和范围授权，可设有效期；回收只记录回收时间，授权记录保留。</p>
      </div>
    </header>

    <p class="page-note">
      APP_READ 选“全部部门”可查询统计全企业申请，选“指定部门”只查询该部门；FIN_STATS_READ
      为财务统计；BIZ_CONTENT_READ 为查看业务正文，每次访问留痕。
    </p>

    <div class="toolbar list-filters">
      <div class="user-filter">
        <UserPicker
          :model-value="filters.userId"
          :preset="filterPreset"
          placeholder="按被授权用户筛选"
          @update:model-value="onFilterUser"
          @change="(u: UserOption[]) => (pickedUsers = toPresets(u))"
        />
      </div>
      <el-switch v-model="filters.activeOnly" active-text="仅显示有效授权" @change="search" />
      <el-button link type="primary" @click="reset">重置</el-button>
      <div class="list-actions">
        <el-button type="primary" :icon="Plus" @click="openCreate">新建授权</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="records" row-key="id" class="grants-table eas-row-table">
      <el-table-column prop="userName" label="用户" min-width="90" />
      <el-table-column label="权限点" min-width="150">
        <template #default="{ row }">
          {{ GRANT_PERMISSION_LABEL[row.permissionCode as GrantPermission] ?? row.permissionCode }}
        </template>
      </el-table-column>
      <el-table-column label="范围" min-width="130">
        <template #default="{ row }">
          {{ (SCOPE_TYPE_LABEL[row.scopeType as ScopeType] ?? row.scopeType) + (row.scopeType === 'DEPT' ? `：${row.deptName ?? `#${row.deptId}`}` : '') }}
        </template>
      </el-table-column>
      <el-table-column label="有效期" min-width="175">
        <template #default="{ row }">
          {{ fmtDate(row.validFrom) }} ~ {{ row.validUntil ? fmtGrantUntil(row.validUntil) : '长期' }}
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="原因" min-width="140" show-overflow-tooltip />
      <el-table-column prop="grantedByName" label="授权人" min-width="90" />
      <el-table-column label="授权时间" width="150">
        <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="状态" min-width="120">
        <template #default="{ row }">
          <el-tag class="admin-status" :type="GRANT_STATE[grantState(row as GrantView)].type" disable-transitions>
            {{ GRANT_STATE[grantState(row as GrantView)].label }}
          </el-tag>
          <div v-if="row.revokedAt" class="muted small">
            {{ row.revokedByName ?? '—' }} {{ fmtDateTime(row.revokedAt) }}
          </div>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="80">
        <template #default="{ row }">
          <span v-if="canRevoke(row as GrantView)" class="row-actions">
            <el-button link type="danger" :disabled="acting" @click="revoke(row as GrantView)">回收</el-button>
          </span>
          <span v-else class="muted">—</span>
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

    <el-dialog v-model="form.visible" title="新建授权" width="min(560px, 94vw)" :close-on-click-modal="false">
      <ServerErrorAlert :error="form.error" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="被授权用户" prop="userId">
          <UserPicker
            :model-value="form.userId"
            :preset="formUserPreset"
            @update:model-value="onFormUser"
            @change="(u: UserOption[]) => (formUserPreset = toPresets(u))"
          />
        </el-form-item>
        <el-form-item label="权限点" prop="permissionCode">
          <el-select v-model="form.permissionCode" placeholder="选择权限点" style="width: 100%">
            <el-option v-for="o in permissionOptions" :key="o.value" :value="o.value" :label="o.label">
              <span>{{ o.label }}</span>
              <span class="muted small ml8">{{ PERM_MEANING[o.value] }}</span>
            </el-option>
          </el-select>
          <div v-if="meaning" class="muted small">含义：{{ meaning }}</div>
        </el-form-item>
        <el-form-item label="范围" prop="scopeType">
          <el-radio-group v-model="form.scopeType" @change="onScopeChange">
            <el-radio v-for="o in scopeOptions" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.scopeType === 'DEPT'" label="部门" prop="deptId">
          <el-select v-model="form.deptId" placeholder="选择部门" filterable style="width: 100%">
            <el-option v-for="d in dict.departments" :key="d.id" :value="d.id" :label="d.name" />
          </el-select>
        </el-form-item>
        <div class="date-row">
          <el-form-item label="生效日期（选填）" prop="validFrom" class="flex-1">
            <el-date-picker
              v-model="form.validFrom"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="留空表示立即生效"
              :disabled-date="disableBeforeToday"
              @change="revalidateUntil"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="失效日期（选填）" prop="validUntil" class="flex-1">
            <el-date-picker
              v-model="form.validUntil"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="留空表示长期有效"
              :disabled-date="disableUntil"
              style="width: 100%"
            />
          </el-form-item>
        </div>
        <el-form-item label="授权原因" prop="reason">
          <el-input
            v-model="form.reason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="如：季度财务审计需要，将写入审计日志"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="form.visible = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submit">创建授权</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.user-filter {
  width: 240px;
}
.grants-table {
  width: 100%;
}
.date-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.date-row .flex-1 {
  min-width: 200px;
}
.ml8 {
  margin-left: 8px;
}
@media (max-width: 768px) {
  .user-filter {
    width: 100%;
  }
}
</style>
