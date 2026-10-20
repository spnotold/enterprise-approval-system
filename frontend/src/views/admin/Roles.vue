<script setup lang="ts">
import '@/components/admin/admin.css'
// 角色与权限（只读）：各角色的功能权限点与成员。角色授予 / 回收、主办人设置在用户管理中进行
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh, User } from '@element-plus/icons-vue'
import { api } from '@/lib/api'
import type { RoleCode, RoleView } from '@/lib/types'
import { PERMISSION_LABEL, ROLE_CODES } from '@/lib/labels'
import { showError } from '@/lib/errors'

const router = useRouter()

const roles = ref<RoleView[]>([])
const loading = ref(false)
const loaded = ref(false)
const active = ref<string[]>([])

const sorted = computed(() => {
  const idx = (c: RoleCode) => {
    const i = ROLE_CODES.indexOf(c)
    return i < 0 ? ROLE_CODES.length : i
  }
  return [...roles.value].sort((a, b) => idx(a.code) - idx(b.code))
})

async function load() {
  loading.value = true
  try {
    roles.value = await api.admin.roles.list()
    // 默认展开除“员工”外的角色（员工成员通常很多）
    if (!loaded.value) active.value = roles.value.filter((r) => r.code !== 'EMPLOYEE').map((r) => r.code)
    loaded.value = true
  } catch (e) {
    showError(e)
  } finally {
    loading.value = false
  }
}

onMounted(load)

function primaryOf(r: RoleView): string | null {
  return r.members.find((m) => m.primaryHandler)?.realName ?? null
}

const ROLE_NOTE: Partial<Record<RoleCode, string>> = {
  EMPLOYEE: '注册审核通过时自动授予。',
  DEPT_HEAD: '在“部门管理 → 设置负责人”时同步授予 / 回收；只能查看与统计本人负责部门的申请。',
  FINANCE_APPROVER: '按角色单人审批的节点由主办人处理；会签 / 或签取全部持有人。财务统计需另行授权（FIN_STATS_READ）。',
  ENTERPRISE_HEAD: '按角色单人审批的节点由主办人处理；企业范围查询与统计需另行授权（APP_READ@ALL）。',
}
</script>

<template>
  <div class="page admin-page">
    <header class="sheet-head">
      <div>
        <h2 class="sheet-title">角色与权限</h2>
        <p class="sheet-sub">角色决定功能权限；角色授予与回收请在用户管理中操作。</p>
      </div>
      <div class="head-actions">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button :icon="User" @click="router.push('/admin/users')">用户管理</el-button>
      </div>
    </header>

    <p class="page-note">系统管理员只有管理类权限，不能审批；查看业务正文需另行授予 BIZ_CONTENT_READ，每次访问留痕。</p>

    <div v-loading="loading" class="roles-wrap">
      <el-empty v-if="loaded && roles.length === 0" description="暂无角色数据" :image-size="80" />
      <el-collapse v-else v-model="active">
        <el-collapse-item v-for="r in sorted" :key="r.code" :name="r.code">
          <template #title>
            <div class="role-title">
              <span class="role-name">{{ r.name }}</span>
              <el-tag size="small" :type="r.code === 'SYS_ADMIN' ? 'danger' : 'info'" disable-transitions>
                {{ r.code }}
              </el-tag>
              <span class="muted small">{{ r.members.length }} 人</span>
              <span v-if="primaryOf(r)" class="muted small">主办人：{{ primaryOf(r) }}</span>
            </div>
          </template>

          <div class="role-body">
            <p v-if="r.description" class="role-desc">{{ r.description }}</p>
            <p v-if="ROLE_NOTE[r.code]" class="muted small role-desc">{{ ROLE_NOTE[r.code] }}</p>

            <div class="section-label">权限点（{{ r.permissions.length }}）</div>
            <div class="perm-tags">
              <el-tag v-for="p in r.permissions" :key="p.code" effect="plain" disable-transitions class="perm-tag">
                {{ p.name || PERMISSION_LABEL[p.code] || p.code }}
                <span class="perm-code">{{ p.code }}</span>
              </el-tag>
              <span v-if="r.permissions.length === 0" class="muted small">无</span>
            </div>

            <div class="section-label">成员（{{ r.members.length }}）</div>
            <el-table
              v-if="r.members.length"
              :data="r.members"
              size="small"
              max-height="320"
              row-key="userId"
              class="eas-row-table"
              style="width: 100%"
            >
              <el-table-column prop="realName" label="姓名" min-width="100" />
              <el-table-column label="部门" min-width="120">
                <template #default="{ row }">{{ row.deptName ?? '—' }}</template>
              </el-table-column>
              <el-table-column label="主办人" width="100">
                <template #default="{ row }">
                  <el-tag v-if="row.primaryHandler" type="warning" size="small" disable-transitions>主办</el-tag>
                </template>
              </el-table-column>
            </el-table>
            <div v-else class="muted small">暂无成员</div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<style scoped>
.roles-wrap {
  min-height: 120px;
}
.role-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  line-height: 1.4;
}
.role-name {
  font-weight: 600;
  font-size: var(--eas-fs-md);
}
.role-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.role-desc {
  margin: 0;
}
.section-label {
  margin-top: 4px;
  font-weight: 600;
  font-size: var(--eas-fs-sm);
}
.perm-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.perm-code {
  margin-left: 6px;
  opacity: 0.7;
  font-size: var(--eas-fs-xs);
}
</style>
