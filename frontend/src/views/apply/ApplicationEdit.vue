<script setup lang="ts">
// 编辑草稿：按申请类型复用对应表单
import { onMounted, ref } from 'vue'
import { api } from '@/lib/api'
import type { AppType } from '@/lib/types'
import { errorText, toApiError } from '@/lib/errors'
import PurchaseForm from './PurchaseForm.vue'
import TravelForm from './TravelForm.vue'
import ExpenseForm from './ExpenseForm.vue'
import CustomForm from './CustomForm.vue'

const props = defineProps<{ id: number }>()

const type = ref<AppType | null>(null)
const templateId = ref<number | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const d = await api.applications.detail(props.id)
    if (d.status !== 'DRAFT' || !d.allowedActions.includes('EDIT')) {
      error.value = '只有本人的草稿可以编辑'
      return
    }
    type.value = d.type
    templateId.value = d.custom?.templateId ?? d.templateId
  } catch (e) {
    const err = toApiError(e)
    error.value = err.code === 40401 ? '无权查看或已不存在' : errorText(err)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div>
    <el-skeleton v-if="loading" :rows="10" animated />
    <el-result v-else-if="error" icon="warning" :title="error">
      <template #extra>
        <el-button @click="$router.push(`/applications/${id}`)">查看详情</el-button>
        <el-button type="primary" @click="$router.push('/applications/mine')">返回我的申请</el-button>
      </template>
    </el-result>
    <PurchaseForm v-else-if="type === 'PURCHASE'" :id="id" />
    <TravelForm v-else-if="type === 'TRAVEL'" :id="id" />
    <ExpenseForm v-else-if="type === 'EXPENSE'" :id="id" />
    <CustomForm v-else-if="type === 'CUSTOM'" :id="id" :template-id="templateId ?? undefined" />
  </div>
</template>
