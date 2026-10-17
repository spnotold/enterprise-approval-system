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
  <view class="password">
    <view class="lead">修改成功后，其他设备上的登录会失效，需要使用新密码重新登录。</view>
    <view class="panel form">
      <FormItem label="当前密码" required :error="fe.get('oldPassword')">
        <input
          class="ctl"
          :class="{ 'ctl--error': !!fe.get('oldPassword'), 'ctl--focus': focus === 'oldPassword' }"
          :value="form.oldPassword"
          password
          maxlength="64"
          placeholder="请输入当前密码"
          placeholder-class="ctl-placeholder"
          @input="onInput('oldPassword', $event)"
          @focus="focus = 'oldPassword'"
          @blur="focus = ''"
        />
      </FormItem>
      <FormItem label="新密码" required :error="fe.get('newPassword')" help="8-64 位，至少包含字母和数字">
        <input
          class="ctl"
          :class="{ 'ctl--error': !!fe.get('newPassword'), 'ctl--focus': focus === 'newPassword' }"
          :value="form.newPassword"
          password
          maxlength="64"
          placeholder="请输入新密码"
          placeholder-class="ctl-placeholder"
          @input="onInput('newPassword', $event)"
          @focus="focus = 'newPassword'"
          @blur="focus = ''"
        />
      </FormItem>
      <FormItem label="确认新密码" required :error="fe.get('confirm')">
        <input
          class="ctl"
          :class="{ 'ctl--error': !!fe.get('confirm'), 'ctl--focus': focus === 'confirm' }"
          :value="form.confirm"
          password
          maxlength="64"
          placeholder="再次输入新密码"
          placeholder-class="ctl-placeholder"
          @input="onInput('confirm', $event)"
          @focus="focus = 'confirm'"
          @blur="focus = ''"
        />
      </FormItem>
      <view v-for="m in fe.general.value" :key="m" class="err">{{ m }}</view>
      <button
        class="submit"
        hover-class="submit--pressed"
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
.password {
  min-height: 100vh;
  padding: 32rpx 40rpx calc(48rpx + env(safe-area-inset-bottom));
  background: var(--eas-paper);
  color: var(--eas-ink);
  font-family: var(--eas-font-sans);
}

.lead {
  margin-bottom: 24rpx;
  font-size: var(--eas-fs-sm);
  line-height: 1.6;
  color: var(--eas-ink-2);
}

.panel {
  padding: 8rpx 32rpx 32rpx;
  background: var(--eas-surface);
  border: 1rpx solid var(--eas-rule);
  border-radius: var(--eas-radius-panel);
}

/* FormItem 的标签、帮助和错误文字改用 token 色 */
.form :deep(.field-label) {
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
}

.form :deep(.req) {
  color: var(--eas-danger);
}

.form :deep(.field-help) {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
}

.form :deep(.field-err),
.err {
  margin-top: 8rpx;
  font-size: var(--eas-fs-xs);
  line-height: 1.5;
  color: var(--eas-danger);
}

.ctl {
  width: 100%;
  height: 88rpx;
  padding: 0 24rpx;
  background: var(--eas-paper);
  border: 2rpx solid var(--eas-rule-strong);
  border-radius: var(--eas-radius-control);
  font-size: var(--eas-fs-md);
  color: var(--eas-ink);
  transition: border-color var(--eas-dur-fast) var(--eas-ease);
}

.ctl--focus {
  border-color: var(--eas-primary);
}

.ctl--error {
  background: var(--eas-danger-tint);
  border-color: var(--eas-danger);
}

.ctl-placeholder {
  color: var(--eas-placeholder);
}

.submit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 88rpx;
  margin: 32rpx 0 0;
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
</style>
