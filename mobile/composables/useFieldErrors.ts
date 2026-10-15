// 字段级错误：服务端 errors[].field（如 items[2].amountCents）映射到表单项；
// 映射不到的放进 general，在表单顶部集中显示。
import { computed, nextTick, reactive, ref } from 'vue'
import { toApiError } from '@/lib/http'
import type { FieldError } from '@/lib/types'
import { showError, toast } from '@/utils/feedback'

export function useFieldErrors() {
  const map = reactive<Record<string, string>>({})
  const general = ref<string[]>([])

  function clear(): void {
    for (const k of Object.keys(map)) delete map[k]
    general.value = []
  }

  /** 用户修改某字段后清掉它的错误 */
  function clearField(path: string): void {
    if (map[path]) delete map[path]
  }

  function set(path: string, message: string): void {
    if (!map[path]) map[path] = message
  }

  /**
   * @param remap 把服务端字段路径换成页面上的路径（如报销提交前剔除了空行，下标需要换回界面下标）；
   *              返回 null 表示页面上没有对应位置
   */
  function setAll(list: FieldError[], remap?: (field: string) => string | null): void {
    clear()
    for (const e of list) {
      const path = e.field ? (remap ? remap(e.field) : e.field) : null
      if (path) set(path, e.message)
      else general.value.push(e.message)
    }
  }

  function get(path: string): string {
    return map[path] ?? ''
  }

  /** 是否有以 prefix 开头的错误（prefix 本身、prefix.xxx、prefix[0]…） */
  function has(prefix: string): boolean {
    return Object.keys(map).some((k) => k === prefix || k.startsWith(`${prefix}.`) || k.startsWith(`${prefix}[`))
  }

  /** prefix 本身或其下第一个字段的错误（如 companions[1]、companions[1].name） */
  function first(prefix: string): string {
    if (map[prefix]) return map[prefix]
    const k = Object.keys(map).find((x) => x.startsWith(`${prefix}.`) || x.startsWith(`${prefix}[`))
    return k ? map[k] : ''
  }

  /** 清掉 prefix 本身及其下所有字段的错误 */
  function clearUnder(prefix: string): void {
    for (const k of Object.keys(map)) {
      if (k === prefix || k.startsWith(`${prefix}.`) || k.startsWith(`${prefix}[`)) delete map[k]
    }
  }

  const count = computed(() => Object.keys(map).length + general.value.length)

  return { map, general, clear, clearField, clearUnder, set, setAll, get, has, first, count }
}

export type FieldErrors = ReturnType<typeof useFieldErrors>

/** 把 “items[3].amountCents” 中的下标换掉 */
export function remapIndex(field: string, list: string, mapping: number[]): string | null {
  const m = new RegExp(`^${list}\\[(\\d+)\\](.*)$`).exec(field)
  if (!m) return field
  const ui = mapping[Number(m[1])]
  return ui === undefined ? null : `${list}[${ui}]${m[2]}`
}

/** 滚动到第一个标红的字段 */
export function scrollToError(): void {
  void nextTick(() => {
    setTimeout(() => {
      uni.pageScrollTo({ selector: '.field-err', duration: 200, offsetTop: -160, fail: () => {} } as UniApp.PageScrollToOptions)
    }, 50)
  })
}

/**
 * 表单保存 / 提交失败的统一处理：有字段错误时映射到表单项并滚动到第一个错误；
 * 409（草稿在别处修改等）弹窗并提供刷新；其余按错误码提示。
 * 返回 true 表示已映射到字段。
 */
export function applyApiError(
  fe: FieldErrors,
  err: unknown,
  opts: { remap?: (field: string) => string | null; onRefresh?: () => void } = {},
): boolean {
  const e = toApiError(err)
  if (e.errors.length && (e.code === 40000 || e.code === 42201)) {
    fe.setAll(e.errors, opts.remap)
    uni.hideLoading()
    toast(e.errors.length === 1 ? e.errors[0].message : `有 ${e.errors.length} 处需要修改`)
    scrollToError()
    return true
  }
  showError(e, { onRefresh: opts.onRefresh })
  return false
}
