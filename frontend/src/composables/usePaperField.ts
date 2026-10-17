import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import {
  calcDotInfluence,
  calcDotOffset,
  calcDotRadius,
  calcRippleProgress,
  easeCursor,
  interpolateRgba,
  isSettled,
  parseHexColor,
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
  container?:
    | Ref<HTMLElement | null | undefined>
    | HTMLElement
    | null
    | (() => HTMLElement | null | undefined)
}

export interface RippleItem {
  x: number
  y: number
  startTime: number
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

  function renderFrame(now: number) {
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

    if (curStrength > 0.001) {
      const activeRadius = radius
      const minX = Math.max(0, Math.floor((curX - activeRadius) / spacing) * spacing)
      const maxX = Math.min(width, Math.ceil((curX + activeRadius) / spacing) * spacing)
      const minY = Math.max(0, Math.floor((curY - activeRadius) / spacing) * spacing)
      const maxY = Math.min(height, Math.ceil((curY + activeRadius) / spacing) * spacing)

      // 1. 擦除动态区域内的静态点（用底色圆盖住原点位）
      ctx.fillStyle = colors.baseColor
      ctx.beginPath()
      for (let x0 = minX; x0 <= maxX; x0 += spacing) {
        for (let y0 = minY; y0 <= maxY; y0 += spacing) {
          const d = Math.hypot(x0 - curX, y0 - curY)
          if (d < activeRadius) {
            ctx.moveTo(x0 + dotRadius + 1.5, y0)
            ctx.arc(x0, y0, dotRadius + 1.5, 0, Math.PI * 2)
          }
        }
      }
      ctx.fill()

      // 2. 绘制白色径向光（半径 220px，透明度 ≤ 0.35）
      const glowR = lightRadius
      const gradient = ctx.createRadialGradient(curX, curY, 0, curX, curY, glowR)
      const lightAlpha = maxLightAlpha * curStrength
      gradient.addColorStop(0, `rgba(255, 255, 255, ${lightAlpha.toFixed(3)})`)
      gradient.addColorStop(0.5, `rgba(255, 255, 255, ${(lightAlpha * 0.4).toFixed(3)})`)
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

      ctx.fillStyle = gradient
      ctx.fillRect(curX - glowR, curY - glowR, glowR * 2, glowR * 2)

      // 3. 绘制受光标吸引与变大、变黛蓝的点
      for (let x0 = minX; x0 <= maxX; x0 += spacing) {
        for (let y0 = minY; y0 <= maxY; y0 += spacing) {
          const d = Math.hypot(x0 - curX, y0 - curY)
          if (d < activeRadius) {
            const influence = calcDotInfluence(d, activeRadius) * curStrength
            const { x, y } = calcDotOffset(x0, y0, curX, curY, d, maxOffset, influence)
            const r = calcDotRadius(dotRadius, maxDotRadius, influence)
            const col = interpolateRgba(colors.baseDotColor, colors.primaryDotColor, influence)

            ctx.fillStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${col.a})`
            ctx.beginPath()
            ctx.arc(x, y, r, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }

    // 4. 绘制点击波纹细环
    if (activeRipples.length > 0) {
      ctx.lineWidth = 1
      for (const ripple of activeRipples) {
        const elapsed = now - ripple.startTime
        const { radius: r, alpha, done } = calcRippleProgress(elapsed, 500, 90, 0.25)
        if (!done && alpha > 0.005) {
          ctx.strokeStyle = `rgba(${colors.primaryRgb.r}, ${colors.primaryRgb.g}, ${colors.primaryRgb.b}, ${alpha})`
          ctx.beginPath()
          ctx.arc(ripple.x, ripple.y, r, 0, Math.PI * 2)
          ctx.stroke()
        }
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

    // 3. 点击环更新与清理
    activeRipples = activeRipples.filter((r) => now - r.startTime < 500)

    // 4. 绘制本帧
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
      activeRipples.push({
        x: targetX,
        y: targetY,
        startTime: performance.now(),
      })
      startLoop()
    }
  }

  function onVisibilityChange() {
    if (typeof document === 'undefined') return
    if (document.hidden) {
      stopLoop()
    } else {
      if (!isDegraded.value && (isPointerInside || activeRipples.length > 0)) {
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
