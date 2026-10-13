import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scopeOf, tokenize } from './helpers/grammar.mjs'

const XML = 'source.krpano-xml'

test('A1: type="Javascript" 的 action 正文(CDATA)按 JS 高亮', async () => {
  const tok = await tokenize(XML, [
    '<action name="a" type="Javascript">',
    '<![CDATA[',
    'const x = 1;',
    ']]>',
    '</action>',
  ].join('\n'))
  assert.ok(scopeOf(tok, 'const').includes('keyword.test.js'), 'const 应命中 JS 语法')
  assert.ok(
    scopeOf(tok, '<![CDATA[').some(s => s.includes('punctuation.definition.cdata')),
    'CDATA 起始标记应为标点',
  )
  assert.ok(
    scopeOf(tok, ']]>').some(s => s.includes('punctuation.definition.cdata')),
    'CDATA 结束标记应为标点',
  )
})

test('A1: type="js" 官方内联写法(无 CDATA)按 JS 高亮', async () => {
  const tok = await tokenize(XML, [
    '<action name="test" type="js" args="var1, var2, var3">',
    'console.log(1);',
    '</action>',
  ].join('\n'))
  assert.ok(scopeOf(tok, 'console').includes('keyword.test.js'), 'console 应命中 JS 语法')
})

test('A1: type="javascript"(全小写,本仓库 snippet 的写法)按 JS 高亮', async () => {
  const tok = await tokenize(XML, [
    '<action name="a" type="javascript">',
    'let y = 2;',
    '</action>',
  ].join('\n'))
  assert.ok(scopeOf(tok, 'let').includes('keyword.test.js'), 'let 应命中 JS 语法')
})

test('A1: 单行 JS action 也按 JS 高亮', async () => {
  const tok = await tokenize(XML, '<action name="a" type="js">let y = 2;</action>')
  assert.ok(scopeOf(tok, 'let').includes('keyword.test.js'))
})

test('A1: 自闭合 JS action 只高亮标签本身', async () => {
  const tok = await tokenize(XML, '<action name="a" type="js"/>')
  assert.ok(!scopeOf(tok, 'js').includes('keyword.test.js'), '自闭合标签不应内嵌 JS 语法')
  assert.ok(scopeOf(tok, 'name').includes('entity.other.attribute-name.html'))
})

test('A1: lang="ts" 不再被当作特殊分支(krpano 不支持 TypeScript)', async () => {
  const tok = await tokenize(XML, [
    '<action name="a" lang="ts">',
    'const x = 1;',
    '</action>',
  ].join('\n'))
  assert.ok(!scopeOf(tok, 'const').includes('keyword.test.js'), '不应命中 JS/TS 语法')
})

test('A2: 属性字符串里 {{…}} 内部按 krpano 语法高亮', async () => {
  const tok = await tokenize(XML, '<action name="a" args="{{view.hlookat}}"/>')
  assert.ok(
    scopeOf(tok, '{{').some(s => s.includes('punctuation.definition.generic.begin')),
    '插值定界符应为标点',
  )
  assert.ok(
    scopeOf(tok, 'view').includes('support.variable.krpano-global-variable'),
    '插值内部的 view 应命中 krpano 全局变量',
  )
})

test('A3: 裸词只有变量 scope,不再被误标为 property', async () => {
  const tok = await tokenize(XML, [
    '<action name="a">',
    'foo(1);',
    '</action>',
  ].join('\n'))
  const scopes = scopeOf(tok, 'foo')
  assert.ok(scopes.includes('variable.other.readwrite.krpano-variable'))
  assert.ok(!scopes.includes('variable.other.property.krpano-property'))
})

test('A4: 单行 krpano action 正文有脚本高亮', async () => {
  const tok = await tokenize(XML, '<action name="a">set(x, 1);</action>')
  assert.ok(
    scopeOf(tok, 'set').includes('support.function.krpano-global-function'),
    'set 应命中 krpano 全局函数',
  )
})

test('B1: 自闭合 action 的标签名/属性名/自闭合标记 scope 统一为 .html 命名', async () => {
  const tok = await tokenize(XML, '<action name="a" keep="true"/>')
  assert.ok(scopeOf(tok, 'action').includes('entity.name.tag.action.html'))
  assert.ok(scopeOf(tok, 'name').includes('entity.other.attribute-name.html'))
  assert.ok(scopeOf(tok, '/>').includes('punctuation.definition.tag.end.html'))
})

test('回归: 多行默认 action 仍按 krpano 脚本高亮', async () => {
  const tok = await tokenize(XML, [
    '<action name="a">',
    'if(x, set(y, 1));',
    '</action>',
  ].join('\n'))
  assert.ok(scopeOf(tok, 'if').includes('keyword.control.krpano-statement'))
})

test('回归: 非 action 标签(走 text.xml)不受影响', async () => {
  const tok = await tokenize(XML, '<hotspot name="spot1" ath="0" atv="0"/>')
  assert.ok(scopeOf(tok, 'hotspot').includes('source.krpano-xml'))
  assert.ok(!scopeOf(tok, 'spot1').includes('keyword.test.js'))
})
