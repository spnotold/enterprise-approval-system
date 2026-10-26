<script setup lang="ts">
// 修改密码：成功后服务端撤销该用户全部刷新令牌，当前设备也需重新登录
import { reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import FormItem from '@/components/FormItem.vue'
import { useFieldErrors } from '@/composables/useFieldErrors'
import { auth, requireLogin } from '@/stores/auth'
import { alert, showError } from '@/utils/feedback'
import { LOGIN_PAGE } from '@/utils/nav'
import { inputValue, type UniInputEvent } from '@/utils/uniEvent'

const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/

const form = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const busy = ref(false)
const focus = ref('')
const fe = useFieldErrors()

onLoad(async () => {
  await requireLogin()
})

function onInput(key: keyof typeof form, e: Event | UniInputEvent): void {
  form[key] = inputValue(e)
  fe.clearField(key)
}

async function submit(): Promise<void> {
  if (busy.value) return
  fe.clear()
  if (!form.oldPassword) fe.set('oldPassword', '请输入当前密码')
  if (!PASSWORD_RE.test(form.newPassword)) fe.set('newPassword', '新密码 8-64 位，至少包含字母和数字')
  else if (form.newPassword === form.oldPassword) fe.set('newPassword', '新密码不能与当前密码相同')
  if (form.confirm !== form.newPassword) fe.set('confirm', '两次输入的新密码不一致')
  if (fe.count.value) return
  busy.value = true
  try {
    await api.me.changePassword({ oldPassword: form.oldPassword, newPassword: form.newPassword })
    auth.clearLocal()
    await alert('密码已修改', '其他设备上的登录已失效，请使用新密码重新登录。')
    uni.reLaunch({ url: LOGIN_PAGE })
  } catch (err) {
    const e = toApiError(err)
    if (e.errors.length) fe.setAll(e.errors)
    else if (e.code === 40103 || e.code === 40000) fe.set('oldPassword', e.message || '当前密码不正确')
    else showError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <view class="page">
    <view class="lead">修改成功后，其他设备上的登录会失效，需要使用新密码重新登录。</view>
    <view class="card">
      <view class="card-title">修改密码</view>
      <FormItem label="当前密码" required :error="fe.get('oldPassword')">
        <input
          class="input"
          :class="{ 'is-error': !!fe.get('oldPassword'), 'is-focus': focus === 'oldPassword' }"
          :value="form.oldPassword"
          password
          maxlength="64"
          placeholder="请输入当前密码"
          placeholder-class="placeholder"
          @input="onInput('oldPassword', $event)"
          @focus="focus = 'oldPassword'"
          @blur="focus = ''"
        />
      </FormItem>
      <FormItem label="新密码" required :error="fe.get('newPassword')" help="8-64 位，至少包含字母和数字">
        <input
          class="input"
          :class="{ 'is-error': !!fe.get('newPassword'), 'is-focus': focus === 'newPassword' }"
          :value="form.newPassword"
          password
          maxlength="64"
          placeholder="请输入新密码"
          placeholder-class="placeholder"
          @input="onInput('newPassword', $event)"
          @focus="focus = 'newPassword'"
          @blur="focus = ''"
        />
      </FormItem>
      <FormItem label="确认新密码" required :error="fe.get('confirm')">
        <input
          class="input"
          :class="{ 'is-error': !!fe.get('confirm'), 'is-focus': focus === 'confirm' }"
          :value="form.confirm"
          password
          maxlength="64"
          placeholder="再次输入新密码"
          placeholder-class="placeholder"
          @input="onInput('confirm', $event)"
          @focus="focus = 'confirm'"
          @blur="focus = ''"
        />
      </FormItem>
      <view v-for="m in fe.general.value" :key="m" class="banner banner-danger">{{ m }}</view>
      <button
        class="btn btn-primary btn-block submit"
        hover-class="press-primary"
        :hover-stay-time="60"
        :loading="busy"
        :disabled="busy"
        @tap="submit"
      >
        确认修改
      </button>
    </view>
  </view>
</template>

<style scoped>
@import '../../styles/form.css';

.lead {
  margin: 8rpx 8rpx 24rpx 0;
  font-size: var(--eas-fs-sm);
  line-height: 1.6;
  color: var(--eas-ink-2);
}

.submit {
  margin-top: 24rpx;
}
</style>
