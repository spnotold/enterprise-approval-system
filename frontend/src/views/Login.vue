<script setup lang="ts">
// 登录：用户名或邮箱 + 密码；失败原因在按钮上方提示，演示账号点击即可填入
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import { showError } from '@/lib/errors'
import AuthShell from '@/components/AuthShell.vue'

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
// 仅后端以 demo profile 运行时展示演示账号；请求失败按非 demo 处理
const demoMode = ref(false)

onMounted(async () => {
  try {
    demoMode.value = (await api.dict.publicConfig()).demo === true
  } catch {
    demoMode.value = false
  }
})

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
  <AuthShell>
    <h1 class="auth-title">登录</h1>

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

      <el-button type="primary" native-type="submit" :loading="loading" class="submit">登录</el-button>
    </el-form>

    <div class="switch-line">
      还没有账号？<router-link to="/register" class="link">注册新账号</router-link>
    </div>

    <el-collapse v-if="demoMode" v-model="demoOpen" class="demo">
      <el-collapse-item name="demo">
        <template #title>
          <span class="demo-title">演示账号</span>
          <span class="muted small">密码均为 {{ DEMO_PASSWORD }}，点击一行填入</span>
        </template>
        <ul class="demo-list">
          <li v-for="a in DEMO_ACCOUNTS" :key="a.username">
            <button type="button" class="demo-item" @click="fillDemo(a)">
              <span class="demo-head">
                <span class="demo-name">{{ a.name }}</span>
                <span class="demo-user">{{ a.username }}</span>
              </span>
              <span class="demo-desc">{{ a.desc }}</span>
            </button>
          </li>
        </ul>
      </el-collapse-item>
    </el-collapse>
  </AuthShell>
</template>

<style scoped>
.auth-title {
  margin: 0 0 24px;
  font-size: var(--eas-fs-lg);
  font-weight: 600;
  line-height: 1.4;
}
.form-alert {
  margin-bottom: 16px;
}
.submit {
  width: 100%;
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

/* 演示账号：整行可点，悬停高亮 */
.demo {
  --el-collapse-header-height: 44px;
  margin-top: 24px;
  border-top: 1px solid var(--eas-rule);
  border-bottom: none;
}
.demo :deep(.el-collapse-item__header) {
  gap: 8px;
  border-bottom: none;
}
.demo :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}
.demo :deep(.el-collapse-item__content) {
  padding-bottom: 8px;
}
.demo-title {
  font-weight: 600;
  margin-right: 8px;
}
.demo-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 300px;
  overflow-y: auto;
}
.demo-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px 8px 7px;
  border: none;
  border-left: 3px solid transparent;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
  line-height: 1.5;
}
.demo-item:hover,
.demo-item:focus-visible {
  background: var(--eas-paper);
  border-left-color: var(--eas-primary);
}
.demo-item:focus-visible {
  outline-offset: -2px;
}
.demo-item:active {
  background: var(--eas-paper-deep);
}
.demo-head {
  display: flex;
  gap: 12px;
  align-items: baseline;
}
.demo-name {
  font-weight: 500;
}
.demo-user {
  color: var(--eas-ink-2);
  font-size: var(--eas-fs-xs);
  font-variant-numeric: tabular-nums;
}
.demo-desc {
  color: var(--eas-ink-3);
  font-size: var(--eas-fs-xs);
}
</style>
