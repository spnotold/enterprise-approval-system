# 套色 v3 基础层

设计依据：[界面设计规范](ui_design.md)（第三版）。这里说明基础层已经做好的东西，页面改造时直接用，不要重复造。

## 外壳

- `Layout.vue`：顶栏（品牌章、栏目、铃铛、头像）+ 背景 `SceneryField` + 内容区。外壳从 `router/menu.ts` 的权限过滤结果生成顶栏、栏目页签和管理索引；通知中心从铃铛进入。
- 当前路由恰好对应栏目中的一项且栏目有至少两项时，外壳渲染 `SectionTabs.vue`：**栏目名大标题（展示字 40）+ 胶囊页签**。所以这类页面**不要再放自己的页面标题**，第一张单据直接从页签下面开始。表单、详情、编辑页不渲染栏目页签，页面自己放标题或单据头。
- 页签行右侧的 `#section-actions` 是操作区目标，页面用延迟 Teleport 放操作：

```vue
<Teleport to="#section-actions" defer>
  <el-button @click="refresh">刷新</el-button>
</Teleport>
```

  只在外壳为当前路由生成栏目页签的页面使用这个目标（窄屏隐藏页签时目标仍存在）。若页面按权限只剩一个可见子页面，保留页内操作区（或禁用 Teleport）。
- `IndexTabs.vue`：胶囊页签呈现组件（选中 = 藏青 + 颗粒 + 芥黄错版），统计和通知页内切换直接复用。`items` 为 `{ key, label, to?, count? }[]`，`active` 为选中项 key；传 `to` 用路由链接，省略时用按钮并发出 `select(key)`。`#actions` 插槽放日期区间、刷新等；`hideTabs` 隐藏导航保留操作区。用它的页面要自己在上面放展示字标题（`.page-title`）。
- 管理栏目：`AdminIndex.vue` 竖排胶囊索引在左，外壳把页面包在一张 `.sheet` 里（`.routed-page.admin-page`，内边距 24）。管理页面内部不要再套一层 `.sheet`。
- 背景：`SceneryField.vue`（`position: fixed` 铺满视口）。登录 / 注册页的 `AuthShell` 也用它。

## 全局样式（`styles/main.css`）

已经全局改好的 Element Plus 组件，页面里**不要再写局部覆盖去改回去**：

- `el-button`：胶囊 + 硬投影 + 悬停抬起 / 按下沉。默认 = 纸色；`type="primary"` 藏青、`warning` 芥黄、`danger` 铁锈、`success` 鼠尾草、`info` 暗纸（有色的都带颗粒）；`plain` = 纸底有色字；`link` / `text` 没有色块和投影（钢蓝字）。相邻按钮间距 14px（留出投影）。
- `el-input` / `el-select` / `el-date-picker` / `el-input-number`：`field` 底、1.5px 框线、圆角 12；聚焦墨线框 + 芥黄错版。
- `el-tag`：实色胶囊 + 颗粒；`type` 映射 primary = 天青、success = 鼠尾草、warning = 芥黄、danger = 铁锈、info = 暗纸。`StatusTag.vue` 按状态选 type。
- `el-table`：透明底（透出单据纸），表头 12px 600 ink-2、下边 2px 墨线；悬停整行 `row-hover` + 首列 5px 芥黄竖条；`.row-actions` 悬停 / 聚焦时显示，触屏常显。
- `el-radio-button` 组：一排胶囊，选中藏青 + 错版。`el-checkbox` / `el-radio` / `el-switch`：藏青。
- `el-pagination`：当前页藏青圆 + 错版。
- 浮层（下拉、选择器、日期、popover）、`el-dialog`、`el-message-box`、`el-message`、`el-notification`：纸底、圆角、硬投影，标题用展示字。
- `el-alert`：四种浅色底（天青 / 芥黄 / 铁锈 / 鼠尾草浅）。`el-empty` 不显示组件库的空盒子图，空状态用 `ListEmpty`。

页面结构类：

- `.sheet`：单据（纸色、圆角 16、`6px 6px 0` 纸影，不描边）；`.sheet--wide` 左右内边距 36；`.sheet-head`（标题展示字 21，可在标题前放 `.ink-glyph`）、`.sheet-section`（段间 2px 虚线）、`.sheet > .toolbar`、`.sheet > .pager`。
- `.page-title`：展示字 40 页面标题；`.section-title`：展示字 20 小节标题；`.display`：展示字工具类。
- `.two-line` / `.cell-main` / `.cell-sub` / `.cell-none`：两行单元格。`.tag-overdue`：已超时芥黄胶囊。`.status-dot--primary/success/danger/warning/muted`：圆点 + 文字。
- `.ink-glyph.ink-glyph--sun|leaf|hill|bell|stack`：小节标题前的两色叠印小图形（`aria-hidden="true"`），每张单据最多一个。
- `.inked`：给有颜色的块叠颗粒。`.text-link`：钢蓝字 + 芥黄下划线的链接。
- `.form-actions`：表单 / 详情底部固定操作栏（纸底、上沿硬投影、高 72）。

## Token

见 `styles/tokens.css`。v2 的名字都还在（`desk`、`sheet`、`tab`、`row-hover`、`primary`…），值换成了套色墨；新增 `shade`、`field`、`ink-deep`、`mustard*`、`rust*`、`sage*`、`sky*`、`link`、`grain`、`stamp-mask`、`font-display`、`display-tracking`、`offset-mark`、`radius-pill`、`fs-40`。旧别名 `paper`、`paper-deep`、`surface`、`muted-tint`、`skeleton-to`、`shadow-lift` 仍可用。

修改基础语义色后运行 `node scripts/generate-theme-colors.mjs --write`（浅色阶按与单据纸混色生成），`--check` 验证没有过期。

字体：`main.ts` 导入 `@fontsource-variable/fraunces/soft.css` 和 `@fontsource/zcool-xiaowei/400.css`，都按 unicode-range 分片，浏览器只下载用到的字。全局 `font-variation-settings: 'SOFT' 100`。

## 素材

- 插画：`src/assets/illustrations/*.webp`，提示词在同目录 `prompts/`。在 Vue 里 `import img from '@/assets/illustrations/xxx.webp'`。
  - `login`（登录左栏）、`workbench-banner`（工作台横幅）、`apply-purchase|travel|expense|leave|seal|generic`（发起入口，4:3）、`empty-tray`（空列表）、`empty-search`（筛选无结果）、`forbidden`（403）、`not-found`（404）、`bg-meadow` 与 `leaf-1..6`（背景，`SceneryField` 专用）。
- 纹理：`src/assets/textures/grain.png`（颗粒，经 `--eas-grain` 使用）、`stamp-mask.png`（印章残缺遮罩，经 `--eas-stamp-mask` 用作 `mask-image`）。

## 详情页栏目来源

不变：详情和编辑页依次采用 `from` 查询参数、`history.state.sectionFrom`、进入前的列表路由、浏览器历史的返回路由及当前详情上下文。仅接受当前权限可见的申请 / 审批来源。直接打开链接时读取申请人，自己的申请归「申请」，其他申请归「审批」。
