// 套色的 JS 色值：canvas（uCharts）读不到 CSS 变量，switch 的 color 属性也要写死色值。
// 和 styles/tokens.css 里的同名 token 保持一致，改色时两处一起改。
export const PALETTE = {
  ink: '#22313f',
  ink2: '#5b6670',
  sheet: '#fbf6ea',
  desk: '#f1ece1',
  rule: '#e7dcc4',
  ruleStrong: '#cfc2a4',
  primary: '#27425a',
  mustard: '#d9a441',
  rust: '#a94a2c',
  sage: '#a3b590',
  sky: '#b3cbd5',
  muted: '#7d8389',
} as const

/** 图表序列色：藏青、鼠尾草、芥黄、铁锈、灰、天青（docs/ui_design.md 第 2 节） */
export const CHART_SERIES = ['#27425a', '#7f9a6e', '#d9a441', '#a94a2c', '#9a9488', '#8fb0bf'] as const

/** 开关、勾选：藏青 */
export const SWITCH_COLOR = PALETTE.primary
