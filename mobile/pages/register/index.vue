<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import type { DeptOption } from '@/lib/types'
import FormItem from '@/components/FormItem.vue'
import { useFieldErrors } from '@/composables/useFieldErrors'
import { alert, showError } from '@/utils/feedback'

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/

const form = reactive({ username: '', realName: '', email: '', password: '', confirm: '' })
const depts = ref<DeptOption[]>([])
const deptIndex = ref(-1)
const busy = ref(false)
const fe = useFieldErrors()
const available = reactive({ username: null as boolean | null, email: null as boolean | null })

onLoad(async () => {
  try {
    depts.value = await api.dict.publicDepartments()
  } catch (e) {
    showError(e)
  }
})

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
  if (!PASSWORD_RE.test(p)) return { text: '不符合要求', cls: 'text-danger' }
  if (score >= 5) return { text: '强', cls: 'text-success' }
  if (score >= 3) return { text: '中', cls: 'text-warning' }
  return { text: '弱', cls: 'text-danger' }
})

function onInput(key: keyof typeof form, e: { detail: { value: string } }): void {
  form[key] = e.detail.value
  fe.clearField(key)
  if (key === 'username' || key === 'email') available[key] = null
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
  <view class="page">
    <view class="banner banner-info">注册后需管理员审核，通过后自动成为员工。角色由管理员另行授予。</view>
    <view class="card">
      <FormItem label="用户名" required :error="fe.get('username')" help="4-32 位字母、数字或下划线，以字母开头">
        <input
          class="input"
          :class="{ 'is-error': !!fe.get('username') }"
          :value="form.username"
          placeholder="如 zhang_san"
          placeholder-class="placeholder"
          maxlength="32"
          @input="onInput('username', $event)"
          @blur="checkAvailability('username')"
        />
        <view v-if="available.username === true && !fe.get('username')" class="field-help text-success">用户名可用</view>
      </FormItem>
      <FormItem label="姓名" required :error="fe.get('realName')">
        <input
          class="input"
          :class="{ 'is-error': !!fe.get('realName') }"
          :value="form.realName"
          placeholder="真实姓名"
          placeholder-class="placeholder"
          maxlength="50"
          @input="onInput('realName', $event)"
        />
      </FormItem>
      <FormItem label="邮箱" required :error="fe.get('email')">
        <input
          class="input"
          :class="{ 'is-error': !!fe.get('email') }"
          :value="form.email"
          placeholder="用于接收审批提醒"
          placeholder-class="placeholder"
          maxlength="100"
          @input="onInput('email', $event)"
          @blur="checkAvailability('email')"
        />
        <view v-if="available.email === true && !fe.get('email')" class="field-help text-success">邮箱可用</view>
      </FormItem>
      <FormItem label="密码" required :error="fe.get('password')" help="8-64 位，至少包含字母和数字">
        <input
          class="input"
          :class="{ 'is-error': !!fe.get('password') }"
          :value="form.password"
          password
          placeholder="设置登录密码"
          placeholder-class="placeholder"
          maxlength="64"
          @input="onInput('password', $event)"
        />
        <view v-if="strength" class="field-help">
          密码强度：<text :class="strength.cls">{{ strength.text }}</text>
        </view>
      </FormItem>
      <FormItem label="确认密码" required :error="fe.get('confirm')">
        <input
          class="input"
          :class="{ 'is-error': !!fe.get('confirm') }"
          :value="form.confirm"
          password
          placeholder="再次输入密码"
          placeholder-class="placeholder"
          maxlength="64"
          @input="onInput('confirm', $event)"
        />
      </FormItem>
      <FormItem label="申请加入的部门" required :error="fe.get('requestedDeptId')">
        <picker
          :range="depts"
          range-key="name"
          :value="deptIndex < 0 ? 0 : deptIndex"
          @change="deptIndex = Number($event.detail.value); fe.clearField('requestedDeptId')"
        >
          <view class="picker-value" :class="{ 'is-error': !!fe.get('requestedDeptId') }">
            <text :class="{ placeholder: deptIndex < 0 }">{{ deptIndex < 0 ? '请选择部门' : depts[deptIndex].name }}</text>
            <uni-icons type="right" size="16" color="#8f959e" />
          </view>
        </picker>
      </FormItem>
      <view v-for="m in fe.general.value" :key="m" class="field-err">{{ m }}</view>
      <button class="btn btn-primary btn-block mt" :loading="busy" :disabled="busy" @tap="submit">提交注册</button>
    </view>
  </view>
</template>
