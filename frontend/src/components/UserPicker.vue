<script setup lang="ts">
// 用户选择：远程搜索启用用户（同行人员、转办对象、指定审批人）
import { computed, ref } from 'vue'
import { api } from '@/lib/api'
import type { UserOption } from '@/lib/types'

export interface UserPreset {
  id: number
  realName: string
  username?: string
  deptName?: string | null
}

const model = defineModel<number | number[] | null>({ default: null })

const props = withDefaults(
  defineProps<{
    multiple?: boolean
    placeholder?: string
    /** 已选用户的显示信息（编辑已有数据时传入，避免只显示 ID） */
    preset?: UserPreset[]
    /** 不可选的用户（如申请人本人） */
    exclude?: number[]
    disabled?: boolean
    clearable?: boolean
  }>(),
  { multiple: false, placeholder: '输入姓名或用户名搜索', preset: () => [], exclude: () => [], disabled: false, clearable: true },
)

const emit = defineEmits<{ change: [users: UserOption[]] }>()

const found = ref<UserOption[]>([])
const loading = ref(false)
let timer: number | undefined
let seq = 0

const options = computed<UserOption[]>(() => {
  const seen = new Set<number>()
  const list: UserOption[] = []
  for (const p of props.preset) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    list.push({ id: p.id, realName: p.realName, username: p.username ?? '', deptName: p.deptName ?? null })
  }
  for (const u of found.value) {
    if (seen.has(u.id)) continue
    seen.add(u.id)
    list.push(u)
  }
  return list
})

function search(q: string) {
  window.clearTimeout(timer)
  timer = window.setTimeout(async () => {
    const my = ++seq
    loading.value = true
    try {
      const r = await api.dict.users(q.trim())
      if (my === seq) found.value = r
    } catch {
      if (my === seq) found.value = []
    } finally {
      if (my === seq) loading.value = false
    }
  }, 300)
}

function onVisible(open: boolean) {
  if (open && found.value.length === 0) search('')
}

function onChange(v: number | number[] | null) {
  const ids = Array.isArray(v) ? v : v == null ? [] : [v]
  emit(
    'change',
    ids.map((id) => options.value.find((o) => o.id === id)).filter((o): o is UserOption => !!o),
  )
}
</script>

<template>
  <el-select
    v-model="model"
    :multiple="multiple"
    filterable
    remote
    :remote-method="search"
    :loading="loading"
    :placeholder="placeholder"
    :disabled="disabled"
    :clearable="clearable"
    remote-show-suffix
    style="width: 100%"
    @visible-change="onVisible"
    @change="onChange"
  >
    <el-option
      v-for="u in options"
      :key="u.id"
      :value="u.id"
      :label="u.deptName ? `${u.realName}（${u.deptName}）` : u.realName"
      :disabled="exclude.includes(u.id)"
    >
      <span>{{ u.realName }}</span>
      <span class="muted small" style="margin-left: 8px">{{ u.username }}{{ u.deptName ? ` · ${u.deptName}` : '' }}</span>
    </el-option>
  </el-select>
</template>
