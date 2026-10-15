<script setup lang="ts">
// uCharts 封装：小程序用 type="2d" 的 canvas（同层渲染，不会盖住弹层），H5 用 uni 的 canvas 上下文。
// 点击图表显示提示框。数值请同时在页面上以文字 / 卡片给出（图表只作辅助）。
import { getCurrentInstance, nextTick, onMounted, onUnmounted, watch } from 'vue'
import uCharts from '@qiun/ucharts'
import { CHART_COLORS, type ChartData } from '@/utils/chart'

const props = withDefaults(
  defineProps<{
    type: 'ring' | 'pie' | 'column' | 'bar' | 'line'
    data: ChartData
    /** 额外的 uCharts 配置，浅合并 */
    opts?: Record<string, unknown>
    /** 图表高度，rpx */
    height?: number
  }>(),
  { opts: () => ({}), height: 480 },
)

const uid = `uc${Math.random().toString(36).slice(2, 10)}`
const instance = getCurrentInstance()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let chart: any = null
let disposed = false

function baseOptions(): Record<string, unknown> {
  // uCharts 会改写传入的 series（附加内部字段），传深拷贝，避免触发响应式监听而反复重绘
  const data = JSON.parse(JSON.stringify(props.data)) as ChartData
  return {
    type: props.type,
    categories: data.categories ?? [],
    series: data.series,
    animation: true,
    background: '#FFFFFF',
    color: CHART_COLORS,
    padding: [12, 12, 4, 4],
    fontSize: 11,
    fontColor: '#646a73',
    dataLabel: props.type === 'ring' || props.type === 'pie',
    enableScroll: false,
    legend: { show: props.data.series.length > 1 || props.type === 'ring' || props.type === 'pie', position: 'bottom', fontSize: 11 },
    xAxis: { disableGrid: true, fontColor: '#646a73', fontSize: 10, axisLineColor: '#e5e6eb' },
    yAxis: { gridType: 'dash', gridColor: '#eeeeee', dashLength: 4, data: [{ min: 0, fontColor: '#8f959e', fontSize: 10 }] },
    ...props.opts,
  }
}

function draw(): void {
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
  width: 100%;
}

.uchart-canvas {
  width: 100%;
  height: 100%;
}
</style>
