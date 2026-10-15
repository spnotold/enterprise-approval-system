<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import TaskListContent from '@/components/tasks/TaskListContent.vue'

defineProps<{ kind: 'pending' | 'done' }>()
const auth = useAuthStore()
</script>

<template>
  <!-- 两个路由复用本页时重建列表，使 useListQuery 始终绑定当前路由的 URL。 -->
  <TaskListContent v-if="auth.can('TASK_HANDLE') && !auth.hasRole('SYS_ADMIN')" :key="kind" :kind="kind" />
  <el-result v-else icon="warning" title="没有处理待办的权限">
    <template #extra><el-button @click="$router.push('/')">返回工作台</el-button></template>
  </el-result>
</template>
