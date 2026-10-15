// 字段级错误：客户端校验与服务端 errors[].field 用同一套路径（如 items[2].amountCents），
// 映射到对应表单项 / 表格单元格，并滚动到第一个错误。
import { computed, nextTick, reactive, ref, type Ref } from 'vue'
import type { ApiError } from '@/lib/http'
import type { FieldError } from '@/lib/types'

export interface FieldErrors {
  map: Record<string, string>
  /** 没有 field 的错误（如整单规则） */
  general: Ref<string[]>
  /** 顶部汇总列表 */
  summary: Ref<{ path: string | null; message: string }[]>
  has: Ref<boolean>
  get: (path: string) => string | undefined
  /** 某路径前缀下是否有错误，如 items[2] */
  hasPrefix: (prefix: string) => boolean
  set: (errors: Record<string, string>) => void
  fromApi: (err: ApiError) => boolean
  fromList: (errors: FieldError[]) => void
  clear: (path?: string) => void
  scrollToFirst: (container?: HTMLElement | null) => Promise<void>
}

/** 规范化路径：items.2.amountCents / items[2]['amountCents'] -> items[2].amountCents */
export function normalizePath(p: string): string {
  return p
    .replace(/\['([^']+)'\]/g, '.$1')
    .replace(/\.(\d+)(?=\.|$|\[)/g, '[$1]')
    .replace(/^\./, '')
}

export function useFieldErrors(): FieldErrors {
  const map = reactive<Record<string, string>>({})
  const general = ref<string[]>([])

  function clear(path?: string) {
    if (path) {
      delete map[path]
      return
    }
    for (const k of Object.keys(map)) delete map[k]
    general.value = []
  }

  function add(path: string | null | undefined, message: string) {
    if (!path) {
      if (!general.value.includes(message)) general.value.push(message)
      return
    }
    const p = normalizePath(path)
    map[p] = map[p] && !map[p].includes(message) ? `${map[p]}；${message}` : message
  }

  function set(errors: Record<string, string>) {
    clear()
    for (const [k, v] of Object.entries(errors)) add(k, v)
  }

  function fromList(errors: FieldError[]) {
    clear()
    for (const e of errors) add(e.field, e.message)
  }

  function fromApi(err: ApiError): boolean {
    if (!err.errors?.length) return false
    fromList(err.errors)
    return true
  }

  const summary = computed(() => [
    ...general.value.map((message) => ({ path: null, message })),
    ...Object.entries(map).map(([path, message]) => ({ path, message })),
  ])

  async function scrollToFirst(container?: HTMLElement | null) {
    await nextTick()
    const root: ParentNode = container ?? document
    const el = root.querySelector('.is-error, .field-error, .cell-error')
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const input = el.querySelector('input, textarea')
      if (input instanceof HTMLElement) input.focus({ preventScroll: true })
    }
  }

  return {
    map,
    general,
    summary,
    has: computed(() => general.value.length > 0 || Object.keys(map).length > 0),
    get: (path: string) => map[path],
    hasPrefix: (prefix: string) => Object.keys(map).some((k) => k === prefix || k.startsWith(`${prefix}.`) || k.startsWith(`${prefix}[`)),
    set,
    fromApi,
    fromList,
    clear,
    scrollToFirst,
  }
}
