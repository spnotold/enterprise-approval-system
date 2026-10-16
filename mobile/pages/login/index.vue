<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import { auth } from '@/stores/auth'
import { showError, toast } from '@/utils/feedback'
import { HOME_PAGE, TAB_PAGES } from '@/utils/nav'

const account = ref('')
const password = ref('')
const showPwd = ref(false)
const busy = ref(false)
const error = ref('')
const showDemo = ref(false)
const focus = ref<'' | 'account' | 'password'>('')
// 仅后端以 demo profile 运行时展示演示账号；请求失败按非 demo 处理
const demoMode = ref(false)
let redirect = ''

const DEMO_ACCOUNTS = [
  { username: 'rd_emp_wang', name: '王工', desc: '研发部员工（主演示）' },
  { username: 'rd_head_li', name: '李研', desc: '研发部负责人' },
  { username: 'fin_auditor_wu', name: '吴审', desc: '财务审批人' },
  { username: 'fin_head_qian', name: '钱会计', desc: '财务部负责人、财务审批人' },
  { username: 'ceo_zhao', name: '赵总', desc: '企业负责人' },
  { username: 'mkt_emp_zhou', name: '周敏', desc: '市场部员工' },
  { username: 'rd_emp_chen', name: '陈工', desc: '研发部员工' },
  { username: 'admin', name: '系统管理员', desc: '仅管理权限（请用 Web 端）' },
]

onLoad(async (q) => {
  redirect = q?.redirect ? decodeURIComponent(q.redirect) : ''
  if (auth.isLoggedIn) {
    leave()
    return
  }
  try {
    demoMode.value = (await api.dict.publicConfig()).demo === true
  } catch {
    demoMode.value = false
  }
})

function leave(): void {
  const target = redirect && !redirect.startsWith('/pages/login') ? redirect : HOME_PAGE
  const path = target.split('?')[0]
  if (TAB_PAGES.includes(path)) uni.switchTab({ url: path })
  else uni.reLaunch({ url: target })
}

function fillDemo(username: string): void {
  account.value = username
  password.value = 'Demo@2026'
  error.value = ''
}

const LOGIN_MESSAGES: Record<number, string> = {
  40103: '用户名或密码错误',
  40104: '账号待管理员审核，审核通过后才能登录',
  40105: '账号已停用或已被锁定，请稍后再试或联系管理员',
  42901: '登录尝试过于频繁，请稍后再试',
}

async function submit(): Promise<void> {
  if (busy.value) return
  error.value = ''
  if (!account.value.trim() || !password.value) {
    error.value = '请输入用户名 / 邮箱和密码'
    return
  }
  busy.value = true
  try {
    const me = await auth.login(account.value.trim(), password.value)
    toast(`欢迎，${me.realName}`, 'none')
    leave()
  } catch (err) {
    const e = toApiError(err)
    if (LOGIN_MESSAGES[e.code] || e.code === 40000) error.value = LOGIN_MESSAGES[e.code] ?? e.message
    else showError(e)
  } finally {
    busy.value = false
  }
}

function goRegister(): void {
  uni.navigateTo({ url: '/pages/register/index' })
}
</script>

<template>
  <view class="login">
    <view class="head">
      <view class="title">企业审批系统</view>
      <view class="lead">提交申请，查看进度，处理待办。</view>
    </view>

    <view class="panel">
      <view class="field">
        <view class="label">用户名或邮箱</view>
        <input
          v-model="account"
          class="ctl"
          :class="{ 'ctl--focus': focus === 'account' }"
          placeholder="请输入用户名或邮箱"
          placeholder-class="ctl-placeholder"
          maxlength="100"
          confirm-type="next"
          @focus="focus = 'account'"
          @blur="focus = ''"
        />
      </view>
      <view class="field">
        <view class="label">密码</view>
        <view class="ctl-row" :class="{ 'ctl--focus': focus === 'password' }">
          <input
            v-model="password"
            class="ctl-bare flex1"
            :password="!showPwd"
            placeholder="请输入密码"
            placeholder-class="ctl-placeholder"
            maxlength="64"
            confirm-type="done"
            @focus="focus = 'password'"
            @blur="focus = ''"
            @confirm="submit"
          />
          <view class="ctl-action" hover-class="is-pressed" :hover-stay-time="60" @tap="showPwd = !showPwd">
            {{ showPwd ? '隐藏' : '显示' }}
          </view>
        </view>
      </view>
      <view v-if="error" class="err">{{ error }}</view>
      <button
        class="submit"
        hover-class="submit--pressed"
        :hover-stay-time="60"
        :loading="busy"
        :disabled="busy"
        @tap="submit"
      >
        登录
      </button>
      <view class="links">
        <view class="link" hover-class="is-pressed" :hover-stay-time="60" @tap="goRegister">注册新账号</view>
        <view v-if="demoMode" class="link" hover-class="is-pressed" :hover-stay-time="60" @tap="showDemo = !showDemo">
          {{ showDemo ? '收起演示账号' : '演示账号' }}
        </view>
      </view>
    </view>

    <view v-if="demoMode && showDemo" class="panel demo-panel">
      <view class="demo-head">
        <text class="demo-title">演示账号</text>
        <text class="note">密码均为 Demo@2026</text>
      </view>
      <view
        v-for="d in DEMO_ACCOUNTS"
        :key="d.username"
        class="demo"
        hover-class="is-pressed"
        :hover-stay-time="60"
        @tap="fillDemo(d.username)"
      >
        <view class="flex1">
          <view>
            <text class="demo-name">{{ d.name }}</text>
            <text class="note demo-user">{{ d.username }}</text>
          </view>
          <view class="note">{{ d.desc }}</view>
        </view>
        <text class="demo-fill">填入</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.login {
  min-height: 100vh;
  padding: 96rpx 40rpx calc(48rpx + env(safe-area-inset-bottom));
  background: var(--eas-paper);
  color: var(--eas-ink);
  font-family: var(--eas-font-sans);
}

.head {
  margin-bottom: 40rpx;
}

.title {
  font-family: var(--eas-font-serif);
  font-size: var(--eas-fs-xl);
  font-weight: 600;
  line-height: 1.3;
  color: var(--eas-ink);
}

.lead {
  margin-top: 12rpx;
  font-size: var(--eas-fs-sm);
  line-height: 1.6;
  color: var(--eas-ink-2);
}

.panel {
  padding: 16rpx 32rpx 24rpx;
  margin-bottom: 24rpx;
  background: var(--eas-surface);
  border: 1rpx solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
}

.field {
  padding: 16rpx 0;
}

.label {
  margin-bottom: 12rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
}

.ctl,
.ctl-row {
  width: 100%;
  height: 88rpx;
  background: var(--eas-paper);
  border: 2rpx solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
  font-size: var(--eas-fs-md);
  color: var(--eas-ink);
  transition: border-color var(--eas-dur-fast) var(--eas-ease);
}

.ctl {
  padding: 0 24rpx;
}

.ctl-row {
  display: flex;
  align-items: center;
}

.ctl-bare {
  height: 100%;
  padding: 0 24rpx;
  font-size: var(--eas-fs-md);
  color: var(--eas-ink);
}

.ctl--focus {
  border-color: var(--eas-primary);
}

.ctl-placeholder {
  color: var(--eas-placeholder);
}

.ctl-action {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 112rpx;
  height: 100%;
  padding: 0 16rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-primary);
  border-radius: var(--eas-radius-control);
}

.err {
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  line-height: 1.5;
  color: var(--eas-danger);
}

.submit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 88rpx;
  margin: 24rpx 0 0;
  padding: 0;
  line-height: 88rpx;
  font-size: var(--eas-fs-md);
  color: var(--eas-surface);
  background: var(--eas-primary);
  border-radius: var(--eas-radius-control);
  transition: background-color var(--eas-dur-fast) var(--eas-ease);
}

.submit::after {
  border: none;
}

.submit--pressed {
  background: var(--eas-primary-hover);
}

.submit[disabled] {
  opacity: 0.55;
}

.links {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8rpx;
}

.link {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 88rpx;
  min-height: 88rpx;
  padding: 0 16rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-primary);
  border-radius: var(--eas-radius-control);
}

.links .link:first-child {
  margin-left: -16rpx;
}

.links .link:last-child {
  margin-right: -16rpx;
}

.note {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.demo-panel {
  padding-bottom: 8rpx;
}

.demo-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16rpx 0 8rpx;
}

.demo-title {
  font-size: var(--eas-fs-md);
  font-weight: 600;
}

.demo {
  display: flex;
  align-items: center;
  min-height: 88rpx;
  margin: 0 -32rpx;
  padding: 16rpx 32rpx;
  border-top: 1rpx solid var(--eas-rule);
}

.demo-name {
  font-size: var(--eas-fs-sm);
  font-weight: 600;
}

.demo-user {
  margin-left: 16rpx;
}

.demo-fill {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-primary);
}
</style>
