<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { ActionResult, AppAction, ApplicationDetail, FlowView } from '@/lib/types'
import { APP_STATUS_LABEL, LOG_ACTION_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { ApiError, errorText, isServerError, showError, toApiError } from '@/lib/errors'
import { useAction } from '@/composables/useAction'
import { useApplicationContext } from '@/composables/applicationContext'
import { sessionGeneration, useAuthStore } from '@/stores/auth'
import { useNoticeStore } from '@/stores/notice'
import ApprovePanel from '@/components/ApprovePanel.vue'
import FlowTimeline from '@/components/FlowTimeline.vue'
import StatusTag from '@/components/StatusTag.vue'
import ApplicationBusiness from '@/components/applications/ApplicationBusiness.vue'
import LinkedApplicationCard from '@/components/applications/LinkedApplicationCard.vue'
import SlipHeader from '@/components/slip/SlipHeader.vue'
import SignatureBar from '@/components/slip/SignatureBar.vue'
import SlipSection from '@/components/slip/SlipSection.vue'
import SlipFields from '@/components/slip/SlipFields.vue'
import SlipField from '@/components/slip/SlipField.vue'
import { provideSlipHover } from '@/components/slip/hover'
import { detailBackLabel, detailStatusSentence } from '@/components/slip/detailPresentation'

const props = defineProps<{ id: number }>()
const applicationContext = useApplicationContext()
const router = useRouter()
const auth = useAuthStore()
const notice = useNoticeStore()
const detail = ref<ApplicationDetail | null>(null)
const loading = ref(false)
const loadError = ref<ApiError | null>(null)
const acting = ref<AppAction | null>(null)
const now = ref(Date.now())
const urgeLimit = ref<{ id: number; seq: number | null; nextAt: string } | null>(null)
const act = useAction()
const busy = computed(() => loading.value || loadError.value !== null || acting.value !== null)
const full = computed(() => detail.value?.viewMode === 'FULL')
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
const backLabel = ref(detailBackLabel(window.history.state?.back))
watch(() => router.currentRoute.value.fullPath, () => {
  backLabel.value = detailBackLabel(window.history.state?.back)
}, { flush: 'post' })
const statusSentence = computed(() => detail.value ? detailStatusSentence(detail.value, ownerAction('COPY')) : '')
const actionBar = ref<HTMLElement | null>(null)
const actionBarHeight = ref(72)
watch(actionBar, (element, _old, onCleanup) => {
  if (!element) return
  const measure = () => { actionBarHeight.value = element.getBoundingClientRect().height }
  measure()
  const observer = new ResizeObserver(measure)
  observer.observe(element)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })
const hasActions = computed(() => canHandle.value || (['EDIT', 'DELETE', 'COPY', 'WITHDRAW', 'URGE', 'SUBMIT'] as AppAction[]).some(ownerAction))

// 签批栏与流转记录（及审批日志）的悬停联动
const hover = provideSlipHover()
const hoveredNodeName = computed(() => detail.value?.flow?.nodes.find((node) => String(node.seq) === hover.key.value)?.name ?? null)
function logRowClass({ row }: { row: { nodeName: string | null } }): string {
  return hoveredNodeName.value && row.nodeName === hoveredNodeName.value ? 'row-linked' : ''
}
function locateNode(key: string) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  document.getElementById(`flow-node-${key}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
}

// 本人刚同意 / 驳回的待办：刷新后它在签批栏里落章，动画只播这一次。
// 落章标记按（申请 id、待办 id）快照登记：请求发出时为 submitting，成功后转为 ready（等待展示），
// 章播完、动画被取消、章卸载或刷新后找不到这枚章时消费掉，不依赖审批面板是否还在。
interface StampMark { appId: number; taskId: number; phase: 'submitting' | 'ready' }
const stampMark = ref<StampMark | null>(null)
const freshTaskId = computed(() => {
  const mark = stampMark.value
  return mark?.phase === 'ready' && mark.appId === detail.value?.id ? mark.taskId : null
})
function onStamped(taskId: number) {
  if (stampMark.value?.taskId === taskId) stampMark.value = null
}
function hasStamp(result: ApplicationDetail, taskId: number): boolean {
  return !!result.flow?.nodes.some((node) => node.tasks.some((task) => task.id === taskId && (task.status === 'APPROVED' || task.status === 'REJECTED')))
}

// 审批提交进行中：推送触发的自动刷新先记下，结束后再刷，避免提前换掉审批面板、丢掉提交结果
const submitting = ref(false)
let refreshQueued = false
let submitSeq = 0
async function onSubmit({ taskId, result }: { taskId: number; result: Promise<ActionResult | undefined> }) {
  const seq = ++submitSeq
  const appId = props.id
  stampMark.value = { appId, taskId, phase: 'submitting' }
  submitting.value = true
  let ok = false
  try {
    ok = !!(await result)
  } catch {
    ok = false
  }
  if (seq !== submitSeq) return
  submitting.value = false
  const mark = stampMark.value
  if (mark?.appId === appId && mark.taskId === taskId) stampMark.value = ok ? { ...mark, phase: 'ready' } : null
  if (ok || refreshQueued) {
    refreshQueued = false
    void load()
  }
}
function autoRefresh() {
  if (submitting.value) refreshQueued = true
  else void load()
}

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
    applicationContext?.publish(id, result.applicant.id)
    const mark = stampMark.value
    if (mark?.phase === 'ready' && (mark.appId !== result.id || !hasStamp(result, mark.taskId))) stampMark.value = null
    now.value = Date.now()
    const limit = urgeLimit.value
    if (result.status !== 'IN_APPROVAL' || result.applicant.id !== auth.me?.id ||
        (limit && (limit.id !== result.id || limit.seq !== result.currentNodeSeq || Date.parse(limit.nextAt) <= now.value))) {
      urgeLimit.value = null
    }
    if (result.status === 'IN_APPROVAL' && result.applicant.id === auth.me?.id && result.urgeNextAllowedAt && Date.parse(result.urgeNextAllowedAt) > now.value) {
      urgeLimit.value = { id: result.id, seq: result.currentNodeSeq, nextAt: result.urgeNextAllowedAt }
    }
  } catch (e) {
    if (seq !== requestSeq || id !== props.id || generation !== sessionGeneration()) return
    loadError.value = toApiError(e)
    // 临时刷新失败保留输入；权限失效时立即移除旧内容。
    if ([40101, 40102, 40301, 40401].includes(loadError.value.code)) {
      detail.value = null
      stampMark.value = null
    }
    if (isServerError(loadError.value)) showError(loadError.value)
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}
watch([() => props.id, () => auth.me?.id], () => {
  detail.value = null
  urgeLimit.value = null
  stampMark.value = null
  submitting.value = false
  refreshQueued = false
  submitSeq += 1
  if (auth.me) void load()
  else { requestSeq += 1; loading.value = false; loadError.value = null }
}, { immediate: true, flush: 'sync' })
watch(() => notice.lastAppEvent, (event) => {
  if (event?.applicationId === props.id) autoRefresh()
})
onBeforeUnmount(() => { requestSeq += 1; submitSeq += 1 })

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

const timer = window.setInterval(() => { now.value = Date.now() }, 30_000)
onBeforeUnmount(() => window.clearInterval(timer))
const nextUrgeAt = computed(() => {
  const limit = urgeLimit.value
  return ownerAction('URGE') && detail.value?.status === 'IN_APPROVAL' && limit && limit.id === detail.value?.id && limit.seq === detail.value.currentNodeSeq && Date.parse(limit.nextAt) > now.value ? limit.nextAt : null
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
  <div class="page application-detail" :style="{ '--detail-action-height': `${hasActions ? actionBarHeight : 0}px` }">
    <div class="detail-toolbar">
      <el-button :disabled="acting !== null" @click="back">{{ backLabel }}</el-button>
      <span class="flex-1" />
      <el-button :icon="Refresh" :loading="loading" :disabled="loading || acting !== null || submitting" @click="load">刷新</el-button>
    </div>
    <el-skeleton v-if="loading && !detail" :rows="12" animated />
    <el-result v-else-if="loadError && !detail" icon="warning" :title="loadError.code === 40401 || loadError.httpStatus === 404 ? '无权查看或已不存在' : errorText(loadError)">
      <template #extra><el-button @click="back">{{ backLabel }}</el-button><el-button type="primary" @click="load">重新加载</el-button></template>
    </el-result>
    <template v-else-if="detail">
      <!-- surface：背景格纸据此把提示条、操作栏识别为内容，点击其中空白不荡开背景环 -->
      <el-alert v-if="loadError" class="surface" :title="errorText(loadError, '刷新失败，请重试后再操作')" type="warning" :closable="false" show-icon />
      <el-alert v-if="!full" class="surface" title="关联申请只读摘要" description="此查看方式仅展示关联摘要及流程结果，附件和审批意见不可见。" type="info" :closable="false" show-icon />
      <el-alert v-else-if="!detail.canReadAttachments" class="surface" title="可查看业务内容；当前无权预览或下载附件。" type="info" :closable="false" show-icon />

      <article class="sheet sheet--wide slip" :aria-label="`${detail.appNo} 申请单`">
        <SlipHeader :detail="detail" />
        <SlipSection v-if="visibleFlow && visibleFlow.nodes.length" title="签批" glyph="sun" class="signature-section">
          <SignatureBar
            v-if="visibleFlow && visibleFlow.nodes.length"
            :flow="visibleFlow"
            :now="now"
            :show-comments="full"
            :fresh-task-id="freshTaskId"
            @stamped="onStamped"
            @locate="locateNode"
          />
        </SlipSection>
        <SlipSection v-if="!full" title="关联摘要">
          <LinkedApplicationCard v-if="detail.linked" :application="detail.linked" :navigable="false" />
          <el-empty v-else description="未返回关联摘要" :image-size="60" />
        </SlipSection>
        <ApplicationBusiness v-else :key="`${detail.id}-${detail.version}-${detail.canReadAttachments}`" :detail="detail" />
        <SlipSection v-if="full && (detail.source || detail.followUps.length)" title="来源与后续申请">
          <div v-if="detail.source" class="application-link"><span class="muted">来源单</span><router-link :to="`/applications/${detail.source.id}`">{{ detail.source.appNo }}</router-link><StatusTag :status="detail.source.status" size="small" /></div>
          <div v-for="followUp in detail.followUps" :key="followUp.id" class="application-link"><span class="muted">后续单</span><router-link :to="`/applications/${followUp.id}`">{{ followUp.appNo }}</router-link><StatusTag :status="followUp.status" size="small" /></div>
        </SlipSection>
        <SlipSection :title="full ? '流转记录' : '审批流程结果'">
          <FlowTimeline :flow="visibleFlow" :template-name="detail.templateName" />
        </SlipSection>
        <SlipSection v-if="full" title="审批日志">
          <div class="log-scroll" role="region" aria-label="审批日志" tabindex="0"><el-table class="log-table" :data="logs" row-key="id" size="small" :row-class-name="logRowClass">
            <el-table-column label="时间" width="175"><template #default="{ row }"><span class="num">{{ fmtDateTime(row.createdAt, true) }}</span></template></el-table-column>
            <el-table-column label="操作" width="80"><template #default="{ row }"><span :class="{ 'text-danger': row.action === 'REJECT' }">{{ row.action === 'APPROVE' ? '同意' : LOG_ACTION_LABEL[row.action as keyof typeof LOG_ACTION_LABEL] }}</span></template></el-table-column>
            <el-table-column prop="operatorName" label="操作人" min-width="100" />
            <el-table-column prop="nodeName" label="节点" min-width="120"><template #default="{ row }">{{ row.nodeName ?? '—' }}</template></el-table-column>
            <el-table-column label="意见 / 原因" min-width="220"><template #default="{ row }"><span class="pre-wrap" :class="{ 'text-danger': row.action === 'REJECT' }">{{ row.comment || '—' }}</span></template></el-table-column>
            <el-table-column label="状态变化" min-width="180"><template #default="{ row }"><template v-if="row.fromStatus && row.fromStatus === row.toStatus">{{ APP_STATUS_LABEL[row.toStatus as keyof typeof APP_STATUS_LABEL] }}（进入下一节点）</template><template v-else>{{ row.fromStatus ? APP_STATUS_LABEL[row.fromStatus as keyof typeof APP_STATUS_LABEL] : '—' }}，变为 {{ row.toStatus ? APP_STATUS_LABEL[row.toStatus as keyof typeof APP_STATUS_LABEL] : '—' }}</template></template></el-table-column>
            <el-table-column label="申请 / 模板版本" width="140"><template #default="{ row }">v{{ row.appVersion }} / {{ row.templateVersionNo == null ? '—' : `v${row.templateVersionNo}` }}</template></el-table-column>
            <template #empty><el-empty description="暂无审批日志" :image-size="60" /></template>
          </el-table></div>
        </SlipSection>
        <SlipSection title="单据信息">
          <SlipFields>
            <SlipField label="模板">{{ detail.templateName }}<span v-if="detail.templateVersionNo != null" class="muted version">v{{ detail.templateVersionNo }}</span></SlipField>
            <SlipField label="结束时间"><span class="num">{{ fmtDateTime(detail.finishedAt) }}</span></SlipField>
            <template v-if="full">
              <SlipField label="创建时间"><span class="num">{{ fmtDateTime(detail.createdAt) }}</span></SlipField>
              <SlipField label="更新时间"><span class="num">{{ fmtDateTime(detail.updatedAt) }}</span></SlipField>
            </template>
          </SlipFields>
        </SlipSection>
      </article>

      <div v-if="full && hasActions" ref="actionBar" class="detail-actions surface">
        <div class="detail-actions-inner">
          <div class="action-state"><span>{{ statusSentence }}</span><span v-if="nextUrgeAt && ownerAction('URGE')" class="urge-note">下次可催办：{{ fmtDateTime(nextUrgeAt) }}</span></div>
          <div v-if="hasActions" class="action-buttons">
            <el-button v-if="ownerAction('EDIT')" :disabled="busy" @click="router.push(`/applications/${detail.id}/edit`)">编辑草稿</el-button>
            <el-button v-if="ownerAction('DELETE')" type="danger" :loading="acting === 'DELETE'" :disabled="busy" @click="ownerOperation('DELETE')">删除草稿</el-button>
            <el-button v-if="ownerAction('COPY')" type="primary" :loading="acting === 'COPY'" :disabled="busy" @click="ownerOperation('COPY')">复制并修改</el-button>
            <el-button v-if="ownerAction('WITHDRAW')" type="danger" :loading="acting === 'WITHDRAW'" :disabled="busy" @click="ownerOperation('WITHDRAW')">撤回申请</el-button>
            <el-button v-if="ownerAction('URGE')" :loading="acting === 'URGE'" :disabled="busy || !!nextUrgeAt" @click="urge">催办</el-button>
            <el-button v-if="ownerAction('SUBMIT')" type="primary" :loading="acting === 'SUBMIT'" :disabled="busy" @click="ownerOperation('SUBMIT')">提交申请</el-button>
            <ApprovePanel v-if="canHandle && detail.myTaskId" :disabled="busy" :refreshing="loading" :refresh-error="loadError ? errorText(loadError) : null" :key="`${detail.id}-${detail.myTaskId}`" :task-id="detail.myTaskId" :app-version="detail.version" :can-approve="allowed('APPROVE')" :can-reject="allowed('REJECT')" @submit="onSubmit" @refresh="load" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.application-detail { box-sizing: border-box; width: 100%; max-width: 1040px; min-width: 0; margin: 0 auto; gap: 16px; padding-bottom: calc(var(--detail-action-height, 72px) + 16px); }
.detail-toolbar { display: flex; align-items: center; gap: 8px; min-width: 0; }
.slip { min-width: 0; font-size: var(--eas-fs-14); line-height: 1.65; }
.application-link { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 4px 0; overflow-wrap: anywhere; }
.application-link a { display: inline-flex; align-items: center; min-height: 32px; color: var(--eas-primary); text-decoration: none; font-variant-numeric: tabular-nums; }
.application-link a:hover { text-decoration: underline; }
.version { margin-left: 8px; }
.num { font-variant-numeric: tabular-nums; }
.log-scroll { min-width: 0; max-width: 100%; overflow-x: auto; }
.log-table { width: 100%; }
.log-table :deep(.row-linked > td.el-table__cell) { background: var(--eas-row-hover); }
.log-table :deep(.row-linked > td.el-table__cell:first-child) { box-shadow: inset 3px 0 0 var(--eas-mustard); }
.detail-actions {
  position: fixed;
  z-index: 10;
  bottom: 0;
  left: 0;
  right: 0;
  height: 72px;
  min-height: 72px;
  box-sizing: border-box;
  box-shadow: 0 -4px 0 var(--eas-shade);
  background: var(--eas-sheet);
}
.detail-actions-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  box-sizing: border-box;
  width: calc(100% - 80px);
  max-width: 1040px;
  height: 72px;
  min-height: 72px;
  margin: 0 auto;
}
.action-state { display: flex; flex-direction: column; min-width: 0; color: var(--eas-ink-2); font-size: var(--eas-fs-note); overflow-wrap: anywhere; }
.urge-note { font-size: var(--eas-fs-12); }
.action-buttons { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; flex-shrink: 0; gap: 14px; }
.detail-actions .el-button { margin-left: 0; }
@media (max-width: 768px) {
  .slip { --eas-sheet-inset: 16px; }
  .detail-actions-inner { width: calc(100% - 32px); gap: 8px; }
  .action-state { flex: 1 1 auto; font-size: var(--eas-fs-xs); }
  .action-buttons { flex: 0 1 58%; max-width: 58%; flex-wrap: nowrap; justify-content: flex-start; gap: 10px; padding: 8px 4px; overflow-x: auto; scrollbar-width: thin; }
  .detail-actions .el-button { flex: none; }
}
</style>
