<script setup lang="ts">
// 我的：个人信息、我的申请、统计、修改密码、邮件提醒开关、退出登录
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import AdminNotice from '@/components/AdminNotice.vue'
import { auth, requireLogin } from '@/stores/auth'
import { notice } from '@/stores/notice'
import { SWITCH_COLOR } from '@/utils/palette'
import { confirm, showError, toast } from '@/utils/feedback'
import { ROLE_LABEL } from '@/utils/labels'
import { go, goAppList } from '@/utils/nav'
import { switchValue, type UniSwitchChangeEvent } from '@/utils/uniEvent'

const me = computed(() => auth.state.me)
const adminOnly = computed(() => auth.isAdminOnly)
const canDept = computed(() => auth.can('APP_READ_DEPT'))
const savingPref = ref(false)

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
    <view class="profile">
      <view class="avatar inked">{{ (me?.realName ?? '?').slice(0, 1) }}</view>
      <view class="profile-main">
        <view class="name">{{ me?.realName ?? '—' }}</view>
        <view class="sub">
          <text>{{ me?.deptName ?? '未分配部门' }}</text>
          <text v-for="r in me?.roles ?? []" :key="r.code" class="sub-gap">
            {{ ROLE_LABEL[r.code] ?? r.name }}<text v-if="r.primaryHandler">（主办）</text>
          </text>
        </view>
        <view class="sub-line">{{ me?.username }}</view>
        <view class="sub-line ellipsis">{{ me?.email }}</view>
      </view>
    </view>

    <AdminNotice v-if="adminOnly" />

    <view class="card menu">
      <view v-if="!adminOnly" class="row-item" hover-class="is-pressed" :hover-stay-time="60" @tap="goAppList()">
        <text class="flex1">我的申请</text>
        <view class="chevron" />
      </view>
      <view
        v-if="!adminOnly && canDept"
        class="row-item"
        hover-class="is-pressed"
        :hover-stay-time="60"
        @tap="goAppList({ scope: 'dept' })"
      >
        <text class="flex1">本部门申请</text>
        <view class="chevron" />
      </view>
      <view v-if="!adminOnly" class="row-item" hover-class="is-pressed" :hover-stay-time="60" @tap="go('/pages/stats/index')">
        <text class="flex1">统计报表</text>
        <view class="chevron" />
      </view>
      <view class="row-item" hover-class="is-pressed" :hover-stay-time="60" @tap="go('/pages/me/password')">
        <text class="flex1">修改密码</text>
        <view class="chevron" />
      </view>
      <view class="row-item">
        <view class="flex1">
          <view>邮件提醒</view>
          <view class="sub">关闭后仍可在“消息”中查看站内通知</view>
        </view>
        <switch :checked="!!me?.emailNotify" :disabled="savingPref || !me" :color="SWITCH_COLOR" @change="toggleEmail" />
      </view>
    </view>

    <button class="btn btn-ghost-danger logout" hover-class="is-pressed" :hover-stay-time="60" @tap="logout">退出登录</button>
  </view>
</template>

<style scoped>
.me {
  min-height: 100vh;
  padding: 24rpx 24rpx calc(48rpx + env(safe-area-inset-bottom));
  background: var(--eas-desk);
  color: var(--eas-ink);
  font-family: var(--eas-font-sans);
}

/* ---------- 顶部：鼠尾草圆头像 + 展示字姓名，直接放在页面底上 ---------- */
.profile {
  display: flex;
  align-items: center;
  padding: 24rpx 8rpx 40rpx;
}

.avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 120rpx;
  height: 120rpx;
  margin-right: 28rpx;
  border-radius: 50%;
  background-color: var(--eas-sage);
  color: var(--eas-ink);
  font-family: var(--eas-font-display);
  font-size: 56rpx;
  font-weight: 700;
  line-height: 1;
}

.profile-main {
  flex: 1;
  min-width: 0;
}

.name {
  font-family: var(--eas-font-display);
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
  line-height: 1.3;
}

.sub {
  display: flex;
  flex-wrap: wrap;
  font-size: var(--eas-fs-xs);
  line-height: 1.6;
  color: var(--eas-ink-2);
}

/* 用户名、邮箱各占一行，长邮箱省略，不撑宽页面 */
.sub-line {
  font-size: var(--eas-fs-xs);
  line-height: 1.6;
  color: var(--eas-ink-2);
}

.sub-gap {
  margin-left: 24rpx;
}

/* ---------- 设置项：一张单据，行间一条细线 ---------- */
.menu {
  padding: 0;
  overflow: hidden;
}

.row-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  min-height: 88rpx;
  padding: 16rpx 32rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink);
  border-top: 1rpx solid var(--eas-rule);
}

.row-item:first-child {
  border-top: none;
}

.chevron {
  flex: none;
  width: 14rpx;
  height: 14rpx;
  border-right: 3rpx solid var(--eas-ink-3);
  border-bottom: 3rpx solid var(--eas-ink-3);
  transform: rotate(-45deg);
}

/* ---------- 退出登录：通栏纸色按钮，铁锈字 ---------- */
.logout {
  width: calc(100% - 8rpx);
  margin: 0 8rpx 0 0;
}
</style>
