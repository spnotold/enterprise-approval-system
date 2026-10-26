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
    <!-- 插画头：整幅铺满，状态栏区域也铺图；品牌和标题压在左上的天空上 -->
    <view class="hero">
      <image class="hero-img" src="/static/illustrations/m-login.jpg" mode="aspectFill" />
      <image class="leaf leaf-a" src="/static/illustrations/leaf-1.png" mode="aspectFit" />
      <image class="leaf leaf-b" src="/static/illustrations/leaf-3.png" mode="aspectFit" />
      <image class="leaf leaf-c" src="/static/illustrations/leaf-5.png" mode="aspectFit" />
      <view class="brand">
        <view class="seal inked"><text class="seal-char">审</text></view>
        <text class="brand-name">企业审批</text>
      </view>
      <view class="hero-title">登录</view>
    </view>

    <view class="body">
      <view class="card sheet">
        <view class="field">
          <view class="label">用户名或邮箱</view>
          <input
            v-model="account"
            class="input"
            :class="{ 'is-focus': focus === 'account' }"
            placeholder="请输入用户名或邮箱"
            placeholder-class="placeholder"
            maxlength="100"
            confirm-type="next"
            @focus="focus = 'account'"
            @blur="focus = ''"
          />
        </view>
        <view class="field">
          <view class="label">密码</view>
          <view class="input pwd" :class="{ 'is-focus': focus === 'password' }">
            <input
              v-model="password"
              class="pwd-in"
              :password="!showPwd"
              placeholder="请输入密码"
              placeholder-class="placeholder"
              maxlength="64"
              confirm-type="done"
              @focus="focus = 'password'"
              @blur="focus = ''"
              @confirm="submit"
            />
            <view class="pwd-toggle" hover-class="is-pressed" :hover-stay-time="60" @tap="showPwd = !showPwd">
              {{ showPwd ? '隐藏' : '显示' }}
            </view>
          </view>
        </view>
        <view v-if="error" class="field-err">{{ error }}</view>
        <button class="btn btn-primary btn-block submit" :loading="busy" :disabled="busy" @tap="submit">登录</button>
      </view>

      <view class="links">
        <view class="link-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="goRegister">注册新账号</view>
        <view v-if="demoMode" class="link-btn" hover-class="is-pressed" :hover-stay-time="60" @tap="showDemo = !showDemo">
          {{ showDemo ? '收起演示账号' : '演示账号' }}
        </view>
      </view>

      <view v-if="demoMode && showDemo" class="demo">
        <view class="demo-head">
          <text class="demo-title">演示账号</text>
          <text class="demo-note">密码都是 Demo@2026</text>
        </view>
        <view class="demo-grid">
          <view
            v-for="d in DEMO_ACCOUNTS"
            :key="d.username"
            class="demo-card"
            hover-class="is-pressed"
            :hover-stay-time="60"
            @tap="fillDemo(d.username)"
          >
            <view class="demo-name">{{ d.name }}</view>
            <view class="demo-user">{{ d.username }}</view>
            <view class="demo-desc">{{ d.desc }}</view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.login {
  min-height: 100vh;
}

/* ---------- 插画头 ---------- */
.hero {
  position: relative;
  height: 600rpx;
  overflow: hidden;
}

.hero-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/* 飘叶：一片 8–12 秒，从左往右边飘边转、上下轻摆；30 秒一轮、三片错开，同时最多一片 */
.leaf {
  position: absolute;
  left: 0;
  opacity: 0;
  pointer-events: none;
}

.leaf-a {
  top: 240rpx;
  width: 48rpx;
  height: 52rpx;
  animation: leaf-a 30s linear infinite;
}

.leaf-b {
  top: 320rpx;
  width: 36rpx;
  height: 40rpx;
  animation: leaf-b 30s linear infinite;
  animation-delay: 10s;
}

.leaf-c {
  top: 400rpx;
  width: 44rpx;
  height: 48rpx;
  animation: leaf-c 30s linear infinite;
  animation-delay: 20s;
}

@keyframes leaf-a {
  0% { transform: translate(-120rpx, 0) rotate(0deg); opacity: 0; }
  2% { opacity: 1; }
  9% { transform: translate(90rpx, 20rpx) rotate(60deg); }
  16% { transform: translate(300rpx, -16rpx) rotate(140deg); }
  23% { transform: translate(510rpx, 16rpx) rotate(220deg); }
  29% { transform: translate(700rpx, -10rpx) rotate(300deg); opacity: 1; }
  31% { transform: translate(860rpx, 4rpx) rotate(330deg); opacity: 0; }
  100% { transform: translate(860rpx, 4rpx) rotate(330deg); opacity: 0; }
}

@keyframes leaf-b {
  0% { transform: translate(-100rpx, 0) rotate(-20deg); opacity: 0; }
  2% { opacity: 1; }
  8% { transform: translate(120rpx, -14rpx) rotate(40deg); }
  15% { transform: translate(340rpx, 18rpx) rotate(120deg); }
  21% { transform: translate(560rpx, -12rpx) rotate(200deg); }
  25% { transform: translate(720rpx, 10rpx) rotate(260deg); opacity: 1; }
  27% { transform: translate(850rpx, 0) rotate(300deg); opacity: 0; }
  100% { transform: translate(850rpx, 0) rotate(300deg); opacity: 0; }
}

@keyframes leaf-c {
  0% { transform: translate(-110rpx, 0) rotate(10deg); opacity: 0; }
  3% { opacity: 1; }
  10% { transform: translate(150rpx, 22rpx) rotate(90deg); }
  19% { transform: translate(400rpx, -20rpx) rotate(180deg); }
  27% { transform: translate(620rpx, 14rpx) rotate(260deg); opacity: 1; }
  33% { transform: translate(860rpx, -6rpx) rotate(340deg); opacity: 0; }
  100% { transform: translate(860rpx, -6rpx) rotate(340deg); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .leaf {
    display: none;
  }
}

/* 品牌：铁锈圆章 + 芥黄错版，右上角留给小程序胶囊按钮 */
.brand {
  position: absolute;
  top: calc(var(--status-bar-height) + 32rpx);
  left: 40rpx;
  display: flex;
  align-items: center;
}

.seal {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  background-color: var(--eas-rust);
  border-radius: 50%;
  box-shadow: var(--eas-offset-mark);
}

.seal-char {
  font-family: var(--eas-font-display);
  font-size: 44rpx;
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-sheet);
}

.brand-name {
  margin-left: 24rpx;
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-lg);
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
}

.hero-title {
  position: absolute;
  top: calc(var(--status-bar-height) + 152rpx);
  left: 40rpx;
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-hero);
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
  line-height: 1.3;
  color: var(--eas-ink);
}

/* ---------- 表单单据：向上压住插画底边 ---------- */
.body {
  padding: 0 40rpx calc(48rpx + env(safe-area-inset-bottom));
}

.sheet {
  position: relative;
  margin-top: -48rpx;
  padding-top: 16rpx;
}

.label {
  margin-bottom: 12rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
}

/* 密码行：输入框 + 右侧「显示 / 隐藏」 */
.pwd {
  display: flex;
  align-items: center;
  padding: 0;
}

.pwd-in {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0 24rpx;
  font-size: 30rpx;
  color: var(--eas-ink);
}

.pwd-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 112rpx;
  height: 100%;
  padding: 0 20rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-link);
  border-radius: var(--eas-radius-control);
}

.submit {
  margin-top: 24rpx;
}

.links {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-right: 8rpx;
  padding: 0 16rpx;
}

/* ---------- 演示账号：两列纸色小卡 ---------- */
.demo {
  margin: 8rpx 8rpx 0 0;
}

.demo-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16rpx 8rpx 20rpx;
}

.demo-title {
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-md);
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
  color: var(--eas-ink);
}

.demo-note {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.demo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}

.demo-card {
  width: calc(50% - 10rpx);
  min-height: 88rpx;
  padding: 20rpx 24rpx;
  background: var(--eas-sheet);
  border-radius: var(--eas-radius-control);
  box-shadow: 6rpx 6rpx 0 var(--eas-shade);
  transition: transform var(--eas-dur-fast) var(--eas-ease), box-shadow var(--eas-dur-fast) var(--eas-ease);
}

.demo-card.is-pressed {
  transform: translate(4rpx, 4rpx);
  box-shadow: 2rpx 2rpx 0 var(--eas-shade);
}

.demo-name {
  font-size: var(--eas-fs-sm);
  font-weight: 600;
  color: var(--eas-ink);
}

.demo-user {
  margin-top: 2rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.demo-desc {
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  line-height: 1.5;
  color: var(--eas-ink-3);
}
</style>
