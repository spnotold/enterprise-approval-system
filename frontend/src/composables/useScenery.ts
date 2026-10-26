import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import {
  LEAF_INTERVAL_MIN,
  LEAF_INTERVAL_SPREAD,
  MAX_GUSTS,
  MAX_LEAVES,
  gustFromPointer,
  isLeafGone,
  leafFlip,
  packGusts,
  pushGust,
  pushLeaf,
  spawnLeaf,
  stepLeaf,
  type Gust,
  type Leaf,
} from './sceneryMath'

export interface SceneryOptions {
  /** 风景图 */
  background: string
  /** 飘叶图（透明底） */
  leaves: string[]
  /** 盖在风景上的纸色薄层透明度，越大越淡 */
  veil?: number
}

const VERT = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }'

// 草地风纹：风景图按 cover 底边对齐画满；低频噪声往右平移形成一阵一阵的风带，
// 风带扫过的草（图片下部）微微倒伏、泛亮；鼠标风是从指针处出发、沿移动方向走的一道高斯带。
const FRAG = `
precision mediump float;
uniform sampler2D img;
uniform vec2 res, imgSize;
uniform float t, veil;
uniform vec3 page;
uniform vec4 gusts[${MAX_GUSTS}];
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 p = vec2(gl_FragCoord.x / res.x, 1.0 - gl_FragCoord.y / res.y);
  float s = max(res.x / imgSize.x, res.y / imgSize.y);
  vec2 shown = imgSize * s;
  vec2 uv = (p * res - vec2((res.x - shown.x) * 0.5, res.y - shown.y)) / shown;
  float grass = smoothstep(0.80, 0.90, uv.y);
  float x = p.x * res.x / res.y;
  float g = smoothstep(0.58, 0.95, noise(vec2(x * 1.1 - t * 0.32, t * 0.04 + uv.y * 1.5)));
  for (int i = 0; i < ${MAX_GUSTS}; i++) {
    vec4 q = gusts[i];
    float age = t - q.z;
    if (q.w > 0.0 && age > 0.0) {
      float d = x - (q.x * res.x / res.y + q.y * age * 0.55);
      g += q.w * exp(-d * d * 14.0) * exp(-age * 0.8);
    }
  }
  float blade = noise(vec2(uv.x * 380.0, uv.y * 26.0));
  float bend = clamp(g, 0.0, 1.4) * grass * (0.5 + 0.9 * blade);
  vec3 c = texture2D(img, uv + vec2(-bend * 0.0028, bend * 0.0012)).rgb;
  c = mix(c, c * 1.07 + vec3(0.04, 0.035, 0.0), bend * 0.5);
  gl_FragColor = vec4(mix(c, page, veil), 1.0);
}`

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function cssColor(name: string): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const m = /^#([0-9a-f]{6})$/i.exec(raw)
  if (!m) return [241 / 255, 236 / 255, 225 / 255]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** 草地画布：返回 null 表示 WebGL 不可用，退回 CSS 静态背景 */
function createMeadow(canvas: HTMLCanvasElement, bg: HTMLImageElement, veil: number) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, powerPreference: 'low-power' })
  if (!gl) return null
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const a = gl.getAttribLocation(prog, 'a')
  gl.enableVertexAttribArray(a)
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, bg)
  const u = (name: string) => gl.getUniformLocation(prog, name)
  gl.uniform2f(u('imgSize'), bg.naturalWidth, bg.naturalHeight)
  gl.uniform1f(u('veil'), veil)
  gl.uniform3f(u('page'), ...cssColor('--eas-desk'))
  return {
    resize(w: number, h: number) {
      canvas.width = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
      gl.uniform2f(u('res'), w, h)
    },
    draw(t: number, gusts: Float32Array) {
      gl.uniform1f(u('t'), t)
      gl.uniform4fv(u('gusts'), gusts)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

/**
 * 页面背景：铺满视口的淡色风景，风一阵阵吹过草地，偶尔飘过一片叶子；
 * 鼠标横向划动从指针处掀起一阵风，并推开附近的叶子。
 * 减弱动效或触屏（无悬停）时只画一帧静态风景；页面不可见时停帧。
 */
export function useScenery(meadowRef: Ref<HTMLCanvasElement | null>, leavesRef: Ref<HTMLCanvasElement | null>, options: SceneryOptions) {
  /** WebGL 草地是否在画；false 时由容器的 CSS 背景兜底 */
  const live = ref(false)
  let raf = 0
  let disposed = false
  let cleanup: (() => void) | undefined

  onMounted(async () => {
    const meadowCanvas = meadowRef.value
    const leafCanvas = leavesRef.value
    if (!meadowCanvas || !leafCanvas) return
    const still =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(hover: none)').matches
    let bg: HTMLImageElement
    let leafImgs: HTMLImageElement[]
    try {
      ;[bg, ...leafImgs] = await Promise.all([options.background, ...options.leaves].map(loadImage))
    } catch {
      return
    }
    if (disposed) return

    const meadow = createMeadow(meadowCanvas, bg, options.veil ?? 0.28)
    live.value = !!meadow
    const ctx = leafCanvas.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let W = 0
    let H = 0
    const resize = () => {
      W = window.innerWidth
      H = window.innerHeight
      meadow?.resize(Math.round(W * dpr), Math.round(H * dpr))
      leafCanvas.width = Math.round(W * dpr)
      leafCanvas.height = Math.round(H * dpr)
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (still) meadow?.draw(0, packGusts([]))
    }
    resize()

    const gusts: (Gust | null)[] = new Array(MAX_GUSTS).fill(null)
    let gustCursor = 0
    let lastGustAt = -Infinity
    let lastX: number | null = null
    const leaves: Leaf[] = []
    let nextLeaf = 2
    let last = performance.now()

    const onPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      const now = performance.now() / 1000
      const gust = lastX == null ? null : gustFromPointer(e.clientX, W, e.clientX - lastX, now, lastGustAt)
      lastX = e.clientX
      if (gust) {
        gustCursor = pushGust(gusts, gustCursor, gust)
        lastGustAt = now
      }
      for (const leaf of leaves) pushLeaf(leaf, e.clientX, e.clientY)
    }
    const onLeave = () => {
      lastX = null
    }
    const frame = (nowMs: number) => {
      raf = 0
      const dt = Math.min(0.05, (nowMs - last) / 1000)
      last = nowMs
      const t = nowMs / 1000
      meadow?.draw(t, packGusts(gusts))
      if (ctx) {
        ctx.clearRect(0, 0, W, H)
        if ((nextLeaf -= dt) <= 0 && leaves.length < MAX_LEAVES) {
          leaves.push(spawnLeaf(Math.random, H, leafImgs.length))
          nextLeaf = LEAF_INTERVAL_MIN + Math.random() * LEAF_INTERVAL_SPREAD
        }
        for (const leaf of leaves) {
          stepLeaf(leaf, dt, t)
          const img = leafImgs[leaf.kind]
          const h = (leaf.size * img.naturalHeight) / img.naturalWidth
          ctx.save()
          ctx.translate(leaf.x, leaf.y)
          ctx.rotate(leaf.rot)
          ctx.scale(leafFlip(leaf, t), 1)
          ctx.globalAlpha = 0.9
          ctx.drawImage(img, -leaf.size / 2, -h / 2, leaf.size, h)
          ctx.restore()
        }
        for (let i = leaves.length - 1; i >= 0; i--) if (isLeafGone(leaves[i], W, H)) leaves.splice(i, 1)
      }
      schedule()
    }
    const schedule = () => {
      if (!raf && !disposed && !still && document.visibilityState === 'visible') raf = requestAnimationFrame(frame)
    }
    const onVisibility = () => {
      last = performance.now()
      schedule()
    }

    window.addEventListener('resize', resize)
    if (!still) {
      // 开场先放两片叶子在半路，免得第一眼是空的
      leaves.push(spawnLeaf(Math.random, H, leafImgs.length, W * 0.25), spawnLeaf(Math.random, H, leafImgs.length, W * 0.7))
      window.addEventListener('pointermove', onPointer, { passive: true })
      document.documentElement.addEventListener('pointerleave', onLeave)
      document.addEventListener('visibilitychange', onVisibility)
      schedule()
    }
    cleanup = () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      meadow?.dispose()
    }
  })

  onBeforeUnmount(() => {
    disposed = true
    if (raf) cancelAnimationFrame(raf)
    cleanup?.()
  })

  return { live }
}
