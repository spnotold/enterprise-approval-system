<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import type { DeptOption } from '@/lib/types'
import FormItem from '@/components/FormItem.vue'
import { useFieldErrors } from '@/composables/useFieldErrors'
import { alert, showError } from '@/utils/feedback'
import { inputValue, pickerValue, type UniInputEvent, type UniPickerChangeEvent } from '@/utils/uniEvent'

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/

const form = reactive({ username: '', realName: '', email: '', password: '', confirm: '' })
const depts = ref<DeptOption[]>([])
const deptIndex = ref(-1)
const busy = ref(false)
const focus = ref('')
const fe = useFieldErrors()
const available = reactive({ username: null as boolean | null, email: null as boolean | null })

onLoad(async () => {
  try {
    depts.value = await api.dict.publicDepartments()
  } catch (e) {
    showError(e)
  }
})

// 自定义导航栏：顶部内容让出真实状态栏高度（小程序的 --status-bar-height 是编译时写死的 25px；H5 为 0）
const topInset = `${uni.getSystemInfoSync().statusBarHeight ?? 0}px`

// 没有原生导航栏，返回按钮是唯一出口：H5 直接打开注册页时页面栈只有一页，navigateBack 不会失败而是原地刷新，要先判断
function goBack(): void {
  const toLogin = () => uni.reLaunch({ url: '/pages/login/index' })
  if (getCurrentPages().length > 1) uni.navigateBack({ fail: toLogin })
  else toLogin()
}

function onBackKey(e: KeyboardEvent): void {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  goBack()
}

/** 密码强度：只做提示，规则以“8–64 位，至少包含字母和数字”为准 */
const strength = computed(() => {
  const p = form.password
  if (!p) return null
  let score = 0
  if (p.length >= 8) score++
  if (p.length >= 12) score++
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++
  if (/\d/.test(p)) score++
  if (/[^A-Za-z0-9]/.test(p)) score++
  if (!PASSWORD_RE.test(p)) return { text: '不符合要求', cls: 'tone-danger' }
  if (score >= 5) return { text: '强', cls: 'tone-success' }
  if (score >= 3) return { text: '中', cls: 'tone-warning' }
  return { text: '弱', cls: 'tone-danger' }
})

function onInput(key: keyof typeof form, e: Event | UniInputEvent): void {
  form[key] = inputValue(e)
  fe.clearField(key)
  if (key === 'username' || key === 'email') available[key] = null
}

function onBlur(key: 'username' | 'email'): void {
  focus.value = ''
  void checkAvailability(key)
}

function onDepartmentChange(e: Event | UniPickerChangeEvent): void {
  deptIndex.value = Number(pickerValue(e))
  fe.clearField('requestedDeptId')
}

async function checkAvailability(key: 'username' | 'email'): Promise<void> {
  const v = form[key].trim()
  if (key === 'username' && !USERNAME_RE.test(v)) return
  if (key === 'email' && !EMAIL_RE.test(v)) return
  try {
    const r = await api.auth.availability(key === 'username' ? { username: v } : { email: v })
    const ok = key === 'username' ? r.usernameAvailable : r.emailAvailable
    available[key] = ok ?? null
    if (ok === false) fe.set(key, key === 'username' ? '该用户名已被注册' : '该邮箱已被注册')
  } catch {
    // 可用性检查失败不影响提交，以注册接口结果为准
  }
}

function validate(): boolean {
  fe.clear()
  if (!USERNAME_RE.test(form.username.trim())) fe.set('username', '用户名为 4-32 位字母、数字或下划线，以字母开头')
  if (!form.realName.trim()) fe.set('realName', '请填写姓名')
  else if (form.realName.trim().length > 50) fe.set('realName', '姓名不能超过 50 个字')
  if (!EMAIL_RE.test(form.email.trim())) fe.set('email', '请输入有效的邮箱')
  if (!PASSWORD_RE.test(form.password)) fe.set('password', '密码 8-64 位，至少包含字母和数字')
  if (form.confirm !== form.password) fe.set('confirm', '两次输入的密码不一致')
  if (deptIndex.value < 0) fe.set('requestedDeptId', '请选择申请加入的部门')
  if (available.username === false) fe.set('username', '该用户名已被注册')
  if (available.email === false) fe.set('email', '该邮箱已被注册')
  return fe.count.value === 0
}

async function submit(): Promise<void> {
  if (busy.value || !validate()) return
  busy.value = true
  try {
    await api.auth.register({
      username: form.username.trim(),
      realName: form.realName.trim(),
      email: form.email.trim(),
      password: form.password,
      requestedDeptId: depts.value[deptIndex.value].id,
    })
    await alert('注册成功', '账号已提交，管理员审核通过后即可登录。')
    uni.navigateBack({ fail: () => uni.reLaunch({ url: '/pages/login/index' }) })
  } catch (err) {
    const e = toApiError(err)
    if (e.errors.length) {
      fe.setAll(e.errors)
      if (fe.general.value.length) showError(e)
    } else showError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <view class="register" :style="{ '--top-inset': topInset }">
    <!-- 插画头：同一张插画换个裁切位置，矮一截；左上是返回按钮和标题 -->
    <view class="hero">
      <image class="hero-img" src="/static/illustrations/m-login.jpg" mode="aspectFill" />
      <view class="hero-head">
        <view
          class="back"
          role="button"
          aria-label="返回登录"
          tabindex="0"
          hover-class="is-pressed"
          :hover-stay-time="60"
          @tap="goBack"
          @keydown="onBackKey"
        >
          <view class="back-arrow" />
        </view>
        <view class="hero-title">注册</view>
      </view>
    </view>

    <view class="body">
      <view class="card sheet form">
        <view class="lead">注册账号，经管理员审核后使用。</view>
        <FormItem label="用户名" required :error="fe.get('username')" help="4-32 位字母、数字或下划线，以字母开头">
          <input
            class="input"
            :class="{ 'is-error': !!fe.get('username'), 'is-focus': focus === 'username' }"
            :value="form.username"
            placeholder="如 zhang_san"
            placeholder-class="placeholder"
            maxlength="32"
            @input="onInput('username', $event)"
            @focus="focus = 'username'"
            @blur="onBlur('username')"
          />
          <view v-if="available.username === true && !fe.get('username')" class="ok">用户名可用</view>
        </FormItem>
        <FormItem label="姓名" required :error="fe.get('realName')">
          <input
            class="input"
            :class="{ 'is-error': !!fe.get('realName'), 'is-focus': focus === 'realName' }"
            :value="form.realName"
            placeholder="真实姓名"
            placeholder-class="placeholder"
            maxlength="50"
            @input="onInput('realName', $event)"
            @focus="focus = 'realName'"
            @blur="focus = ''"
          />
        </FormItem>
        <FormItem label="邮箱" required :error="fe.get('email')">
          <input
            class="input"
            :class="{ 'is-error': !!fe.get('email'), 'is-focus': focus === 'email' }"
            :value="form.email"
            placeholder="用于接收审批提醒"
            placeholder-class="placeholder"
            maxlength="100"
            @input="onInput('email', $event)"
            @focus="focus = 'email'"
            @blur="onBlur('email')"
          />
          <view v-if="available.email === true && !fe.get('email')" class="ok">邮箱可用</view>
        </FormItem>
        <FormItem label="密码" required :error="fe.get('password')" help="8-64 位，至少包含字母和数字">
          <input
            class="input"
            :class="{ 'is-error': !!fe.get('password'), 'is-focus': focus === 'password' }"
            :value="form.password"
            password
            placeholder="设置登录密码"
            placeholder-class="placeholder"
            maxlength="64"
            @input="onInput('password', $event)"
            @focus="focus = 'password'"
            @blur="focus = ''"
          />
          <view v-if="strength" class="hint">
            密码强度：<text :class="strength.cls">{{ strength.text }}</text>
          </view>
        </FormItem>
        <FormItem label="确认密码" required :error="fe.get('confirm')">
          <input
            class="input"
            :class="{ 'is-error': !!fe.get('confirm'), 'is-focus': focus === 'confirm' }"
            :value="form.confirm"
            password
            placeholder="再次输入密码"
            placeholder-class="placeholder"
            maxlength="64"
            @input="onInput('confirm', $event)"
            @focus="focus = 'confirm'"
            @blur="focus = ''"
          />
        </FormItem>
        <FormItem label="申请加入的部门" required :error="fe.get('requestedDeptId')">
          <picker
            :range="depts"
            range-key="name"
            :value="deptIndex < 0 ? 0 : deptIndex"
            @change="onDepartmentChange"
          >
            <view
              class="picker-value"
              :class="{ 'is-error': !!fe.get('requestedDeptId') }"
              hover-class="is-pressed"
              :hover-stay-time="60"
            >
              <text class="pick-text" :class="{ placeholder: deptIndex < 0 }">{{ deptIndex < 0 ? '请选择部门' : depts[deptIndex].name }}</text>
              <text class="pick-action">{{ deptIndex < 0 ? '选择' : '更改' }}</text>
            </view>
          </picker>
        </FormItem>
        <view v-for="m in fe.general.value" :key="m" class="field-err">{{ m }}</view>
        <button class="btn btn-primary btn-block submit" :loading="busy" :disabled="busy" :hover-stay-time="60" @tap="submit">提交注册</button>
        <view class="lead">审核通过后自动成为员工，角色由管理员另行授予。</view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.register {
  min-height: 100vh;
}

/* ---------- 插画头（矮） ---------- */
.hero {
  position: relative;
  height: 360rpx;
  overflow: hidden;
}

/* 图片按原图 4:3 的高度放，容器只露出上面的天空、山和湖，不露出右下的印章 */
.hero-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 562.5rpx;
}

.hero-head {
  position: absolute;
  top: calc(var(--top-inset, 0px) + 24rpx);
  left: 32rpx;
  display: flex;
  align-items: center;
}

/* 返回：纸色圆 + 硬投影，按下沉进投影 */
.back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  background: var(--eas-sheet);
  border-radius: 50%;
  box-shadow: 6rpx 6rpx 0 var(--eas-shade);
  transition: transform var(--eas-dur-fast) var(--eas-ease), box-shadow var(--eas-dur-fast) var(--eas-ease);
}

/* #ifdef H5 */
.back:focus-visible {
  outline: 4rpx solid var(--eas-ink);
  outline-offset: 6rpx;
}
/* #endif */

.back.is-pressed {
  transform: translate(4rpx, 4rpx);
  box-shadow: 2rpx 2rpx 0 var(--eas-shade);
}

.back-arrow {
  width: 22rpx;
  height: 22rpx;
  margin-left: 8rpx;
  border-left: 6rpx solid var(--eas-ink);
  border-bottom: 6rpx solid var(--eas-ink);
  transform: rotate(45deg);
}

.hero-title {
  margin-left: 28rpx;
  font-family: var(--eas-font-display);
  font-size: var(--eas-fs-xl);
  font-weight: 700;
  letter-spacing: var(--eas-display-tracking);
  line-height: 1.3;
  color: var(--eas-ink);
}

/* ---------- 表单单据：压住插画下沿 ---------- */
.body {
  padding: 0 40rpx calc(48rpx + env(safe-area-inset-bottom));
}

.sheet {
  position: relative;
  margin-top: -48rpx;
}

.lead {
  margin: 16rpx 0 8rpx;
  font-size: var(--eas-fs-sm);
  line-height: 1.6;
  color: var(--eas-ink-2);
}

.pick-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pick-action {
  flex-shrink: 0;
  margin-left: 16rpx;
  font-size: var(--eas-fs-sm);
  color: var(--eas-link);
}

.ok {
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-success);
}

.hint {
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.tone-success {
  color: var(--eas-success);
}

.tone-warning {
  color: var(--eas-warning-text);
}

.tone-danger {
  color: var(--eas-rust-deep);
}

.submit {
  margin-top: 24rpx;
}
</style>
