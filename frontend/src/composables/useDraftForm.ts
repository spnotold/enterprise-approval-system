// 草稿表单：加载、保存、version 维护；有未保存修改时离开页面给出提示；提交前保存并预览审批路径
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/lib/api'
import type { TypePath } from '@/lib/api/applications'
import type { ActionResult, ApplicationDetail, DraftSaved, PathPreview } from '@/lib/types'
import { toApiError, type ApiError } from '@/lib/http'
import { showError } from '@/lib/errors'
import { pathPreviewMessage } from '@/lib/pathPreview'
import { useAction } from './useAction'
import { useFieldErrors } from './useFieldErrors'

export interface DraftFormOptions<M> {
  typePath: TypePath
  /** 编辑已有草稿时的 id；新建时为 null */
  initialId: number | null
  emptyModel: () => M
  fromDetail: (d: ApplicationDetail) => M
  /** 模型 -> 请求体（不含 version）；在此剔除空行等 */
  toBody: (m: M) => object
  /** 保存草稿前的格式校验（light），返回 路径 -> 错误 */
  validateLight?: (m: M) => Record<string, string>
  /** 提交前的完整校验（full） */
  validateFull?: (m: M) => Record<string, string>
  onLoaded?: (d: ApplicationDetail) => void
  afterSave?: (r: DraftSaved) => void | Promise<void>
  /** 提交时的特殊错误处理（如自定义表单 40906），返回 true 表示已处理 */
  onSubmitError?: (err: ApiError) => boolean | Promise<boolean>
  /** 新建后把 id 写到 URL 查询参数 ?id=，刷新页面可继续编辑；默认 true */
  idInQuery?: boolean
  /** 服务端错误路径 -> 界面路径（如剔除空行后的下标映射） */
  mapErrorPath?: (path: string) => string
}

function parseId(v: unknown): number | null {
  const s = Array.isArray(v) ? v[0] : v
  const n = Number(s)
  return s != null && s !== '' && Number.isInteger(n) && n > 0 ? n : null
}

export function useDraftForm<M extends object>(opts: DraftFormOptions<M>) {
  const route = useRoute()
  const router = useRouter()
  const idInQuery = opts.idInQuery !== false
  const fe = useFieldErrors()
  const submitAction = useAction()
  const deleteAction = useAction()

  const model = ref(opts.emptyModel()) as Ref<M>
  const id = ref<number | null>(opts.initialId ?? (idInQuery ? parseId(route.query.id) : null))
  const version = ref<number | null>(null)
  const appNo = ref<string | null>(null)
  const detail = shallowRef<ApplicationDetail | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const loadError = ref<string | null>(null)
  const snapshot = ref('')
  let leaving = false

  const dirty = computed(() => JSON.stringify(model.value) !== snapshot.value)
  const submitting = computed(() => submitAction.loading.value)

  function markClean() {
    snapshot.value = JSON.stringify(model.value)
  }

  async function load() {
    fe.clear()
    loadError.value = null
    if (id.value == null) {
      model.value = opts.emptyModel()
      version.value = null
      appNo.value = null
      detail.value = null
      markClean()
      return
    }
    loading.value = true
    try {
      const d = await api.applications.detail(id.value)
      if (d.status !== 'DRAFT' || !d.allowedActions.includes('EDIT')) {
        loadError.value = '该申请已不是可编辑的草稿'
        detail.value = d
        return
      }
      detail.value = d
      version.value = d.version
      appNo.value = d.appNo
      model.value = opts.fromDetail(d)
      markClean()
      opts.onLoaded?.(d)
    } catch (e) {
      const err = toApiError(e)
      loadError.value = err.code === 40401 ? '无权查看或已不存在' : err.message
    } finally {
      loading.value = false
    }
  }

  /** 保存（新建或更新）；失败抛出 ApiError */
  async function persist(): Promise<DraftSaved> {
    saving.value = true
    try {
      const snap = JSON.stringify(model.value)
      const body = opts.toBody(model.value)
      let r: DraftSaved
      if (id.value == null) {
        r = await api.applications.create(opts.typePath, body as never)
        id.value = r.id
        if (idInQuery) await router.replace({ query: { ...route.query, id: String(r.id) } })
      } else {
        r = await api.applications.save(id.value, opts.typePath, { ...body, version: version.value ?? undefined } as never)
      }
      version.value = r.version
      appNo.value = r.appNo
      snapshot.value = snap
      await opts.afterSave?.(r)
      return r
    } finally {
      saving.value = false
    }
  }

  /** 40905：草稿在别处被修改，提示重新加载 */
  async function handleDraftConflict(err: ApiError): Promise<boolean> {
    if (err.code !== 40905) return false
    try {
      await ElMessageBox.confirm(
        '该草稿已在其他页面或设备上修改，本页的修改无法保存。重新加载将获取最新草稿，并丢弃本页未保存的修改。',
        '草稿已在别处修改',
        { type: 'warning', confirmButtonText: '重新加载', cancelButtonText: '暂不' },
      )
      await load()
    } catch {
      // 用户选择暂不：保留本页内容，便于手动复制
    }
    return true
  }

  async function handleFieldErrors(err: ApiError): Promise<boolean> {
    if ((err.code === 40000 || err.code === 42201) && err.errors.length) {
      const map = opts.mapErrorPath
      fe.fromList(map ? err.errors.map((x) => ({ ...x, field: x.field ? map(x.field) : x.field })) : err.errors)
      ElMessage.error(err.message || '请修正标红的内容')
      await fe.scrollToFirst()
      return true
    }
    return false
  }

  function applyClientErrors(errors: Record<string, string> | undefined): boolean {
    if (!errors || Object.keys(errors).length === 0) return false
    fe.set(errors)
    ElMessage.error('请先修正标红的内容')
    void fe.scrollToFirst()
    return true
  }

  /** “保存草稿”按钮 */
  async function saveDraft(): Promise<boolean> {
    if (saving.value) return false
    fe.clear()
    if (applyClientErrors(opts.validateLight?.(model.value))) return false
    try {
      await persist()
      ElMessage.success('草稿已保存')
      return true
    } catch (e) {
      const err = toApiError(e)
      if (!(await handleDraftConflict(err)) && !(await handleFieldErrors(err))) showError(err)
      return false
    }
  }

  /** “提交”：完整校验 -> 保存 -> 预览审批路径并确认 -> 提交（带幂等键） */
  async function submit(): Promise<ActionResult | undefined> {
    if (saving.value || submitting.value) return undefined
    fe.clear()
    if (applyClientErrors(opts.validateFull?.(model.value))) return undefined
    try {
      if (id.value == null || dirty.value) await persist()
    } catch (e) {
      const err = toApiError(e)
      if (!(await handleDraftConflict(err)) && !(await handleFieldErrors(err))) showError(err)
      return undefined
    }
    const appId = id.value!
    let preview: PathPreview | null = null
    try {
      preview = await api.applications.pathPreview(appId)
    } catch {
      preview = null
    }
    const r = await submitAction.run({
      confirm: { title: '确认提交', message: pathPreviewMessage(preview), type: 'info', confirmText: '提交' },
      action: (key) => api.applications.submit(appId, { appVersion: version.value ?? 0 }, key),
      onError: async (err) => {
        if (opts.onSubmitError && (await opts.onSubmitError(err))) return true
        if (await handleDraftConflict(err)) return true
        if (await handleFieldErrors(err)) return true
        return false
      },
      onConflict: () => load(),
    })
    if (r) {
      version.value = r.appVersion
      ElMessage.success(`提交成功，当前审批人：${r.currentNode?.assigneeName ?? '—'}`)
      leaving = true
      markClean()
      await router.push(`/applications/${appId}`)
    }
    return r
  }

  // ---------- 离开提示 ----------

  async function confirmLeave(): Promise<boolean> {
    if (leaving || !dirty.value) return true
    try {
      await ElMessageBox.confirm('有未保存的修改，确定离开吗？', '提示', {
        type: 'warning',
        confirmButtonText: '离开',
        cancelButtonText: '留在此页',
      })
      return true
    } catch {
      return false
    }
  }

  onBeforeRouteLeave(() => confirmLeave())
  // 同一路由记录下切换（如从 ?id=1 回到新建、切换模板）
  onBeforeRouteUpdate(async (to) => {
    if (to.path === route.path && (!idInQuery || parseId(to.query.id) === id.value)) return true
    return confirmLeave()
  })
  if (idInQuery) {
    watch(
      () => route.query.id,
      (v) => {
        const next = parseId(v)
        if (next !== id.value) {
          id.value = next
          void load()
        }
      },
    )
  }

  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!leaving && dirty.value) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

  /** 删除草稿等场景主动放行 */
  function allowLeave() {
    leaving = true
  }

  /** 删除草稿（二次确认），成功后回到我的申请 */
  async function removeDraft(): Promise<boolean> {
    if (id.value == null) return false
    const appId = id.value
    const ok = await deleteAction.run({
      confirm: { title: '删除草稿', message: '删除后不可恢复，确定删除该草稿吗？', danger: true, confirmText: '删除' },
      action: async () => {
        await api.applications.remove(appId)
        return true
      },
      success: '草稿已删除',
    })
    if (ok) {
      leaving = true
      await router.push('/applications/mine')
    }
    return !!ok
  }

  return {
    model,
    id,
    version,
    appNo,
    detail,
    loading,
    saving,
    submitting,
    deleting: deleteAction.loading,
    loadError,
    dirty,
    fe,
    load,
    persist,
    saveDraft,
    submit,
    markClean,
    allowLeave,
    removeDraft,
    handleDraftConflict,
  }
}
