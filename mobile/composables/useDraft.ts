// 草稿表单的保存与提交（草稿优先）：
//   新建：POST /applications/{type} → 得到 id、version
//   保存：PUT /applications/{id}/{type}，带 version；版本不一致返回 40905
//   提交：先保存最新内容 → 预览审批路径 → 打开确认框时生成幂等键 →
//         POST /applications/{id}/submit {appVersion}；网络失败重试时复用同一个键
import { reactive, watch, type WatchSource } from 'vue'
import { onUnload } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { ApiError } from '@/lib/http'
import type { TypePath } from '@/lib/api/applications'
import { newIdemKey } from '@/lib/idem'
import type {
  ActionResult,
  ApplicationDetail,
  CustomSaveRequest,
  DraftSaved,
  ExpenseSaveRequest,
  PathPreview,
  PurchaseSaveRequest,
  TravelSaveRequest,
} from '@/lib/types'
import { runIdempotent } from '@/utils/action'
import { alert, confirm, hideLoading, loading, toast } from '@/utils/feedback'
import { goDetail } from '@/utils/nav'

export interface SaveBodyMap {
  purchase: PurchaseSaveRequest
  travel: TravelSaveRequest
  expense: ExpenseSaveRequest
  custom: CustomSaveRequest
}

const LEAVE_MESSAGE = '有未保存的修改，确定离开吗？'

function setLeaveAlert(on: boolean): void {
  // #ifdef MP-WEIXIN
  const u = uni as unknown as {
    enableAlertBeforeUnload?: (o: { message: string }) => void
    disableAlertBeforeUnload?: () => void
  }
  if (on) u.enableAlertBeforeUnload?.({ message: LEAVE_MESSAGE })
  else u.disableAlertBeforeUnload?.()
  // #endif
  // #ifdef H5
  window.onbeforeunload = on ? () => LEAVE_MESSAGE : null
  // #endif
}

export function pathPreviewText(p: PathPreview | null): string {
  if (!p) return '审批路径暂不可用，提交时会重新校验。\n\n'
  if (!p.nodes.length) return ''
  const lines = p.nodes
    .map((n, i) => {
      const many = n.mode && n.mode !== 'SINGLE' && n.candidates?.length
      const who = many
        ? `${n.mode === 'COUNTERSIGN' ? '会签' : '或签'}：${n.candidates.map((c) => c.realName).join('、')}`
        : (n.assignee?.realName ?? '待定')
      if (!n.effective) return `${i + 1}. ${n.name}（跳过${n.conditionText ? `，条件不满足：${n.conditionText}` : ''}）`
      return `${i + 1}. ${n.name}（${who}）${n.resolveNote ? `\n${n.resolveNote}` : ''}`
    })
  return `审批路径：\n${lines.join('\n')}\n\n`
}

export function useDraft<K extends TypePath>(type: K) {
  const draft = reactive({
    id: null as number | null,
    version: null as number | null,
    appNo: '',
    dirty: false,
    busy: false,
  })

  let tracking = false
  let revision = 0

  /** 监听表单数据，有修改时标记 dirty 并开启离开提示 */
  function trackDirty(source: WatchSource<unknown>): void {
    watch(
      source,
      () => {
        if (!tracking) return
        revision++
        if (!draft.dirty) {
          draft.dirty = true
          setLeaveAlert(true)
        }
      },
      { deep: true, flush: 'sync' },
    )
  }

  /** 加载数据完成后调用：此后的修改才算未保存 */
  function startTracking(): void {
    setTimeout(() => {
      tracking = true
    }, 0)
  }

  function markClean(): void {
    draft.dirty = false
    setLeaveAlert(false)
  }

  onUnload(() => setLeaveAlert(false))

  /** 编辑已有草稿：加载详情；不是本人可编辑的草稿时提示并转到详情页 */
  async function load(id: number): Promise<ApplicationDetail | null> {
    const d = await api.applications.detail(id)
    if (d.type.toLowerCase() !== type) {
      throw new ApiError({ code: 40000, message: '草稿类型与当前表单不匹配' }, 400)
    }
    if (d.status !== 'DRAFT' || !d.allowedActions.includes('EDIT')) {
      await alert('无法编辑', '该申请已不是草稿，不能再修改。')
      goDetail(id, true)
      return null
    }
    draft.id = d.id
    draft.version = d.version
    draft.appNo = d.appNo
    return d
  }

  async function persist(body: SaveBodyMap[K], opts: { silent?: boolean } = {}): Promise<DraftSaved> {
    const sentRevision = revision
    let r: DraftSaved
    if (draft.id === null) {
      r = await api.applications.create(type, body)
    } else {
      r = await api.applications.save(draft.id, type, { ...body, version: draft.version ?? undefined })
    }
    draft.id = r.id
    draft.version = r.version
    draft.appNo = r.appNo
    if (revision === sentRevision) markClean()
    if (!opts.silent) toast('草稿已保存', 'success')
    return r
  }

  function lock(): void {
    if (draft.busy) throw new ApiError({ code: 40903, message: '正在处理中，请稍候' }, 409)
    draft.busy = true
  }

  async function save(body: SaveBodyMap[K], opts: { silent?: boolean } = {}): Promise<DraftSaved> {
    lock()
    try { return await persist(body, opts) }
    finally { draft.busy = false }
  }

  /**
   * 保存并提交。业务校验失败（40000 / 42201 / 409 等）时抛出 ApiError，由页面映射字段错误；
   * 用户取消或放弃重试时返回 null。
   */
  async function submit(body: SaveBodyMap[K], opts: { afterSave?: (id: number) => Promise<string | void> } = {}): Promise<ActionResult | null> {
    lock()
    try {
      const sentRevision = revision
      loading('保存中')
      let saved: DraftSaved
      try {
        saved = await persist(body, { silent: true })
      } finally {
        hideLoading()
      }
      const id = saved.id
      const extra = await opts.afterSave?.(id)
      let preview: PathPreview | null = null
      loading('生成审批路径')
      try {
        preview = await api.applications.pathPreview(id)
      } catch {
        preview = null // 预览失败不阻止提交，以服务端校验为准
      } finally {
        hideLoading()
      }
      if (preview && preview.errors.length) {
        await alert('暂时无法提交', preview.errors.join('\n'))
        return null
      }
      // 打开确认框时生成幂等键；本次提交的重试都复用它
      const idemKey = newIdemKey()
      const ok = await confirm({
        title: '确认提交',
        content: `${pathPreviewText(preview)}${extra ? `${extra}\n\n` : ''}提交后进入审批流程，审批期间不能修改。`,
        confirmText: '提交',
      })
      if (!ok) return null
      if (revision !== sentRevision) {
        toast('表单内容已变化，请检查后重新提交')
        return null
      }
      const r = await runIdempotent(idemKey, (key) => api.applications.submit(id, { appVersion: saved.version }, key), '提交中')
      if (r && revision === sentRevision) markClean()
      return r
    } finally {
      draft.busy = false
    }
  }

  /** 提交成功：提示当前审批人并转到详情页 */
  function finishSubmit(r: ActionResult): void {
    draft.busy = true // 跳转前保持锁定，避免成功提示期间重复提交
    const who = r.currentNode?.assigneeName
    toast(who ? `提交成功，当前审批人：${who}` : '提交成功', 'none')
    setTimeout(() => goDetail(r.applicationId, true), 1200)
  }

  return { draft, trackDirty, startTracking, markClean, load, save, submit, finishSubmit }
}
