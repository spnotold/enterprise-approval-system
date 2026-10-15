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

function render() {
  if (!chart.value) return
  chart.value.setOption(props.option, true)
}

onMounted(() => {
  if (!el.value) return
  chart.value = echarts.init(el.value)
  render()
  ro = new ResizeObserver(() => chart.value?.resize())
  ro.observe(el.value)
})

onBeforeUnmount(() => {
  ro?.disconnect()
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
  <div ref="el" class="stats-chart" :style="{ height: `${height}px` }" />
</template>

<style scoped>
.stats-chart {
  width: 100%;
}
</style>
