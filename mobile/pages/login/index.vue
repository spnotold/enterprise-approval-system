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
    <view class="brand">
      <view class="brand-logo">审</view>
      <view class="brand-name">企业审批系统</view>
      <view class="muted">采购 · 差旅 · 报销 · 自定义流程</view>
    </view>

    <view class="card">
      <view class="field">
        <view class="field-label">用户名或邮箱</view>
        <input
          v-model="account"
          class="input"
          placeholder="请输入用户名或邮箱"
          placeholder-class="placeholder"
          maxlength="100"
          confirm-type="next"
        />
      </view>
      <view class="field">
        <view class="field-label">密码</view>
        <view class="row pwd">
          <input
            v-model="password"
            class="input flex1"
            :password="!showPwd"
            placeholder="请输入密码"
            placeholder-class="placeholder"
            maxlength="64"
            confirm-type="done"
            @confirm="submit"
          />
          <view class="pwd-eye" @tap="showPwd = !showPwd">
            <uni-icons :type="showPwd ? 'eye' : 'eye-slash'" size="22" color="#8f959e" />
          </view>
        </view>
      </view>
      <view v-if="error" class="field-err">{{ error }}</view>
      <button class="btn btn-primary btn-block login-btn" :loading="busy" :disabled="busy" @tap="submit">登录</button>
      <view class="row between">
        <view class="link-btn" @tap="goRegister">注册新账号</view>
        <view v-if="demoMode" class="link-btn" @tap="showDemo = !showDemo">{{ showDemo ? '收起演示账号' : '演示账号' }}</view>
      </view>
    </view>

    <view v-if="demoMode && showDemo" class="card">
      <view class="card-title">演示账号 <text class="muted">密码均为 Demo@2026</text></view>
      <view v-for="d in DEMO_ACCOUNTS" :key="d.username" class="demo" @tap="fillDemo(d.username)">
        <view class="flex1">
          <text class="bold">{{ d.name }}</text>
          <text class="muted"> {{ d.username }}</text>
          <view class="muted">{{ d.desc }}</view>
        </view>
        <text class="text-primary">填入</text>
      </view>
    </view>
  </view>
</template>

<style scoped>
.login {
  min-height: 100vh;
  padding: 80rpx 40rpx calc(48rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

.brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 48rpx;
}

.brand-logo {
  width: 120rpx;
  height: 120rpx;
  border-radius: 28rpx;
  background: #2f6bff;
  color: #fff;
  font-size: 60rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-name {
  font-size: 40rpx;
  font-weight: 700;
  margin: 20rpx 0 8rpx;
}

.pwd {
  background: #f7f8fa;
  border-radius: 10rpx;
}

.pwd-eye {
  width: 88rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-btn {
  margin-top: 24rpx;
}

.demo {
  display: flex;
  align-items: center;
  min-height: 88rpx;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f0f1f2;
}

.demo:last-child {
  border-bottom: none;
}
</style>
