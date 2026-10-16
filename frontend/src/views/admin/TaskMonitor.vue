<script setup lang="ts">
import '@/components/admin/admin.css'
// 待办监控与转办：只显示单据元数据（管理员默认不能查看业务正文，因此不链接到申请详情）。
// 审批人被停用时由管理员把其名下待办转给新审批人，需填写原因。
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { Search, Warning } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { ApiError } from '@/lib/http'
import type { AppType, MonitorTask, UserStatus } from '@/lib/types'
import { APP_TYPE_LABEL, USER_STATUS_LABEL, USER_STATUS_TAG, toOptions } from '@/lib/labels'
import { fmtDateTime, fmtHours } from '@/lib/datetime'
import { useListQuery } from '@/composables/useListQuery'
import { useAction } from '@/composables/useAction'
import ListEmpty from '@/components/ListEmpty.vue'
import UserPicker from '@/components/UserPicker.vue'
import ServerErrorAlert from '@/components/admin/ServerErrorAlert.vue'

const { loading: acting, run } = useAction()

const { filters, records, total, page, size, loading, hasFilters, search, reset, onPageChange, onSizeChange, load } =
  useListQuery({
    defaults: { keyword: null as string | null, assigneeStatus: null as UserStatus | null },
    fetch: (q) => api.admin.tasks.list(q),
  })

const assigneeStatusOptions = toOptions(USER_STATUS_LABEL).filter((o) => o.value === 'ACTIVE' || o.value === 'DISABLED')

function onlyDisabled() {
  filters.assigneeStatus = filters.assigneeStatus === 'DISABLED' ? null : 'DISABLED'
  void search()
}

// ---------- 转办 ----------

const REASON_MIN = 5
const formRef = ref<FormInstance>()
const dlg = reactive({
  visible: false,
  task: null as MonitorTask | null,
  toUserId: null as number | null,
  reason: '',
  error: null as ApiError | null,
})
const rules: FormRules = {
  toUserId: [{ required: true, message: '请选择新审批人', trigger: 'change' }],
  reason: [
    { required: true, whitespace: true, message: '请填写转办原因', trigger: 'blur' },
    {
      validator: (_r, v: string, cb) => {
        const len = [...(v ?? '').trim()].length
        if (len > 0 && len < REASON_MIN) return cb(new Error(`请至少填写 ${REASON_MIN} 个字`))
        if (len > 500) return cb(new Error('不能超过 500 字'))
        cb()
      },
      trigger: 'blur',
    },
  ],
}

function onPick(v: number | number[] | null) {
  dlg.toUserId = typeof v === 'number' ? v : null
}

function openTransfer(t: MonitorTask) {
  Object.assign(dlg, { visible: true, task: t, toUserId: null, reason: '', error: null })
  formRef.value?.clearValidate()
}

async function submit() {
  const t = dlg.task
  if (!t || !(await formRef.value?.validate().catch(() => false))) return
  dlg.error = null
  const toUserId = dlg.toUserId as number
  const reason = dlg.reason.trim()
  const ok = await run({
    action: async () => {
      await api.admin.tasks.transfer(t.taskId, { toUserId, reason })
      return true
    },
    success: '转办成功',
    onError: (e) => {
      if (e.code === 40000 || e.code === 42201) {
        dlg.error = e
        return true
      }
      return false
    },
    // 待办已被处理（审批、撤回或已转办）：关闭对话框并刷新
    onConflict: async () => {
      dlg.visible = false
      await load()
    },
  })
  if (ok) {
    dlg.visible = false
    await load()
  }
}
</script>

<template>
  <div class="page admin-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">待办监控</h2>
        <div class="page-subtitle">
          全部待处理的审批待办，只显示单据元数据。审批人停用（如离职）后，其名下待办需在此转办给新审批人。
        </div>
      </div>
    </div>

    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="filters.keyword"
          placeholder="申请编号 / 申请人 / 审批人"
          clearable
          :prefix-icon="Search"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="filters.assigneeStatus" placeholder="审批人状态" clearable @change="search">
          <el-option v-for="o in assigneeStatusOptions" :key="o.value" :value="o.value" :label="`审批人${o.label}`" />
        </el-select>
        <el-button
          :type="filters.assigneeStatus === 'DISABLED' ? 'warning' : 'default'"
          :plain="filters.assigneeStatus !== 'DISABLED'"
          :icon="Warning"
          @click="onlyDisabled"
        >
          已停用审批人名下的待办
        </el-button>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button link type="primary" @click="reset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="records" row-key="taskId" class="task-table eas-row-table">
        <el-table-column label="申请编号" min-width="190">
          <template #default="{ row }"><span class="eas-tnum">{{ row.appNo }}</span></template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">{{ APP_TYPE_LABEL[row.type as AppType] ?? row.type }}</template>
        </el-table-column>
        <el-table-column prop="templateName" label="模板" min-width="120" show-overflow-tooltip />
        <el-table-column prop="applicantName" label="申请人" min-width="90" />
        <el-table-column label="部门" min-width="100">
          <template #default="{ row }">{{ row.deptName ?? '—' }}</template>
        </el-table-column>
        <el-table-column prop="nodeName" label="当前节点" min-width="110" />
        <el-table-column label="审批人" min-width="140">
          <template #default="{ row }">
            <span>{{ row.assignee.realName }}</span>
            <el-tag
              :type="USER_STATUS_TAG[row.assignee.status as UserStatus]"
              size="small"
              class="ml6"
              disable-transitions
            >
              {{ USER_STATUS_LABEL[row.assignee.status as UserStatus] ?? row.assignee.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="到达时间" width="150">
          <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="已等待" width="130">
          <template #default="{ row }">
            <span :class="['eas-tnum', { 'text-danger': row.overdue }]">{{ fmtHours(row.pendingHours) }}</span>
            <el-tag v-if="row.overdue" type="danger" size="small" class="ml6" disable-transitions>超时</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" fixed="right" width="90">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="acting" @click="openTransfer(row as MonitorTask)">转办</el-button>
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
    </el-card>

    <el-dialog v-model="dlg.visible" title="转办待办" width="min(560px, 94vw)" :close-on-click-modal="false">
      <template v-if="dlg.task">
        <el-descriptions :column="2" border size="small" class="task-info">
          <el-descriptions-item label="申请编号"><span class="eas-tnum">{{ dlg.task.appNo }}</span></el-descriptions-item>
          <el-descriptions-item label="类型">{{ APP_TYPE_LABEL[dlg.task.type] ?? dlg.task.type }}</el-descriptions-item>
          <el-descriptions-item label="申请人">{{ dlg.task.applicantName }}</el-descriptions-item>
          <el-descriptions-item label="当前节点">{{ dlg.task.nodeName }}</el-descriptions-item>
          <el-descriptions-item label="当前审批人">
            {{ dlg.task.assignee.realName }}
            <el-tag :type="USER_STATUS_TAG[dlg.task.assignee.status]" size="small" class="ml6" disable-transitions>
              {{ USER_STATUS_LABEL[dlg.task.assignee.status] }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="已等待">{{ fmtHours(dlg.task.pendingHours) }}</el-descriptions-item>
        </el-descriptions>
      </template>

      <el-alert type="info" :closable="false" show-icon class="rules-tip">
        <template #title>转办规则</template>
        <ul class="rules-list">
          <li>不能转给申请人、不能转给只有管理员角色的账号；</li>
          <li>原待办变为“已转办”，为新审批人生成待办，并通知新旧审批人与申请人；</li>
          <li>转办记录与原因写入审批日志和审计日志，不可修改。</li>
        </ul>
      </el-alert>

      <ServerErrorAlert :error="dlg.error" />

      <el-form ref="formRef" :model="dlg" :rules="rules" label-position="top" @submit.prevent>
        <el-form-item label="新审批人" prop="toUserId">
          <UserPicker
            :model-value="dlg.toUserId"
            :exclude="dlg.task ? [dlg.task.assignee.id] : []"
            placeholder="输入姓名或用户名搜索"
            @update:model-value="onPick"
          />
        </el-form-item>
        <el-form-item label="转办原因" prop="reason">
          <el-input
            v-model="dlg.reason"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            :placeholder="`如：原审批人已离职（至少 ${REASON_MIN} 个字）`"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg.visible = false">取消</el-button>
        <el-button type="primary" :loading="acting" @click="submit">确认转办</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.task-table {
  margin-top: 12px;
  width: 100%;
}
.ml6 {
  margin-left: 6px;
}
.task-info {
  margin-bottom: 12px;
}
.rules-tip {
  margin-bottom: 12px;
}
.rules-list {
  margin: 4px 0 0;
  padding-left: 18px;
  line-height: 1.7;
}
</style>
