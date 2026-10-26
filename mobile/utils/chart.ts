// 图表数据结构与配色（components/UChart.vue 使用）

import type { AppStatus } from '@/lib/types'
import { CHART_SERIES } from '@/utils/palette'

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
 * 分类配色：套色序列（藏青、鼠尾草、芥黄、铁锈、灰、天青），与 utils/palette.ts 的 CHART_SERIES 一致。
 * 同一实体在各图中颜色一致，不按排名重新分配。
 */
export const CHART_COLORS: string[] = [...CHART_SERIES]

/**
 * 状态在图上的颜色：草稿用深一档的暗纸（浅暗纸在纸底上分不清），审批中天青、已通过鼠尾草、
 * 已驳回铁锈、已撤回灰。canvas 读不到 CSS 变量，色值写在这里。
 */
export const STATUS_CHART_COLORS: Record<AppStatus, string> = {
  DRAFT: '#c9bfa6',
  IN_APPROVAL: '#8fb0bf',
  APPROVED: '#7f9a6e',
  REJECTED: '#a94a2c',
  WITHDRAWN: '#9a9488',
}

/** 合计类序列的中性色（不含状态含义的总量） */
export const TOTAL_CHART_COLOR = '#9a9488'

/** 金额图表只用于展示：分 → 元的数值（不参与任何计算） */
export function centsForChart(cents: number | null | undefined): number {
  return Math.round(cents ?? 0) / 100
}
