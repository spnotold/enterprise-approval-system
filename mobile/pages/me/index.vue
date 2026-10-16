<script setup lang="ts">
// 我的：个人信息、我的申请、统计、修改密码、邮件提醒开关、退出登录
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import AdminNotice from '@/components/AdminNotice.vue'
import { auth, requireLogin } from '@/stores/auth'
import { notice } from '@/stores/notice'
import { confirm, showError, toast } from '@/utils/feedback'
import { ROLE_LABEL } from '@/utils/labels'
import { go, goAppList } from '@/utils/nav'
import { switchValue, type UniSwitchChangeEvent } from '@/utils/uniEvent'

const me = computed(() => auth.state.me)
const adminOnly = computed(() => auth.isAdminOnly)
const canDept = computed(() => auth.can('APP_READ_DEPT'))
const savingPref = ref(false)
// 原生 switch 的 color 属性读不到 CSS 变量，值与 --eas-primary 保持一致
const SWITCH_COLOR = '#3e5c76'

onLoad(async () => {
  await requireLogin()
})

onShow(() => {
  notice.applyBadge()
  if (auth.isLoggedIn) auth.reloadMe().catch(() => {})
})

async function toggleEmail(e: Event | UniSwitchChangeEvent): Promise<void> {
  const value = switchValue(e)
  savingPref.value = true
  try {
    auth.setMe(await api.me.updatePreferences({ emailNotify: value }))
    toast(value ? '已开启邮件提醒' : '已关闭邮件提醒', 'success')
  } catch (err) {
    showError(err)
    if (me.value) auth.setMe({ ...me.value }) // 恢复开关显示
  } finally {
    savingPref.value = false
  }
}

async function logout(): Promise<void> {
  if (!(await confirm({ title: '退出登录', content: '确定退出当前账号吗？', confirmText: '退出', danger: true }))) return
  await auth.logout()
}
</script>

<template>
  <view class="me">
    <view class="panel profile">
      <view class="avatar">{{ (me?.realName ?? '?').slice(0, 1) }}</view>
      <view class="flex1">
        <view class="name">{{ me?.realName ?? '—' }}</view>
        <view class="sub">
          <text>{{ me?.username }}</text>
          <text class="sub-gap">{{ me?.deptName ?? '未分配部门' }}</text>
        </view>
        <view class="sub ellipsis">{{ me?.email }}</view>
        <view v-if="me?.roles?.length" class="roles">
          <text v-for="r in me?.roles ?? []" :key="r.code" class="role">
            {{ ROLE_LABEL[r.code] ?? r.name }}<text v-if="r.primaryHandler">（主办）</text>
          </text>
        </view>
      </view>
    </view>

    <AdminNotice v-if="adminOnly" />

    <view class="panel menu">
      <view v-if="!adminOnly" class="row-item" hover-class="is-pressed" :hover-stay-time="60" @tap="goAppList()">
        <text class="flex1">我的申请</text>
      </view>
      <view
        v-if="!adminOnly && canDept"
        class="row-item"
        hover-class="is-pressed"
        :hover-stay-time="60"
        @tap="goAppList({ scope: 'dept' })"
      >
        <text class="flex1">本部门申请</text>
      </view>
      <view v-if="!adminOnly" class="row-item" hover-class="is-pressed" :hover-stay-time="60" @tap="go('/pages/stats/index')">
        <text class="flex1">统计报表</text>
      </view>
      <view class="row-item" hover-class="is-pressed" :hover-stay-time="60" @tap="go('/pages/me/password')">
        <text class="flex1">修改密码</text>
      </view>
      <view class="row-item">
        <view class="flex1">
          <view>邮件提醒</view>
          <view class="sub">关闭后仍可在“消息”中查看站内通知</view>
        </view>
        <switch :checked="!!me?.emailNotify" :disabled="savingPref || !me" :color="SWITCH_COLOR" @change="toggleEmail" />
      </view>
    </view>

    <button class="logout" hover-class="is-pressed" :hover-stay-time="60" @tap="logout">退出登录</button>
  </view>
</template>

<style scoped>
.me {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom));
  background: var(--eas-paper);
  color: var(--eas-ink);
  font-family: var(--eas-font-sans);
}

.panel {
  margin-bottom: 24rpx;
  background: var(--eas-surface);
  border: 1rpx solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
  overflow: hidden;
}

.profile {
  display: flex;
  align-items: center;
  padding: 32rpx;
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 112rpx;
  height: 112rpx;
  margin-right: 24rpx;
  border-radius: 50%;
  background: var(--eas-primary-tint);
  border: 1rpx solid var(--eas-rule-strong);
  color: var(--eas-primary);
  font-size: var(--eas-fs-lg);
  font-weight: 600;
}

.name {
  font-size: var(--eas-fs-md);
  font-weight: 600;
  line-height: 1.4;
}

.sub {
  font-size: var(--eas-fs-xs);
  line-height: 1.6;
  color: var(--eas-ink-3);
}

.sub-gap {
  margin-left: 20rpx;
}

.roles {
  display: flex;
  flex-wrap: wrap;
  margin-top: 8rpx;
}

.role {
  margin: 0 12rpx 8rpx 0;
  padding: 0 12rpx;
  font-size: var(--eas-fs-xs);
  line-height: 40rpx;
  color: var(--eas-primary);
  border: 1rpx solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-tag);
}

.menu {
  padding: 0;
}

.row-item {
  display: flex;
  align-items: center;
  min-height: 104rpx;
  padding: 16rpx 32rpx;
  font-size: var(--eas-fs-sm);
  border-top: 1rpx solid var(--eas-rule);
}

.row-item:first-child {
  border-top: none;
}

.logout {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 88rpx;
  margin: 0;
  padding: 0;
  line-height: 88rpx;
  font-size: var(--eas-fs-md);
  color: var(--eas-danger);
  background: var(--eas-surface);
  border: 2rpx solid var(--eas-danger);
  border-radius: var(--eas-radius-control);
}

.logout::after {
  border: none;
}
</style>
