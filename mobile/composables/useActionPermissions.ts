// 列表左滑操作权限（详情里的 allowedActions）按需加载并缓存：
// 缓存键为（申请 id + 版本 + 状态），列表刷新（reset）后作废；晚到的旧响应直接丢弃。
import { shallowRef } from 'vue'
import type { AppAction, ApplicationDetail, ApplicationSummary } from '@/lib/types'

export type ActionPermission = { state: 'loading' } | { state: 'error' } | { state: 'ready'; actions: AppAction[] }
export type PermissionTarget = Pick<ApplicationSummary, 'id' | 'version' | 'status'>
interface Entry { key: string; permission: ActionPermission }

export function useActionPermissions(fetchDetail: (id: number) => Promise<ApplicationDetail>) {
  const entries = shallowRef<Record<number, Entry>>({})
  let generation = 0

  const keyOf = (t: PermissionTarget): string => `${t.id}:${t.version}:${t.status}`
  function put(id: number, entry: Entry): void {
    entries.value = { ...entries.value, [id]: entry }
  }

  /** 当前缓存；未加载、或缓存对应的版本/状态与列表项不一致时返回 undefined */
  function get(t: PermissionTarget): ActionPermission | undefined {
    const e = entries.value[t.id]
    return e && e.key === keyOf(t) ? e.permission : undefined
  }

  /** 按需加载一条；加载中或已有结果时不重复请求，失败后再次调用即重试 */
  async function load(t: PermissionTarget): Promise<void> {
    const current = get(t)
    if (current && current.state !== 'error') return
    const key = keyOf(t)
    const gen = generation
    put(t.id, { key, permission: { state: 'loading' } })
    let permission: ActionPermission
    try {
      const d = await fetchDetail(t.id)
      // 详情与列表项的版本/状态不一致说明列表已过期，不能据此展示操作
      permission = d.version === t.version && d.status === t.status ? { state: 'ready', actions: d.allowedActions } : { state: 'error' }
    } catch {
      permission = { state: 'error' }
    }
    if (gen !== generation || entries.value[t.id]?.key !== key) return
    put(t.id, { key, permission })
  }

  /** 列表刷新时调用：清空缓存，并让进行中的请求结果作废 */
  function reset(): void {
    generation++
    entries.value = {}
  }

  return { get, load, reset }
}
