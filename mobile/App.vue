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
/* 全局样式：基准宽度 750rpx，触控目标不小于 88rpx */
page {
  background-color: #f5f6f7;
  color: #1f2329;
  font-size: 28rpx;
  line-height: 1.5;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif;
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
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx 28rpx;
  margin-bottom: 24rpx;
}

.card-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 30rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
}

.section-title {
  font-size: 26rpx;
  color: #8f959e;
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
  color: #8f959e;
  font-size: 24rpx;
}

.text-primary {
  color: #2f6bff;
}

.text-danger {
  color: #e5484d;
}

.text-success {
  color: #16a34a;
}

.text-warning {
  color: #d97706;
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
  color: #646a73;
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
  border-radius: 12rpx;
  font-size: 30rpx;
  background: #fff;
  color: #1f2329;
  border: 2rpx solid #dcdfe6;
  box-sizing: border-box;
}

.btn::after {
  border: none;
}

.btn-primary {
  background: #2f6bff;
  color: #fff;
  border-color: #2f6bff;
}

.btn-danger {
  background: #e5484d;
  color: #fff;
  border-color: #e5484d;
}

.btn-ghost-danger {
  color: #e5484d;
  border-color: #f5b8ba;
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
  color: #2f6bff;
  font-size: 28rpx;
}

.link-btn.danger {
  color: #e5484d;
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
  background: #fff;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -4rpx 16rpx rgba(0, 0, 0, 0.06);
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
  color: #1f2329;
  margin-bottom: 12rpx;
}

.req {
  color: #e5484d;
  margin-right: 4rpx;
}

.input {
  width: 100%;
  height: 88rpx;
  padding: 0 20rpx;
  background: #f7f8fa;
  border-radius: 10rpx;
  font-size: 30rpx;
}

.textarea {
  width: 100%;
  min-height: 168rpx;
  padding: 20rpx;
  background: #f7f8fa;
  border-radius: 10rpx;
  font-size: 30rpx;
  line-height: 1.5;
}

.picker-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 88rpx;
  padding: 0 20rpx;
  background: #f7f8fa;
  border-radius: 10rpx;
  font-size: 30rpx;
}

.placeholder {
  color: #a8abb2;
}

.is-error {
  background: #fff1f0 !important;
}

.field-err {
  color: #e5484d;
  font-size: 24rpx;
  margin-top: 8rpx;
}

.field-help {
  color: #8f959e;
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
  border-radius: 8rpx;
  font-size: 22rpx;
  line-height: 40rpx;
  background: #f0f2f5;
  color: #646a73;
  margin-right: 8rpx;
  white-space: nowrap;
}

.tag-blue {
  background: #e8efff;
  color: #2f6bff;
}

.tag-green {
  background: #e7f6ec;
  color: #16a34a;
}

.tag-red {
  background: #fdecec;
  color: #e5484d;
}

.tag-orange {
  background: #fff4e5;
  color: #d97706;
}

/* 横幅提示 */
.banner {
  padding: 20rpx 24rpx;
  border-radius: 12rpx;
  margin-bottom: 24rpx;
  font-size: 26rpx;
  line-height: 1.6;
}

.banner-danger {
  background: #fdecec;
  color: #b42318;
}

.banner-warning {
  background: #fff7e6;
  color: #ad6800;
}

.banner-info {
  background: #e8efff;
  color: #1d4ed8;
}

/* 分段切换 */
.seg {
  display: flex;
  background: #fff;
  border-radius: 12rpx;
  padding: 6rpx;
  margin-bottom: 24rpx;
}

.seg-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 76rpx;
  border-radius: 10rpx;
  font-size: 28rpx;
  color: #646a73;
}

.seg-item.active {
  background: #2f6bff;
  color: #fff;
  font-weight: 600;
}

/* 筛选条 */
.filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
}

.filter-chip {
  display: flex;
  align-items: center;
  height: 72rpx;
  min-height: 72rpx;
  padding: 0 24rpx;
  margin-right: 16rpx;
  background: #fff;
  border-radius: 36rpx;
  font-size: 26rpx;
  color: #1f2329;
}

.filter-chip.active {
  color: #2f6bff;
  background: #e8efff;
}

.update-tip {
  text-align: center;
  padding: 18rpx;
  margin-bottom: 20rpx;
  border-radius: 12rpx;
  background: #e8efff;
  color: #2f6bff;
  font-size: 26rpx;
}

.divider {
  height: 1rpx;
  background: #f0f1f2;
  margin: 16rpx 0;
}
</style>
