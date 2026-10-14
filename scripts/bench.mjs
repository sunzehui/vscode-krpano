// 性能基准:生成合成的大 tour.xml,测量语言服务关键路径耗时。
// 用法:npm run bench(先 build:test,再跑本脚本)
import { Buffer } from 'node:buffer'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const { getCompletions, getDiagnostics } = require('../test/build/lsp/features.js')
const { getDocumentSymbols } = require('../test/build/lsp/outline.js')
const { WorkspaceIndex } = require('../test/build/lsp/workspace.js')

/** 生成 n 个 scene、每个若干 hotspot/layer/action 的 XML */
function generateTour(scenes, perScene) {
  const parts = ['<krpano bgcolor="0x000000">']
  for (let s = 0; s < scenes; s++) {
    parts.push(`\t<scene name="scene_${s}" title="Scene ${s}">`)
    parts.push(`\t\t<view hlookat="0" vlookat="0" fov="90"/>`)
    parts.push(`\t\t<image><cube url="panos/scene_${s}_%s.jpg"/></image>`)
    for (let i = 0; i < perScene; i++) {
      parts.push(`\t\t<hotspot name="hs_${s}_${i}" ath="${(i * 7) % 180 - 90}" atv="${(i * 5) % 90 - 45}" onclick="action_${s}_${i}();" style="hs_style"/>`)
      parts.push(`\t\t<layer name="layer_${s}_${i}" type="text" html="Layer ${s}/${i}" align="lefttop" x="${i * 4}" y="${i * 3}" bgalpha="0.5"/>`)
    }
    for (let i = 0; i < Math.max(2, perScene / 2); i++)
      parts.push(`\t\t<action name="action_${s}_${i}">set(layer[layer_${s}_${i}].visible, true); tween(view.fov, 80, 0.5); trace(%1);</action>`)
    parts.push('\t</scene>')
  }
  parts.push('</krpano>')
  return parts.join('\n')
}

function time(label, fn) {
  const start = process.hrtime.bigint()
  const result = fn()
  const ms = Number(process.hrtime.bigint() - start) / 1e6
  console.log(`${label.padEnd(46)} ${ms.toFixed(1)} ms`)
  return { ms, result }
}

const tour = generateTour(300, 12)
console.log(`合成文档大小: ${(Buffer.byteLength(tour) / 1024 / 1024).toFixed(2)} MB, 行数 ${tour.split('\n').length}`)

const diagnostics = time('诊断(含引用/索引校验)', () => getDiagnostics(tour))
time('补全(元素名)', () => getCompletions(`${tour.slice(0, 5000)}\n<ho`, tour.slice(0, 5000).length + 4))
time('补全(属性)', () => getCompletions(`${tour.slice(0, 5000)}\n<hotspot na`, tour.slice(0, 5000).length + 12))
time('文档大纲', () => getDocumentSymbols(tour))

const dir = mkdtempSync(path.join(tmpdir(), 'krpano-bench-'))
for (let i = 0; i < 200; i++)
  writeFileSync(path.join(dir, `file_${i}.xml`), generateTour(10, 6))
const index = new WorkspaceIndex(p => ({ text: readFileSync(p, 'utf8'), version: String(Math.random()) }))
const workspace = time('工作区索引(200 个文件)', () => {
  index.refresh([dir], true)
  return index.files().length
})
rmSync(dir, { recursive: true, force: true })

const limits = [
  ['诊断', diagnostics.ms, 4000],
  ['工作区索引', workspace.ms, 8000],
]
let failed = false
for (const [label, ms, limit] of limits) {
  if (ms > limit) {
    console.error(`✗ ${label} 超过上限:${ms.toFixed(1)} ms > ${limit} ms`)
    failed = true
  }
}
console.log(failed ? '\n结果:超出预算' : '\n结果:全部在预算内')
if (failed)
  process.exitCode = 1
