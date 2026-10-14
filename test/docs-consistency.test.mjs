// 文档一致性:文档里写死的数量必须与实际数据/片段数一致,避免随代码漂移。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(path, 'utf8')

// 片段文件是 JSONC(带尾逗号),去掉尾逗号后严格解析
const snippetSource = read('snippets/krpano.code-snippets').replace(/,\s*([}\]])/g, '$1')
const snippetCount = Object.keys(JSON.parse(snippetSource)).length

const krpanoData = JSON.parse(read('src/lsp/krpanoData.json'))
const elementCount = Object.keys(krpanoData.elements).length
const attributeCount = Object.values(krpanoData.elements).reduce((sum, list) => sum + list.length, 0)

test('文档中的片段数量与实际一致', () => {
  const checks = [
    ['docs/snippets.md', new RegExp(`共 ${snippetCount} 个`)],
    ['docs/README.md', new RegExp(`${snippetCount} 个代码片段`)],
    ['docs/architecture.md', new RegExp(`代码片段（${snippetCount} 个）`)],
    ['README.md', new RegExp(`${snippetCount} 个常用写法片段`)],
  ]
  for (const [file, pattern] of checks)
    assert.match(read(file), pattern, `${file} 应写明片段数为 ${snippetCount}`)
})

test('文档中的元素数量与实际一致', () => {
  for (const file of ['docs/faq.md', 'docs/architecture.md', 'README.md'])
    assert.match(read(file), new RegExp(`${elementCount} 个元素`), `${file} 应写明元素数为 ${elementCount}`)
  assert.ok(attributeCount >= 900, `属性数量应仍在 900+ 的量级:${attributeCount}`)
  for (const file of ['docs/faq.md', 'docs/architecture.md', 'README.md'])
    assert.match(read(file), /900\+/, `${file} 应写明属性量级为 900+`)
})
