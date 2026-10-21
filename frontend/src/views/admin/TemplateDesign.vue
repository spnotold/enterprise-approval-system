<script setup lang="ts">
import '@/components/admin/admin.css'
// 流程设计：编辑草稿版本（表单 + 节点），保存、校验、发布；无草稿时只读显示发布版本
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Back, Check, CircleCheck, Delete, EditPen, Promotion } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type {
  AppType,
  DraftVersionRequest,
  FieldError,
  TemplateAdminDetail,
  TemplateVersionBrief,
  TemplateVersionDetail,
  ValidationIssue,
} from '@/lib/types'
import { APP_TYPE_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { errorText, showError, toApiError } from '@/lib/errors'
import { confirmDialog } from '@/composables/useAction'
import TemplateDesigner from '@/components/TemplateDesigner/index.vue'
import { TPL_CODE_LABEL, clone, parseTarget } from '@/components/TemplateDesigner/utils'

const props = defineProps<{ id: number }>()
const router = useRouter()

const detail = ref<TemplateAdminDetail | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
/** 草稿的可编辑副本 */
const edit = ref<DraftVersionRequest | null>(null)
/** 发布版本的只读副本（无草稿时显示） */
const viewCopy = ref<DraftVersionRequest | null>(null)
const snapshot = ref('')

const saving = ref(false)
const validating = ref(false)
const publishing = ref(false)
const discarding = ref(false)
const creatingDraft = ref(false)
const busy = computed(
  () => saving.value || validating.value || publishing.value || discarding.value || creatingDraft.value,
)

const issues = ref<ValidationIssue[]>([])
const issueState = ref<'none' | 'passed' | 'failed'>('none')
const issuesSnapshot = ref('')
const issuePanel = ref<HTMLElement | null>(null)
const designer = ref<InstanceType<typeof TemplateDesigner> | null>(null)

const dirty = computed(() => !!edit.value && JSON.stringify(edit.value) !== snapshot.value)
const issuesStale = computed(
  () => issueState.value !== 'none' && !!edit.value && JSON.stringify(edit.value) !== issuesSnapshot.value,
)

const builtinType = computed<AppType | null>(() => {
  const d = detail.value
  if (!d) return null
  const fs = (edit.value ?? viewCopy.value)?.formSchema
  if (fs?.builtin) return fs.builtin
  return d.category === 'BUILTIN' ? d.bizType : null
})

const versions = computed<TemplateVersionBrief[]>(() =>
  [...(detail.value?.versions ?? [])].sort((a, b) => b.versionNo - a.versionNo),
)

const VERSION_STATUS: Record<TemplateVersionBrief['status'], { label: string; type: 'warning' | 'success' | 'info' }> = {
  DRAFT: { label: '草稿', type: 'warning' },
  PUBLISHED: { label: '当前发布', type: 'success' },
  ARCHIVED: { label: '已归档', type: 'info' },
}

// ---------- 加载 ----------

function toEditable(v: TemplateVersionDetail): DraftVersionRequest {
  const formSchema = clone(v.formSchema ?? { fields: [] })
  if (!Array.isArray(formSchema.fields)) formSchema.fields = []
  const nodeConfig = clone(v.nodeConfig ?? { nodes: [] })
  if (!Array.isArray(nodeConfig.nodes)) nodeConfig.nodes = []
  return { formSchema, nodeConfig }
}

function applyDetail(d: TemplateAdminDetail) {
  detail.value = d
  edit.value = d.draft ? toEditable(d.draft) : null
  viewCopy.value = d.published ? toEditable(d.published) : null
  snapshot.value = edit.value ? JSON.stringify(edit.value) : ''
  clearIssues()
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    applyDetail(await api.admin.templates.get(props.id))
  } catch (e) {
    const err = toApiError(e)
    detail.value = null
    edit.value = null
    viewCopy.value = null
    snapshot.value = ''
    loadError.value = err.code === 40401 ? '模板不存在或无权查看' : errorText(err, '加载失败')
  } finally {
    loading.value = false
  }
}

watch(
  () => props.id,
  () => void load(),
  { immediate: true },
)

// ---------- 校验问题 ----------

function setIssues(list: ValidationIssue[], state: 'passed' | 'failed') {
  issues.value = list
  issueState.value = state
  issuesSnapshot.value = edit.value ? JSON.stringify(edit.value) : ''
}

function clearIssues() {
  issues.value = []
  issueState.value = 'none'
  issuesSnapshot.value = ''
}

function fromFieldErrors(errs: FieldError[]): ValidationIssue[] {
  return errs.map((e) => ({ code: e.rule || 'TPL_INVALID', path: e.field || null, message: e.message }))
}

function scrollToIssues() {
  window.setTimeout(() => issuePanel.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
}

function issueWhere(it: ValidationIssue): string {
  const t = parseTarget(it.path)
  const src = edit.value
  switch (t.kind) {
    case 'field': {
      const f = src?.formSchema.fields[t.index]
      return `表单字段 ${t.index + 1}${f ? `「${f.label || f.key}」` : ''}`
    }
    case 'node': {
      const n = src?.nodeConfig.nodes[t.index]
      return `审批节点 ${t.index + 1}${n ? `「${n.name || n.nodeKey}」` : ''}`
    }
    case 'fields':
      return '表单字段'
    case 'nodes':
      return '审批节点'
    default:
      return it.code === 'TPL_BASIC' ? '模板基本信息' : '整体'
  }
}

async function locateIssue(it: ValidationIssue) {
  const ok = await designer.value?.locate(it.path)
  if (ok) return
  const basic = it.code === 'TPL_BASIC' || (!!it.path && /^(name|code|description|deptIds)/.test(it.path))
  ElMessage.info(
    basic
      ? '该问题涉及模板基本信息（名称、说明、适用部门），请在模板列表中点击“编辑”修改'
      : '该问题针对整个模板，没有具体的定位位置',
  )
}

// ---------- 保存 ----------

/** 保存草稿；失败时已提示，返回 false */
async function persist(): Promise<boolean> {
  if (!edit.value) return false
  saving.value = true
  const snap = JSON.stringify(edit.value)
  try {
    const v = await api.admin.templates.saveDraft(props.id, clone(edit.value))
    if (detail.value) detail.value.draft = v
    snapshot.value = snap
    return true
  } catch (e) {
    const err = toApiError(e)
    if ((err.code === 42201 || err.code === 40000) && err.errors.length) {
      setIssues(fromFieldErrors(err.errors), 'failed')
      ElMessage.error(err.message || '草稿内容有误，请修正下列问题')
      scrollToIssues()
    } else if (err.isConflict) {
      const reload = await confirmDialog({
        title: '模板已在别处修改',
        message: `${err.message || '草稿可能已被其他管理员发布或放弃'}。重新加载将获取最新内容，并丢弃本页未保存的修改。`,
        confirmText: '重新加载',
        cancelText: '暂不',
      })
      if (reload) await load()
    } else {
      showError(err)
    }
    return false
  } finally {
    saving.value = false
  }
}

async function saveDraft() {
  if (busy.value) return
  if (await persist()) ElMessage.success('草稿已保存')
}

async function runValidate() {
  if (!edit.value || busy.value) return
  validating.value = true
  try {
    if (dirty.value && !(await persist())) return
    const list = await api.admin.templates.validate(props.id)
    setIssues(list ?? [], list?.length ? 'failed' : 'passed')
    if (list?.length) {
      ElMessage.warning(`发现 ${list.length} 个问题，点击问题可定位到对应字段或节点`)
      scrollToIssues()
    } else {
      ElMessage.success('校验通过，可以发布')
    }
  } catch (e) {
    showError(e)
  } finally {
    validating.value = false
  }
}

// ---------- 发布 ----------

const publishVisible = ref(false)
const publishFormRef = ref<FormInstance>()
const publishForm = reactive({ changeNote: '' })
const publishRules: FormRules<typeof publishForm> = {
  changeNote: [
    {
      trigger: 'blur',
      validator: (_rule, value: string, cb) => {
        const len = [...(value ?? '').trim()].length
        if (len < 2) cb(new Error('请填写变更说明（至少 2 个字）'))
        else if (len > 500) cb(new Error('不能超过 500 字'))
        else cb()
      },
    },
  ],
}

function openPublish() {
  if (busy.value) return
  publishForm.changeNote = ''
  publishVisible.value = true
  publishFormRef.value?.clearValidate()
}

async function doPublish() {
  const valid = await publishFormRef.value?.validate().catch(() => false)
  if (!valid) return
  publishing.value = true
  try {
    if (dirty.value && !(await persist())) {
      publishVisible.value = false
      return
    }
    const d = await api.admin.templates.publish(props.id, { changeNote: publishForm.changeNote.trim() })
    publishVisible.value = false
    ElMessage.success(`已发布 v${d.currentVersionNo ?? ''}，新申请将使用新版本`)
    snapshot.value = edit.value ? JSON.stringify(edit.value) : ''
    await load()
  } catch (e) {
    const err = toApiError(e)
    if (err.code === 42201 && err.errors.length) {
      publishVisible.value = false
      setIssues(fromFieldErrors(err.errors), 'failed')
      ElMessage.error('发布前校验未通过，请修正下列问题后再发布')
      scrollToIssues()
    } else {
      showError(err)
    }
  } finally {
    publishing.value = false
  }
}

// ---------- 草稿 ----------

async function createDraft() {
  if (busy.value) return
  creatingDraft.value = true
  try {
    await api.admin.templates.createDraft(props.id)
    ElMessage.success('已复制当前发布版本生成草稿')
    await load()
  } catch (e) {
    showError(e)
  } finally {
    creatingDraft.value = false
  }
}

async function discard() {
  if (busy.value || !detail.value) return
  const ok = await confirmDialog({
    title: '放弃草稿',
    message: detail.value.published
      ? '放弃后草稿中的全部修改将丢失，模板继续使用当前发布版本。确定放弃吗？'
      : '该模板尚未发布过，放弃后草稿内容将全部丢失。确定放弃吗？',
    danger: true,
    confirmText: '放弃草稿',
  })
  if (!ok) return
  discarding.value = true
  try {
    await api.admin.templates.discardDraft(props.id)
    snapshot.value = edit.value ? JSON.stringify(edit.value) : ''
    ElMessage.success('草稿已放弃')
    await load()
  } catch (e) {
    showError(e)
  } finally {
    discarding.value = false
  }
}

// ---------- 离开提示 ----------

function confirmLeave(): Promise<boolean> | boolean {
  if (!dirty.value) return true
  return confirmDialog({
    title: '提示',
    message: '设计器中有未保存的修改，确定离开吗？',
    confirmText: '离开',
    cancelText: '留在此页',
  })
}

onBeforeRouteLeave(() => confirmLeave())
onBeforeRouteUpdate((to, from) => (to.params.id === from.params.id ? true : confirmLeave()))

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<template>
  <div class="page admin-page">
    <header class="sheet-head">
      <div class="head-main">
        <el-button link :icon="Back" @click="router.push('/admin/templates')">模板列表</el-button>
        <h2 class="sheet-title">{{ detail?.name ?? '流程设计' }}</h2>
        <template v-if="detail">
          <el-tag size="small" effect="plain" :type="detail.category === 'BUILTIN' ? 'warning' : 'primary'">
            {{ detail.category === 'BUILTIN' ? '内置' : '自定义' }}
          </el-tag>
          <el-tag v-if="!detail.enabled" size="small" type="info">已停用</el-tag>
        </template>
      </div>
      <div v-if="detail" class="head-actions">
        <template v-if="edit">
          <span v-if="dirty" class="text-warning small">有未保存的修改</span>
          <el-button type="danger" plain :icon="Delete" :loading="discarding" :disabled="busy" @click="discard">
            放弃草稿
          </el-button>
          <el-button :icon="Check" :loading="saving && !validating && !publishing" :disabled="busy" @click="saveDraft">
            保存草稿
          </el-button>
          <el-button :icon="CircleCheck" :loading="validating" :disabled="busy" @click="runValidate">校验</el-button>
          <el-button type="primary" :icon="Promotion" :disabled="busy" @click="openPublish">发布</el-button>
        </template>
        <el-button
          v-else
          type="primary"
          :icon="EditPen"
          :loading="creatingDraft"
          :disabled="busy"
          @click="createDraft"
        >
          编辑（生成草稿）
        </el-button>
      </div>
    </header>

    <el-skeleton v-if="loading && !detail" :rows="8" animated />

    <el-result v-else-if="loadError" icon="error" :title="loadError">
      <template #extra>
        <el-button @click="load">重试</el-button>
        <el-button @click="router.push('/admin/templates')">返回列表</el-button>
      </template>
    </el-result>

    <template v-else-if="detail">
      <div class="meta muted small">
        <span>业务类型：{{ APP_TYPE_LABEL[detail.bizType] ?? detail.bizType }}</span>
        <span>适用部门：{{ detail.deptNames.length ? detail.deptNames.join('、') : '全部部门' }}</span>
        <span>当前发布：{{ detail.currentVersionNo ? `v${detail.currentVersionNo}` : '尚未发布' }}</span>
        <span v-if="detail.draft">编辑中：v{{ detail.draft.versionNo }} 草稿</span>
        <span>已使用 {{ detail.usageCount }} 次</span>
      </div>

      <p v-if="!edit && detail.published" class="page-note">
        当前显示已发布版本 v{{ detail.published.versionNo }}（只读）。生成草稿可修改，校验通过后发布为新版本；已提交的申请不受影响。
      </p>
      <div v-else-if="edit" class="page-note page-note--warn">
        正在编辑 v{{ detail.draft?.versionNo ?? '' }} 草稿。保存草稿不影响员工使用；发布后新申请使用新版本，原发布版本归档，已提交的申请仍按提交时的快照审批。
      </div>

      <div v-if="issueState !== 'none'" ref="issuePanel">
        <el-alert
          v-if="issueState === 'passed'"
          type="success"
          show-icon
          :closable="true"
          title="校验通过，可以发布"
          :description="issuesStale ? '设计已在校验后修改，发布时将重新校验。' : '所有发布前检查均已通过。'"
          @close="clearIssues"
        />
        <el-card v-else shadow="never" class="issue-card">
          <template #header>
            <div class="issue-head">
              <span class="text-danger">发现 {{ issues.length }} 个问题，点击可定位到对应字段或节点</span>
              <span v-if="issuesStale" class="muted small">设计已在校验后修改，结果可能已过期，请重新校验</span>
              <span class="flex-1" />
              <el-button link @click="clearIssues">关闭</el-button>
            </div>
          </template>
          <ul class="issue-list">
            <li
              v-for="(it, k) in issues"
              :key="k"
              class="issue-item"
              role="button"
              tabindex="0"
              @click="locateIssue(it)"
              @keydown.enter="locateIssue(it)"
              @keydown.space.prevent="locateIssue(it)"
            >
              <el-tooltip :content="TPL_CODE_LABEL[it.code] ?? it.code" placement="top">
                <el-tag type="danger" size="small" effect="plain" class="code-tag">{{ it.code }}</el-tag>
              </el-tooltip>
              <span class="issue-msg">{{ it.message }}</span>
              <span class="muted small issue-where">
                {{ issueWhere(it) }}<template v-if="it.path"> {{ it.path }}</template>
              </span>
            </li>
          </ul>
        </el-card>
      </div>

      <div v-loading="loading" class="designer-wrap">
        <TemplateDesigner
          v-if="edit"
          ref="designer"
          :key="`draft-${detail.draft?.id ?? 0}`"
          v-model:form-schema="edit.formSchema"
          v-model:node-config="edit.nodeConfig"
          :builtin="builtinType"
          :issues="issues"
        />
        <TemplateDesigner
          v-else-if="viewCopy"
          ref="designer"
          :key="`published-${detail.published?.id ?? 0}`"
          v-model:form-schema="viewCopy.formSchema"
          v-model:node-config="viewCopy.nodeConfig"
          readonly
          :builtin="builtinType"
        />
        <el-empty v-else description="该模板还没有任何版本">
          <el-button type="primary" :loading="creatingDraft" @click="createDraft">编辑（生成草稿）</el-button>
        </el-empty>
      </div>

      <el-card shadow="never" class="versions-card">
        <template #header>
          <span class="section-head">版本历史</span>
          <span class="muted small">每个模板同一时刻至多一个草稿；已发布、已归档版本不可修改</span>
        </template>
        <el-table :data="versions" size="small" empty-text="暂无版本" class="eas-row-table">
          <el-table-column label="版本" width="80">
            <template #default="{ row }">v{{ row.versionNo }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag class="admin-status" size="small" :type="VERSION_STATUS[row.status as TemplateVersionBrief['status']]?.type ?? 'info'">
                {{ VERSION_STATUS[row.status as TemplateVersionBrief['status']]?.label ?? row.status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="变更说明" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ row.changeNote || '—' }}</template>
          </el-table-column>
          <el-table-column label="发布时间" width="150">
            <template #default="{ row }">{{ fmtDateTime(row.publishedAt) }}</template>
          </el-table-column>
          <el-table-column label="发布人" width="120">
            <template #default="{ row }">{{ row.publishedByName || '—' }}</template>
          </el-table-column>
          <el-table-column label="创建时间" width="150">
            <template #default="{ row }">{{ fmtDateTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>

    <el-dialog
      v-model="publishVisible"
      title="发布新版本"
      width="min(520px, 92vw)"
      :close-on-click-modal="false"
      append-to-body
    >
      <p class="muted small publish-note">
        发布后新申请使用新版本<template v-if="detail?.draft"> v{{ detail.draft.versionNo }}</template>，原发布版本归档；已提交的申请仍按提交时的快照审批。发布前会再次完整校验。
      </p>
      <el-form ref="publishFormRef" :model="publishForm" :rules="publishRules" label-position="top" @submit.prevent>
        <el-form-item label="变更说明" prop="changeNote" required>
          <el-input
            v-model="publishForm.changeNote"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="如：报销金额 ≥ 1 万元时增加企业负责人审批（将写入审计日志）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishVisible = false">取消</el-button>
        <el-button type="primary" :loading="publishing" @click="doPublish">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.head-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  min-width: 0;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 20px;
  margin: 12px 0 0;
}
.designer-wrap {
  min-height: 200px;
}
.versions-card {
  margin-top: 16px;
}
.issue-card :deep(.el-card__header) {
  padding: 10px 16px;
}
.issue-card :deep(.el-card__body) {
  padding: 4px 8px 8px;
}
.issue-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}
.issue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 260px;
  overflow: auto;
}
.issue-item {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 6px 8px;
  border-radius: var(--eas-radius-control);
  cursor: pointer;
  outline: none;
}
.issue-item:hover,
.issue-item:focus-visible {
  background: var(--eas-danger-tint);
}
.issue-item:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: 2px;
}
.code-tag {
  flex: none;
}
.issue-msg {
  flex: 1;
  min-width: 200px;
  word-break: break-word;
}
.issue-where {
  word-break: break-all;
}
.section-head {
  font-weight: 600;
  margin-right: 12px;
}
.publish-note {
  margin: 0 0 12px;
  line-height: 1.6;
}
</style>
