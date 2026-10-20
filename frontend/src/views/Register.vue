<script setup lang="ts">
// 注册：与后端相同的格式正则即时提示；用户名 / 邮箱防抖检查是否可用；提交后等待管理员审核
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormItemRule, type FormRules } from 'element-plus'
import { CircleCheckFilled, CircleCloseFilled, Loading } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import { showError } from '@/lib/errors'
import { useFieldErrors } from '@/composables/useFieldErrors'
import AuthShell from '@/components/AuthShell.vue'
import { useDictStore } from '@/stores/dict'
import type { DeptOption } from '@/lib/types'

// 与后端 RegisterRequest 的 Bean Validation 保持一致
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const USERNAME_MSG = '用户名为 4-32 位字母、数字或下划线，以字母开头'
const PASSWORD_MSG = '密码 8-64 位，至少包含字母和数字'
const TAKEN_RULES = new Set(['USERNAME_TAKEN', 'EMAIL_TAKEN'])

type Field = 'username' | 'realName' | 'email' | 'password' | 'confirm' | 'requestedDeptId'
type AvailState = 'idle' | 'checking' | 'available' | 'taken'
type AvailKey = 'username' | 'email'

const router = useRouter()
const dict = useDictStore()
const fe = useFieldErrors()

const formRef = ref<FormInstance>()
const form = reactive({
  username: '',
  realName: '',
  email: '',
  password: '',
  confirm: '',
  requestedDeptId: null as number | null,
})
const submitting = ref(false)
const formError = ref('')

const depts = ref<DeptOption[]>([])
const deptsLoading = ref(false)
const deptsFailed = ref(false)

async function loadDepts() {
  deptsLoading.value = true
  deptsFailed.value = false
  try {
    depts.value = await dict.loadPublicDepartments()
  } catch (e) {
    deptsFailed.value = true
    showError(e, '部门列表加载失败')
  } finally {
    deptsLoading.value = false
  }
}
onMounted(loadDepts)

// ---------- 用户名 / 邮箱可用性（防抖 400 ms，仅格式正确时检查） ----------

const avail = reactive<Record<AvailKey, AvailState>>({ username: 'idle', email: 'idle' })
const timers: Partial<Record<AvailKey, number>> = {}

function formatOk(key: AvailKey, v: string): boolean {
  return key === 'username' ? USERNAME_RE.test(v) : v.length <= 100 && EMAIL_RE.test(v)
}

function scheduleCheck(key: AvailKey) {
  window.clearTimeout(timers[key])
  avail[key] = 'idle'
  const value = form[key].trim()
  if (!formatOk(key, value)) return
  avail[key] = 'checking'
  timers[key] = window.setTimeout(async () => {
    try {
      const r = await api.auth.availability(key === 'username' ? { username: value } : { email: value })
      if (form[key].trim() !== value) return // 已继续输入，结果作废
      const ok = key === 'username' ? r.usernameAvailable : r.emailAvailable
      avail[key] = ok == null ? 'idle' : ok ? 'available' : 'taken'
      // 格式已正确，此时重新校验只会显示或清除“已被占用”
      formRef.value?.validateField(key).catch(() => undefined)
    } catch {
      // 可用性检查只是提示，失败时以提交结果为准
      if (form[key].trim() === value) avail[key] = 'idle'
    }
  }, 400)
}

watch(
  () => form.username,
  () => scheduleCheck('username'),
)
watch(
  () => form.email,
  () => scheduleCheck('email'),
)
onBeforeUnmount(() => {
  window.clearTimeout(timers.username)
  window.clearTimeout(timers.email)
})

// ---------- 密码强度 ----------

const strength = computed(() => {
  const p = form.password
  if (!p) return null
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(p)).length
  if (p.length < 8 || classes < 2) return { level: 1, text: '弱', color: 'var(--eas-danger)' }
  if ((p.length >= 12 && classes >= 3) || (p.length >= 10 && classes === 4))
    return { level: 3, text: '强', color: 'var(--eas-success)' }
  return { level: 2, text: '中', color: 'var(--eas-warning-text)' }
})

// ---------- 校验规则 ----------

type Validator = NonNullable<FormItemRule['validator']>

const usernameValidator: Validator = (_rule, _value, callback) => {
  const v = form.username.trim()
  if (!v) return callback(new Error('请输入用户名'))
  if (!USERNAME_RE.test(v)) return callback(new Error(USERNAME_MSG))
  if (avail.username === 'taken') return callback(new Error('用户名已被占用'))
  callback()
}

const emailValidator: Validator = (_rule, _value, callback) => {
  const v = form.email.trim()
  if (!v) return callback(new Error('请输入邮箱'))
  if (v.length > 100) return callback(new Error('邮箱不超过 100 个字符'))
  if (!EMAIL_RE.test(v)) return callback(new Error('邮箱格式不正确'))
  if (avail.email === 'taken') return callback(new Error('邮箱已被占用'))
  callback()
}

const confirmValidator: Validator = (_rule, _value, callback) => {
  if (!form.confirm) return callback(new Error('请再次输入密码'))
  if (form.confirm !== form.password) return callback(new Error('两次输入的密码不一致'))
  callback()
}

const rules: FormRules = {
  username: [{ validator: usernameValidator, trigger: ['blur', 'change'] }],
  realName: [
    { required: true, whitespace: true, message: '请输入姓名', trigger: 'blur' },
    { max: 50, message: '姓名不超过 50 个字符', trigger: ['blur', 'change'] },
  ],
  email: [{ validator: emailValidator, trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { pattern: PASSWORD_RE, message: PASSWORD_MSG, trigger: 'blur' },
  ],
  confirm: [{ validator: confirmValidator, trigger: ['blur', 'change'] }],
  requestedDeptId: [{ required: true, type: 'number', message: '请选择申请加入的部门', trigger: 'change' }],
}

watch(
  () => form.password,
  () => {
    if (form.confirm) formRef.value?.validateField('confirm').catch(() => undefined)
  },
)

/** 用户修改字段后清除该字段的服务端错误 */
function touch(field: Field) {
  if (fe.get(field)) fe.clear(field)
  formError.value = ''
}

// ---------- 提交 ----------

async function onSubmit() {
  if (submitting.value) return
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) {
    await fe.scrollToFirst()
    return
  }
  submitting.value = true
  fe.clear()
  formError.value = ''
  try {
    await api.auth.register({
      username: form.username.trim(),
      realName: form.realName.trim(),
      email: form.email.trim(),
      password: form.password,
      requestedDeptId: form.requestedDeptId as number,
    })
    ElMessage.success('注册成功，等待管理员审核')
    await router.push({ path: '/login' })
  } catch (e) {
    const err = toApiError(e)
    if (err.code === 40000 || err.code === 42201) {
      const taken = err.errors.filter((x) => TAKEN_RULES.has(x.rule) || /占用|已存在|已注册/.test(x.message))
      for (const t of taken) {
        if (t.field === 'username' || t.rule === 'USERNAME_TAKEN') avail.username = 'taken'
        if (t.field === 'email' || t.rule === 'EMAIL_TAKEN') avail.email = 'taken'
      }
      const mapped = fe.fromApi(err)
      if (taken.length || /占用/.test(err.message)) formError.value = '用户名或邮箱已被占用'
      else if (!mapped || fe.general.value.length) formError.value = fe.general.value.join('；') || err.message
      await fe.scrollToFirst()
    } else {
      showError(err, '注册失败')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthShell>
    <h1 class="auth-title">注册</h1>
    <p class="auth-sub">提交后由管理员审核，审核通过即可登录</p>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      size="large"
      class="auth-form"
      @submit.prevent="onSubmit"
    >
      <el-form-item label="用户名" prop="username" :error="fe.get('username')">
        <el-input
          v-model="form.username"
          placeholder="字母开头，4-32 位字母、数字或下划线"
          autocomplete="username"
          maxlength="32"
          @input="touch('username')"
        >
          <template #suffix>
            <span v-if="avail.username === 'checking'" class="avail muted">
              <el-icon class="is-loading"><Loading /></el-icon>检查中
            </span>
            <span v-else-if="avail.username === 'available'" class="avail ok">
              <el-icon><CircleCheckFilled /></el-icon>可以使用
            </span>
            <span v-else-if="avail.username === 'taken'" class="avail bad">
              <el-icon><CircleCloseFilled /></el-icon>已被占用
            </span>
          </template>
        </el-input>
      </el-form-item>

      <el-form-item label="姓名" prop="realName" :error="fe.get('realName')">
        <el-input
          v-model="form.realName"
          placeholder="真实姓名"
          autocomplete="name"
          maxlength="50"
          @input="touch('realName')"
        />
      </el-form-item>

      <el-form-item label="邮箱" prop="email" :error="fe.get('email')">
        <el-input
          v-model="form.email"
          placeholder="用于接收审批提醒，也可用于登录"
          autocomplete="email"
          maxlength="100"
          @input="touch('email')"
        >
          <template #suffix>
            <span v-if="avail.email === 'checking'" class="avail muted">
              <el-icon class="is-loading"><Loading /></el-icon>检查中
            </span>
            <span v-else-if="avail.email === 'available'" class="avail ok">
              <el-icon><CircleCheckFilled /></el-icon>可以使用
            </span>
            <span v-else-if="avail.email === 'taken'" class="avail bad">
              <el-icon><CircleCloseFilled /></el-icon>已被占用
            </span>
          </template>
        </el-input>
      </el-form-item>

      <el-form-item label="密码" prop="password" :error="fe.get('password')">
        <el-input
          v-model="form.password"
          type="password"
          placeholder="8-64 位，至少包含字母和数字"
          autocomplete="new-password"
          maxlength="64"
          show-password
          @input="touch('password')"
        />
        <div v-if="strength" class="strength" aria-live="polite">
          <div class="strength-bar">
            <span
              v-for="i in 3"
              :key="i"
              class="seg"
              :style="i <= strength.level ? { background: strength.color } : undefined"
            />
          </div>
          <span class="small" :style="{ color: strength.color }">密码强度：{{ strength.text }}</span>
        </div>
      </el-form-item>

      <el-form-item label="确认密码" prop="confirm">
        <el-input
          v-model="form.confirm"
          type="password"
          placeholder="再次输入密码"
          autocomplete="new-password"
          maxlength="64"
          show-password
          @input="touch('confirm')"
        />
      </el-form-item>

      <el-form-item label="申请加入的部门" prop="requestedDeptId" :error="fe.get('requestedDeptId')">
        <el-select
          v-model="form.requestedDeptId"
          placeholder="请选择部门"
          filterable
          :loading="deptsLoading"
          class="full"
          @change="touch('requestedDeptId')"
        >
          <el-option v-for="d in depts" :key="d.id" :label="d.name" :value="d.id" />
        </el-select>
        <div v-if="deptsFailed" class="small text-danger">
          部门列表加载失败，<el-button link type="primary" size="small" @click="loadDepts">重试</el-button>
        </div>
      </el-form-item>

      <el-alert
        v-if="formError"
        :title="formError"
        type="error"
        show-icon
        :closable="false"
        class="form-alert"
      />

      <el-button type="primary" native-type="submit" :loading="submitting" class="submit">
        注册
      </el-button>
    </el-form>

    <div class="switch-line">
      已有账号？<router-link to="/login" class="link">返回登录</router-link>
    </div>
  </AuthShell>
</template>

<style scoped>
.auth-title {
  margin: 0;
  font-family: var(--eas-font-serif);
  font-size: 28px;
  font-weight: 600;
  line-height: var(--eas-lh-title);
}
.auth-sub {
  margin: 6px 0 24px;
  color: var(--eas-ink-2);
}
.auth-form :deep(.el-form-item) {
  margin-bottom: 18px;
}
.auth-form :deep(.el-form-item__label) {
  height: auto;
  margin-bottom: 6px;
  padding: 0;
  color: var(--eas-ink);
  line-height: 1.5;
}
.auth-form :deep(.el-input__wrapper),
.auth-form :deep(.el-select__wrapper) {
  min-height: 40px;
}
.full {
  width: 100%;
}
.avail {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--eas-fs-xs);
  white-space: nowrap;
}
.avail.ok {
  color: var(--eas-success);
}
.avail.bad {
  color: var(--eas-danger);
}
.strength {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-top: 6px;
  line-height: 1.4;
}
.strength-bar {
  display: flex;
  gap: 4px;
  flex: 1;
  max-width: 180px;
}
.seg {
  flex: 1;
  height: 4px;
  border-radius: var(--eas-radius-tag);
  background: var(--eas-rule);
  transition: background var(--eas-dur) var(--eas-ease);
}
.form-alert {
  margin-bottom: 18px;
}
.submit {
  width: 100%;
  height: 42px;
  font-size: var(--eas-fs-nav);
}
.switch-line {
  margin-top: 16px;
  font-size: var(--eas-fs-sm);
  color: var(--eas-ink-2);
}
.link {
  color: var(--eas-primary);
  text-decoration: none;
}
.link:hover {
  text-decoration: underline;
}
.link:focus-visible {
  border-radius: var(--eas-radius-tag);
}
</style>
