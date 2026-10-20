<script setup lang="ts">
// 个人信息：账号、角色、权限与数据授权；邮件提醒开关；修改密码（成功后所有设备需重新登录）
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormItemRule, type FormRules } from 'element-plus'
import { api } from '@/lib/api'
import { toApiError } from '@/lib/http'
import { isDialogCancel, showError } from '@/lib/errors'
import { GRANT_PERMISSION_LABEL, PERMISSION_LABEL, ROLE_LABEL, SCOPE_TYPE_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { useFieldErrors } from '@/composables/useFieldErrors'
import { useAuthStore } from '@/stores/auth'
import { useDictStore } from '@/stores/dict'
import type { GrantBrief } from '@/lib/types'

// 与注册页、后端校验一致
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/
const PASSWORD_MSG = '密码 8-64 位，至少包含字母和数字'

const auth = useAuthStore()
const dict = useDictStore()

const me = computed(() => auth.me)
const refreshing = ref(false)

onMounted(async () => {
  // 角色与授权可能已被管理员调整，进入页面时刷新一次
  refreshing.value = true
  try {
    await auth.reloadMe()
  } catch {
    // 保留已有信息
  } finally {
    refreshing.value = false
  }
  if (auth.me?.headDeptIds.length) dict.loadDepartments().catch(() => undefined)
})

const roles = computed(() =>
  (me.value?.roles ?? []).map((r) => ({ code: r.code, name: ROLE_LABEL[r.code] ?? r.name, primary: r.primaryHandler })),
)
const permissions = computed(() => (me.value?.permissions ?? []).map((p) => ({ code: p, name: PERMISSION_LABEL[p] ?? p })))
const headDepts = computed(() => (me.value?.headDeptIds ?? []).map((id) => dict.deptName(id)))

function grantScope(g: GrantBrief): string {
  if (g.scopeType === 'ALL') return SCOPE_TYPE_LABEL.ALL
  return `${SCOPE_TYPE_LABEL.DEPT}：${g.deptName ?? dict.deptName(g.deptId)}`
}
const grantRows = computed(() =>
  (me.value?.grants ?? []).map((g, i) => ({
    key: i,
    label: GRANT_PERMISSION_LABEL[g.permissionCode] ?? g.permissionCode,
    scope: grantScope(g),
    validUntil: g.validUntil ? fmtDateTime(g.validUntil) : '长期有效',
  })),
)

// ---------- 邮件提醒 ----------

const savingPref = ref(false)

async function onEmailNotify(v: string | number | boolean) {
  if (!auth.me || savingPref.value) return
  const enable = v === true
  savingPref.value = true
  try {
    auth.me = await api.me.updatePreferences({ emailNotify: enable })
    ElMessage.success(enable ? '已开启邮件提醒' : '已关闭邮件提醒')
  } catch (e) {
    showError(e, '保存失败')
  } finally {
    savingPref.value = false
  }
}

// ---------- 修改密码 ----------

type Validator = NonNullable<FormItemRule['validator']>

const pwdRef = ref<FormInstance>()
const pwd = reactive({ oldPassword: '', newPassword: '', confirm: '' })
const pfe = useFieldErrors()
const pwdError = ref('')
const changing = ref(false)

const notSameAsOld: Validator = (_rule, _value, callback) => {
  if (pwd.newPassword && pwd.newPassword === pwd.oldPassword) return callback(new Error('新密码不能与当前密码相同'))
  callback()
}
const confirmValidator: Validator = (_rule, _value, callback) => {
  if (!pwd.confirm) return callback(new Error('请再次输入新密码'))
  if (pwd.confirm !== pwd.newPassword) return callback(new Error('两次输入的密码不一致'))
  callback()
}
const pwdRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { pattern: PASSWORD_RE, message: PASSWORD_MSG, trigger: 'blur' },
    { validator: notSameAsOld, trigger: 'blur' },
  ],
  confirm: [{ validator: confirmValidator, trigger: ['blur', 'change'] }],
}

function touch(field: 'oldPassword' | 'newPassword') {
  if (pfe.get(field)) pfe.clear(field)
  pwdError.value = ''
}

async function changePassword() {
  if (changing.value) return
  const ok = await pwdRef.value?.validate().catch(() => false)
  if (!ok) return
  try {
    await ElMessageBox.confirm('修改成功后需要重新登录，其他设备上的登录也会失效。', '修改密码', {
      type: 'warning',
      confirmButtonText: '确认修改',
      cancelButtonText: '取消',
    })
  } catch (e) {
    if (isDialogCancel(e)) return
    throw e
  }
  changing.value = true
  pfe.clear()
  pwdError.value = ''
  try {
    await api.me.changePassword({ oldPassword: pwd.oldPassword, newPassword: pwd.newPassword })
    ElMessage.success('密码已修改，请重新登录')
    await auth.logout()
  } catch (e) {
    const err = toApiError(e)
    if (err.code === 40103) {
      // 当前密码错误
      pfe.set({ oldPassword: '当前密码不正确' })
    } else if (err.code === 40000 || err.code === 42201) {
      if (pfe.fromApi(err)) {
        if (pfe.general.value.length) pwdError.value = pfe.general.value.join('；')
      } else if (/旧密码|原密码|当前密码/.test(err.message)) {
        pfe.set({ oldPassword: err.message })
      } else {
        pwdError.value = err.message
      }
    } else {
      showError(err, '修改失败')
    }
  } finally {
    changing.value = false
  }
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">个人信息</h2>

    <div v-if="!me" class="sheet skeleton-sheet">
      <el-skeleton :rows="8" animated />
    </div>
    <div v-else class="profile-grid">
      <div class="stack">
        <section v-loading="refreshing" class="sheet">
          <div class="sheet-head"><h2>基本信息</h2></div>
          <dl class="field-list">
            <div class="field"><dt>用户名</dt><dd>{{ me.username }}</dd></div>
            <div class="field"><dt>姓名</dt><dd>{{ me.realName }}</dd></div>
            <div class="field"><dt>邮箱</dt><dd>{{ me.email }}</dd></div>
            <div class="field"><dt>所属部门</dt><dd>{{ me.deptName ?? '未分配' }}</dd></div>
            <div class="field field-full">
              <dt>角色</dt>
              <dd>
                <div class="tags">
                  <el-tag v-for="r in roles" :key="r.code" effect="plain" disable-transitions>
                    {{ r.name }}<span v-if="r.primary" class="primary-mark">（主办人）</span>
                  </el-tag>
                  <span v-if="!roles.length" class="muted">无</span>
                </div>
              </dd>
            </div>
            <div v-if="headDepts.length" class="field field-full">
              <dt>负责部门</dt>
              <dd>
                <div class="tags">
                  <el-tag v-for="(d, i) in headDepts" :key="i" type="success" effect="plain" disable-transitions>
                    {{ d }}
                  </el-tag>
                </div>
              </dd>
            </div>
            <div class="field field-full">
              <dt>功能权限</dt>
              <dd>
                <div class="tags">
                  <el-tag v-for="p in permissions" :key="p.code" type="info" disable-transitions>{{ p.name }}</el-tag>
                  <span v-if="!permissions.length" class="muted">无</span>
                </div>
              </dd>
            </div>
          </dl>
        </section>

        <section class="sheet">
          <div class="sheet-head"><h2>数据授权</h2></div>
          <p v-if="!grantRows.length" class="empty-line">暂无数据授权</p>
          <el-table v-else :data="grantRows" row-key="key" class="full">
            <el-table-column prop="label" label="权限" min-width="180" />
            <el-table-column prop="scope" label="范围" min-width="140" />
            <el-table-column prop="validUntil" label="有效期至" min-width="150" />
          </el-table>
        </section>
      </div>

      <div class="stack">
        <section class="sheet">
          <div class="sheet-head"><h2>通知设置</h2></div>
          <div class="sheet-section pref-row">
            <div>
              <div>邮件提醒</div>
              <div class="muted small">新待办、审批结果等重要通知同时发送到 {{ me.email }}；站内通知不受影响</div>
            </div>
            <el-switch
              :model-value="me.emailNotify"
              :loading="savingPref"
              inline-prompt
              active-text="开"
              inactive-text="关"
              aria-label="邮件提醒"
              @change="onEmailNotify"
            />
          </div>
        </section>

        <section class="sheet">
          <div class="sheet-head"><h2>修改密码</h2></div>
          <div class="sheet-section">
            <el-form
              ref="pwdRef"
              :model="pwd"
              :rules="pwdRules"
              label-position="top"
              class="pwd-form"
              @submit.prevent="changePassword"
            >
              <el-form-item label="当前密码" prop="oldPassword" :error="pfe.get('oldPassword')">
                <el-input
                  v-model="pwd.oldPassword"
                  type="password"
                  autocomplete="current-password"
                  maxlength="64"
                  show-password
                  @input="touch('oldPassword')"
                />
              </el-form-item>
              <el-form-item label="新密码" prop="newPassword" :error="pfe.get('newPassword')">
                <el-input
                  v-model="pwd.newPassword"
                  type="password"
                  autocomplete="new-password"
                  maxlength="64"
                  show-password
                  :placeholder="PASSWORD_MSG"
                  @input="touch('newPassword')"
                />
              </el-form-item>
              <el-form-item label="确认新密码" prop="confirm">
                <el-input
                  v-model="pwd.confirm"
                  type="password"
                  autocomplete="new-password"
                  maxlength="64"
                  show-password
                />
              </el-form-item>
              <el-alert
                v-if="pwdError"
                :title="pwdError"
                type="error"
                show-icon
                :closable="false"
                class="form-alert"
              />
              <el-button type="primary" native-type="submit" :loading="changing">修改密码</el-button>
              <div class="muted small hint">修改成功后将退出登录，其他设备上的登录也会失效。</div>
            </el-form>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-sheet {
  padding: var(--eas-sheet-pad);
}
.profile-grid {
  display: grid;
  grid-template-columns: 7fr 5fr;
  gap: var(--eas-gap);
  align-items: start;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: var(--eas-gap);
  min-width: 0;
}
/* 两列字段：字段名 96px ink-2，值 ink；长内容独占一行 */
.field-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px 32px;
  margin: 0;
  padding: 20px var(--eas-sheet-pad) 24px;
}
.field {
  display: flex;
  gap: 16px;
  min-width: 0;
}
.field dt {
  flex: none;
  width: 96px;
  color: var(--eas-ink-2);
}
.field dd {
  margin: 0;
  min-width: 0;
  color: var(--eas-ink);
  overflow-wrap: anywhere;
}
.field-full {
  grid-column: 1 / -1;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.primary-mark {
  color: var(--eas-warning-text);
}
.full {
  width: 100%;
}
.empty-line {
  margin: 0;
  padding: 4px var(--eas-sheet-pad) 24px;
  color: var(--eas-ink-2);
}
.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.pwd-form {
  max-width: 420px;
}
.form-alert {
  margin-bottom: 16px;
}
.hint {
  margin-top: 8px;
}
@media (max-width: 1000px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 767px) {
  .field-list {
    grid-template-columns: 1fr;
  }
}
</style>
