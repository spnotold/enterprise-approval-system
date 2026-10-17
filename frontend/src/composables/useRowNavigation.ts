// 列表行导航（docs/ui_design.md 第 6 节）：
// - 整行单击进入详情（el-table 的 row-click），点击行内链接 / 按钮等交互元素时不触发；
// - 按住 Ctrl / ⌘ 点击，或鼠标中键点击行，在新标签页打开。
import { onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'

/** 行内不需要触发行跳转的交互元素 */
const INTERACTIVE = 'a, button, input, textarea, select, label, .el-select, .el-dropdown, .el-switch, .el-checkbox, .el-radio'

export interface RowNavigationOptions<T> {
  /** 行的跳转目标 */
  target: (row: T) => RouteLocationRaw
  /** 当前页记录（中键点击时按 DOM 行序定位记录） */
  rows: Ref<readonly T[]>
  /** 可选：返回 false 时禁用跳转（如加载中） */
  enabled?: () => boolean
}

export function useRowNavigation<T>(options: RowNavigationOptions<T>) {
  const router = useRouter()
  /** 绑定到包裹 el-table 的元素上，用于监听中键点击 */
  const wrap = shallowRef<HTMLElement | null>(null)

  function open(row: T) {
    if (options.enabled && !options.enabled()) return
    void router.push(options.target(row))
  }

  function openInNewTab(row: T) {
    if (options.enabled && !options.enabled()) return
    window.open(router.resolve(options.target(row)).href, '_blank', 'noopener')
  }

  /** el-table @row-click 处理器 */
  function onRowClick(row: T, _column: unknown, event: Event) {
    const e = event as MouseEvent
    const el = e.target as HTMLElement | null
    // 用户拖选编号、标题等文字时不应在松开鼠标后离开列表。
    if (e.button !== 0 || el?.closest?.(INTERACTIVE) || window.getSelection()?.toString()) return
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      openInNewTab(row)
      return
    }
    open(row)
  }

  function rowFromEvent(e: Event): T | null {
    const el = e.target as HTMLElement | null
    if (el?.closest?.(INTERACTIVE)) return null
    const tr = el?.closest?.('.eas-row-clickable tr.el-table__row')
    const tbody = tr?.parentElement
    if (!tr || !tbody) return null
    const index = Array.prototype.indexOf.call(tbody.children, tr)
    return options.rows.value[index] ?? null
  }

  function onAuxClick(e: MouseEvent) {
    if (e.button !== 1) return
    const row = rowFromEvent(e)
    if (!row) return
    e.preventDefault()
    openInNewTab(row)
  }

  function onMouseDown(e: MouseEvent) {
    // 阻止中键按下触发浏览器自动滚动
    if (e.button === 1 && rowFromEvent(e)) e.preventDefault()
  }

  function onKeyDown(e: KeyboardEvent) {
    // 子链接和按钮保留自己的键盘行为；行本身支持回车和空格。
    if (e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return
    const row = rowFromEvent(e)
    if (!row) return
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) openInNewTab(row)
    else open(row)
  }

  function makeRowsFocusable() {
    wrap.value?.querySelectorAll<HTMLElement>('.eas-row-clickable tr.el-table__row').forEach((row) => {
      row.tabIndex = 0
    })
  }
  // el-table 在异步加载、分页和错误重试后重建行，焦点属性随之更新。
  let observer: MutationObserver | undefined
  onMounted(() => {
    wrap.value?.addEventListener('auxclick', onAuxClick)
    wrap.value?.addEventListener('mousedown', onMouseDown)
    wrap.value?.addEventListener('keydown', onKeyDown)
    makeRowsFocusable()
    if (wrap.value) {
      observer = new MutationObserver(makeRowsFocusable)
      observer.observe(wrap.value, { childList: true, subtree: true })
    }
  })
  onBeforeUnmount(() => {
    wrap.value?.removeEventListener('auxclick', onAuxClick)
    wrap.value?.removeEventListener('mousedown', onMouseDown)
    wrap.value?.removeEventListener('keydown', onKeyDown)
    observer?.disconnect()
  })

  return { wrap, open, openInNewTab, onRowClick }
}
