<script setup lang="ts">
// 登录：用户名或邮箱 + 密码；失败原因在按钮上方提示，演示账号点击即可填入
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ButtonInstance, FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import { showError } from '@/lib/errors'
import AuthShell from '@/components/AuthShell.vue'

interface DemoAccount {
  username: string
  name: string
  /** 按钮第二行的短身份 */
  role: string
  /** 完整说明，放在按钮 title 里 */
  desc: string
}

const DEMO_PASSWORD = 'Demo@2026'
const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: 'admin',
    name: '系统管理员',
    role: '系统管理员',
    desc: '总经办，系统管理员：管理功能；验证管理员不能审批',
  },
  { username: 'ceo_zhao', name: '赵总', role: '企业负责人', desc: '总经办，部门负责人、企业负责人' },
  { username: 'rd_head_li', name: '李研', role: '研发部负责人', desc: '研发部，部门负责人' },
  { username: 'rd_emp_wang', name: '王工', role: '研发部员工', desc: '研发部，员工，主演示员工' },
  { username: 'rd_emp_chen', name: '陈工', role: '研发部员工', desc: '研发部，员工' },
  { username: 'mkt_head_sun', name: '孙经理', role: '市场部负责人', desc: '市场部，部门负责人' },
  { username: 'mkt_emp_zhou', name: '周敏', role: '市场部员工', desc: '市场部，员工' },
  { username: 'fin_head_qian', name: '钱会计', role: '财务部负责人', desc: '财务部，部门负责人、财务审批人' },
  { username: 'fin_auditor_wu', name: '吴审', role: '财务审批主办', desc: '财务部，财务审批人主办人' },
  {
    username: 'pending_he',
    name: '何晓',
    role: '待审核账号',
    desc: '注册审核演示：申请加入市场部，审核通过前登录会提示待审核',
  },
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
/** 「登录」按钮：填入演示账号后把焦点交给它 */
const submitBtnRef = ref<ButtonInstance>()
// 仅后端以 demo profile 运行时展示演示账号；请求失败按非 demo 处理
const demoMode = ref(false)
const demoExpanded = ref(false)

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
  // 填好后直接可以回车登录：焦点移到「登录」按钮（el-button 根元素是 $el）
  const el = submitBtnRef.value?.$el
  if (el instanceof HTMLElement) el.focus()
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
          placeholder="请输入用户名或邮箱"
          autocomplete="username"
          maxlength="100"
          clearable
        />
      </el-form-item>
      <el-form-item label="密码" prop="password">
        <el-input
          v-model="form.password"
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

      <el-button ref="submitBtnRef" type="primary" native-type="submit" :loading="loading" class="submit">
        登录
      </el-button>
    </el-form>

    <div class="switch-line">
      还没有账号？<router-link to="/register" class="link">注册新账号</router-link>
    </div>

    <section v-if="demoMode" class="demo">
      <button
        type="button"
        class="demo-toggle"
        :aria-expanded="demoExpanded"
        aria-controls="demo-account-list"
        @click="demoExpanded = !demoExpanded"
      >
        <span class="demo-summary">
          <strong>演示账号</strong>
          <span>密码均为 {{ DEMO_PASSWORD }}，点一行即可填入</span>
        </span>
        <span class="demo-action">{{ demoExpanded ? '收起' : '展开' }}</span>
      </button>
      <ul v-if="demoExpanded" id="demo-account-list" class="demo-list">
        <li v-for="a in DEMO_ACCOUNTS" :key="a.username">
          <button type="button" class="demo-item" :title="a.desc" @click="fillDemo(a)">
            <span class="demo-line">
              <span class="demo-name">{{ a.name }}</span>
              <span class="demo-user">{{ a.username }}</span>
            </span>
            <span class="demo-role">{{ a.role }}</span>
          </button>
        </li>
      </ul>
    </section>
  </AuthShell>
</template>

<style scoped>
.auth-title {
  margin: 0 0 28px;
  font-family: var(--eas-font-serif);
  font-size: 28px;
  font-weight: 600;
  line-height: var(--eas-lh-title);
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
.auth-form :deep(.el-input__wrapper) {
  min-height: 40px;
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

.demo {
  margin-top: 28px;
  padding-top: 16px;
  border-top: 1px solid var(--eas-rule);
}
.demo-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-height: 32px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--eas-ink-2);
  font: inherit;
  font-size: var(--eas-fs-note);
  text-align: left;
  cursor: pointer;
}
.demo-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  min-width: 0;
}
.demo-summary strong {
  color: var(--eas-ink);
  font-weight: 600;
}
.demo-action {
  flex: none;
  color: var(--eas-primary);
}
.demo-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: hidden;
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  border: 1px solid var(--eas-rule);
  border-radius: var(--eas-radius-control);
}
.demo-list li {
  min-width: 0;
  border-bottom: 1px solid var(--eas-rule);
}
.demo-list li:nth-child(odd) {
  border-right: 1px solid var(--eas-rule);
}
.demo-list li:nth-last-child(-n + 2) {
  border-bottom: 0;
}
@container auth-main (max-width: 399px) {
  .demo-list {
    grid-template-columns: minmax(0, 1fr);
  }
  .demo-list li:nth-child(odd) {
    border-right: 0;
  }
  .demo-list li:nth-last-child(2) {
    border-bottom: 1px solid var(--eas-rule);
  }
}
.demo-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  box-sizing: border-box;
  min-height: 52px;
  padding: 7px 10px;
  border: 0;
  background: var(--eas-sheet);
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: var(--eas-ink);
  line-height: 1.5;
  transition:
    background-color var(--eas-dur-fast) var(--eas-ease),
    transform var(--eas-dur-fast) var(--eas-ease);
}
.demo-item:hover {
  background: var(--eas-row-hover);
}
.demo-item:active {
  transform: translateY(1px);
}
.demo-item:focus-visible {
  outline: 2px solid var(--eas-primary);
  outline-offset: -2px;
}
.demo-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}
.demo-name {
  font-size: var(--eas-fs-sm);
  font-weight: 600;
}
.demo-user {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-3);
  font-variant-numeric: tabular-nums;
}
.demo-role {
  font-size: var(--eas-fs-xs);
  color: var(--eas-ink-2);
}
</style>
