<script setup lang="ts">
// 审批人规则：指定用户 / 申请人部门负责人 / 角色
import { computed, inject, watch } from 'vue'
import type { ApproverRule, ApproverRuleType, NodeMode, RoleCode, UserOption } from '@/lib/types'
import { APPROVER_RULE_LABEL, ROLE_LABEL } from '@/lib/labels'
import UserPicker, { type UserPreset } from '@/components/UserPicker.vue'
import { APPROVER_ROLES, USER_NAMES_KEY, isMultiMode, userName } from './utils'

const rule = defineModel<ApproverRule>('rule', { required: true })

const props = withDefaults(defineProps<{ mode?: NodeMode; readonly?: boolean }>(), {
  mode: 'SINGLE',
  readonly: false,
})

const names = inject(USER_NAMES_KEY, undefined)
const multi = computed(() => isMultiMode(props.mode))
const RULE_TYPES = Object.keys(APPROVER_RULE_LABEL) as ApproverRuleType[]

function onTypeChange(t: ApproverRuleType) {
  if (t === rule.value.type) return
  if (t === 'SPECIFIED_USER') rule.value = multi.value ? { type: t, userIds: [] } : { type: t, userId: null }
  else if (t === 'ROLE') rule.value = { type: t, roleCode: null }
  else rule.value = { type: t }
}

// 单人 <-> 多人模式切换时转换 userId / userIds
watch(multi, (m) => {
  const r = rule.value
  if (r.type !== 'SPECIFIED_USER') return
  if (m) {
    const ids = r.userIds?.length ? r.userIds : r.userId != null ? [r.userId] : []
    rule.value = { type: 'SPECIFIED_USER', userIds: ids }
  } else {
    rule.value = { type: 'SPECIFIED_USER', userId: r.userId ?? r.userIds?.[0] ?? null }
  }
})

const picked = computed<number | number[] | null>({
  get: () => (multi.value ? (rule.value.userIds ?? []) : (rule.value.userId ?? null)),
  set: (v) => {
    if (multi.value) rule.value.userIds = Array.isArray(v) ? v : v == null ? [] : [v]
    else rule.value.userId = Array.isArray(v) ? (v[0] ?? null) : v
  },
})

const preset = computed<UserPreset[]>(() => {
  const ids = multi.value ? (rule.value.userIds ?? []) : rule.value.userId != null ? [rule.value.userId] : []
  return ids.map((id) => ({ id, realName: userName(names, id) }))
})

function onUsers(users: UserOption[]) {
  if (!names) return
  for (const u of users) names[u.id] = u.realName
}

const roleCode = computed<RoleCode | ''>({
  get: () => rule.value.roleCode ?? '',
  set: (v) => (rule.value.roleCode = v || null),
})
</script>

<template>
  <div class="approver-rule">
    <el-radio-group
      :model-value="rule.type"
      :disabled="readonly"
      size="small"
      @update:model-value="(v) => onTypeChange(v as ApproverRuleType)"
    >
      <el-radio-button v-for="t in RULE_TYPES" :key="t" :value="t">{{ APPROVER_RULE_LABEL[t] }}</el-radio-button>
    </el-radio-group>

    <div class="rule-body">
      <template v-if="rule.type === 'SPECIFIED_USER'">
        <UserPicker
          v-model="picked"
          :multiple="multi"
          :preset="preset"
          :disabled="readonly"
          :placeholder="multi ? '搜索并选择多名审批人' : '搜索并选择审批人'"
          @change="onUsers"
        />
        <div class="muted small hint">
          {{ multi ? '会签 / 或签时为每名选中的用户创建待办。' : '直接由该用户审批。' }}要求用户处于启用状态，且不能是只有管理员角色的账号。
        </div>
      </template>
      <template v-else-if="rule.type === 'ROLE'">
        <el-select v-model="roleCode" placeholder="选择角色" :disabled="readonly" style="width: 100%">
          <el-option v-for="r in APPROVER_ROLES" :key="r" :value="r" :label="ROLE_LABEL[r]" />
        </el-select>
        <div class="muted small hint">单人模式取主办人，会签 / 或签取全部持有人。角色当前须有主办人。</div>
      </template>
      <div v-else class="muted small hint">
        取申请人主属部门的负责人；适用部门都须已设置负责人。
      </div>
    </div>
  </div>
</template>

<style scoped>
.approver-rule {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.rule-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hint {
  line-height: 1.5;
}
</style>
