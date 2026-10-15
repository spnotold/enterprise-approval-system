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

async function toggleEmail(e: { detail: { value: boolean } }): Promise<void> {
  const value = e.detail.value
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
  <view class="page">
    <view class="card profile">
      <view class="avatar">{{ (me?.realName ?? '?').slice(0, 1) }}</view>
      <view class="flex1">
        <view class="name">{{ me?.realName ?? '—' }}</view>
        <view class="muted">{{ me?.username }} · {{ me?.deptName ?? '未分配部门' }}</view>
        <view class="muted ellipsis">{{ me?.email }}</view>
        <view class="roles">
          <text v-for="r in me?.roles ?? []" :key="r.code" class="tag tag-blue">
            {{ ROLE_LABEL[r.code] ?? r.name }}<text v-if="r.primaryHandler">（主办）</text>
          </text>
        </view>
      </view>
    </view>

    <AdminNotice v-if="adminOnly" />

    <view class="card menu">
      <view v-if="!adminOnly" class="menu-item" @tap="goAppList()">
        <uni-icons type="list" size="20" color="#2f6bff" />
        <text class="flex1">我的申请</text>
        <uni-icons type="right" size="16" color="#c0c4cc" />
      </view>
      <view v-if="!adminOnly && canDept" class="menu-item" @tap="goAppList({ scope: 'dept' })">
        <uni-icons type="staff" size="20" color="#2f6bff" />
        <text class="flex1">本部门申请</text>
        <uni-icons type="right" size="16" color="#c0c4cc" />
      </view>
      <view v-if="!adminOnly" class="menu-item" @tap="go('/pages/stats/index')">
        <uni-icons type="tune" size="20" color="#2f6bff" />
        <text class="flex1">统计报表</text>
        <uni-icons type="right" size="16" color="#c0c4cc" />
      </view>
      <view class="menu-item" @tap="go('/pages/me/password')">
        <uni-icons type="locked" size="20" color="#2f6bff" />
        <text class="flex1">修改密码</text>
        <uni-icons type="right" size="16" color="#c0c4cc" />
      </view>
      <view class="menu-item">
        <uni-icons type="email" size="20" color="#2f6bff" />
        <view class="flex1">
          <view>邮件提醒</view>
          <view class="muted">关闭后仍可在“消息”中查看站内通知</view>
        </view>
        <switch :checked="!!me?.emailNotify" :disabled="savingPref || !me" color="#2f6bff" @change="toggleEmail" />
      </view>
    </view>

    <button class="btn btn-block btn-ghost-danger" @tap="logout">退出登录</button>
  </view>
</template>

<style scoped>
.profile {
  display: flex;
  align-items: center;
}

.avatar {
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  background: #2f6bff;
  color: #fff;
  font-size: 48rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 24rpx;
  flex-shrink: 0;
}

.name {
  font-size: 36rpx;
  font-weight: 700;
}

.roles {
  margin-top: 8rpx;
  display: flex;
  flex-wrap: wrap;
}

.roles .tag {
  margin-bottom: 8rpx;
}

.menu {
  padding-top: 0;
  padding-bottom: 0;
}

.menu-item {
  display: flex;
  align-items: center;
  min-height: 104rpx;
  border-bottom: 1rpx solid #f0f1f2;
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-item > text,
.menu-item > view.flex1 {
  margin-left: 20rpx;
}
</style>
