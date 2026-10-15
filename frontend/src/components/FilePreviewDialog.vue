<script setup lang="ts">
// 附件预览：图片 / PDF 通过 blob URL 显示（内容接口需要令牌，不能直接用 src）
import { onBeforeUnmount, ref, watch } from 'vue'
import type { AttachmentMeta } from '@/lib/types'
import { attachmentObjectUrl, downloadAttachment, isImage, isPdf } from '@/lib/fileView'
import { errorText } from '@/lib/errors'

const visible = defineModel<boolean>({ default: false })
const props = defineProps<{ file: AttachmentMeta | null }>()

const url = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const downloading = ref(false)

function revoke() {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = null
}

async function load() {
  revoke()
  error.value = null
  if (!props.file) return
  loading.value = true
  try {
    url.value = await attachmentObjectUrl(props.file)
  } catch (e) {
    error.value = errorText(e, '预览失败')
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.file?.id] as const,
  ([v]) => {
    if (v) void load()
    else revoke()
  },
  { immediate: true },
)

onBeforeUnmount(revoke)

async function download() {
  if (!props.file) return
  downloading.value = true
  try {
    await downloadAttachment(props.file)
  } catch (e) {
    error.value = errorText(e, '下载失败')
  } finally {
    downloading.value = false
  }
}

function openNew() {
  if (url.value) window.open(url.value, '_blank', 'noopener')
}
</script>

<template>
  <el-dialog v-model="visible" :title="file?.originalName ?? '附件预览'" width="min(960px, 96vw)" top="4vh" append-to-body destroy-on-close>
    <div v-loading="loading" class="preview-body">
      <el-result v-if="error" icon="error" :title="error" />
      <template v-else-if="url && file">
        <img v-if="isImage(file)" :src="url" :alt="file.originalName" class="preview-img" />
        <iframe v-else-if="isPdf(file)" :src="url" :title="file.originalName" class="preview-pdf" />
        <el-empty v-else description="该类型不支持预览，请下载查看" />
      </template>
    </div>
    <template #footer>
      <el-button v-if="url && file && isPdf(file)" @click="openNew">新窗口打开</el-button>
      <el-button type="primary" :loading="downloading" @click="download">下载</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.preview-body {
  min-height: 240px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.preview-img {
  max-width: 100%;
  max-height: 78vh;
  object-fit: contain;
}
.preview-pdf {
  width: 100%;
  height: 78vh;
  border: none;
}
</style>
