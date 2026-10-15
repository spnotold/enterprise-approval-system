<script setup lang="ts">
// 登录：用户名或邮箱 + 密码；失败原因在按钮上方提示，演示账号点击即可填入
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { toApiError } from '@/lib/http'
import { showError } from '@/lib/errors'

interface DemoAccount {
  username: string
  name: string
  desc: string
}

const DEMO_PASSWORD = 'Demo@2026'
const DEMO_ACCOUNTS: DemoAccount[] = [
  { username: 'admin', name: '系统管理员', desc: '总经办，系统管理员：管理功能；验证管理员不能审批' },
  { username: 'ceo_zhao', name: '赵总', desc: '总经办，部门负责人、企业负责人' },
  { username: 'rd_head_li', name: '李研', desc: '研发部，部门负责人' },
  { username: 'rd_emp_wang', name: '王工', desc: '研发部，员工，主演示员工' },
  { username: 'rd_emp_chen', name: '陈工', desc: '研发部，员工' },
  { username: 'mkt_head_sun', name: '孙经理', desc: '市场部，部门负责人' },
  { username: 'mkt_emp_zhou', name: '周敏', desc: '市场部，员工' },
  { username: 'fin_head_qian', name: '钱会计', desc: '财务部，部门负责人、财务审批人' },
  { username: 'fin_auditor_wu', name: '吴审', desc: '财务部，财务审批人主办人' },
  { username: 'pending_he', name: '何晓', desc: '注册审核演示：申请加入市场部，审核通过前登录会提示待审核' },
]

/** 需要在按钮上方提示的错误码；其余错误走统一提示 */
const INLINE_ERRORS: Record<number, { text: string; type: 'error' | 'warning' }> = {
  40103: { text: '用户名或密码错误', type: 'error' },
  40104: { text: '账号待管理员审核，审核通过后即可登录', type: 'warning' },
  40105: {
    text: '账号已停用或已被锁定（连续失败 5 次锁定 15 分钟），请稍后再试或联系管理员',
    type: 'error',
  },
  42901: { text: '登录过于频繁，请稍后再试', type: 'warning' },
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const formRef = ref<FormInstance>()
const form = reactive({ account: '', password: '' })
const rules: FormRules = {
  account: [{ required: true, whitespace: true, message: '请输入用户名或邮箱', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}
const loading = ref(false)
const inlineError = ref<{ text: string; type: 'error' | 'warning' } | null>(null)
const demoOpen = ref<string[]>([])

/** 只接受站内路径，防止开放重定向 */
function redirectTarget(): string {
  const r = route.query.redirect
  if (typeof r === 'string' && r.startsWith('/') && !r.startsWith('//') && !r.startsWith('/\\')) return r
  return '/'
}

async function onSubmit() {
  if (loading.value) return
  const ok = await formRef.value?.validate().catch(() => false)
  if (!ok) return
  loading.value = true
  inlineError.value = null
  try {
    await auth.login(form.account.trim(), form.password)
    await router.replace(redirectTarget())
  } catch (e) {
    const err = toApiError(e)
    const inline = INLINE_ERRORS[err.code]
    if (inline) {
      inlineError.value = inline
      if (err.code === 40103) form.password = ''
    } else {
      showError(err, '登录失败')
    }
  } finally {
    loading.value = false
  }
}

function fillDemo(a: DemoAccount) {
  form.account = a.username
  form.password = DEMO_PASSWORD
  inlineError.value = null
  formRef.value?.clearValidate()
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <div class="brand">
        <span class="logo">审</span>
        <div>
          <h1 class="brand-title">企业审批系统</h1>
          <div class="muted small">登录以继续</div>
        </div>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        class="auth-form"
        @submit.prevent="onSubmit"
      >
        <el-form-item label="用户名或邮箱" prop="account">
          <el-input
            v-model="form.account"
            :prefix-icon="User"
            placeholder="请输入用户名或邮箱"
            autocomplete="username"
            maxlength="100"
            clearable
          />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            :prefix-icon="Lock"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
            maxlength="64"
            show-password
          />
        </el-form-item>

        <el-alert
          v-if="inlineError"
          :title="inlineError.text"
          :type="inlineError.type"
          show-icon
          :closable="false"
          class="form-alert"
        />

        <el-button type="primary" native-type="submit" :loading="loading" class="submit">登 录</el-button>
      </el-form>

      <div class="switch-line">
        还没有账号？<router-link to="/register" class="link">注册新账号</router-link>
      </div>

      <el-collapse v-model="demoOpen" class="demo">
        <el-collapse-item name="demo">
          <template #title>
            <span class="demo-title">演示账号</span>
            <span class="muted small">（密码均为 {{ DEMO_PASSWORD }}，点击填入）</span>
          </template>
          <ul class="demo-list">
            <li v-for="a in DEMO_ACCOUNTS" :key="a.username">
              <button type="button" class="demo-item" @click="fillDemo(a)">
                <span class="demo-head">
                  <span class="mono">{{ a.username }}</span>
                  <span class="demo-name">{{ a.name }}</span>
                </span>
                <span class="muted small">{{ a.desc }}</span>
              </button>
            </li>
          </ul>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  box-sizing: border-box;
  background:
    radial-gradient(circle at 15% 20%, var(--el-color-primary-light-8), transparent 45%),
    radial-gradient(circle at 85% 80%, var(--el-color-primary-light-9), transparent 50%),
    var(--el-bg-color-page);
}
.auth-card {
  width: 100%;
  max-width: 420px;
  padding: 32px 28px 20px;
  box-sizing: border-box;
  background: var(--el-bg-color);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--el-color-primary);
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  flex-shrink: 0;
}
.brand-title {
  margin: 0 0 2px;
  font-size: 22px;
  font-weight: 600;
}
.form-alert {
  margin-bottom: 16px;
}
.submit {
  width: 100%;
}
.switch-line {
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
  color: var(--el-text-color-regular);
}
.link {
  color: var(--el-color-primary);
  text-decoration: none;
}
.link:hover {
  text-decoration: underline;
}
.demo {
  margin-top: 20px;
}
.demo-title {
  font-weight: 600;
  margin-right: 4px;
}
.demo-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 320px;
  overflow-y: auto;
}
.demo-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
  line-height: 1.5;
}
.demo-item:hover,
.demo-item:focus-visible {
  background: var(--el-fill-color-light);
  outline: none;
}
.demo-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.demo-name {
  font-weight: 500;
}
@media (max-width: 480px) {
  .auth-card {
    padding: 24px 18px 16px;
  }
}
</style>
