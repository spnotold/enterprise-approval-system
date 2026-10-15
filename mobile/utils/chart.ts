// 图表数据结构与配色（components/UChart.vue 使用）

export interface ChartSeries {
  name: string
  data: (number | null)[] | number
  color?: string
  /** 堆叠柱状图的分组 */
  index?: number
}

export interface ChartData {
  categories?: string[]
  series: ChartSeries[]
}

/**
 * 分类配色：固定顺序，已用色觉障碍可分辨性校验（相邻对 CVD ΔE ≥ 9）。
 * 同一实体在各图中颜色一致，不按排名重新分配。部分颜色与白底对比度不足 3:1，
 * 因此图表都开启数据标签或在下方给出数字卡片。
 */
export const CHART_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

/** 金额图表只用于展示：分 → 元的数值（不参与任何计算） */
export function centsForChart(cents: number | null | undefined): number {
  return Math.round(cents ?? 0) / 100
}
