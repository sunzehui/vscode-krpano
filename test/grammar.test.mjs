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

test('内嵌:<data> 的 CDATA 内容按 JSON 高亮', async () => {
  const tok = await tokenize(XML, [
    '<krpano>',
    '<data name="config">',
    '<![CDATA[',
    '{ "debug": true, "count": 3 }',
    ']]>',
    '</data>',
    '</krpano>',
  ].join('\n'))
  assert.ok(scopeOf(tok, '"debug"').includes('support.type.property-name.test.json'), 'JSON 键应命中')
  assert.ok(scopeOf(tok, 'true').includes('constant.language.test.json'), 'JSON 值应命中')
  assert.ok(scopeOf(tok, '3').includes('constant.numeric.test.json'), 'JSON 数字应命中')
  assert.ok(scopeOf(tok, '<![CDATA[').some(s => s.includes('punctuation.definition.cdata')), 'CDATA 标记应为标点')
})

test('内嵌:<cssstyles> 内的 <style> 正文按 CSS 高亮', async () => {
  const tok = await tokenize(XML, [
    '<krpano>',
    '<cssstyles>',
    '<style name=".test_class">',
    'color: #fff;',
    '</style>',
    '</cssstyles>',
    '</krpano>',
  ].join('\n'))
  assert.ok(scopeOf(tok, 'color').includes('support.type.property-name.test.css'), 'CSS 属性应命中')
  assert.ok(scopeOf(tok, '#fff').includes('constant.other.color.test.css'), 'CSS 颜色应命中')
  // 注意:第 1 次出现的 'style' 是 cssstyles 内的子串,这里要取标签名本身
  assert.ok(scopeOf(tok, 'style', 2).includes('entity.name.tag.style.html'), 'style 标签名应按 HTML 标签名着色')
})

test('内嵌:cssstyles 之外的自闭合 <style> 仍按 krpano 元素处理', async () => {
  const tok = await tokenize(XML, '<krpano><style name="s" bgcolor="0xffffff"/></krpano>')
  assert.ok(!scopeOf(tok, '<style').includes('entity.name.tag.style.html'), '不应被当作 cssstyles 内部样式')
})
