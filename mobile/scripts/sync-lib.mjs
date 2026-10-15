#!/usr/bin/env node
// 把 Web 端共享的接口定义、类型和金额函数原样复制到 mobile/lib。
//   npm run sync-lib            复制
//   npm run sync-lib -- --check 只检查是否与 Web 端一致（不一致时退出码为 1）
//
// 复制范围：types.ts、money.ts、api/*.ts（files.ts、index.ts 除外——移动端用 uni.uploadFile
// 另行实现 lib/files.ts，并在 lib/api/index.ts 中汇总）。
// http.ts、idem.ts 依赖 axios / crypto，移动端各自实现，不在复制范围内。
//
// 生成的文件会提交到仓库：Nginx 镜像构建 H5 时只拷贝 mobile/ 目录，拿不到 ../frontend。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = resolve(mobileRoot, '../frontend/src/lib')
const dstRoot = resolve(mobileRoot, 'lib')
const check = process.argv.includes('--check')

const EXCLUDED_API = new Set(['files.ts', 'index.ts'])

function header(rel) {
  return (
    `// ⚠ 此文件由 mobile/scripts/sync-lib.mjs 从 frontend/src/lib/${rel} 原样复制生成，请勿手动修改。\n` +
    `// 修改请改 Web 端源文件后执行 npm run sync-lib。\n`
  )
}

if (!existsSync(srcRoot)) {
  console.error(`[sync-lib] 找不到 Web 端共享库目录：${srcRoot}`)
  process.exit(1)
}

const files = ['types.ts', 'money.ts']
for (const name of readdirSync(join(srcRoot, 'api')).sort()) {
  if (name.endsWith('.ts') && !EXCLUDED_API.has(name)) files.push(`api/${name}`)
}

let stale = 0
for (const rel of files) {
  const src = join(srcRoot, rel)
  const dst = join(dstRoot, rel)
  const content = header(rel) + readFileSync(src, 'utf8')
  const current = existsSync(dst) ? readFileSync(dst, 'utf8') : null
  if (current === content) continue
  stale++
  if (check) {
    console.error(`[sync-lib] 已过期：${relative(mobileRoot, dst)}`)
    continue
  }
  mkdirSync(dirname(dst), { recursive: true })
  writeFileSync(dst, content)
  console.log(`[sync-lib] 已更新：${relative(mobileRoot, dst)}`)
}

if (check && stale > 0) {
  console.error(`[sync-lib] ${stale} 个文件与 Web 端不一致，请执行 npm run sync-lib`)
  process.exit(1)
}
console.log(`[sync-lib] 完成，共 ${files.length} 个文件${stale ? `，更新 ${stale} 个` : '，均已是最新'}`)
