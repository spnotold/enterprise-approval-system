<script setup lang="ts">
import { reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import type { AttachmentMeta, CustomSaveRequest, FormSchema } from '@/lib/types'
import CustomFormRenderer from '@/components/CustomFormRenderer.vue'
import FormItem from '@/components/FormItem.vue'
import { useDraft } from '@/composables/useDraft'
import { applyApiError, scrollToError, useFieldErrors } from '@/composables/useFieldErrors'
import { requireLogin } from '@/stores/auth'
import { initialValues, mergeValues, validateCustom } from '@/utils/customForm'
import { alert, hideLoading, loading, showError, toast } from '@/utils/feedback'

const form = reactive({ title: '', values: {} as Record<string, unknown>, attachments: {} as Record<string, AttachmentMeta[]> })
const schema = ref<FormSchema | null>(null), templateId = ref<number | null>(null), templateVersionId = ref<number | null>(null)
const templateName = ref('自定义申请'), versionNo = ref<number | null>(null)
const ready = ref(false), loadError = ref(''), uploading = ref(false), refreshing = ref(false), outdated = ref(false), reviewRequired = ref(false)
const fe = useFieldErrors()
// 标题输入框聚焦状态；小程序没有 :focus，用 @focus / @blur 切换 .is-focus
const titleFocus = ref(false)
const { draft, trackDirty, startTracking, markClean, load, save, submit, finishSubmit } = useDraft('custom')
let initialId: number | null = null

function body(): CustomSaveRequest {
  const values = Object.fromEntries((schema.value?.fields ?? []).map(f => [f.key, form.values[f.key]]))
  return { title: form.title.trim() || null, templateId: templateId.value ?? undefined, templateVersionId: templateVersionId.value, formValues: values }
}
function remap(path: string): string | null {
  if (path === 'title') return path
  const field = path.replace(/^formValues\./, '').replace(/^formValues\[['"]?([^'"\]]+)['"]?\]/, '$1')
  const key = schema.value?.fields.find(f => field === f.key || field.startsWith(`${f.key}[`) || field.startsWith(`${f.key}.`))?.key
  return key ?? null
}
async function fill(id: number): Promise<void> {
  ready.value = false; loadError.value = ''; loading()
  try {
    const d = await load(id)
    if (!d) return
    if (!d.custom) throw new Error('自定义草稿内容不完整')
    const c = d.custom
    templateId.value = c.templateId; templateVersionId.value = c.templateVersionId; versionNo.value = c.versionNo
    schema.value = c.formSchema; templateName.value = d.templateName; outdated.value = c.outdated
    form.title = d.title ?? ''; form.values = { ...initialValues(c.formSchema), ...c.formValues }; form.attachments = { ...c.attachments }
    reviewRequired.value = false; fe.clear(); markClean(); ready.value = true
    uni.setNavigationBarTitle({ title: d.templateName })
  } catch (e) { loadError.value = '草稿加载失败，请重试'; showError(e) }
  finally { hideLoading() }
}
async function initialize(): Promise<void> {
  if (initialId) return fill(initialId)
  ready.value = false; loadError.value = ''; loading()
  try {
    if (!templateId.value) throw new Error('缺少有效的模板编号，请从发起页重新选择')
    const t = await api.templates.current(templateId.value)
    if (t.category !== 'CUSTOM') throw new Error('此页面只支持自定义模板')
    schema.value = t.formSchema; templateVersionId.value = t.versionId; versionNo.value = t.versionNo; templateName.value = t.name
    form.values = initialValues(t.formSchema); form.attachments = {}; fe.clear(); markClean(); ready.value = true
    uni.setNavigationBarTitle({ title: t.name })
  } catch (e) { loadError.value = '模板加载失败，请返回发起页或重试'; showError(e) }
  finally { hideLoading() }
}
async function reloadDraft(): Promise<void> { if (draft.id) await fill(draft.id) }

async function upgrade(): Promise<void> {
  if (!templateId.value || refreshing.value || draft.busy) return
  if (uploading.value) return toast('附件上传中，请稍候')
  refreshing.value = true; loading('获取最新模板')
  try {
    const t = await api.templates.current(templateId.value)
    if (t.category !== 'CUSTOM') throw new Error('模板类型无效')
    const merged = mergeValues(schema.value, form.values, t.formSchema)
    const kept: Record<string, AttachmentMeta[]> = {}
    for (const f of t.formSchema.fields) {
      const ids = merged.values[f.key]
      if (f.type === 'ATTACHMENT' && Array.isArray(ids)) kept[f.key] = (form.attachments[f.key] ?? []).filter(a => ids.includes(a.id))
    }
    schema.value = t.formSchema; templateVersionId.value = t.versionId; versionNo.value = t.versionNo; templateName.value = t.name
    form.values = merged.values; form.attachments = kept
    outdated.value = false; reviewRequired.value = true; fe.clear()
    uni.setNavigationBarTitle({ title: t.name })
    hideLoading()
    await alert('模板已更新', `已切换为 v${t.versionNo}，同名同类型字段已保留。${merged.dropped.length ? `以下字段需重新检查或填写：${merged.dropped.join('、')}。` : ''}请核对新表单，确认后再次提交。`)
  } catch (e) { showError(e) }
  finally { refreshing.value = false; hideLoading() }
}

async function act(full: boolean): Promise<void> {
  if (!ready.value || !schema.value || draft.busy || refreshing.value) return
  if (uploading.value) return toast('附件上传中，请稍候')
  if (outdated.value) return upgrade()
  if (full && reviewRequired.value) return toast('请先核对并确认新版表单内容')
  fe.setAll(validateCustom(schema.value, form.values, { full }))
  for (const f of schema.value.fields) {
    if (f.type !== 'ATTACHMENT') continue
    const files = form.attachments[f.key] ?? []
    if (f.rules?.allowedTypes?.length && files.some(a => !f.rules?.allowedTypes?.includes(a.contentType))) fe.set(f.key, '附件类型不符合当前模板，请移除后重新上传')
    if (files.some(a => a.sizeBytes > (f.rules?.maxSizeMb ?? 10) * 1024 * 1024)) fe.set(f.key, '附件大小超出当前模板限制，请移除后重新上传')
  }
  if (full && !form.title.trim()) fe.set('title', '请填写标题')
  if ([...form.title.trim()].length > 100) fe.set('title', '标题不能超过 100 字')
  if (fe.count.value) { toast('请完善标红的内容'); return scrollToError() }
  try {
    if (full) { const r = await submit(body()); if (r) { ready.value = false; finishSubmit(r) } }
    else { loading('保存中'); await save(body()) }
  } catch (e) {
    if (toApiError(e).code === 40906) { outdated.value = true; await upgrade() }
    else applyApiError(fe, e, { remap, onRefresh: reloadDraft })
  } finally { hideLoading() }
}
onLoad(async q => {
  if (!(await requireLogin())) return
  if (q?.id) initialId = Number(q.id)
  if (q?.templateId) templateId.value = Number(q.templateId)
  if ((initialId !== null && (!Number.isSafeInteger(initialId) || initialId <= 0)) || (templateId.value !== null && (!Number.isSafeInteger(templateId.value) || templateId.value <= 0))) { loadError.value = '模板或草稿编号无效'; return }
  trackDirty(() => ({ form, templateVersionId: templateVersionId.value }))
  await initialize(); startTracking()
})
</script>

<template>
  <view class="page page--bar">
    <view v-if="loadError" class="banner banner-danger">
      {{ loadError }}
      <view class="link-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="initialize">重试</view>
    </view>
    <template v-if="ready && schema">
      <view class="row between mb">
        <view class="head-meta">
          <text>{{ draft.appNo ? `草稿 ${draft.appNo}` : templateName }}</text>
          <text v-if="draft.dirty" class="head-dirty">未保存</text>
        </view>
        <text class="tag">v{{ versionNo }}</text>
      </view>
      <view v-if="outdated" class="banner banner-warning">
        模板已更新。切换后保留同名同类型字段，请重新核对。
        <view class="link-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="upgrade">加载最新模板</view>
      </view>
      <view v-if="reviewRequired" class="banner banner-warning">
        已切换到新版模板，请核对字段与附件。
        <view class="link-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="reviewRequired = false">已核对内容，允许提交</view>
      </view>
      <view v-if="fe.general.value.length" class="banner banner-danger">
        <view v-for="m in fe.general.value" :key="m">{{ m }}</view>
      </view>
      <view class="card" :class="{ locked: draft.busy || refreshing }">
        <view class="card-title">{{ templateName }}</view>
        <FormItem label="标题" required :error="fe.get('title')">
          <input
            v-model="form.title"
            class="input"
            :class="{ 'is-error': !!fe.get('title'), 'is-focus': titleFocus }"
            maxlength="100"
            placeholder="简要说明本次申请"
            @input="fe.clearField('title')"
            @focus="titleFocus = true"
            @blur="titleFocus = false"
          />
        </FormItem>
        <CustomFormRenderer :key="templateVersionId ?? 0" :schema="schema" :values="form.values" :attachments="form.attachments" :errors="fe" @busy="uploading = $event" />
      </view>
      <view class="field-help">提交前会保存最新内容并预览审批路径，确认后进入审批。</view>
    </template>
    <view class="bottom-bar">
      <button class="btn" :disabled="!ready || draft.busy || refreshing || uploading" hover-class="is-pressed" :hover-stay-time="60" @tap="act(false)">保存草稿</button>
      <button class="btn btn-primary" :disabled="!ready || draft.busy || refreshing || uploading" hover-class="press-primary" :hover-stay-time="60" @tap="act(true)">提交</button>
    </view>
  </view>
</template>

<style scoped>
@import '../../styles/form.css';

.locked {
  pointer-events: none;
  opacity: 0.7;
}

.head-meta {
  flex: 1;
  min-width: 0;
  margin-right: 16rpx;
  overflow-wrap: anywhere;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}

.head-dirty {
  margin-left: 20rpx;
  color: var(--eas-warning-text);
}
</style>
