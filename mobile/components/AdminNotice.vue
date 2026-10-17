<script setup lang="ts">
// 只有系统管理员角色的账号：移动端不提供管理功能，提示去 Web 端
</script>

<template>
  <view class="card admin">
    <uni-icons type="info-filled" size="40" color="var(--eas-primary)" />
    <view class="admin-title">管理功能请在 Web 端使用</view>
    <view class="admin-text">
      系统管理员账号只有管理权限（用户与注册审核、部门、授权、流程模板、待办监控与转办、审计日志），
      不发起申请、不参与审批。请在电脑浏览器中打开系统 Web 端进行管理操作。
    </view>
    <view class="muted">移动端仍可查看消息、修改密码和退出登录。</view>
  </view>
</template>

<style scoped>
.admin {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48rpx 32rpx;
}

.admin-title {
  font-size: 32rpx;
  font-weight: 600;
  margin: 16rpx 0 12rpx;
}

.admin-text {
  font-size: 26rpx;
  color: var(--eas-ink-2);
  line-height: 1.7;
  margin-bottom: 12rpx;
}
</style>
