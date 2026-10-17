/**
 * 滑动同意的手势状态机（纯函数）。组件把触摸 / 鼠标 / 键盘事件翻译成 SlideEvent，再执行返回的 effect。
 * - 只有正常抬起（end）且位置 ≥ 90% 才确认；系统打断（cancel，如 touchcancel、窗口失焦）一律回弹，绝不确认。
 * - 键盘路径需两次确认：第一次 Enter / 空格进入 armed，armed 时再按一次才确认，语义与滑到底等价。
 */

/** 松手时滑块位移达到最大距离的该比例才算确认 */
export const CONFIRM_RATIO = 0.9
/** 位移超过该像素才算拖动，否则视为单点 */
export const MOVE_SLOP = 4

export type SlidePhase = 'idle' | 'dragging' | 'armed' | 'confirmed'

export interface SlideState {
  phase: SlidePhase
  /** 滑块位移（px） */
  left: number
  startX: number
  startY: number
  moved: boolean
}

export type SlideEvent =
  | { type: 'start'; x: number; y: number }
  | { type: 'move'; x: number; y: number; maxLeft: number }
  /** 正常抬起：touchend / mouseup */
  | { type: 'end'; maxLeft: number }
  /** 被系统打断：touchcancel、窗口失焦等 */
  | { type: 'cancel' }
  /** Enter / 空格 */
  | { type: 'key'; maxLeft: number }
  /** 键盘待确认超时、失焦或按 Esc */
  | { type: 'disarm' }
  /** 提交失败等，由父组件复位 */
  | { type: 'reset' }

/** confirm：提交同意；hint：单点滑块，提示操作方式；arm：进入键盘待确认 */
export type SlideEffect = 'confirm' | 'hint' | 'arm' | null

export interface SlideStep {
  state: SlideState
  effect: SlideEffect
}

export function initialSlide(): SlideState {
  return { phase: 'idle', left: 0, startX: 0, startY: 0, moved: false }
}

const stay = (state: SlideState): SlideStep => ({ state, effect: null })

export function reduceSlide(s: SlideState, e: SlideEvent): SlideStep {
  if (e.type === 'reset') return stay(initialSlide())
  if (s.phase === 'confirmed') return stay(s)
  switch (e.type) {
    case 'start':
      return stay({ phase: 'dragging', left: 0, startX: e.x, startY: e.y, moved: false })
    case 'move': {
      if (s.phase !== 'dragging') return stay(s)
      const dx = e.x - s.startX
      const moved = s.moved || Math.abs(dx) > MOVE_SLOP || Math.abs(e.y - s.startY) > MOVE_SLOP
      return stay({ ...s, moved, left: Math.max(0, Math.min(e.maxLeft, dx)) })
    }
    case 'end':
      if (s.phase !== 'dragging') return stay(s)
      if (s.moved && e.maxLeft > 0 && s.left >= e.maxLeft * CONFIRM_RATIO) {
        return { state: { ...s, phase: 'confirmed', left: e.maxLeft }, effect: 'confirm' }
      }
      return { state: initialSlide(), effect: s.moved ? null : 'hint' }
    case 'cancel':
      return s.phase === 'dragging' ? stay(initialSlide()) : stay(s)
    case 'key':
      if (s.phase === 'dragging') return stay(s)
      if (s.phase === 'armed') return { state: { ...s, phase: 'confirmed', left: e.maxLeft }, effect: 'confirm' }
      return { state: { ...initialSlide(), phase: 'armed' }, effect: 'arm' }
    case 'disarm':
      return s.phase === 'armed' ? stay(initialSlide()) : stay(s)
  }
  return stay(s)
}
