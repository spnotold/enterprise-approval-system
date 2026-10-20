import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import {
  BROWNIAN_CURSOR_HEAT,
  RIPPLE_DURATION,
  RIPPLE_MAX_DISPLACEMENT,
  brownianStep,
  calcDotInfluence,
  calcDotOffset,
  calcDotRadius,
  calcTrailOffset,
  easeCursor,
  interpolateRgba,
  isSettled,
  parseHexColor,
  rippleAmplitude,
  rippleEmphasis,
  rippleOffset,
  rippleRadius,
  resizeBrownianField,
  stepBrownianDot,
  type BrownianField,
  type Rgba,
} from './paperMath'

export interface PaperFieldOptions {
  base?: Ref<string> | string
  radius?: number
  spacing?: number
  dotRadius?: number
  maxOffset?: number
  maxDotRadius?: number
  lightRadius?: number
  maxLightAlpha?: number
  /** 点阵是否做布朗运动（减弱动效 / 触屏下自动关闭） */
  ambient?: boolean
  container?:
    | Ref<HTMLElement | null | undefined>
    | HTMLElement
    | null
    | (() => HTMLElement | null | undefined)
}

export interface RippleItem {
  x: number
  y: number
  /** 涟漪起点时间戳（performance.now()） */
  t0: number
}

/** 同时存在的涟漪上限，超出时丢弃最早的 */
export const MAX_ACTIVE_RIPPLES = 3

/** 涟漪向 primary 插值时透明度上限（0.5，低于光标跟随的 0.55） */
const RIPPLE_MAX_DOT_ALPHA = 0.5

/**
 * 纯函数：追加涟漪；超过上限时丢弃最早的
 */
export function pushRipple(
  ripples: RippleItem[],
  ripple: RippleItem,
  max = MAX_ACTIVE_RIPPLES,
): RippleItem[] {
  const next = [...ripples, ripple]
  if (max > 0 && next.length > max) {
    next.splice(0, next.length - max)
  }
  return next
}

/**
 * 纯函数：移除超过生命周期的涟漪（默认 1000ms）
 */
export function pruneRipples(
  ripples: RippleItem[],
  now: number,
  duration = RIPPLE_DURATION,
): RippleItem[] {
  return ripples.filter((ripple) => now - ripple.t0 < duration)
}

export interface PaperClickAncestor {
  tagName: string
  role: string | null
  backgroundColor: string
  contentEditable?: boolean
}

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT'])
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'tab',
  'switch',
  'slider',
  'combobox',
  'option',
  'menuitem',
])

function alphaFromCssColor(color: string): number {
  const normalized = color.trim().toLowerCase()
  if (!normalized || normalized === 'transparent') return 0

  const functionMatch = normalized.match(/^[a-z][\w-]*\((.*)\)$/)
  if (!functionMatch) return 1

  const body = functionMatch[1]
  const slashAlpha = body.match(/\/\s*([+-]?(?:\d*\.)?\d+)%?\s*$/)
  if (slashAlpha) {
    const value = Number(slashAlpha[1])
    return slashAlpha[0].includes('%') ? value / 100 : value
  }

  if (normalized.startsWith('rgba(') || normalized.startsWith('hsla(')) {
    const parts = body.split(',')
    const rawAlpha = parts.at(-1)?.trim() ?? '1'
    const value = Number.parseFloat(rawAlpha)
    return rawAlpha.endsWith('%') ? value / 100 : value
  }

  return 1
}

/**
 * 纯函数：祖先链不包含交互元素或实色背景时，才视为格纸背景空白。
 * 调用方应从点击目标开始收集，并在背景容器本身之前停止。
 */
export function isPaperBackgroundChain(ancestors: PaperClickAncestor[]): boolean {
  return ancestors.every(({ tagName, role, backgroundColor, contentEditable }) => {
    if (INTERACTIVE_TAGS.has(tagName.toUpperCase())) return false
    if (role && INTERACTIVE_ROLES.has(role.toLowerCase())) return false
    if (contentEditable) return false
    return alphaFromCssColor(backgroundColor) <= 0
  })
}

/**
 * 判断 pointerdown 是否发生在背景空白处
 * 1. 排除按钮、链接、输入框、下拉框、单选/复选、标签页等可交互控件。
 * 2. 排除白底卡片、面板、表格、弹窗、抽屉等实色内容容器。
 * 3. 排除 Aside 内部的主体说明内容（.aside-inner）。
 * 4. 结合 document.elementsFromPoint 进行底层堆叠检测，确保点击区域下无内容承载元素。
 */
export function isBackgroundClick(e: PointerEvent, backgroundContainer?: HTMLElement | null): boolean {
  const target =
    typeof Element === 'undefined' || e.target instanceof Element ? (e.target as Element | null) : null
  if (!target) return false

  const ancestors: PaperClickAncestor[] = []
  let current: Element | null = target
  while (current && current !== backgroundContainer) {
    ancestors.push({
      tagName: current.tagName,
      role: current.getAttribute('role'),
      backgroundColor:
        typeof getComputedStyle === 'function' ? getComputedStyle(current).backgroundColor : '',
      contentEditable: current.hasAttribute('contenteditable'),
    })
    current = current.parentElement
  }

  if (!isPaperBackgroundChain(ancestors)) return false

  // 补充排除：保留历史选择器，覆盖 tabindex 等没有明确语义的控件。
  if (
    target.closest(
      'button, a, input, textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [tabindex]:not([tabindex="-1"])',
    )
  ) {
    return false
  }

  // 补充排除：保留历史内容容器白名单，兼容背景由伪元素绘制等情况。
  if (
    target.closest(
      '.el-card, .sheet, .part, .panel, .surface, .kpi, .el-table, .el-dialog, .el-drawer, .el-popover, .el-dropdown, .el-dropdown-menu, .el-menu, .header, .aside, .nav-drawer, .slip, .cell, .auth-box, .auth-main',
    )
  ) {
    return false
  }

  // 在 AuthShell 中，aside-inner 内包含说明文字、标题与签批示意。
  if (target.closest('.aside-inner')) {
    return false
  }

  // 补充进行底层堆叠检测。
  if (typeof document !== 'undefined' && typeof document.elementsFromPoint === 'function') {
    const stack = document.elementsFromPoint(e.clientX, e.clientY)
    for (const el of stack) {
      if (
        el.closest(
          '.el-card, .sheet, .part, .panel, .surface, .el-table, .el-dialog, .el-drawer, .auth-box, .slip, button, a, input, textarea, select',
        )
      ) {
        return false
      }
    }
  }

  return true
}

export function resolvePaperColors(baseProp = 'paper') {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const defaultRule = { r: 196, g: 201, b: 195 }
    const defaultPrimary = { r: 62, g: 92, b: 118 }
    return {
      baseColor: '#f2f3f0',
      baseDotColor: { ...defaultRule, a: 0.6 },
      primaryRgb: defaultPrimary,
      primaryDotColor: { ...defaultPrimary, a: 0.55 },
    }
  }

  const rootStyle = getComputedStyle(document.documentElement)
  const ruleStrongHex = rootStyle.getPropertyValue('--eas-rule-strong').trim() || '#c4c9c3'
  const primaryHex = rootStyle.getPropertyValue('--eas-primary').trim() || '#3e5c76'

  let baseColor = rootStyle.getPropertyValue('--eas-paper').trim() || '#f2f3f0'
  if (baseProp === 'deep' || baseProp === 'paper-deep' || baseProp.includes('deep')) {
    baseColor = rootStyle.getPropertyValue('--eas-paper-deep').trim() || '#e8eae5'
  } else if (baseProp.startsWith('--')) {
    baseColor = rootStyle.getPropertyValue(baseProp).trim() || baseColor
  } else if (baseProp.startsWith('var(')) {
    const varName = baseProp.replace(/^var\(\s*|\s*\)$/g, '')
    baseColor = rootStyle.getPropertyValue(varName).trim() || baseColor
  } else if (baseProp && baseProp !== 'paper') {
    baseColor = baseProp
  }

  const ruleRgb = parseHexColor(ruleStrongHex)
  const primaryRgb = parseHexColor(primaryHex)

  return {
    baseColor,
    baseDotColor: { ...ruleRgb, a: 0.6 } as Rgba,
    primaryRgb,
    primaryDotColor: { ...primaryRgb, a: 0.55 } as Rgba,
  }
}

/** 每帧涟漪状态草稿（复用对象，避免逐帧分配） */
interface RippleFrame {
  x: number
  y: number
  elapsed: number
  radius: number
  amplitude: number
}

/** 每帧需要重绘的点草稿（复用对象，避免逐帧分配） */
interface DynamicDot {
  x0: number
  y0: number
  x: number
  y: number
  emphasis: number
  rippleTint: boolean
}

export function usePaperField(
  canvasRef: Ref<HTMLCanvasElement | null>,
  options: PaperFieldOptions = {},
) {
  const radius = options.radius ?? 140
  const spacing = options.spacing ?? 20
  const dotRadius = options.dotRadius ?? 1
  const maxOffset = options.maxOffset ?? 3
  const maxDotRadius = options.maxDotRadius ?? 1.8
  const lightRadius = options.lightRadius ?? 220
  const maxLightAlpha = options.maxLightAlpha ?? 0.35
  // 涟漪脏矩形余量：覆盖擦除圆半径与位移后点半径
  const rippleDotPadding = Math.max(maxDotRadius, dotRadius + 1.5) + 1
  // 点阵的布朗运动：只在精细指针 + 非减弱动效时开启
  const ambientEnabled = options.ambient !== false
  const AMBIENT_FRAME_MS = 33
  const TRAIL_MAX = 2.4

  const isDegraded = ref(false)

  let offscreenCanvas: HTMLCanvasElement | null = null
  let resizeObserver: ResizeObserver | null = null
  let coarseQuery: MediaQueryList | null = null
  let motionQuery: MediaQueryList | null = null
  let dprQuery: MediaQueryList | null = null

  let rafId: number | null = null
  let containerEl: HTMLElement | null = null
  let disposed = false

  // 指针状态
  let targetX = 0
  let targetY = 0
  let curX = 0
  let curY = 0
  let isPointerInside = false
  let cursorStrength = 0
  let fadeStartTime: number | null = null
  let fadeStartStrength = 0
  let activeRipples: RippleItem[] = []
  const rippleFrames: RippleFrame[] = []
  const dynamicDots: DynamicDot[] = []
  // 光标拖尾：记录最近一次移动方向，快速拖动时点阵被轻轻带走
  let trailX = 0
  let trailY = 0
  let prevPointerX = 0
  let prevPointerY = 0
  let lastPointerMoveAt = 0
  let lastAmbientRender = 0
  // 每个点各自的布朗位移与速度，随网格尺寸重建
  let brownian: BrownianField | null = null
  let lastBrownianAt = 0

  // 尺寸缓存
  let width = 0
  let height = 0
  let dpr = 1

  function getBasePropValue(): string {
    if (!options.base) return 'paper'
    if (typeof options.base === 'string') return options.base
    return options.base.value || 'paper'
  }

  function checkDegraded(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
    if (!coarseQuery) {
      coarseQuery = window.matchMedia('(hover: none), (pointer: coarse)')
    }
    if (!motionQuery) {
      motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    }
    return Boolean(coarseQuery.matches || motionQuery.matches)
  }

  function stopLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (typeof window !== 'undefined') {
      const g = window as unknown as {
        __paperFieldPerf?: {
          durations: number[]
          activeRaf: boolean
        }
      }
      if (g.__paperFieldPerf) {
        g.__paperFieldPerf.activeRaf = false
      }
    }
  }

  function startLoop() {
    if (isDegraded.value) return
    if (typeof window !== 'undefined') {
      const g = window as unknown as {
        __paperFieldPerf?: {
          durations: number[]
          activeRaf: boolean
        }
      }
      g.__paperFieldPerf = g.__paperFieldPerf || { durations: [], activeRaf: false }
      g.__paperFieldPerf.activeRaf = true
    }
    if (rafId === null) {
      rafId = requestAnimationFrame(tick)
    }
  }

  function rebuildOffscreen() {
    if (width <= 0 || height <= 0) return
    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement('canvas')
    }
    offscreenCanvas.width = Math.round(width * dpr)
    offscreenCanvas.height = Math.round(height * dpr)

    const offCtx = offscreenCanvas.getContext('2d')
    if (!offCtx) return

    const colors = resolvePaperColors(getBasePropValue())

    offCtx.save()
    offCtx.scale(dpr, dpr)

    // 底色
    offCtx.fillStyle = colors.baseColor
    offCtx.fillRect(0, 0, width, height)

    // 静态点阵
    offCtx.fillStyle = `rgba(${colors.baseDotColor.r}, ${colors.baseDotColor.g}, ${colors.baseDotColor.b}, ${colors.baseDotColor.a})`
    offCtx.beginPath()
    for (let x = 0; x <= width; x += spacing) {
      for (let y = 0; y <= height; y += spacing) {
        offCtx.moveTo(x + dotRadius, y)
        offCtx.arc(x, y, dotRadius, 0, Math.PI * 2)
      }
    }
    offCtx.fill()
    offCtx.restore()
  }

  /**
   * 布朗模式：每个点在网格原位附近各自无规则地抖动，光标附近升温抖得更凶，再叠加吸附 / 拖尾 / 涟漪。
   * 基础点用一次 path 批量绘制，只有受影响的少数点逐点绘制，避免每帧上千次状态切换。
   */
  function renderAmbientFrame(now: number) {
    const canvas = canvasRef.value
    const field = brownian
    if (!canvas || !field || width <= 0 || height <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tStart = performance.now()
    const colors = resolvePaperColors(getBasePropValue())

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.fillStyle = colors.baseColor
    ctx.fillRect(0, 0, width, height)

    const curStrength = cursorStrength
    const hasCursor = curStrength > 0.001
    const trailSpeed = Math.hypot(trailX, trailY)
    const hasTrail = hasCursor && trailSpeed > 0.05

    // 收集本帧活跃的涟漪状态
    let rippleCount = 0
    for (const ripple of activeRipples) {
      const elapsed = now - ripple.t0
      if (elapsed < 0 || elapsed >= RIPPLE_DURATION) continue
      let frame = rippleFrames[rippleCount]
      if (!frame) {
        frame = { x: 0, y: 0, elapsed: 0, radius: 0, amplitude: 0 }
        rippleFrames[rippleCount] = frame
      }
      frame.x = ripple.x
      frame.y = ripple.y
      frame.elapsed = elapsed
      frame.radius = rippleRadius(elapsed)
      frame.amplitude = rippleAmplitude(elapsed)
      rippleCount++
    }

    // rAF 时间戳可能略早于上一次 performance.now()，负值按 0 处理
    const step = brownianStep(lastBrownianAt > 0 ? (now - lastBrownianAt) / 1000 : 0)
    lastBrownianAt = Math.max(lastBrownianAt, now)

    // 基础点阵：先批量画不受影响的点，受影响点留给逐点绘制
    let dotCount = 0
    ctx.fillStyle = `rgba(${colors.baseDotColor.r}, ${colors.baseDotColor.g}, ${colors.baseDotColor.b}, ${colors.baseDotColor.a})`
    ctx.beginPath()
    for (let col = 0; col < field.cols; col++) {
      const x0 = col * spacing
      for (let row = 0; row < field.rows; row++) {
        const y0 = row * spacing
        const i = col * field.rows + row
        let temperature = 1
        if (hasCursor) {
          const homeDist = Math.hypot(x0 - curX, y0 - curY)
          if (homeDist < radius) {
            temperature += BROWNIAN_CURSOR_HEAT * calcDotInfluence(homeDist, radius) * curStrength
          }
        }
        stepBrownianDot(field, i, step, temperature)
        const ax = x0 + field.x[i]
        const ay = y0 + field.y[i]
        let near = false
        let cursorDist = 0
        let cursorInfluence = 0

        if (hasCursor) {
          cursorDist = Math.hypot(ax - curX, ay - curY)
          if (cursorDist < radius) {
            cursorInfluence = calcDotInfluence(cursorDist, radius) * curStrength
            if (cursorInfluence > 0.001) near = true
          }
        }
        if (!near) {
          for (let i = 0; i < rippleCount; i++) {
            const frame = rippleFrames[i]
            if (Math.hypot(ax - frame.x, ay - frame.y) <= frame.radius + Math.max(frame.amplitude, RIPPLE_MAX_DISPLACEMENT) + rippleDotPadding) {
              near = true
              break
            }
          }
        }
        if (!near) {
          ctx.moveTo(ax + dotRadius, ay)
          ctx.arc(ax, ay, dotRadius, 0, Math.PI * 2)
          continue
        }

        let dot = dynamicDots[dotCount]
        if (!dot) {
          dot = { x0: 0, y0: 0, x: 0, y: 0, emphasis: 0, rippleTint: false }
          dynamicDots[dotCount] = dot
        }
        dot.x0 = ax
        dot.y0 = ay
        dot.x = ax
        dot.y = ay
        dot.emphasis = 0
        dot.rippleTint = false
        dotCount++
      }
    }
    ctx.fill()

    // 光标附近的白色径向光
    if (hasCursor) {
      const glowR = lightRadius
      const gradient = ctx.createRadialGradient(curX, curY, 0, curX, curY, glowR)
      const lightAlpha = maxLightAlpha * curStrength
      gradient.addColorStop(0, `rgba(255, 255, 255, ${lightAlpha.toFixed(3)})`)
      gradient.addColorStop(0.5, `rgba(255, 255, 255, ${(lightAlpha * 0.4).toFixed(3)})`)
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(curX - glowR, curY - glowR, glowR * 2, glowR * 2)
    }

    // 受影响点：吸附 + 拖尾 + 涟漪
    const rippleDotColor: Rgba = { ...colors.primaryRgb, a: RIPPLE_MAX_DOT_ALPHA }
    for (let i = 0; i < dotCount; i++) {
      const dot = dynamicDots[i]
      let cursorDist = 0
      let cursorInfluence = 0
      if (hasCursor) {
        cursorDist = Math.hypot(dot.x0 - curX, dot.y0 - curY)
        if (cursorDist < radius) {
          cursorInfluence = calcDotInfluence(cursorDist, radius) * curStrength
        }
      }

      let rippleDx = 0
      let rippleDy = 0
      let rippleStrength = 0
      for (let j = 0; j < rippleCount; j++) {
        const frame = rippleFrames[j]
        const dx = dot.x0 - frame.x
        const dy = dot.y0 - frame.y
        const dist = Math.hypot(dx, dy)
        if (dist > frame.radius) continue
        const offset = rippleOffset(dist, frame.radius, frame.elapsed)
        const emphasis = rippleEmphasis(offset)
        if (emphasis > rippleStrength) rippleStrength = emphasis
        if (dist > 0) {
          rippleDx += (dx / dist) * offset
          rippleDy += (dy / dist) * offset
        }
      }

      let x = dot.x0
      let y = dot.y0
      if (cursorInfluence > 0) {
        const attracted = calcDotOffset(dot.x0, dot.y0, curX, curY, cursorDist, maxOffset, cursorInfluence)
        x = attracted.x
        y = attracted.y
        if (hasTrail) {
          const trail = calcTrailOffset(trailX, trailY, cursorInfluence, TRAIL_MAX)
          x += trail.x
          y += trail.y
        }
      }
      dot.x = x + rippleDx
      dot.y = y + rippleDy
      dot.emphasis = Math.max(cursorInfluence, rippleStrength)
      dot.rippleTint = rippleStrength > cursorInfluence

      const tint = dot.rippleTint ? rippleDotColor : colors.primaryDotColor
      const col = interpolateRgba(colors.baseDotColor, tint, dot.emphasis)
      const r = calcDotRadius(dotRadius, maxDotRadius, dot.emphasis)
      ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${col.a})`
      ctx.beginPath()
      ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()

    if (typeof window !== 'undefined') {
      const renderDuration = performance.now() - tStart
      const g = window as unknown as {
        __paperFieldPerf?: {
          durations: number[]
          activeRaf: boolean
        }
      }
      if (g.__paperFieldPerf) {
        g.__paperFieldPerf.durations.push(renderDuration)
        if (g.__paperFieldPerf.durations.length > 120) {
          g.__paperFieldPerf.durations.shift()
        }
      }
    }
  }

  function renderFrame(now: number) {
    if (ambientEnabled && !isDegraded.value) {
      renderAmbientFrame(now)
      return
    }
    const canvas = canvasRef.value
    if (!canvas || !offscreenCanvas || width <= 0 || height <= 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const tStart = performance.now()
    const colors = resolvePaperColors(getBasePropValue())

    ctx.save()
    // 整体 blit 离屏图（包含底色和基础静态点阵）
    ctx.drawImage(offscreenCanvas, 0, 0)
    ctx.scale(dpr, dpr)

    const curStrength = cursorStrength
    const hasCursor = curStrength > 0.001

    // 收集本帧活跃的涟漪状态（波前 0.24px/ms，振幅线性衰减）
    let rippleCount = 0
    for (const ripple of activeRipples) {
      const elapsed = now - ripple.t0
      if (elapsed < 0 || elapsed >= RIPPLE_DURATION) continue
      let frame = rippleFrames[rippleCount]
      if (!frame) {
        frame = { x: 0, y: 0, elapsed: 0, radius: 0, amplitude: 0 }
        rippleFrames[rippleCount] = frame
      }
      frame.x = ripple.x
      frame.y = ripple.y
      frame.elapsed = elapsed
      frame.radius = rippleRadius(elapsed)
      frame.amplitude = rippleAmplitude(elapsed)
      rippleCount++
    }

    if (hasCursor || rippleCount > 0) {
      // 1. 脏矩形 = 光标影响区 ∪ 各涟漪（当前半径 + 振幅 + 点半径余量）外接矩形
      let dirtyMinX = Number.POSITIVE_INFINITY
      let dirtyMaxX = Number.NEGATIVE_INFINITY
      let dirtyMinY = Number.POSITIVE_INFINITY
      let dirtyMaxY = Number.NEGATIVE_INFINITY
      const extendDirty = (cx: number, cy: number, half: number) => {
        dirtyMinX = Math.min(dirtyMinX, cx - half)
        dirtyMaxX = Math.max(dirtyMaxX, cx + half)
        dirtyMinY = Math.min(dirtyMinY, cy - half)
        dirtyMaxY = Math.max(dirtyMaxY, cy + half)
      }
      if (hasCursor) extendDirty(curX, curY, radius)
      for (let i = 0; i < rippleCount; i++) {
        const frame = rippleFrames[i]
        extendDirty(frame.x, frame.y, frame.radius + Math.max(frame.amplitude, RIPPLE_MAX_DISPLACEMENT) + rippleDotPadding)
      }

      const minX = Math.max(0, Math.floor(dirtyMinX / spacing) * spacing)
      const maxX = Math.min(width, Math.ceil(dirtyMaxX / spacing) * spacing)
      const minY = Math.max(0, Math.floor(dirtyMinY / spacing) * spacing)
      const maxY = Math.min(height, Math.ceil(dirtyMaxY / spacing) * spacing)

      // 2. 收集需要重绘的点：位移 = 光标吸附位移 + 各涟漪径向位移之和
      let dotCount = 0
      for (let x0 = minX; x0 <= maxX; x0 += spacing) {
        for (let y0 = minY; y0 <= maxY; y0 += spacing) {
          let cursorDist = 0
          let cursorInfluence = 0
          if (hasCursor) {
            cursorDist = Math.hypot(x0 - curX, y0 - curY)
            if (cursorDist < radius) {
              cursorInfluence = calcDotInfluence(cursorDist, radius) * curStrength
            }
          }

          let rippleDx = 0
          let rippleDy = 0
          let rippleStrength = 0
          for (let i = 0; i < rippleCount; i++) {
            const frame = rippleFrames[i]
            const dx = x0 - frame.x
            const dy = y0 - frame.y
            const dist = Math.hypot(dx, dy)
            if (dist > frame.radius) continue
            const offset = rippleOffset(dist, frame.radius, frame.elapsed)
            const emphasis = rippleEmphasis(offset)
            if (emphasis > rippleStrength) rippleStrength = emphasis
            if (dist > 0) {
              rippleDx += (dx / dist) * offset
              rippleDy += (dy / dist) * offset
            }
          }

          if (cursorInfluence <= 0 && rippleStrength <= 0) continue

          let dot = dynamicDots[dotCount]
          if (!dot) {
            dot = { x0: 0, y0: 0, x: 0, y: 0, emphasis: 0, rippleTint: false }
            dynamicDots[dotCount] = dot
          }
          let x = x0
          let y = y0
          if (cursorInfluence > 0) {
            const attracted = calcDotOffset(x0, y0, curX, curY, cursorDist, maxOffset, cursorInfluence)
            x = attracted.x
            y = attracted.y
          }
          dot.x0 = x0
          dot.y0 = y0
          dot.x = x + rippleDx
          dot.y = y + rippleDy
          dot.emphasis = Math.max(cursorInfluence, rippleStrength)
          dot.rippleTint = rippleStrength > cursorInfluence
          dotCount++
        }
      }

      // 3. 用底色圆擦掉原点位上的静态点
      if (dotCount > 0) {
        const eraseRadius = dotRadius + 1.5
        ctx.fillStyle = colors.baseColor
        ctx.beginPath()
        for (let i = 0; i < dotCount; i++) {
          const dot = dynamicDots[i]
          ctx.moveTo(dot.x0 + eraseRadius, dot.y0)
          ctx.arc(dot.x0, dot.y0, eraseRadius, 0, Math.PI * 2)
        }
        ctx.fill()
      }

      // 4. 光标附近的白色径向光（半径 220px，透明度 ≤ 0.35）
      if (hasCursor) {
        const glowR = lightRadius
        const gradient = ctx.createRadialGradient(curX, curY, 0, curX, curY, glowR)
        const lightAlpha = maxLightAlpha * curStrength
        gradient.addColorStop(0, `rgba(255, 255, 255, ${lightAlpha.toFixed(3)})`)
        gradient.addColorStop(0.5, `rgba(255, 255, 255, ${(lightAlpha * 0.4).toFixed(3)})`)
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

        ctx.fillStyle = gradient
        ctx.fillRect(curX - glowR, curY - glowR, glowR * 2, glowR * 2)
      }

      // 5. 重绘动态点：强调强度取光标影响与涟漪强调的较大值
      const rippleDotColor: Rgba = { ...colors.primaryRgb, a: RIPPLE_MAX_DOT_ALPHA }
      for (let i = 0; i < dotCount; i++) {
        const dot = dynamicDots[i]
        const tint = dot.rippleTint ? rippleDotColor : colors.primaryDotColor
        const col = interpolateRgba(colors.baseDotColor, tint, dot.emphasis)
        const r = calcDotRadius(dotRadius, maxDotRadius, dot.emphasis)

        ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${col.a})`
        ctx.beginPath()
        ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    ctx.restore()

    if (typeof window !== 'undefined') {
      const renderDuration = performance.now() - tStart
      const g = window as unknown as {
        __paperFieldPerf?: {
          durations: number[]
          activeRaf: boolean
        }
      }
      if (g.__paperFieldPerf) {
        g.__paperFieldPerf.durations.push(renderDuration)
        if (g.__paperFieldPerf.durations.length > 120) {
          g.__paperFieldPerf.durations.shift()
        }
      }
    }
  }

  function tick(now: number) {
    // 1. 影响强度更新
    if (isPointerInside) {
      if (cursorStrength < 1) {
        cursorStrength = Math.min(1, cursorStrength + 0.1)
      }
    } else {
      if (fadeStartTime !== null) {
        const elapsed = now - fadeStartTime
        cursorStrength = Math.max(0, fadeStartStrength * (1 - elapsed / 300))
        if (cursorStrength <= 0.001) {
          cursorStrength = 0
        }
      } else {
        cursorStrength = 0
      }
    }

    // 2. 光标缓动
    curX = easeCursor(curX, targetX, 0.18)
    curY = easeCursor(curY, targetY, 0.18)
    if (isSettled({ x: curX, y: curY }, { x: targetX, y: targetY }, 0.5)) {
      curX = targetX
      curY = targetY
    }

    // 2b. 指针停下后拖尾缓慢消失
    if (now - lastPointerMoveAt > 60) {
      trailX *= 0.9
      trailY *= 0.9
      if (Math.abs(trailX) < 0.02) trailX = 0
      if (Math.abs(trailY) < 0.02) trailY = 0
    }

    // 3. 涟漪清理（每个涟漪 1000ms 后移除）
    activeRipples = pruneRipples(activeRipples, now)

    // 4. 绘制本帧
    if (ambientEnabled && !isDegraded.value) {
      const active = isPointerInside || activeRipples.length > 0
      // 静止时把布朗运动降到约 30fps，交互时恢复逐帧，兼顾细腻与功耗
      if (!active && now - lastAmbientRender < AMBIENT_FRAME_MS) {
        rafId = requestAnimationFrame(tick)
        return
      }
      lastAmbientRender = now
      renderFrame(now)
      if (typeof document !== 'undefined' && document.hidden) {
        rafId = null
        stopLoop()
        return
      }
      rafId = requestAnimationFrame(tick)
      return
    }

    renderFrame(now)

    // 5. 判断是否可以停止 rAF
    const hasRipples = activeRipples.length > 0
    const cursorIsSettled = Math.abs(targetX - curX) < 0.5 && Math.abs(targetY - curY) < 0.5
    const strengthIsSettled =
      (isPointerInside && cursorStrength >= 0.999) || (!isPointerInside && cursorStrength <= 0.001)

    if (!hasRipples && cursorIsSettled && strengthIsSettled) {
      rafId = null
      stopLoop()
      return
    }

    rafId = requestAnimationFrame(tick)
  }

  function onPointerMove(e: PointerEvent) {
    if (isDegraded.value) return
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    targetX = e.clientX - rect.left
    targetY = e.clientY - rect.top

    const now = performance.now()
    if (lastPointerMoveAt > 0) {
      const dx = Math.max(-14, Math.min(14, targetX - prevPointerX))
      const dy = Math.max(-14, Math.min(14, targetY - prevPointerY))
      trailX = trailX * 0.62 + dx * 0.38
      trailY = trailY * 0.62 + dy * 0.38
    }
    prevPointerX = targetX
    prevPointerY = targetY
    lastPointerMoveAt = now

    if (!isPointerInside) {
      isPointerInside = true
      fadeStartTime = null
      if (cursorStrength <= 0.001) {
        curX = targetX
        curY = targetY
      }
    }
    startLoop()
  }

  function onPointerLeave() {
    if (isDegraded.value) return
    isPointerInside = false
    fadeStartTime = performance.now()
    fadeStartStrength = cursorStrength
    lastPointerMoveAt = 0
    startLoop()
  }

  function onPointerDown(e: PointerEvent) {
    if (isDegraded.value) return
    const canvas = canvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    targetX = e.clientX - rect.left
    targetY = e.clientY - rect.top

    if (isBackgroundClick(e, containerEl)) {
      activeRipples = pushRipple(activeRipples, {
        x: targetX,
        y: targetY,
        t0: performance.now(),
      })
      startLoop()
    }
  }

  function onVisibilityChange() {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      stopLoop()
    } else {
      if (!isDegraded.value && (ambientEnabled || isPointerInside || activeRipples.length > 0)) {
        startLoop()
      }
    }
  }

  function onMediaChange() {
    const degraded = checkDegraded()
    if (degraded !== isDegraded.value) {
      isDegraded.value = degraded
      if (degraded) {
        detachPointerListeners()
        stopLoop()
        cursorStrength = 0
        activeRipples = []
        renderFrame(performance.now())
      } else {
        attachPointerListeners()
        if (ambientEnabled) startLoop()
      }
    }
  }

  function onDprChange() {
    if (disposed) return
    updateSize()
    registerDprListener()
  }

  function resolveContainer(): HTMLElement | null {
    let el: HTMLElement | null = null
    if (options.container) {
      if (typeof options.container === 'function') {
        el = options.container() ?? null
      } else if ('value' in options.container) {
        el = options.container.value ?? null
      } else {
        el = options.container
      }
    }
    return el || canvasRef.value?.parentElement || null
  }

  function attachPointerListeners() {
    const el = containerEl || resolveContainer()
    if (!el || isDegraded.value) return
    containerEl = el
    el.addEventListener('pointermove', onPointerMove, { passive: true })
    el.addEventListener('pointerleave', onPointerLeave, { passive: true })
    el.addEventListener('pointerdown', onPointerDown, { passive: true })
  }

  function detachPointerListeners() {
    if (!containerEl) return
    containerEl.removeEventListener('pointermove', onPointerMove)
    containerEl.removeEventListener('pointerleave', onPointerLeave)
    containerEl.removeEventListener('pointerdown', onPointerDown)
    containerEl = null
  }

  function addMediaListener(mql: MediaQueryList | null, handler: () => void) {
    if (!mql) return
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler)
    } else if (typeof (mql as unknown as { addListener?: (h: () => void) => void }).addListener === 'function') {
      (mql as unknown as { addListener: (h: () => void) => void }).addListener(handler)
    }
  }

  function removeMediaListener(mql: MediaQueryList | null, handler: () => void) {
    if (!mql) return
    if (typeof mql.removeEventListener === 'function') {
      mql.removeEventListener('change', handler)
    } else if (typeof (mql as unknown as { removeListener?: (h: () => void) => void }).removeListener === 'function') {
      (mql as unknown as { removeListener: (h: () => void) => void }).removeListener(handler)
    }
  }

  function registerDprListener() {
    removeMediaListener(dprQuery, onDprChange)
    dprQuery = null

    if (disposed || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const currentDpr = window.devicePixelRatio || 1
    dprQuery = window.matchMedia(`(resolution: ${currentDpr}dppx)`)
    addMediaListener(dprQuery, onDprChange)
  }

  function updateSize() {
    const canvas = canvasRef.value
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const newWidth = rect.width
    const newHeight = rect.height
    const newDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1

    if (newWidth <= 0 || newHeight <= 0) return
    if (newWidth === width && newHeight === height && newDpr === dpr) return

    width = newWidth
    height = newHeight
    dpr = newDpr

    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    if (ambientEnabled) {
      // 与渲染循环 x0 <= width 的取点一致
      brownian = resizeBrownianField(brownian, Math.floor(width / spacing) + 1, Math.floor(height / spacing) + 1)
    }

    rebuildOffscreen()
    renderFrame(performance.now())
  }

  function init() {
    disposed = false
    isDegraded.value = checkDegraded()

    addMediaListener(coarseQuery, onMediaChange)
    addMediaListener(motionQuery, onMediaChange)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    const canvas = canvasRef.value
    if (canvas) {
      updateSize()
      registerDprListener()
      const targetObserved = resolveContainer() || canvas.parentElement
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          if (disposed) return
          updateSize()
        })
        if (targetObserved) resizeObserver.observe(targetObserved)
      }

      if (!isDegraded.value) {
        attachPointerListeners()
        if (ambientEnabled) startLoop()
      }
    }
  }

  function cleanup() {
    disposed = true
    stopLoop()
    detachPointerListeners()
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    removeMediaListener(coarseQuery, onMediaChange)
    removeMediaListener(motionQuery, onMediaChange)
    removeMediaListener(dprQuery, onDprChange)
    dprQuery = null
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }

  onMounted(() => {
    init()
  })

  onBeforeUnmount(() => {
    cleanup()
  })

  if (options.base && typeof options.base === 'object' && 'value' in options.base) {
    watch(options.base, () => {
      rebuildOffscreen()
      renderFrame(performance.now())
    })
  }

  return {
    isDegraded,
    updateSize,
    stopLoop,
    startLoop,
  }
}
