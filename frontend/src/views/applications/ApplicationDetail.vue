<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { AppAction, ApplicationDetail, FlowView } from '@/lib/types'
import { APP_STATUS_LABEL, APP_TYPE_LABEL, LOG_ACTION_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { ApiError, errorText, isServerError, showError, toApiError } from '@/lib/errors'
import { useAction } from '@/composables/useAction'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { sessionGeneration, useAuthStore } from '@/stores/auth'
import { useNoticeStore } from '@/stores/notice'
import ApprovePanel from '@/components/ApprovePanel.vue'
import FlowTimeline from '@/components/FlowTimeline.vue'
import StatusTag from '@/components/StatusTag.vue'
import MoneyText from '@/components/MoneyText.vue'
import ApplicationBusiness from '@/components/applications/ApplicationBusiness.vue'
import LinkedApplicationCard from '@/components/applications/LinkedApplicationCard.vue'

const props = defineProps<{ id: number }>()
const router = useRouter()
const auth = useAuthStore()
const notice = useNoticeStore()
const { isMobile } = useBreakpoint()
const detail = ref<ApplicationDetail | null>(null)
const loading = ref(false)
const loadError = ref<ApiError | null>(null)
const acting = ref<AppAction | null>(null)
const urgeLimit = ref<{ id: number; seq: number | null; nextAt: string } | null>(null)
const act = useAction()
const busy = computed(() => loading.value || acting.value !== null)
const full = computed(() => detail.value?.viewMode === 'FULL')
const columns = computed(() => isMobile.value ? 1 : 2)
const activeNodes = computed(() => detail.value?.flow?.nodes.filter((node) => node.status === 'ACTIVE') ?? [])
const logs = computed(() => [...(detail.value?.logs ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id))
// 关联查看只呈现流程结果，即使意外收到正文意见也不显示。
const visibleFlow = computed<FlowView | null>(() => {
  const flow = detail.value?.flow
  if (!flow) return null
  if (full.value) return flow
  return {
    ...flow,
    nodes: flow.nodes.map((node) => ({
      ...node, resolveNote: null, conditionText: null,
      tasks: node.tasks.map((task) => ({ ...task, comment: null })),
    })),
  }
})

function allowed(action: AppAction): boolean {
  return !!(full.value && detail.value?.allowedActions.includes(action))
}
function ownerAction(action: AppAction): boolean {
  return allowed(action) && detail.value?.applicant.id === auth.me?.id && auth.can('APP_CREATE')
}
const canHandle = computed(() => !!(
  full.value && detail.value?.myTaskId && detail.value.status === 'IN_APPROVAL' &&
  detail.value.applicant.id !== auth.me?.id && auth.can('TASK_HANDLE') && !auth.hasRole('SYS_ADMIN') &&
  (allowed('APPROVE') || allowed('REJECT'))
))
const hasActions = computed(() => canHandle.value || (['EDIT', 'DELETE', 'COPY', 'WITHDRAW', 'URGE', 'SUBMIT'] as AppAction[]).some(ownerAction))

let requestSeq = 0
async function load() {
  const seq = ++requestSeq
  const id = props.id
  const generation = sessionGeneration()
  loading.value = true
  loadError.value = null
  try {
    const result = await api.applications.detail(id)
    if (seq !== requestSeq || id !== props.id || generation !== sessionGeneration()) return
    detail.value = result
  } catch (e) {
    if (seq !== requestSeq || id !== props.id || generation !== sessionGeneration()) return
    detail.value = null
    loadError.value = toApiError(e)
    if (isServerError(loadError.value)) showError(loadError.value)
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}
watch(() => props.id, () => {
  detail.value = null
  urgeLimit.value = null
  void load()
}, { immediate: true })
watch(() => notice.lastAppEvent, (event) => {
  if (event?.applicationId === props.id) void load()
})
onBeforeUnmount(() => { requestSeq += 1 })

function back() {
  if (window.history.state?.back) router.back()
  else void router.push('/')
}
function assertCurrent(snapshot: ApplicationDetail, action: AppAction) {
  if (props.id !== snapshot.id || detail.value?.id !== snapshot.id || detail.value.version !== snapshot.version || !ownerAction(action)) {
    throw new ApiError({ code: 40901, message: '申请状态已变化，请刷新后重新操作' }, 409)
  }
}
async function ownerOperation(action: 'WITHDRAW' | 'SUBMIT' | 'COPY' | 'DELETE') {
  const snapshot = detail.value
  if (!snapshot || busy.value || !ownerAction(action)) return
  acting.value = action // 在二次确认期间也禁止重复打开。
  const generation = sessionGeneration()
  try {
    const confirmations = {
      WITHDRAW: { title: '撤回申请', message: `确定撤回 ${snapshot.appNo}？撤回后所有待办将失效，本单不能继续审批；可复制为新草稿重新提交。`, confirmText: '撤回', danger: true },
      SUBMIT: { title: '提交申请', message: `确定提交 ${snapshot.appNo}？提交后业务内容和附件将锁定，并按流程分配审批人。`, confirmText: '提交' },
      COPY: { title: '复制并修改', message: `将以 ${snapshot.appNo} 为来源生成一张新草稿，业务内容和附件一并复制，原单审批历史保持不变。`, confirmText: '复制' },
      DELETE: { title: '删除草稿', message: `确定删除草稿 ${snapshot.appNo}？删除后不可恢复。`, confirmText: '删除', danger: true },
    }
    const result = await act.run({
      confirm: confirmations[action],
      action: async (key) => {
        if (generation !== sessionGeneration()) throw new ApiError({ code: 40101, message: '登录身份已变化，请重新登录' }, 401)
        assertCurrent(snapshot, action)
        if (action === 'WITHDRAW') return api.applications.withdraw(snapshot.id, { appVersion: snapshot.version }, key)
        if (action === 'SUBMIT') return api.applications.submit(snapshot.id, { appVersion: snapshot.version }, key)
        if (action === 'COPY') return api.applications.copy(snapshot.id)
        await api.applications.remove(snapshot.id)
        return true
      },
      onConflict: () => load(),
      onError: (error) => {
        // 复制接口没有幂等契约，未知结果时不能自动重放。
        if (action === 'COPY' && (error.code === -1 || isServerError(error))) {
          showError(error)
          ElMessage.warning('复制结果尚未确认，请先到我的申请检查是否已生成新草稿。')
          return true
        }
        if (error.code === 40301 || error.code === 40401) void load()
      },
    })
    if (!result || props.id !== snapshot.id || generation !== sessionGeneration()) return
    if (action === 'COPY' && typeof result === 'object' && 'appNo' in result) {
      ElMessage.success(`已复制为新草稿 ${result.appNo}`)
      await router.push(`/applications/${result.id}/edit`)
    } else if (action === 'DELETE') {
      ElMessage.success('草稿已删除')
      await router.push('/applications/mine')
    } else {
      ElMessage.success(action === 'WITHDRAW' ? '已撤回，待办已失效' : '提交成功')
      await load()
    }
  } finally {
    acting.value = null
  }
}

const now = ref(Date.now())
const timer = window.setInterval(() => { now.value = Date.now() }, 30_000)
onBeforeUnmount(() => window.clearInterval(timer))
const nextUrgeAt = computed(() => {
  const limit = urgeLimit.value
  return limit && limit.id === detail.value?.id && limit.seq === detail.value.currentNodeSeq && Date.parse(limit.nextAt) > now.value ? limit.nextAt : null
})
async function urge() {
  const snapshot = detail.value
  if (!snapshot || busy.value || !ownerAction('URGE') || nextUrgeAt.value) return
  acting.value = 'URGE'
  const generation = sessionGeneration()
  try {
    const result = await act.run({
      action: (key) => {
        if (generation !== sessionGeneration()) throw new ApiError({ code: 40101, message: '登录身份已变化，请重新登录' }, 401)
        assertCurrent(snapshot, 'URGE')
        return api.applications.urge(snapshot.id, key)
      },
      onConflict: () => load(),
      onError: (error) => { if (error.code === 40301 || error.code === 40401) void load() },
    })
    if (!result || props.id !== snapshot.id || generation !== sessionGeneration()) return
    now.value = Date.now()
    if (result.nextAllowedAt) urgeLimit.value = { id: snapshot.id, seq: snapshot.currentNodeSeq, nextAt: result.nextAllowedAt }
    if (result.urged) ElMessage.success('已向当前审批人发送催办通知')
    else ElMessage.info(result.nextAllowedAt ? `已催办过，下次可催办时间：${fmtDateTime(result.nextAllowedAt)}` : '当前节点已催办，请稍后再试')
  } finally {
    acting.value = null
  }
}
</script>

<template>
  <div class="page application-detail">
    <div class="page-header">
      <div><h2 class="page-title">申请详情</h2><div v-if="detail" class="page-subtitle mono">{{ detail.appNo }}</div></div>
      <div class="toolbar">
        <el-button :disabled="acting !== null" @click="back">返回</el-button>
        <el-button :icon="Refresh" :loading="loading" :disabled="busy" @click="load">刷新</el-button>
      </div>
    </div>
    <el-skeleton v-if="loading" :rows="12" animated />
    <el-result v-else-if="loadError" icon="warning" :title="loadError.code === 40401 || loadError.httpStatus === 404 ? '无权查看或已不存在' : errorText(loadError)">
      <template #extra><el-button @click="back">返回</el-button><el-button type="primary" @click="load">重新加载</el-button></template>
    </el-result>
    <template v-else-if="detail">
      <el-alert v-if="!full" title="关联申请只读摘要" description="此查看方式仅展示关联摘要及流程结果，附件和审批意见不可见。" type="info" :closable="false" show-icon />
      <el-alert v-else-if="!detail.canReadAttachments" title="可查看业务内容；当前无权预览或下载附件。" type="info" :closable="false" show-icon />
      <el-card shadow="never">
        <template #header><div class="detail-heading"><h3 class="section-title pre-wrap">{{ detail.title || detail.templateName }}</h3><StatusTag :status="detail.status" :show-node="false" /></div></template>
        <el-descriptions :column="columns" border>
          <el-descriptions-item label="申请编号"><span class="mono">{{ detail.appNo }}</span></el-descriptions-item>
          <el-descriptions-item label="申请类型">{{ APP_TYPE_LABEL[detail.type] }}</el-descriptions-item>
          <el-descriptions-item label="申请人">{{ detail.applicant.realName }}</el-descriptions-item>
          <el-descriptions-item label="所属部门">{{ detail.deptName ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="申请金额"><MoneyText :cents="detail.amountCents" strong /></el-descriptions-item>
          <el-descriptions-item label="模板">{{ detail.templateName }}<template v-if="detail.templateVersionNo != null"> · v{{ detail.templateVersionNo }}</template></el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ fmtDateTime(detail.submittedAt) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">{{ fmtDateTime(detail.finishedAt) }}</el-descriptions-item>
          <template v-if="full">
            <el-descriptions-item label="创建时间">{{ fmtDateTime(detail.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ fmtDateTime(detail.updatedAt) }}</el-descriptions-item>
          </template>
          <el-descriptions-item v-if="activeNodes.length" label="当前审批" :span="columns">
            <div v-for="node in activeNodes" :key="node.seq">{{ node.name }} · {{ (node.candidates.length ? node.candidates : node.assignee ? [node.assignee] : []).map(person => person.realName).join('、') || '—' }}</div>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>
      <el-card v-if="!full" shadow="never">
        <template #header><h3 class="section-title">关联摘要</h3></template>
        <LinkedApplicationCard v-if="detail.linked" :application="detail.linked" :navigable="false" />
        <el-empty v-else description="未返回关联摘要" :image-size="60" />
      </el-card>
      <ApplicationBusiness v-else :key="`${detail.id}-${detail.version}-${detail.canReadAttachments}`" :detail="detail" />
      <el-card v-if="full && (detail.source || detail.followUps.length)" shadow="never">
        <template #header><h3 class="section-title">来源与后续申请</h3></template>
        <div v-if="detail.source" class="application-link">来源单：<router-link :to="`/applications/${detail.source.id}`">{{ detail.source.appNo }}</router-link><StatusTag :status="detail.source.status" size="small" /></div>
        <div v-for="followUp in detail.followUps" :key="followUp.id" class="application-link">后续单：<router-link :to="`/applications/${followUp.id}`">{{ followUp.appNo }}</router-link><StatusTag :status="followUp.status" size="small" /></div>
      </el-card>
      <el-card shadow="never">
        <template #header><h3 class="section-title">{{ full ? '审批流程与意见' : '审批流程结果' }}</h3></template>
        <FlowTimeline :flow="visibleFlow" />
      </el-card>
      <el-card v-if="full" shadow="never">
        <template #header><h3 class="section-title">审批日志</h3></template>
        <el-table :data="logs" row-key="id" size="small" border>
          <el-table-column label="时间" width="175"><template #default="{ row }">{{ fmtDateTime(row.createdAt, true) }}</template></el-table-column>
          <el-table-column label="操作" width="80"><template #default="{ row }"><span :class="{ 'text-danger': row.action === 'REJECT' }">{{ LOG_ACTION_LABEL[row.action as keyof typeof LOG_ACTION_LABEL] }}</span></template></el-table-column>
          <el-table-column prop="operatorName" label="操作人" min-width="100" />
          <el-table-column prop="nodeName" label="节点" min-width="120"><template #default="{ row }">{{ row.nodeName ?? '—' }}</template></el-table-column>
          <el-table-column label="意见 / 原因" min-width="220"><template #default="{ row }"><span class="pre-wrap" :class="{ 'text-danger': row.action === 'REJECT' }">{{ row.comment || '—' }}</span></template></el-table-column>
          <el-table-column label="状态变化" min-width="180"><template #default="{ row }"><template v-if="row.fromStatus && row.fromStatus === row.toStatus">{{ APP_STATUS_LABEL[row.toStatus as keyof typeof APP_STATUS_LABEL] }}（进入下一节点）</template><template v-else>{{ row.fromStatus ? APP_STATUS_LABEL[row.fromStatus as keyof typeof APP_STATUS_LABEL] : '—' }} → {{ row.toStatus ? APP_STATUS_LABEL[row.toStatus as keyof typeof APP_STATUS_LABEL] : '—' }}</template></template></el-table-column>
          <el-table-column label="申请 / 模板版本" width="140"><template #default="{ row }">v{{ row.appVersion }} / {{ row.templateVersionNo == null ? '—' : `v${row.templateVersionNo}` }}</template></el-table-column>
          <template #empty><el-empty description="暂无审批日志" :image-size="60" /></template>
        </el-table>
      </el-card>
      <div v-if="full && hasActions" class="form-actions detail-actions">
        <span v-if="nextUrgeAt && ownerAction('URGE')" class="muted small">下次可催办：{{ fmtDateTime(nextUrgeAt) }}</span><span class="flex-1" />
        <el-button v-if="ownerAction('EDIT')" :disabled="busy" @click="router.push(`/applications/${detail.id}/edit`)">编辑草稿</el-button>
        <el-button v-if="ownerAction('DELETE')" type="danger" plain :loading="acting === 'DELETE'" :disabled="busy" @click="ownerOperation('DELETE')">删除草稿</el-button>
        <el-button v-if="ownerAction('COPY')" type="primary" :loading="acting === 'COPY'" :disabled="busy" @click="ownerOperation('COPY')">复制并修改</el-button>
        <el-button v-if="ownerAction('WITHDRAW')" type="danger" plain :loading="acting === 'WITHDRAW'" :disabled="busy" @click="ownerOperation('WITHDRAW')">撤回申请</el-button>
        <el-button v-if="ownerAction('URGE')" :loading="acting === 'URGE'" :disabled="busy || !!nextUrgeAt" @click="urge">催办</el-button>
        <el-button v-if="ownerAction('SUBMIT')" type="primary" :loading="acting === 'SUBMIT'" :disabled="busy" @click="ownerOperation('SUBMIT')">提交申请</el-button>
        <ApprovePanel v-if="canHandle && detail.myTaskId && !busy" :key="`${detail.id}-${detail.version}-${detail.myTaskId}`" :task-id="detail.myTaskId" :app-version="detail.version" :can-approve="allowed('APPROVE')" :can-reject="allowed('REJECT')" @done="load" @refresh="load" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.detail-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.detail-heading h3 { flex: 1; min-width: 0; }
.application-link { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 4px 0; }
.application-link a { color: var(--el-color-primary); text-decoration: none; }
.detail-actions { flex-wrap: wrap; align-items: center; }
.detail-actions .el-button { margin-left: 0; }
</style>
