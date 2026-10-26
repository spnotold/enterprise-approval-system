<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { auth } from '@/stores/auth'
import { dict } from '@/stores/dict'
import { realtime } from '@/stores/realtime'

auth.onLogin(() => realtime.start())
auth.onLogout(() => {
  realtime.stop()
  dict.clear()
})

onLaunch(() => {
  // 带着令牌启动（小程序重新打开、H5 刷新页面）：拉取用户信息并开启实时提醒
  if (auth.isLoggedIn) {
    void auth.ensureMe()
    realtime.start()
  }
})

// 小程序：前台立即拉取并每 15 秒轮询，进入后台停止
onShow(() => realtime.onAppShow())
onHide(() => realtime.onAppHide())
</script>

<style>
@import './styles/tokens.css';

/* 全局样式（套色，docs/ui_design.md 第 9 节）：基准宽度 750rpx，触控目标不小于 88rpx */
page {
  background-color: var(--eas-desk);
  color: var(--eas-ink);
  font-size: 28rpx;
  line-height: 1.6;
  font-family: var(--eas-font-sans);
  font-variant-numeric: tabular-nums;
  /* Fraunces 的柔角轴：数字和字母圆一点，和插画的软边几何形一致 */
  font-variation-settings: 'SOFT' 100;
}

view,
text,
scroll-view,
input,
textarea {
  box-sizing: border-box;
}

.page {
  padding: 24rpx 32rpx calc(48rpx + env(safe-area-inset-bottom));
  min-height: 100vh;
  box-sizing: border-box;
}

/* 底部有固定操作栏的页面 */
.page--bar {
  padding-bottom: calc(184rpx + env(safe-area-inset-bottom));
}

/* ---------- 展示字与套色小工具 ---------- */
.display {
  font-family: var(--eas-font-display);
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
}

/* 有颜色的墨块叠颗粒：主按钮、标签、计数、章、选中的胶囊；纸色块不用 */
.inked {
  background-image: var(--eas-grain);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
}

/* 小节标题前的两色小图形：两块墨叠印；每张单据最多一个。
   用法 <view class="ink-glyph ink-glyph--sun" />（装饰，不写文字） */
.ink-glyph {
  position: relative;
  display: inline-block;
  flex: none;
  width: 44rpx;
  height: 40rpx;
  margin-right: 14rpx;
}

.ink-glyph::before,
.ink-glyph::after {
  content: '';
  position: absolute;
  mix-blend-mode: multiply;
}

.ink-glyph--sun::before { left: 0; top: 6rpx; width: 30rpx; height: 30rpx; border-radius: 50%; background: var(--eas-mustard); }
.ink-glyph--sun::after { left: 16rpx; top: 0; width: 28rpx; height: 18rpx; border-radius: 28rpx 28rpx 0 0; background: var(--eas-rust); }
.ink-glyph--leaf::before { left: 0; top: 4rpx; width: 32rpx; height: 32rpx; border-radius: 0 100% 0 100%; background: var(--eas-sage); }
.ink-glyph--leaf::after { left: 18rpx; top: 14rpx; width: 24rpx; height: 24rpx; border-radius: 50%; background: var(--eas-sky); }
.ink-glyph--hill::before { left: 0; top: 12rpx; width: 44rpx; height: 24rpx; border-radius: 24rpx 24rpx 0 0; background: var(--eas-sky); }
.ink-glyph--hill::after { left: 22rpx; top: 2rpx; width: 18rpx; height: 18rpx; border-radius: 50%; background: var(--eas-rust); }
.ink-glyph--bell::before { left: 4rpx; top: 4rpx; width: 28rpx; height: 28rpx; border-radius: 50%; background: var(--eas-sky); }
.ink-glyph--bell::after { left: 16rpx; top: 14rpx; width: 28rpx; height: 24rpx; border-radius: 6rpx 6rpx 14rpx 14rpx; background: var(--eas-mustard); }
.ink-glyph--stack::before { left: 0; top: 8rpx; width: 32rpx; height: 28rpx; border-radius: 6rpx; background: var(--eas-sky); }
.ink-glyph--stack::after { left: 12rpx; top: 0; width: 32rpx; height: 28rpx; border-radius: 6rpx; background: var(--eas-mustard); }

/* ---------- 单据 ---------- */
/* 单据：纸色、圆角、往右下错开的纸影，不描边；单据之间留出投影的位置 */
.card {
  background: var(--eas-sheet);
  border-radius: var(--eas-radius-panel);
  box-shadow: var(--eas-shadow-sheet);
  padding: 28rpx 32rpx;
  margin: 0 8rpx 32rpx 0;
}

/* 整张可点的单据按下时沉进投影 */
.card.is-pressed {
  transform: translate(6rpx, 6rpx);
  box-shadow: 2rpx 2rpx 0 var(--eas-shade);
  transition: transform var(--eas-dur-fast) var(--eas-ease);
}

/* 单据标题：展示字，前面可放一个 .ink-glyph；右侧放「查看全部」之类的 .link-btn */
.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 64rpx;
  margin-bottom: 12rpx;
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-title);
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
}

/* 单据外的小节标题 */
.section-title {
  display: flex;
  align-items: center;
  margin: 16rpx 8rpx 20rpx;
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-md);
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
}

/* 单据内分段：2rpx 宽的虚线像裁切线 */
.divider {
  height: 0;
  border-top: 4rpx dashed var(--eas-rule);
  margin: 20rpx 0;
}

.row {
  display: flex;
  align-items: center;
}

.between {
  justify-content: space-between;
}

.wrap {
  flex-wrap: wrap;
}

.flex1 {
  flex: 1;
  min-width: 0;
}

.ellipsis {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.break {
  word-break: break-all;
  white-space: pre-wrap;
}

.muted {
  color: var(--eas-ink-3);
  font-size: 24rpx;
}

.text-primary {
  color: var(--eas-primary);
}

.text-link {
  color: var(--eas-link);
}

.text-danger {
  color: var(--eas-danger);
}

.text-success {
  color: var(--eas-success);
}

.text-warning {
  color: var(--eas-warning-text);
}

.bold {
  font-weight: 600;
}

/* 金额：展示字数字（Fraunces），等宽 */
.amount {
  font-family: var(--eas-font-display);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.mt {
  margin-top: 16rpx;
}

.mb {
  margin-bottom: 16rpx;
}

/* 键值对展示 */
.kv {
  display: flex;
  padding: 10rpx 0;
  font-size: 28rpx;
}

.kv-label {
  width: 190rpx;
  flex-shrink: 0;
  color: var(--eas-ink-2);
}

.kv-value {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  white-space: pre-wrap;
}

/* ---------- 按钮：胶囊 + 硬投影，按下沉进投影 ---------- */
.btn {
  --btn-shadow: var(--eas-shade);
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  line-height: 88rpx;
  padding: 0 36rpx;
  border-radius: var(--eas-radius-pill);
  font-size: 30rpx;
  font-weight: 600;
  background-color: var(--eas-sheet);
  color: var(--eas-ink);
  border: none;
  box-shadow: 6rpx 6rpx 0 var(--btn-shadow);
  box-sizing: border-box;
  transition: transform var(--eas-dur-fast) var(--eas-ease), box-shadow var(--eas-dur-fast) var(--eas-ease);
}

.btn::after {
  border: none;
}

/* 按下：uni 的 button 默认 hover-class 是 button-hover；页面也会写 is-pressed / press-primary */
.btn.button-hover,
.btn.is-pressed,
.btn.press-primary {
  transform: translate(4rpx, 4rpx);
  box-shadow: 2rpx 2rpx 0 var(--btn-shadow);
}

.btn.button-hover,
.btn.is-pressed {
  background-color: var(--eas-row-hover) !important;
}

/* 主按钮：藏青色块 + 颗粒，投影深一档 */
.btn-primary {
  --btn-shadow: var(--eas-ink-deep);
  background-color: var(--eas-primary);
  background-image: var(--eas-grain);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
  color: var(--eas-sheet);
}

.btn-primary.button-hover,
.btn-primary.is-pressed,
.btn-primary.press-primary {
  background-color: var(--eas-primary-hover) !important;
}

/* 危险：铁锈色块 */
.btn-danger {
  --btn-shadow: var(--eas-rust-deep);
  background-color: var(--eas-rust);
  background-image: var(--eas-grain);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
  color: var(--eas-sheet);
}

.btn-danger.button-hover,
.btn-danger.is-pressed,
.btn-danger.press-primary {
  background-color: var(--eas-rust-deep) !important;
}

/* 纸底铁锈字：驳回、删除这类次要的危险操作 */
.btn-ghost-danger {
  color: var(--eas-rust-deep);
}

.btn-block {
  width: 100%;
}

.btn[disabled] {
  opacity: 0.5;
  transform: none;
  box-shadow: none;
}

/* 文字按钮：钢蓝字，保证 88rpx 触控区域 */
.link-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  min-width: 88rpx;
  padding: 0 16rpx;
  color: var(--eas-link);
  font-family: var(--eas-font-sans);
  font-size: 28rpx;
  font-weight: 600;
  letter-spacing: 0;
  border-radius: var(--eas-radius-pill);
}

.link-btn.danger {
  color: var(--eas-rust-deep);
}

/* 底部固定操作栏：纸底，上沿一条纸影硬投影，留出安全区 */
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--window-bottom, 0);
  z-index: 90;
  display: flex;
  align-items: center;
  background: var(--eas-sheet);
  box-shadow: 0 -6rpx 0 var(--eas-shade);
  padding: 20rpx 32rpx calc(20rpx + env(safe-area-inset-bottom));
}

.bottom-bar .btn {
  flex: 1;
  margin-left: 24rpx;
}

.bottom-bar .btn:first-child {
  margin-left: 0;
}

/* ---------- 表单 ---------- */
.field {
  padding: 18rpx 0;
}

.field-label {
  display: flex;
  align-items: center;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--eas-ink);
  margin-bottom: 12rpx;
}

.req {
  color: var(--eas-rust);
  margin-right: 4rpx;
}

/* 输入框：纸上留的空格（field 底 + 3rpx 框线）；聚焦换墨线框 + 芥黄错版。
   小程序没有 :focus，页面用 @focus / @blur 切换 .is-focus */
.input,
.textarea,
.picker-value {
  width: 100%;
  background: var(--eas-field);
  border: 3rpx solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
  font-size: 30rpx;
  color: var(--eas-ink);
  transition: border-color var(--eas-dur-fast) var(--eas-ease), box-shadow var(--eas-dur-fast) var(--eas-ease);
}

.input {
  height: 88rpx;
  padding: 0 24rpx;
}

.textarea {
  min-height: 168rpx;
  padding: 20rpx 24rpx;
  line-height: 1.6;
}

.picker-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 0 24rpx;
}

.input:focus,
.textarea:focus,
.is-focus {
  border-color: var(--eas-ink);
  box-shadow: var(--eas-offset-mark);
}

.placeholder {
  color: var(--eas-placeholder);
}

.is-error {
  background: var(--eas-danger-tint) !important;
  border-color: var(--eas-rust) !important;
}

.field-err {
  color: var(--eas-rust-deep);
  font-size: 24rpx;
  margin-top: 8rpx;
}

.field-help {
  color: var(--eas-ink-3);
  font-size: 24rpx;
  margin-top: 8rpx;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 88rpx;
}

/* ---------- 标签：实色胶囊 + 颗粒 ---------- */
/* 默认暗纸（类型、草稿这类中性信息）；天青 = 审批中，鼠尾草 = 已通过，铁锈 = 驳回 / 危险，芥黄 = 注意 / 超时 */
.tag {
  display: inline-flex;
  align-items: center;
  height: 44rpx;
  padding: 0 18rpx;
  border-radius: var(--eas-radius-pill);
  font-size: 24rpx;
  font-weight: 600;
  line-height: 44rpx;
  background-color: var(--eas-tab);
  color: var(--eas-ink);
  margin-right: 10rpx;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 有色标签叠颗粒；暗纸标签保持干净 */
.tag-blue,
.tag-green,
.tag-red,
.tag-orange {
  background-image: var(--eas-grain);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
}

.tag-blue {
  background-color: var(--eas-sky);
}

.tag-green {
  background-color: var(--eas-sage);
}

.tag-red {
  background-color: var(--eas-rust);
  color: var(--eas-sheet);
}

.tag-orange {
  background-color: var(--eas-mustard);
}

/* ---------- 横幅提示：浅色墨底，不描边 ---------- */
.banner {
  padding: 22rpx 28rpx;
  border-radius: var(--eas-radius-control);
  margin-bottom: 24rpx;
  font-size: 26rpx;
  line-height: 1.6;
}

.banner-danger {
  background: var(--eas-danger-tint);
  color: var(--eas-rust-deep);
}

.banner-warning {
  background: var(--eas-warning-tint);
  color: var(--eas-warning-text);
}

.banner-info {
  background: var(--eas-sky-tint);
  color: var(--eas-ink);
}

/* ---------- 分段切换：一排胶囊；选中 = 藏青 + 颗粒 + 芥黄错版 ---------- */
/* 页面接入 .seg-indicator 后由选中块通过 transform 滑动 */
.seg {
  position: relative;
  display: flex;
  background: var(--eas-tab);
  border-radius: var(--eas-radius-pill);
  padding: 6rpx;
  margin: 0 8rpx 32rpx 0;
}

.seg-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80rpx;
  border-radius: var(--eas-radius-pill);
  font-size: 28rpx;
  font-weight: 600;
  color: var(--eas-ink-2);
  transition: color var(--eas-dur) var(--eas-ease);
}

.seg-item.active {
  background-color: var(--eas-ink);
  background-image: var(--eas-grain);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
  color: var(--eas-sheet);
  box-shadow: var(--eas-offset-mark);
}

.seg-indicator {
  position: absolute;
  top: 6rpx;
  bottom: 6rpx;
  left: 6rpx;
  z-index: 0;
  background-color: var(--eas-ink);
  background-image: var(--eas-grain);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
  border-radius: var(--eas-radius-pill);
  box-shadow: var(--eas-offset-mark);
  transition: transform var(--eas-dur) var(--eas-ease);
}

.seg-indicator ~ .seg-item {
  position: relative;
  z-index: 1;
}

.seg-indicator ~ .seg-item.active {
  background: transparent;
  box-shadow: none;
}

/* 按下选中项时保持藏青底，免得纸色字落在浅底上看不见；有滑块时按下的项保持透明 */
.seg-item.active.is-pressed,
.filter-chip.active.is-pressed {
  background-color: var(--eas-ink) !important;
}

.seg-indicator ~ .seg-item.is-pressed,
.seg-indicator ~ .seg-item.active.is-pressed {
  background-color: transparent !important;
}

@media (prefers-reduced-motion: reduce) {
  .seg-indicator { transition: none; }
}

/* ---------- 筛选条：胶囊；选中同分段 ---------- */
.filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 24rpx;
}

.filter-chip {
  display: flex;
  align-items: center;
  height: 72rpx;
  min-height: 72rpx;
  padding: 0 28rpx;
  margin: 8rpx 16rpx 8rpx 0;
  background: var(--eas-tab);
  border-radius: var(--eas-radius-pill);
  font-size: 26rpx;
  font-weight: 600;
  color: var(--eas-ink);
}

.filter-chip.active {
  background-color: var(--eas-ink);
  background-image: var(--eas-grain);
  background-size: var(--eas-grain-size);
  background-blend-mode: multiply;
  color: var(--eas-sheet);
  box-shadow: var(--eas-offset-mark);
}

/* #ifdef H5 */
/* H5 的导航栏和 tabBar 由 uni 渲染在页面外，读不到 page 上的变量，这里直接写色值：
   导航栏标题用展示字、墨色；tabBar 角标用铁锈 */
.uni-page-head {
  color: #22313f !important;
}

.uni-page-head__title {
  font-family: 'Fraunces Variable', 'Noto Serif SC', serif;
  font-weight: 700 !important;
  letter-spacing: 0.01em;
}

.uni-tabbar__badge {
  background-color: #a94a2c !important;
  font-family: 'Fraunces Variable', sans-serif;
  font-weight: 600;
}

.uni-tabbar__label {
  font-weight: 600;
}
/* #endif */

/* 有新数据的提示条：芥黄浅底胶囊 */
.update-tip {
  text-align: center;
  padding: 18rpx;
  margin-bottom: 24rpx;
  border-radius: var(--eas-radius-pill);
  background: var(--eas-mustard-tint);
  color: var(--eas-ink);
  font-size: 26rpx;
  font-weight: 600;
}
</style>
