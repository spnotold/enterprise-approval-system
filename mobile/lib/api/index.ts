// 移动端接口汇总。除 files 外，各模块由 scripts/sync-lib.mjs 从 Web 端原样复制；
// files 用 uni.uploadFile / uni.downloadFile 另行实现（见 ../files.ts）。
import { admin } from './admin'
import { applications } from './applications'
import { auth } from './auth'
import { dict } from './dict'
import { me } from './me'
import { notifications } from './notifications'
import { stats } from './stats'
import { tasks } from './tasks'
import { templates } from './templates'
import { contentUrl, downloadAttachment, previewAttachment, uploadFile } from '../files'

export const files = {
  upload: uploadFile,
  download: downloadAttachment,
  preview: previewAttachment,
  contentUrl,
}

export const api = { auth, me, dict, templates, applications, tasks, files, notifications, stats, admin }
export default api
