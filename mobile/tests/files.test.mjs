import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTs } from './loadTs.mjs'

function harness(responses) {
  const calls = [], tasks = []
  let refreshes = 0, token = 'before'
  class ApiError extends Error { constructor(body) { super(body.message); this.code = body.code } }
  const http = {
    ApiError, authFailed() {}, authHeaders: () => ({ Authorization: token }), currentAccessToken: () => token,
    refreshOnce: async () => { refreshes++; token = 'after' }, toApiError: e => e,
    parseResponse: (status, data) => { const body = JSON.parse(data); if (status === 401) throw new ApiError(body); return body.data },
  }
  const uni = { uploadFile(options) {
    calls.push(options)
    const response = responses.shift()
    const task = { aborted: false, progress: null, abort() { this.aborted = true; options.fail({ errMsg: 'uploadFile:fail abort' }) }, onProgressUpdate(fn) { this.progress = fn } }
    tasks.push(task)
    if (response) queueMicrotask(() => options.success(response))
    return task
  } }
  return { files: loadTs('lib/files.ts', { './config': { API_BASE: '/api' }, './http': http }, { uni }), calls, tasks, refreshes: () => refreshes }
}
const local = { path: '/tmp/photo.png', name: 'photo.png', size: 100, kind: 'image' }
const meta = { id: 1, originalName: 'photo.png', contentType: 'image/png', sizeBytes: 100 }
const success = { statusCode: 200, data: JSON.stringify({ data: meta }) }

test('uploadFile 保留可取消的任务，转发上传进度并解析附件', async () => {
  const h = harness([success]), progress = []
  const handle = h.files.uploadFile(local, 'EXPENSE_INVOICE', p => progress.push(p))
  h.tasks[0].progress({ progress: 75 })
  assert.equal((await handle.promise).id, 1); assert.equal(progress[0], 75)
  assert.equal(h.calls[0].formData.refType, 'EXPENSE_INVOICE')
})
test('上传令牌过期只刷新一次并重建任务，重传使用新令牌', async () => {
  const h = harness([{ statusCode: 401, data: JSON.stringify({ code: 40102 }) }, success])
  const result = await h.files.uploadFile(local, 'CUSTOM_FIELD').promise
  assert.equal(result.id, 1); assert.equal(h.refreshes(), 1); assert.equal(h.calls.length, 2)
  assert.equal(h.calls[0].header.Authorization, 'before'); assert.equal(h.calls[1].header.Authorization, 'after')
})
test('取消上传会调用 UploadTask.abort，取消不触发刷新重试', async () => {
  const h = harness([]), handle = h.files.uploadFile(local, 'PURCHASE_QUOTE')
  handle.abort()
  await assert.rejects(handle.promise, /已取消上传/)
  assert.equal(h.tasks[0].aborted, true); assert.equal(h.refreshes(), 0)
})
