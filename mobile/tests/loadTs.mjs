// 使用项目现有 TypeScript 编译器，在内存中载入业务模块；无需测试框架依赖。
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

export function loadTs(path, stubs = {}, globals = {}) {
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const js = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }, fileName: file,
    }).outputText
    const localRequire = (id) => {
      if (Object.hasOwn(stubs, id)) return stubs[id]
      if (!id.startsWith('.') && !id.startsWith('@/')) return require(id)
      let target = id.startsWith('@/') ? resolve(root, id.slice(2)) : resolve(dirname(file), id)
      if (!target.endsWith('.ts')) target += '.ts'
      return load(target)
    }
    const evaluate = runInNewContext('(function(require, module, exports) {\n' + js + '\n})', {
      console, Date, setTimeout, clearTimeout, ...globals,
    }, { filename: file })
    evaluate(localRequire, module, module.exports)
    return module.exports
  }
  return load(resolve(root, path))
}
