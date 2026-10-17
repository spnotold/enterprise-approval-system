<script setup lang="ts">
// 自定义申请：按模板当前发布版本的 form_schema 渲染（FormRenderer）。
// 草稿按旧版本填写时提交返回 40906：重新获取模板、按新版本重新渲染（同 key 同类型字段保留值），用户确认后带新版本保存再提交。
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { api } from '@/lib/api'
import type { AttachmentMeta, CustomSaveRequest, FormSchema } from '@/lib/types'
import { useDraftForm } from '@/composables/useDraftForm'
import { provideUploadTracker } from '@/lib/fileView'
import { trimOrNull } from '@/lib/formModels'
import { carryOverValues, defaultValue, validateFormValues } from '@/lib/formSchema'
import { errorText } from '@/lib/errors'
import FormShell from './FormShell.vue'
import FormRenderer from '@/components/FormRenderer.vue'

const props = defineProps<{ templateId?: number; id?: number }>()

interface CustomModel {
  title: string | null
  formValues: Record<string, unknown>
  /** ATTACHMENT 字段的附件元数据（界面显示用，不提交） */
  attachments: Record<string, AttachmentMeta[]>
  /** 表单渲染所用的模板版本 */
  templateVersionId: number | null
}

const schema = shallowRef<FormSchema | null>(null)
const templateName = ref('自定义申请')
const templateDescription = ref<string | null>(null)
const templateId = ref<number | null>(props.templateId ?? null)
const versionNo = ref<number | null>(null)
const outdated = ref(false)
const templateError = ref<string | null>(null)
const refreshing = ref(false)

const len = (s: string | null | undefined) => [...(s ?? '').trim()].length

function emptyModel(): CustomModel {
  return { title: null, formValues: {}, attachments: {}, templateVersionId: null }
}

function toBody(m: CustomModel): Omit<CustomSaveRequest, 'version'> {
  return {
    templateId: templateId.value ?? undefined,
    templateVersionId: m.templateVersionId,
    title: trimOrNull(m.title),
    formValues: m.formValues,
  }
}

function validate(m: CustomModel, full: boolean): Record<string, string> {
  const e: Record<string, string> = {}
  if (len(m.title) > 100) e.title = '标题不能超过 100 字'
  if (full && !len(m.title)) e.title = '请填写标题'
  if (schema.value) Object.assign(e, validateFormValues(schema.value, m.formValues, { full }))
  return e
}

const LABELS = computed<Record<string, string>>(() => {
  const map: Record<string, string> = { title: '标题', formValues: '表单' }
  for (const f of schema.value?.fields ?? []) map[f.key] = f.label
  return map
})

const draft = useDraftForm<CustomModel>({
  typePath: 'custom',
  initialId: props.id ?? null,
  idInQuery: props.id == null,
  emptyModel,
  fromDetail: (d) => {
    const c = d.custom
    if (!c) return emptyModel()
    schema.value = c.formSchema
    templateId.value = c.templateId
    versionNo.value = c.versionNo
    outdated.value = c.outdated
    templateName.value = d.templateName
    return {
      title: d.title,
      formValues: { ...c.formValues },
      attachments: { ...(c.attachments ?? {}) },
      templateVersionId: c.templateVersionId,
    }
  },
  toBody,
  validateLight: (m) => validate(m, false),
  validateFull: (m) => validate(m, true),
  mapErrorPath: (p) => (schema.value?.fields.some((f) => f.key === p) ? `formValues.${p}` : p),
  onSubmitError: (err) => {
    if (err.code !== 40906) return false
    // 等当前提交动作结束后再处理，避免与进行中的提交冲突
    window.setTimeout(() => void rerenderWithLatest(true), 0)
    return true
  },
})

const { model, fe } = draft
const uploading = provideUploadTracker()

/** 新建：取模板当前发布版本 */
async function loadTemplateForNew() {
  if (templateId.value == null) {
    templateError.value = '缺少模板参数'
    return
  }
  try {
    const t = await api.templates.current(templateId.value)
    schema.value = t.formSchema
    templateName.value = t.name
    templateDescription.value = t.description
    versionNo.value = t.versionNo
    const values: Record<string, unknown> = {}
    for (const f of t.formSchema.fields) values[f.key] = defaultValue(f)
    model.value = { title: null, formValues: values, attachments: {}, templateVersionId: t.versionId }
    draft.markClean()
  } catch (e) {
    templateError.value = errorText(e, '模板不存在或已停用')
  }
}

/**
 * 模板已更新：按最新发布版本重新渲染，同 key 且同类型的字段保留值。
 * fromSubmit 为 true 时（提交返回 40906），用户确认后直接保存并提交。
 */
async function rerenderWithLatest(fromSubmit: boolean) {
  if (templateId.value == null) return
  refreshing.value = true
  let dropped: string[] = []
  let newVersionNo: number | null = null
  try {
    const t = await api.templates.current(templateId.value)
    const carried = carryOverValues(schema.value, t.formSchema, model.value.formValues)
    dropped = carried.dropped
    const keptAttachments: Record<string, AttachmentMeta[]> = {}
    for (const f of t.formSchema.fields) {
      if (f.type === 'ATTACHMENT' && Array.isArray(carried.values[f.key]) && model.value.attachments[f.key]) {
        keptAttachments[f.key] = model.value.attachments[f.key]
      }
    }
    schema.value = t.formSchema
    versionNo.value = t.versionNo
    templateName.value = t.name
    templateDescription.value = t.description
    outdated.value = false
    model.value = { ...model.value, formValues: carried.values, attachments: keptAttachments, templateVersionId: t.versionId }
    newVersionNo = t.versionNo
  } catch (e) {
    await ElMessageBox.alert(errorText(e, '模板不存在或已停用'), '无法获取最新模板', { type: 'error' }).catch(() => undefined)
    return
  } finally {
    refreshing.value = false
  }
  fe.clear()
  const droppedText = dropped.length ? `以下字段类型或标识已变化，需要重新填写：${dropped.join('、')}。` : ''
  try {
    await ElMessageBox.confirm(
      `模板已更新为 v${newVersionNo}，表单已按新版本重新渲染，同名同类型字段的值已保留。${droppedText}请确认内容无误。`,
      '模板已更新',
      {
        type: 'warning',
        confirmButtonText: fromSubmit ? '确认并提交' : '确认',
        cancelButtonText: '先检查一下',
      },
    )
  } catch {
    return
  }
  // 带新的 templateVersionId 保存（模型已变化，提交时会先保存）
  if (fromSubmit) await draft.submit()
  else await draft.saveDraft()
}

// 从 ?id= 草稿回到新建时重新取模板
watch(
  () => draft.id.value,
  (v, old) => {
    if (v == null && old != null) void loadTemplateForNew()
  },
)

onMounted(async () => {
  if (draft.id.value != null) await draft.load()
  else await loadTemplateForNew()
})

const loadError = computed(() => draft.loadError.value ?? templateError.value)
</script>

<template>
  <FormShell
    :title="templateName"
    :description="templateDescription"
    :app-no="draft.appNo.value"
    :loading="draft.loading.value || (!schema && !loadError)"
    :load-error="loadError"
    :dirty="draft.dirty.value"
    :saving="draft.saving.value"
    :submitting="draft.submitting.value"
    :deleting="draft.deleting.value"
    :uploading="uploading"
    :can-delete="draft.id.value != null"
    :errors="fe.summary.value"
    :labels="LABELS"
    @save="draft.saveDraft"
    @submit="draft.submit"
    @delete="draft.removeDraft"
  >
    <template #header-extra>
      <span v-if="versionNo" class="version">模板版本 v{{ versionNo }}</span>
    </template>
    <el-alert v-if="outdated" type="warning" :closable="false" show-icon title="该草稿按旧版本模板填写，模板已更新">
      <div class="outdated">
        提交前需要按最新版本重新渲染表单（同名同类型字段的值会保留）。
        <el-button size="small" type="warning" :loading="refreshing" @click="rerenderWithLatest(false)">按最新版本重新填写</el-button>
      </div>
    </el-alert>
    <el-card v-if="schema" shadow="never">
      <el-form label-width="120px" @submit.prevent>
        <el-form-item label="标题" required :error="fe.get('title')">
          <el-input v-model="model.title" maxlength="100" show-word-limit placeholder="简要说明本次申请" />
        </el-form-item>
      </el-form>
      <FormRenderer
        v-model="model.formValues"
        v-model:attachments="model.attachments"
        :schema="schema"
        :error="fe.get"
      />
    </el-card>
  </FormShell>
</template>

<style scoped>
.version {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}
.outdated {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
