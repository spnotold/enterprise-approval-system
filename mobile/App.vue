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

/* 全局样式：基准宽度 750rpx，触控目标不小于 88rpx */
page {
  background-color: var(--eas-paper);
  color: var(--eas-ink);
  font-size: 28rpx;
  line-height: 1.6;
  font-family: var(--eas-font-sans);
  font-variant-numeric: tabular-nums;
}

view,
text,
scroll-view,
input,
textarea {
  box-sizing: border-box;
}

.page {
  padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom));
  min-height: 100vh;
  box-sizing: border-box;
}

/* 底部有固定操作栏的页面 */
.page--bar {
  padding-bottom: calc(176rpx + env(safe-area-inset-bottom));
}

.card {
  background: var(--eas-surface);
  border: 1rpx solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
  padding: 24rpx 28rpx;
  margin-bottom: 16rpx;
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--eas-ink);
  margin-bottom: 12rpx;
}

.section-title {
  font-size: 24rpx;
  color: var(--eas-ink-2);
  margin: 8rpx 8rpx 16rpx;
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

.amount {
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

/* 按钮 */
.btn {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  line-height: 88rpx;
  padding: 0 28rpx;
  border-radius: var(--eas-radius-control);
  font-size: 30rpx;
  background: var(--eas-surface);
  color: var(--eas-ink);
  border: 2rpx solid var(--eas-rule-strong);
  box-sizing: border-box;
}

.btn::after {
  border: none;
}

.btn-primary {
  background: var(--eas-primary);
  color: var(--eas-surface);
  border-color: var(--eas-primary);
}

.btn-danger {
  background: var(--eas-danger);
  color: var(--eas-surface);
  border-color: var(--eas-danger);
}

.btn-ghost-danger {
  color: var(--eas-danger);
  border-color: var(--eas-danger);
}

.btn-block {
  width: 100%;
}

.btn[disabled] {
  opacity: 0.55;
}

/* 文字按钮：保证 88rpx 触控区域 */
.link-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 88rpx;
  min-width: 88rpx;
  padding: 0 16rpx;
  color: var(--eas-primary);
  font-size: 28rpx;
}

.link-btn.danger {
  color: var(--eas-danger);
}

/* 底部固定操作栏，留出安全区 */
.bottom-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: var(--window-bottom, 0);
  z-index: 90;
  display: flex;
  align-items: center;
  background: var(--eas-surface);
  border-top: 1rpx solid var(--eas-rule);
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
}

.bottom-bar .btn {
  flex: 1;
  margin-left: 16rpx;
}

.bottom-bar .btn:first-child {
  margin-left: 0;
}

/* 表单 */
.field {
  padding: 18rpx 0;
}

.field-label {
  display: flex;
  align-items: center;
  font-size: 28rpx;
  color: var(--eas-ink);
  margin-bottom: 12rpx;
}

.req {
  color: var(--eas-danger);
  margin-right: 4rpx;
}

.input {
  width: 100%;
  height: 88rpx;
  padding: 0 20rpx;
  background: var(--eas-paper);
  border: 2rpx solid transparent;
  border-radius: var(--eas-radius-control);
  font-size: 30rpx;
}

.textarea {
  width: 100%;
  min-height: 168rpx;
  padding: 20rpx;
  background: var(--eas-paper);
  border: 2rpx solid transparent;
  border-radius: var(--eas-radius-control);
  font-size: 30rpx;
  line-height: 1.6;
}

.picker-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 0 20rpx;
  background: var(--eas-paper);
  border: 2rpx solid transparent;
  border-radius: var(--eas-radius-control);
  font-size: 30rpx;
}

.input:focus,
.textarea:focus {
  border-color: var(--eas-primary);
}

.placeholder {
  color: var(--eas-placeholder);
}

.is-error {
  background: var(--eas-danger-tint) !important;
  border-color: var(--eas-danger) !important;
}

.field-err {
  color: var(--eas-danger);
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

/* 标签 */
.tag {
  display: inline-flex;
  align-items: center;
  height: 40rpx;
  padding: 0 12rpx;
  border-radius: var(--eas-radius-tag);
  font-size: 24rpx;
  line-height: 40rpx;
  background: var(--eas-muted-tint);
  color: var(--eas-ink-2);
  margin-right: 8rpx;
  white-space: nowrap;
}

.tag-blue {
  background: var(--eas-primary-tint);
  color: var(--eas-primary);
}

.tag-green {
  background: var(--eas-success-tint);
  color: var(--eas-success);
}

.tag-red {
  background: var(--eas-danger-tint);
  color: var(--eas-danger);
}

.tag-orange {
  background: var(--eas-warning-tint);
  color: var(--eas-warning-text);
}

/* 横幅提示 */
.banner {
  padding: 20rpx 24rpx;
  border-radius: var(--eas-radius-panel);
  margin-bottom: 16rpx;
  font-size: 26rpx;
  line-height: 1.6;
}

.banner-danger {
  background: var(--eas-danger-tint);
  color: var(--eas-danger);
}

.banner-warning {
  background: var(--eas-warning-tint);
  color: var(--eas-warning-text);
}

.banner-info {
  background: var(--eas-primary-tint);
  color: var(--eas-primary);
}

/* 分段切换；页面接入 .seg-indicator 后由选中块通过 transform 滑动。 */
.seg {
  position: relative;
  display: flex;
  background: var(--eas-paper-deep);
  border-radius: var(--eas-radius-control);
  padding: 6rpx;
  margin-bottom: 16rpx;
}

.seg-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  border-radius: 6rpx;
  font-size: 28rpx;
  color: var(--eas-ink-2);
}

.seg-item.active {
  background: var(--eas-surface);
  color: var(--eas-ink);
  font-weight: 600;
}

.seg-indicator {
  position: absolute;
  top: 6rpx;
  bottom: 6rpx;
  left: 6rpx;
  z-index: 0;
  background: var(--eas-surface);
  border: 1rpx solid var(--eas-rule);
  border-radius: 6rpx;
  transition: transform var(--eas-dur) var(--eas-ease);
}

.seg-indicator ~ .seg-item {
  position: relative;
  z-index: 1;
}

.seg-indicator ~ .seg-item.active {
  background: transparent;
}

@media (prefers-reduced-motion: reduce) {
  .seg-indicator { transition: none; }
}

/* 筛选条 */
.filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}

.filter-chip {
  display: flex;
  align-items: center;
  height: 72rpx;
  min-height: 72rpx;
  padding: 0 24rpx;
  margin-right: 16rpx;
  background: var(--eas-surface);
  border: 2rpx solid var(--eas-rule);
  border-radius: var(--eas-radius-control);
  font-size: 26rpx;
  color: var(--eas-ink);
}

.filter-chip.active {
  color: var(--eas-primary);
  background: var(--eas-primary-tint);
  border-color: var(--eas-primary-tint);
}

.update-tip {
  text-align: center;
  padding: 18rpx;
  margin-bottom: 16rpx;
  border-radius: var(--eas-radius-control);
  background: var(--eas-primary-tint);
  color: var(--eas-primary);
  font-size: 26rpx;
}

.divider {
  height: 1rpx;
  background: var(--eas-rule);
  margin: 16rpx 0;
}
</style>
