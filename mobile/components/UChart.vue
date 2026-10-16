<script setup lang="ts">
// uCharts 封装：小程序用 type="2d" 的 canvas（同层渲染，不会盖住弹层），H5 用 uni 的 canvas 上下文。
// 点击图表显示提示框。数值请同时在页面上以文字 / 卡片给出（图表只作辅助）。
import { getCurrentInstance, nextTick, onMounted, onUnmounted, watch } from 'vue'
import uCharts from '@qiun/ucharts'
import type { ChartData } from '@/utils/chart'

const props = withDefaults(
  defineProps<{
    type: 'ring' | 'pie' | 'column' | 'bar' | 'line'
    data: ChartData
    /** 额外的 uCharts 配置，坐标轴、图例、extra 与默认值合并，其余浅合并 */
    opts?: Record<string, unknown>
    /** 图表高度，rpx */
    height?: number
  }>(),
  { opts: () => ({}), height: 480 },
)

// canvas 读不到 CSS 变量，这里的色值是 styles/tokens.css 中同名 token 的镜像，改 token 时需同步
const INK = '#22303a'
const INK_2 = '#5e6b73'
const RULE = '#daddd8'
const RULE_STRONG = '#c4c9c3'
const SURFACE = '#ffffff'
// 序列色（docs/ui_design.md 第 2 节）：黛蓝、苔绿、土黄、赭、灰、浅黛
const SERIES_COLORS = ['#3e5c76', '#4f7a5c', '#a27b2c', '#9c4a3e', '#7a858c', '#8a9fb3']

const BASE_X_AXIS = { disableGrid: true, fontColor: INK_2, fontSize: 12, axisLineColor: RULE_STRONG }
const BASE_Y_AXIS = { gridType: 'dash', gridColor: RULE, dashLength: 4, data: [{ min: 0, fontColor: INK_2, fontSize: 12 }] }
const BASE_LEGEND = { position: 'bottom', fontSize: 12, fontColor: INK_2 }
const BASE_TOOLTIP = {
  showArrow: false,
  bgColor: INK,
  bgOpacity: 0.94,
  fontColor: SURFACE,
  borderRadius: 2,
  gridColor: RULE_STRONG,
}
const BASE_TYPE_EXTRA: Record<string, Record<string, unknown>> = {
  ring: { borderWidth: 2, borderColor: SURFACE, centerColor: SURFACE },
  pie: { borderWidth: 2, borderColor: SURFACE },
  column: { activeBgColor: INK, activeBgOpacity: 0.06 },
}

const uid = `uc${Math.random().toString(36).slice(2, 10)}`
const instance = getCurrentInstance()
let chart: uCharts | null = null
let disposed = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 页面传入的坐标轴配置只覆盖自己写的字段，不丢掉默认配色 */
function mergeAxis(base: Record<string, unknown>, override: unknown): Record<string, unknown> {
  if (!isRecord(override)) return base
  const merged: Record<string, unknown> = { ...base, ...override }
  const baseData: unknown = base.data
  const overrideData: unknown = override.data
  if (Array.isArray(baseData) && Array.isArray(overrideData)) {
    merged.data = overrideData.map((item: unknown, index) => ({
      ...(isRecord(baseData[index]) ? baseData[index] : {}),
      ...(isRecord(item) ? item : {}),
    }))
  }
  return merged
}

function baseOptions(): Record<string, unknown> {
  // uCharts 会改写传入的 series（附加内部字段），传深拷贝，避免触发响应式监听而反复重绘
  const data = JSON.parse(JSON.stringify(props.data)) as ChartData
  const { xAxis, yAxis, legend, extra, ...rest } = props.opts
  const extraOptions = isRecord(extra) ? extra : {}
  const typeExtra: unknown = extraOptions[props.type]
  const typeOptions = isRecord(typeExtra) ? typeExtra : {}
  return {
    type: props.type,
    categories: data.categories ?? [],
    series: data.series,
    animation: false,
    background: SURFACE,
    color: SERIES_COLORS,
    padding: [12, 12, 4, 4],
    fontSize: 12,
    fontColor: INK_2,
    dataLabel: props.type === 'ring' || props.type === 'pie',
    enableScroll: false,
    ...rest,
    legend: {
      show: props.data.series.length > 1 || props.type === 'ring' || props.type === 'pie',
      ...mergeAxis(BASE_LEGEND, legend),
    },
    xAxis: mergeAxis(BASE_X_AXIS, xAxis),
    yAxis: mergeAxis(BASE_Y_AXIS, yAxis),
    // uCharts 构造器直接读取 extra.ring / extra.pie.labelWidth，必须初始化对应图形配置。
    extra: {
      tooltip: BASE_TOOLTIP,
      ...extraOptions,
      [props.type]: { ...BASE_TYPE_EXTRA[props.type], ...typeOptions },
    },
  }
}

function paint(): void {
  if (disposed || !instance) return
  // #ifdef MP-WEIXIN
  uni
    .createSelectorQuery()
    .in(instance.proxy)
    .select(`#${uid}`)
    .fields({ node: true, size: true }, () => {})
    .exec((res: { node?: { getContext(t: string): unknown; width: number; height: number }; width: number; height: number }[]) => {
      const r = res?.[0]
      if (!r?.node || disposed) return
      const dpr = uni.getSystemInfoSync().pixelRatio || 2
      const canvas = r.node
      canvas.width = r.width * dpr
      canvas.height = r.height * dpr
      chart = new uCharts({
        ...baseOptions(),
        context: canvas.getContext('2d'),
        canvas2d: true,
        pixelRatio: dpr,
        width: r.width * dpr,
        height: r.height * dpr,
      })
    })
  // #endif
  // #ifndef MP-WEIXIN
  uni
    .createSelectorQuery()
    .in(instance.proxy)
    .select(`#${uid}`)
    .boundingClientRect((rect) => {
      const box = rect as UniApp.NodeInfo | null
      if (!box?.width || disposed) return
      chart = new uCharts({
        ...baseOptions(),
        context: uni.createCanvasContext(uid, instance.proxy),
        pixelRatio: 1,
        width: box.width,
        height: box.height,
      })
    })
    .exec()
  // #endif
}

function draw(): void {
  if (disposed || !instance) return
  chart?.stopAnimation()
  paint()
}

function onTap(e: unknown): void {
  if (!chart) return
  chart.touchLegend?.(e)
  chart.showToolTip?.(e)
}

onMounted(() => {
  void nextTick(() => setTimeout(draw, 50))
})

watch(
  () => [props.data, props.opts],
  () => setTimeout(draw, 0),
  { deep: true },
)

onUnmounted(() => {
  disposed = true
  chart?.stopAnimation()
  chart = null
})
</script>

<template>
  <view class="uchart" :style="{ height: height + 'rpx' }">
    <!-- #ifdef MP-WEIXIN -->
    <canvas :id="uid" type="2d" class="uchart-canvas" @touchend="onTap" />
    <!-- #endif -->
    <!-- #ifndef MP-WEIXIN -->
    <canvas :id="uid" :canvas-id="uid" class="uchart-canvas" @touchend="onTap" />
    <!-- #endif -->
  </view>
</template>

<style scoped>
.uchart {
  position: relative;
  width: 100%;
}

.uchart-canvas {
  width: 100%;
  height: 100%;
}

</style>
