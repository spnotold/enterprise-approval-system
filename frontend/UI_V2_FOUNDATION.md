# 案卷 v2 基础组件

设计依据：`../docs/ui_design.md`。外壳从 `router/menu.ts` 的权限过滤结果生成顶栏、栏目页签和管理索引。通知中心从铃铛进入。

## 栏目页签与页面操作

`Layout.vue` 在当前路由恰好对应栏目中的一项且栏目有至少两项时，渲染 `SectionTabs.vue`。表单、详情和编辑页不渲染栏目页签。窄屏的子页面导航移入抽屉，操作目标仍以独立的右对齐行保留，跨断点缩放时保持同一 DOM 节点；模板设计器不显示管理索引。页面迁移时移除原有重复标题；把第一张单据作为 `.page > .sheet` 或直接作为页面根 `.sheet`，外壳会去掉它的左上圆角，与活动页签相接。

页签行右侧的 `#section-actions` 是操作区目标。页面在同一渲染周期内也可以通过 Vue 3.5 的延迟 Teleport 放置操作：

```vue
<Teleport to="#section-actions" defer>
  <el-button @click="refresh">刷新</el-button>
</Teleport>
```

只在外壳为当前路由生成栏目页签的页面使用这个目标（窄屏隐藏页签时目标仍存在）。若页面按权限只剩一个可见子页面，保留页内操作区（或禁用 Teleport），不要传送到不存在的目标。`defer` 只延迟到本轮渲染结束，不会等待未来路由。

`IndexTabs.vue` 是不依赖栏目的呈现组件，统计和通知可直接复用。`items` 为 `{ key, label, to?, count? }[]`，`active` 为选中项 key，`label` 为导航区域的可访问名称。传 `to` 时使用路由链接；省略 `to` 时使用按钮并发出 `select(key)`，父页面维护选中项和内容。`#actions` 具名插槽用于页内页签的日期区间、刷新等操作；`hideTabs` 可隐藏导航而保留操作区。

## 单据与登记簿

- `.sheet`：单据底、边框、6px 圆角和纸厚阴影；`.sheet-head`、`.sheet-section` 提供分段和24px左右内边距。详情页可用 `.sheet--wide` 切到32px。
- `.two-line`、`.cell-main`、`.cell-sub`：两行单元格；`.tag-overdue`：超时描边标签；`.status-dot` 配合 `.status-dot--primary/success/danger/warning/muted` 渲染状态。
- 表格的悬停底、首列竖线和操作显隐已全局应用。`listRows.css` 保留旧列表类名；页面迁移时再去掉旧 `fixed` 列并合并列。
- `ListEmpty.vue` 保留 `filtered`、`description`、`reset` 事件和默认插槽，新增 `#action` 插槽。`imageSize` 仅为调用兼容保留，不显示插画。

## Token 和字体

旧名称 `paper`、`paper-deep`、`surface`、`muted-tint`、`skeleton-to`、`shadow-lift` 仍作为带注释的兼容别名存在。新增代码使用 `desk`、`sheet`、`tab`、`row-hover` 等 v2 名称。保留 `fs-xs/sm/md/lg/doc/xl`，同时提供 `fs-12/14/16/20/26/32`。

修改基础语义色后运行 `node scripts/generate-theme-colors.mjs --write`；使用 `--check` 验证 Element Plus 色阶没有过期。显式语义浅底遵循设计值，Element Plus 的 light-N/dark-2 独立按混色规则生成。

`main.ts` 只导入一次 `@fontsource/noto-serif-sc/600.css`。构建产物包含 unicode-range 字体分片及 WOFF2/WOFF 格式；浏览器仅请求当前标题使用的字符分片。

## 详情页栏目来源

详情和编辑页依次采用 `from` 查询参数、`history.state.sectionFrom`、进入前的列表路由、浏览器历史的返回路由及当前详情上下文。仅接受当前权限可见的申请/审批来源。来源随 history entry 保存；直接打开链接时读取申请人，自己的申请归「申请」，其他申请归「审批」。Ctrl/⌘/中键打开的新标签页若原始链接没有 `from`，也使用这个身份回退，不依赖原标签页的历史。这次额外读取仅用于壳层栏目选择，详情页仍负责自己的数据和错误展示。
