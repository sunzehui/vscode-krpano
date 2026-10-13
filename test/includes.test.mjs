import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildIncludeIndex,
  collectDefinitions,
  contextForFile,
  extractIncludes,
  isLocalRelativeUrl,
  pathToUri,
  resolveIncludePath,
  uriToPath,
} = require('./.tmp/lsp/symbols.js')

test('符号:收集 name 定义与 <include> 引用', () => {
  const text = [
    '<krpano>',
    '  <include url="actions.xml"/>',
    '  <action name="do_thing" autorun="onstart">trace(1);</action>',
    '  <hotspot name="hs_1"/>',
    '  <scene name="room1"/>',
    '</krpano>',
  ].join('\n')
  const definitions = collectDefinitions(text)
  assert.deepEqual(definitions.map(d => `${d.element}:${d.name}`), ['action:do_thing', 'hotspot:hs_1', 'scene:room1'])
  assert.equal(definitions[0].range.start.line, 2, '定义范围应指向 name 的值')
  assert.deepEqual(extractIncludes(text).map(i => i.url), ['actions.xml'])
})

test('符号:url 解析规则(相对路径解析,http/占位符/绝对路径跳过)', () => {
  assert.equal(isLocalRelativeUrl('actions.xml'), true)
  assert.equal(isLocalRelativeUrl('sub/a.xml'), true)
  assert.equal(isLocalRelativeUrl('/abs/a.xml'), false)
  assert.equal(isLocalRelativeUrl('http://x/a.xml'), false)
  assert.equal(isLocalRelativeUrl('%FIRSTXML%a.xml'), false)
  assert.equal(resolveIncludePath('/pano/tour.xml', 'actions.xml'), '/pano/actions.xml')
  assert.equal(resolveIncludePath('/pano/tour.xml', 'sub/a.xml'), '/pano/sub/a.xml')
  assert.equal(resolveIncludePath('/pano/tour.xml', 'http://x/a.xml'), undefined)
  assert.equal(resolveIncludePath('C:\\pano\\tour.xml', 'actions.xml'), 'C:\\pano\\actions.xml')
  assert.equal(resolveIncludePath('/pano/sub/a.xml', '../b.xml'), '/pano/b.xml', '应归一化 .. 与 .')
  assert.equal(resolveIncludePath('/pano/sub/a.xml', './x/../b.xml'), '/pano/sub/b.xml')
})

test('符号:URI 与路径互转', () => {
  assert.equal(uriToPath('file:///Users/me/pano/tour.xml'), '/Users/me/pano/tour.xml')
  assert.equal(uriToPath('file:///C:/pano/tour.xml'), 'C:/pano/tour.xml')
  assert.equal(uriToPath('untitled:Untitled-1'), undefined)
  assert.equal(pathToUri('/Users/me/pano/tour.xml'), 'file:///Users/me/pano/tour.xml')
})

test('索引:沿 include 链收集定义,处理嵌套、缺失与环', () => {
  const files = {
    '/pano/tour.xml': '<krpano>\n<include url="actions.xml"/>\n<include url="nope.xml"/>\n</krpano>',
    '/pano/actions.xml': '<krpano>\n<include url="helpers/more.xml"/>\n<action name="from_include"/>\n</krpano>',
    '/pano/helpers/more.xml': '<krpano>\n<action name="deep_action"/>\n<include url="../tour.xml"/>\n</krpano>',
  }
  const index = buildIncludeIndex('/pano/tour.xml', path => files[path])
  assert.deepEqual([...index.definitions.keys()].sort(), ['deep_action', 'from_include'])
  assert.equal(index.definitions.get('from_include').path, '/pano/actions.xml')
  assert.equal(index.definitions.get('deep_action').path, '/pano/helpers/more.xml')
  assert.deepEqual(index.unresolved.map(u => u.url), ['nope.xml'], '缺失的 include 应被记录')
  assert.equal(index.unresolved[0].path, '/pano/tour.xml')
})

test('索引:深度上限防止异常结构', () => {
  const files = {}
  for (let i = 0; i < 40; i++)
    files[`/pano/f${i}.xml`] = `<krpano>\n<include url="f${i + 1}.xml"/>\n<action name="a${i}"/>\n</krpano>`
  const index = buildIncludeIndex('/pano/f0.xml', path => files[path], 3)
  assert.equal(index.definitions.size, 4, '深度 3 应包含 f0..f3')
})

test('索引:contextForFile 只暴露其它文件的定义与当前文件的缺失 include', () => {
  const files = {
    '/pano/tour.xml': '<krpano>\n<include url="actions.xml"/>\n<include url="nope.xml"/>\n</krpano>',
    '/pano/actions.xml': '<krpano>\n<action name="from_include"/>\n</krpano>',
  }
  const index = buildIncludeIndex('/pano/tour.xml', path => files[path])
  const context = contextForFile(index, '/pano/tour.xml', 'file:///pano/tour.xml')
  assert.deepEqual([...context.externalDefinitions.keys()], ['from_include'])
  assert.equal(context.externalDefinitions.get('from_include').uri, 'file:///pano/actions.xml')
  assert.deepEqual(context.unresolvedIncludes.map(u => u.url), ['nope.xml'])
})
