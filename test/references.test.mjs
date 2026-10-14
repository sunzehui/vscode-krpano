import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { getDocumentSymbols } = require('./build/lsp/outline.js')
const { collectReferences, findReferences, findUnknownIndexes, indexContextAt, nameAtOffset } = require('./build/lsp/references.js')

const text = [
  '<krpano>',
  '  <action name="do_thing" args="v">',
  '    layer[info].visible = true;',
  '    loadscene(room1);',
  '    other_action(1);',
  '  </action>',
  '  <action name="js_one" type="Javascript"><![CDATA[',
  '    other_action(2); // JS 动作体不应算引用',
  '  ]]></action>',
  '  <action name="other_action"/>',
  '  <scene name="room1"/>',
  '  <layer name="info"/>',
  '  <hotspot name="hs_1" style="my_style" linkedscene="room1" onclick="do_thing(1);"/>',
  '  <style name="my_style"/>',
  '  <!-- layer[info] 在注释里不算引用 -->',
  '</krpano>',
].join('\n')

test('引用:四种形式都能识别', () => {
  const indexRefs = findReferences(text, 'info').filter(r => r.form === 'index')
  assert.equal(indexRefs.length, 1, 'layer[info] 索引引用应恰好 1 处(注释里的不算)')
  assert.equal(indexRefs[0].element, 'layer')

  const attrRefs = findReferences(text, 'room1').filter(r => r.form === 'attribute')
  assert.equal(attrRefs.length, 1, 'linkedscene="room1" 应被识别')
  assert.equal(attrRefs[0].element, 'scene')

  const argRefs = findReferences(text, 'room1').filter(r => r.form === 'argument')
  assert.equal(argRefs.length, 1, 'loadscene(room1) 应被识别')

  const callRefs = findReferences(text, 'do_thing').filter(r => r.form === 'call')
  assert.equal(callRefs.length, 1, 'onclick 里的 do_thing( 应被识别')
})

test('引用:跳过 JS 动作体、CDATA 与注释', () => {
  const calls = findReferences(text, 'other_action')
  assert.equal(calls.length, 1, `JS 动作体里的调用不应算引用:${JSON.stringify(calls)}`)
  assert.equal(calls[0].range.start.line, 4)
  // style 属性引用 + style 定义
  const styleRefs = findReferences(text, 'my_style')
  assert.deepEqual(styleRefs.map(r => r.form), ['attribute'])
})

test('引用:光标处的名字(定义与引用)', () => {
  const definitionAt = text.indexOf('name="do_thing"') + 'name="'.length
  const definition = nameAtOffset(text, definitionAt)
  assert.equal(definition?.kind, 'definition')
  assert.equal(definition?.name, 'do_thing')

  const referenceAt = text.indexOf('onclick="do_thing') + 'onclick="'.length
  const reference = nameAtOffset(text, referenceAt)
  assert.equal(reference?.kind, 'reference')
  assert.equal(reference?.name, 'do_thing')

  assert.equal(nameAtOffset(text, text.indexOf('<scene')), undefined, '普通标签名不算名字')
})

test('索引:未知索引校验与补全上下文', () => {
  const withGhost = '<krpano>\n  <action name="a">layer[ghost_name].visible = false;</action>\n</krpano>'
  const unknown = findUnknownIndexes(withGhost, (element, name) => element === 'layer' && name === 'info')
  assert.equal(unknown.length, 1)
  assert.equal(unknown[0].name, 'ghost_name')
  assert.ok(!findUnknownIndexes(withGhost, () => true).length, '已知名字不应报')

  const dynamic = '<krpano>\n  <action name="a">layer[get(x)].visible = false;</action>\n</krpano>'
  assert.equal(findUnknownIndexes(dynamic, () => false).length, 0, '动态索引不参与校验')

  const line = '    layer[hs'
  const context = indexContextAt(line, line.length)
  assert.deepEqual(context, { element: 'layer', prefix: 'hs' })
})

test('大纲:场景树与范围', () => {
  const symbols = getDocumentSymbols(text)
  assert.deepEqual(symbols.map(s => `${s.detail}:${s.name}`), ['action:do_thing', 'action:js_one', 'action:other_action', 'scene:room1', 'layer:info', 'hotspot:hs_1', 'style:my_style'])
  const hotspot = symbols.find(s => s.detail === 'hotspot')
  assert.equal(hotspot.children.length, 0)
  // selectionRange 应落在 range 之内
  for (const symbol of symbols) {
    const inside = (symbol.selectionRange.start.line > symbol.range.start.line || symbol.selectionRange.start.character >= symbol.range.start.character)
      && (symbol.selectionRange.end.line < symbol.range.end.line || symbol.selectionRange.end.character <= symbol.range.end.character)
    assert.ok(inside, `${symbol.name} 的 selectionRange 应包含在 range 内`)
  }

  const nested = getDocumentSymbols('<krpano>\n  <scene name="room1">\n    <hotspot name="hs"/>\n  </scene>\n</krpano>')
  assert.equal(nested.length, 1)
  assert.equal(nested[0].children.length, 1)
  assert.equal(nested[0].children[0].name, 'hs')
  assert.ok(nested[0].range.end.line >= 3, '成对标签的 range 应覆盖到闭合标签')
})

test('引用:collectReferences 不重复计数', () => {
  const counted = collectReferences(text)
  const keys = counted.map(r => `${r.range.start.line}:${r.range.start.character}:${r.form}`)
  assert.equal(new Set(keys).size, keys.length, '不应有重复引用')
})
