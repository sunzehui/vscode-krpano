import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)

// 先由 `npm run test:build` 把 src 下两个纯模块编译到 test/.tmp(CJS)
const { beautify } = require('./.tmp/beautifyHtml.js')
const getOptionsModule = require('./.tmp/getOptions.js')
const getOptions = getOptionsModule.default ?? getOptionsModule

const base = { handleRootNode: true }

test('C1: insertSpaces=true 时用空格缩进(按 tabSize)', () => {
  const opts = getOptions({ editor: { tabSize: 4, insertSpaces: true }, xml: { format: {} } })
  assert.equal(opts.indentation, '    ')
})

test('C1: insertSpaces=false 时用 Tab 缩进', () => {
  const opts = getOptions({ editor: { tabSize: 4, insertSpaces: false }, xml: { format: {} } })
  assert.equal(opts.indentation, '\t')
})

test('C1: xml.format.indentation 显式配置优先', () => {
  const opts = getOptions({ editor: { tabSize: 8, insertSpaces: false }, xml: { format: { indentation: '  ' } } })
  assert.equal(opts.indentation, '  ')
})

test('C5: 缺少 editor/tabSize 时兜底 4 空格且不抛错', () => {
  assert.equal(getOptions({ xml: { format: {} } }).indentation, '    ')
  assert.equal(getOptions({ editor: {}, xml: { format: {} } }).indentation, '    ')
  assert.equal(getOptions({}).indentation, '    ')
})

test('C3: 空文档/纯空白为 no-op,不报失败', () => {
  const r = beautify('   \n\n', base)
  assert.equal(r.failed, false)
  assert.equal(r.text, '   \n\n')
})

test('C3: 无法解析为 XML 时返回原文并标记 failed', () => {
  const r = beautify('hello world', base)
  assert.equal(r.failed, true)
  assert.equal(r.text, 'hello world')
})

test('C3: 合法文档正常格式化且不报失败', () => {
  const r = beautify('<krpano><view/><hotspot name="a"/></krpano>', base)
  assert.equal(r.failed, false)
  assert.match(r.text, /^<krpano>/)
  assert.match(r.text, / {2}<view\/>/)
})

test('回归: 多根节点自动补 <krpano> 根', () => {
  const r = beautify('<a/>\n<b/>', base)
  assert.equal(r.failed, false)
  assert.match(r.text, /^<krpano>[\s\S]*<\/krpano>$/)
})

test('C4: 多根节点 + XML 声明时,声明保留在文件最前', () => {
  const r = beautify('<?xml version="1.0" encoding="UTF-8"?>\n<a/>\n<b/>', base)
  assert.equal(r.failed, false)
  assert.ok(r.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), `声明应在最前:\n${r.text}`)
  assert.equal(r.text.split('<?xml').length - 1, 1, '声明应只出现一次')
  assert.ok(r.text.indexOf('<krpano>') > r.text.indexOf('<?xml'), '<krpano> 应在声明之后')
})

test('回归: handleRootNode=false 时多根节点不补根,按失败处理', () => {
  const r = beautify('<a/>\n<b/>', { handleRootNode: false })
  assert.equal(r.failed, true)
  assert.equal(r.text, '<a/>\n<b/>')
})

test('回归: 默认忽略 action 内容(保留内部换行与缩进)', () => {
  const src = '<krpano><action name="a">set(x,1);\n\n   calc(y, 2);</action></krpano>'
  const r = beautify(src, base)
  assert.equal(r.failed, false)
  assert.ok(r.text.includes('set(x,1);\n\n   calc(y, 2);'), `action 内容应原样保留:\n${r.text}`)
})

test('C1: xml.format.indentation 为空串时按 editor 设置自动换算', () => {
  const opts = getOptions({ editor: { tabSize: 3, insertSpaces: true }, xml: { format: { indentation: '' } } })
  assert.equal(opts.indentation, '   ')
})

test('项8: 标签结构被容错修复时标记 structureChanged', () => {
  const mismatched = beautify('<krpano><a></b></krpano>', base)
  assert.equal(mismatched.failed, false)
  assert.equal(mismatched.structureChanged, true, '错配标签应触发结构变化提示')

  const unclosed = beautify('<krpano><a></krpano>', base)
  assert.equal(unclosed.structureChanged, true, '未闭合标签应触发结构变化提示')

  const wellFormed = beautify('<krpano>\n  <view hlookat="0"/>\n  <hotspot name="a"/>\n</krpano>', base)
  assert.equal(wellFormed.failed, false)
  assert.equal(Boolean(wellFormed.structureChanged), false, '正常文档仅缩进变化不应提示')

  const emptyPair = beautify('<krpano><a></a></krpano>', { ...base, forceSelfClosingEmptyTag: true })
  assert.equal(Boolean(emptyPair.structureChanged), false, '空标签两种写法等价,不应提示')

  const wrapped = beautify('<a/>\n<b/>', base)
  assert.equal(wrapped.failed, false)
  assert.equal(wrapped.structureChanged, undefined, '自动补根路径不做结构差异比较')
})

test('项8: 属性值里的 > 与引号不影响结构判断', () => {
  const src = '<krpano>\n  <hotspot name="a" onclick="if(x &gt; 1, looktohotspot(get(name),65));"/>\n</krpano>'
  const r = beautify(src, base)
  assert.equal(r.failed, false)
  assert.equal(Boolean(r.structureChanged), false)
})
