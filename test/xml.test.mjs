import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { scanXml, signaturesDiffer, structureSignature, offsetToPosition, tagAtOffset, looksLikeKrpanoXml, isSkippedOffset } = require('./build/shared/xml.js')

test('扫描:标签、属性、引号内的大于号', () => {
  const text = '<hotspot name="a" onclick="if(x &gt; 1, lookto(0,0));"/>'
  const { tags } = scanXml(text)
  assert.equal(tags.length, 1)
  assert.equal(tags[0].name, 'hotspot')
  assert.equal(tags[0].kind, 'self')
  const onclick = tags[0].attributes.find(a => a.name === 'onclick')
  assert.ok(onclick.value.includes('&gt; 1'), '引号内的 > 不应截断标签')
  assert.equal(tags[0].attributes.length, 2)
})

test('扫描:注释、CDATA、处理指令被跳过', () => {
  const text = '<?xml version="1.0"?>\n<krpano><!-- <hotspot/> --><data><![CDATA[ <a> ]]>x</data></krpano>'
  const { tags, skipped } = scanXml(text)
  assert.deepEqual(tags.map(t => `${t.name}:${t.kind}`), ['krpano:open', 'data:open', 'data:close', 'krpano:close'])
  assert.deepEqual(skipped.map(s => s.kind), ['pi', 'comment', 'cdata'])
})

test('扫描:未闭合标签与脚本中的小于号', () => {
  const unclosed = scanXml('<krpano><action name="a">').tags
  assert.deepEqual(unclosed.map(t => `${t.name}:${t.kind}`), ['krpano:open', 'action:open'])
  const script = scanXml('<action name="a">if(x < y, set(a,1));</action>').tags
  assert.deepEqual(script.map(t => `${t.name}:${t.kind}`), ['action:open', 'action:close'], 'a < y 不应被当作标签')
})

test('结构签名:空白无关,空标签两种写法等价', () => {
  assert.deepEqual(structureSignature('<a><b/></a>'), ['a', '#b', '/a'])
  assert.deepEqual(structureSignature('<a>\n  <b></b>\n</a>'), ['a', '#b', '/a'])
  assert.equal(signaturesDiffer('<a>\n  <b/>\n</a>', '<a><b/></a>'), false, '仅缩进变化不应视为结构变化')
})

test('结构签名:错配与未闭合标签可被识别', () => {
  assert.equal(signaturesDiffer('<krpano><a></b></krpano>', '<krpano><a></a></krpano>'), true)
  assert.equal(signaturesDiffer('<krpano><a></krpano>', '<krpano><a></a></krpano>'), true)
})

test('偏移量与位置换算、偏移处标签查找', () => {
  const text = 'ab\ncd<hotspot/>'
  assert.deepEqual(offsetToPosition(text, 5), { line: 1, character: 2 })
  const scan = scanXml(text)
  const tag = tagAtOffset(scan, 8)
  assert.equal(tag.name, 'hotspot')
})

test('krpano 文档判定:扩展只处理 krpano 的 xml', () => {
  assert.equal(looksLikeKrpanoXml('<krpano version="1.21"><scene name="a"/></krpano>'), true)
  assert.equal(looksLikeKrpanoXml('<scene name="a"><hotspot name="h"/></scene>'), true, '片段文件也算')
  assert.equal(looksLikeKrpanoXml('<project><modelVersion>4.0.0</modelVersion></project>'), false, 'pom.xml 之类不算')
  assert.equal(looksLikeKrpanoXml('<manifest><application><activity><intent-filter><action name="a"/></intent-filter></activity></application></manifest>'), false, '只有通用元素名(action 等)不算')
  assert.equal(looksLikeKrpanoXml(''), false)
})

test('偏移是否落在注释/CDATA 区域内', () => {
  const text = '<krpano><!-- <action name="a">foo();</action> --><hotspot/></krpano>'
  const { skipped } = scanXml(text)
  assert.equal(isSkippedOffset(skipped, text.indexOf('foo')), true)
  assert.equal(isSkippedOffset(skipped, text.indexOf('<hotspot')), false)
})
