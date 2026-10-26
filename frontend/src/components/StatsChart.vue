<script setup lang="ts">
// ECharts 封装：按需引入图表类型，随容器尺寸自适应
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import type { PieSeriesOption } from 'echarts/charts'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
])

const props = withDefaults(
  defineProps<{
    option: EChartsCoreOption
    height?: number
    loading?: boolean
  }>(),
  { height: 300, loading: false },
)

const el = ref<HTMLDivElement | null>(null)
const chart = shallowRef<echarts.ECharts | null>(null)
let ro: ResizeObserver | null = null
let focusedSlice: string | null = null

// 柱 / 线由 ECharts 的 focus: 'series' 处理。饼图图例按扇区筛选，
// 单独调整扇区透明度，保留原生图例点击筛选和 tooltip。
function focusPieLegend(name: string | null) {
  if (!chart.value || focusedSlice === name) return
  const raw = props.option.series
  const series = (Array.isArray(raw) ? raw : raw ? [raw] : []) as PieSeriesOption[]
  if (name !== null && !series.some((s) => s.type === 'pie' && s.data?.some((d) =>
    typeof d === 'object' && d !== null && !Array.isArray(d) && d.name === name,
  ))) return
  focusedSlice = name
  chart.value.setOption({
    series: series.map((s) => s.type !== 'pie' ? {} : {
      data: s.data?.map((d) => {
        if (typeof d !== 'object' || d === null || Array.isArray(d)) return d
        const dimmed = name !== null && d.name !== name
        return {
          ...d,
          itemStyle: { ...d.itemStyle, opacity: dimmed ? 0.2 : (d.itemStyle?.opacity ?? 1) },
          label: { ...d.label, opacity: dimmed ? 0.2 : (d.label?.opacity ?? 1) },
          labelLine: {
            ...d.labelLine,
            lineStyle: { ...d.labelLine?.lineStyle, opacity: dimmed ? 0.2 : (d.labelLine?.lineStyle?.opacity ?? 1) },
          },
        }
      }),
    }),
  })
}

function onHighlight(event: unknown) {
  // 饼图 seriesName 可能是空字符串；focusPieLegend 内部会按扇区名精确守卫。
  if (event && typeof event === 'object' && 'name' in event && typeof event.name === 'string') {
    focusPieLegend(event.name)
  }
}

function onDownplay() {
  focusPieLegend(null)
}

function render() {
  if (!chart.value) return
  focusedSlice = null
  chart.value.setOption(props.option, true)
}

onMounted(() => {
  if (!el.value) return
  chart.value = echarts.init(el.value)
  // 部分消费者用最小 mock 实现图表 API，事件接口保持可选。
  chart.value.on?.('highlight', onHighlight)
  chart.value.on?.('downplay', onDownplay)
  render()
  ro = new ResizeObserver(() => chart.value?.resize())
  ro.observe(el.value)
})

onBeforeUnmount(() => {
  ro?.disconnect()
  chart.value?.off?.('highlight', onHighlight)
  chart.value?.off?.('downplay', onDownplay)
  chart.value?.dispose()
  chart.value = null
})

watch(() => props.option, render, { deep: true })
watch(
  () => props.loading,
  (v) => (v ? chart.value?.showLoading({ text: '加载中…' }) : chart.value?.hideLoading()),
)
</script>

<template>
  <div ref="el" class="stats-chart" role="img" aria-label="统计图表" :style="{ height: `${height}px` }" />
</template>

<style scoped>
.stats-chart {
  width: 100%;
}
</style>
