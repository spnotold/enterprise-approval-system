<script setup lang="ts">
// 流程模板管理：列表、新建自定义模板、编辑基本信息、启用 / 停用、进入设计
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { TemplateAdminDetail, TemplateAdminItem } from '@/lib/types'
import { APP_TYPE_LABEL } from '@/lib/labels'
import { fmtDateTime } from '@/lib/datetime'
import { showError, toApiError } from '@/lib/errors'
import { promptReason } from '@/lib/prompt'
import { useDictStore } from '@/stores/dict'
import ListEmpty from '@/components/ListEmpty.vue'

const router = useRouter()
const dict = useDictStore()

const list = ref<TemplateAdminItem[]>([])
const loading = ref(false)
const loaded = ref(false)
const keyword = ref('')
const category = ref<'' | 'BUILTIN' | 'CUSTOM'>('')
const togglingId = ref<number | null>(null)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return list.value.filter(
    (t) =>
      (!category.value || t.category === category.value) &&
      (!kw || t.name.toLowerCase().includes(kw) || t.code.toLowerCase().includes(kw)),
  )
})
const hasFilter = computed(() => !!keyword.value.trim() || !!category.value)

function resetFilter() {
  keyword.value = ''
  category.value = ''
}

async function load() {
  loading.value = true
  try {
    list.value = await api.admin.templates.list()
    loaded.value = true
  } catch (e) {
    showError(e, '加载模板失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  dict.loadDepartments().catch(() => undefined)
})

function designPath(id: number) {
  return `/admin/templates/${id}/design`
}

/** 用接口返回的详情更新列表行 */
function patchRow(d: TemplateAdminDetail) {
  const i = list.value.findIndex((t) => t.id === d.id)
  if (i < 0) return
  const { versions: _v, published: _p, draft: _d, ...item } = d
  list.value[i] = { ...list.value[i], ...item }
}

// ---------- 启用 / 停用 ----------

async function toggle(row: TemplateAdminItem): Promise<boolean> {
  if (togglingId.value !== null) return false
  const disabling = row.enabled
  const reason = await promptReason(
    disabling
      ? {
          title: `停用模板“${row.name}”`,
          message: '停用后员工不能新建，已有草稿提交时被拒绝，审批中的申请不受影响。请填写停用原因（将写入审计日志）。',
          confirmText: '停用',
          danger: true,
        }
      : {
          title: `启用模板“${row.name}”`,
          message: '启用后适用部门的员工可以使用该模板发起申请。请填写原因（将写入审计日志）。',
          confirmText: '启用',
        },
  )
  if (reason === null) return false
  togglingId.value = row.id
  try {
    const d = disabling
      ? await api.admin.templates.disable(row.id, { reason })
      : await api.admin.templates.enable(row.id, { reason })
    patchRow(d)
    ElMessage.success(disabling ? '模板已停用' : '模板已启用')
  } catch (e) {
    showError(e)
  } finally {
    togglingId.value = null
  }
  // 状态以接口返回为准（已在 patchRow 中更新），开关自身不切换
  return false
}

// ---------- 新建 / 编辑 ----------

const CODE_RE = /^[A-Z][A-Z0-9_]{1,31}$/

const dialog = reactive({
  visible: false,
  mode: 'create' as 'create' | 'edit',
  id: null as number | null,
  builtin: false,
  saving: false,
})
const formRef = ref<FormInstance>()
const form = reactive({ code: '', name: '', description: '', deptIds: [] as number[] })
const serverErrors = reactive<Record<string, string>>({})

const len = (v: unknown) => [...String(v ?? '').trim()].length

const rules: FormRules<typeof form> = {
  code: [
    { required: true, message: '请填写模板编码', trigger: 'blur' },
    { pattern: CODE_RE, message: '大写字母开头，只含大写字母、数字、下划线，2–32 位', trigger: 'blur' },
  ],
  name: [
    {
      trigger: 'blur',
      validator: (_r, v: string, cb) => {
        const n = len(v)
        if (n === 0) cb(new Error('请填写模板名称'))
        else if (n < 2 || n > 50) cb(new Error('名称为 2–50 个字'))
        else cb()
      },
    },
  ],
  description: [
    {
      trigger: 'blur',
      validator: (_r, v: string, cb) => (len(v) > 200 ? cb(new Error('说明不超过 200 字')) : cb()),
    },
  ],
}

function clearServerErrors() {
  for (const k of Object.keys(serverErrors)) delete serverErrors[k]
}

function openCreate() {
  dialog.mode = 'create'
  dialog.id = null
  dialog.builtin = false
  Object.assign(form, { code: '', name: '', description: '', deptIds: [] })
  clearServerErrors()
  dialog.visible = true
  formRef.value?.clearValidate()
}

function openEdit(row: TemplateAdminItem) {
  dialog.mode = 'edit'
  dialog.id = row.id
  dialog.builtin = row.category === 'BUILTIN'
  Object.assign(form, {
    code: row.code,
    name: row.name,
    description: row.description ?? '',
    deptIds: [...row.deptIds],
  })
  clearServerErrors()
  dialog.visible = true
  formRef.value?.clearValidate()
}

async function submitDialog() {
  clearServerErrors()
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  dialog.saving = true
  const name = form.name.trim()
  const description = form.description.trim() || null
  try {
    if (dialog.mode === 'create') {
      const d = await api.admin.templates.create({
        code: form.code.trim(),
        name,
        description,
        deptIds: form.deptIds,
      })
      dialog.visible = false
      ElMessage.success('模板已创建，请设计表单和审批流程')
      await router.push(designPath(d.id))
    } else if (dialog.id != null) {
      const d = await api.admin.templates.update(dialog.id, { name, description, deptIds: form.deptIds })
      patchRow(d)
      dialog.visible = false
      ElMessage.success('基本信息已保存')
    }
  } catch (e) {
    const err = toApiError(e)
    const known = err.errors.filter((fe) => ['code', 'name', 'description', 'deptIds'].includes(fe.field))
    if (known.length) {
      for (const fe of known) serverErrors[fe.field] = fe.message
      ElMessage.error(err.message || '请修正标红的内容')
    } else {
      showError(err)
    }
  } finally {
    dialog.saving = false
  }
}

function deptText(row: TemplateAdminItem) {
  return row.deptNames.length ? row.deptNames.join('、') : '全部部门'
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h2 class="page-title">流程模板</h2>
      <div class="toolbar">
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建自定义模板</el-button>
      </div>
    </div>

    <div class="toolbar">
      <el-input v-model="keyword" :prefix-icon="Search" placeholder="名称或编码" clearable />
      <el-select v-model="category" placeholder="全部类别" clearable>
        <el-option value="BUILTIN" label="内置模板" />
        <el-option value="CUSTOM" label="自定义模板" />
      </el-select>
      <span class="muted small">
        内置模板（采购、差旅、报销）表单固定，只能调整审批节点；停用后员工不能新建，审批中的申请不受影响。
      </span>
    </div>

    <el-skeleton v-if="loading && !loaded" :rows="6" animated />
    <el-table v-else v-loading="loading" :data="filtered" row-key="id" border>
      <el-table-column label="模板名称" min-width="200">
        <template #default="{ row }">
          <router-link :to="designPath(row.id)" class="name-link">{{ row.name }}</router-link>
          <div v-if="row.description" class="muted small desc">{{ row.description }}</div>
        </template>
      </el-table-column>
      <el-table-column label="编码" min-width="150">
        <template #default="{ row }"><span class="mono small">{{ row.code }}</span></template>
      </el-table-column>
      <el-table-column label="类别" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" effect="plain" :type="row.category === 'BUILTIN' ? 'warning' : 'primary'">
            {{ row.category === 'BUILTIN' ? '内置' : '自定义' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="业务类型" width="110">
        <template #default="{ row }">{{ APP_TYPE_LABEL[row.bizType as TemplateAdminItem['bizType']] ?? row.bizType }}</template>
      </el-table-column>
      <el-table-column label="适用部门" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <span :class="{ muted: !row.deptNames.length }">{{ deptText(row as TemplateAdminItem) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="80" align="center">
        <template #default="{ row }">
          <el-switch
            :model-value="row.enabled"
            :loading="togglingId === row.id"
            :before-change="() => toggle(row as TemplateAdminItem)"
          />
        </template>
      </el-table-column>
      <el-table-column label="当前版本" width="130">
        <template #default="{ row }">
          <span v-if="row.currentVersionNo">v{{ row.currentVersionNo }}</span>
          <span v-else class="muted">未发布</span>
          <el-tag v-if="row.hasDraft" size="small" type="warning" class="draft-tag">有草稿</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="使用次数" width="90" align="right">
        <template #default="{ row }">{{ row.usageCount }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="150">
        <template #default="{ row }">{{ fmtDateTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(designPath(row.id))">设计</el-button>
          <el-button link type="primary" @click="openEdit(row as TemplateAdminItem)">编辑</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <ListEmpty :filtered="hasFilter" @reset="resetFilter" />
      </template>
    </el-table>

    <el-dialog
      v-model="dialog.visible"
      :title="dialog.mode === 'create' ? '新建自定义模板' : '编辑模板基本信息'"
      width="min(560px, 92vw)"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="88px" @submit.prevent>
        <el-form-item label="模板编码" prop="code" :error="serverErrors.code">
          <el-input
            v-model="form.code"
            class="mono"
            maxlength="32"
            placeholder="如 LEAVE_REQUEST"
            :disabled="dialog.mode === 'edit'"
            @blur="form.code = form.code.trim().toUpperCase()"
          />
          <div class="muted small hint">
            {{ dialog.mode === 'edit' ? '编码创建后不可修改。' : '大写字母开头，只含大写字母、数字、下划线，2–32 位；创建后不可修改。' }}
          </div>
        </el-form-item>
        <el-form-item label="模板名称" prop="name" :error="serverErrors.name">
          <el-input v-model="form.name" maxlength="50" show-word-limit placeholder="如 请假申请" />
        </el-form-item>
        <el-form-item label="说明" prop="description" :error="serverErrors.description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="向员工说明适用场景，可不填"
          />
        </el-form-item>
        <el-form-item label="适用部门" prop="deptIds" :error="serverErrors.deptIds">
          <el-select
            v-model="form.deptIds"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="4"
            placeholder="不选表示全部部门"
            style="width: 100%"
          >
            <el-option v-for="d in dict.departments" :key="d.id" :value="d.id" :label="d.name" />
          </el-select>
          <div class="muted small hint">为空表示全部部门可用。</div>
        </el-form-item>
        <el-alert
          v-if="dialog.mode === 'create'"
          type="info"
          :closable="false"
          show-icon
          title="创建后将生成空的 v1 草稿，进入设计页添加表单字段和审批节点，校验通过后发布。"
        />
        <el-alert
          v-else-if="dialog.builtin"
          type="info"
          :closable="false"
          show-icon
          title="内置模板的表单固定，审批节点请在“设计”中调整。"
        />
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="dialog.saving" @click="submitDialog">
          {{ dialog.mode === 'create' ? '创建并设计' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.name-link {
  color: var(--el-color-primary);
  text-decoration: none;
  font-weight: 500;
}
.name-link:hover {
  text-decoration: underline;
}
.desc {
  line-height: 1.4;
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.draft-tag {
  margin-left: 6px;
}
.hint {
  line-height: 1.5;
  margin-top: 4px;
  width: 100%;
}
</style>
