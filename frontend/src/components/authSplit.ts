// 登录 / 注册页左右分栏宽度的纯逻辑：范围夹紧、localStorage 读写、键盘步进
// 见 docs/ui_design.md 第 6 节「Web：登录页分栏可拖动」；组件只负责事件和样式

/** 表单栏默认宽度（px），双击分界线复位到这个值 */
export const AUTH_FORM_WIDTH_DEFAULT = 540
/** 表单栏最小宽度（px） */
export const AUTH_FORM_WIDTH_MIN = 380
/** 左侧桌面最小宽度（px） */
export const AUTH_ASIDE_WIDTH_MIN = 360
/** 表单栏最多占视口的比例 */
export const AUTH_FORM_WIDTH_MAX_RATIO = 0.6
/** 表单栏宽度的 localStorage 键 */
export const AUTH_SPLIT_STORAGE_KEY = 'eas.auth.formWidth'
/** 方向键每步（px） */
export const AUTH_SPLIT_KEY_STEP = 16

/** 只用到的 localStorage 子集，方便测试注入 */
export interface SplitStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const WIDTH_PATTERN = /^[+-]?\d+(?:\.\d+)?$/

/** 真正可用的 localStorage；不可用（无窗口、被禁用、读属性抛错）时返回 null */
function defaultStorage(): SplitStorage | null {
  try {
    return (globalThis as { localStorage?: SplitStorage }).localStorage ?? null
  } catch {
    return null
  }
}

function resolveStorage(storage?: SplitStorage | null): SplitStorage | null {
  return storage === undefined ? defaultStorage() : storage
}

/**
 * 表单栏允许的最大宽度：不超过 60vw，同时给左栏至少留 360px。
 * 视口过窄时结果会小于最小宽度，由 clampFormWidth 兜底成 AUTH_FORM_WIDTH_MIN。
 */
export function maxFormWidth(viewportWidth: number): number {
  const viewport = Number.isFinite(viewportWidth) ? viewportWidth : 0
  return Math.floor(
    Math.min(viewport * AUTH_FORM_WIDTH_MAX_RATIO, viewport - AUTH_ASIDE_WIDTH_MIN),
  )
}

/** 把表单栏宽度夹进 [380, min(60vw, 视口−360)]；视口太窄时以 380 为准 */
export function clampFormWidth(width: number, viewportWidth: number): number {
  const target = typeof width === 'number' && !Number.isNaN(width) ? width : AUTH_FORM_WIDTH_DEFAULT
  const max = maxFormWidth(viewportWidth)
  if (max <= AUTH_FORM_WIDTH_MIN) return AUTH_FORM_WIDTH_MIN
  return Math.min(Math.max(target, AUTH_FORM_WIDTH_MIN), max)
}

/** 读记忆的宽度；键不存在、值不合法、storage 不可用都返回 null（不抛错） */
export function readFormWidth(storage?: SplitStorage | null): number | null {
  const store = resolveStorage(storage)
  if (!store) return null
  try {
    const raw = store.getItem(AUTH_SPLIT_STORAGE_KEY)
    if (raw === null) return null
    const text = raw.trim()
    if (!WIDTH_PATTERN.test(text)) return null
    const width = Number(text)
    if (!Number.isFinite(width) || width <= 0) return null
    return width
  } catch {
    return null
  }
}

/** 把宽度写进 localStorage；storage 不可用或写入失败时静默忽略 */
export function writeFormWidth(width: number, storage?: SplitStorage | null): void {
  if (!Number.isFinite(width) || width <= 0) return
  const store = resolveStorage(storage)
  if (!store) return
  try {
    store.setItem(AUTH_SPLIT_STORAGE_KEY, String(width))
  } catch {
    // 隐私模式等场景写入会抛错，忽略即可
  }
}

/** 首屏宽度：记忆值按当前视口夹紧，没有记忆就用默认 540 */
export function initialFormWidth(viewportWidth: number, storage?: SplitStorage | null): number {
  return clampFormWidth(readFormWidth(storage) ?? AUTH_FORM_WIDTH_DEFAULT, viewportWidth)
}

/**
 * 手柄上的键盘调整：左 / 右方向键每次 ∓16px，Home / End 到最小 / 最大宽度；
 * 其余按键返回 null，表示不接管。
 */
export function stepFormWidth(key: string, width: number, viewportWidth: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return clampFormWidth(width - AUTH_SPLIT_KEY_STEP, viewportWidth)
    case 'ArrowRight':
      return clampFormWidth(width + AUTH_SPLIT_KEY_STEP, viewportWidth)
    case 'Home':
      return clampFormWidth(AUTH_FORM_WIDTH_MIN, viewportWidth)
    case 'End':
      return clampFormWidth(maxFormWidth(viewportWidth), viewportWidth)
    default:
      return null
  }
}
