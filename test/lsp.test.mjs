import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { getCompletions, getDefinition, getDiagnostics, getHover, krpanoElementNames } = require('./.tmp/lsp/features.js')
const krpanoData = require('../src/lsp/krpanoData.json')

const messages = text => getDiagnostics(text).map(d => d.message)
const offsetOf = (text, needle, occurrence = 1) => {
  let index = -1
  for (let i = 0; i < occurrence; i++)
    index = text.indexOf(needle, index + 1)
  return index
}

test('数据:元素与内建 action 清单', () => {
  for (const el of ['krpano', 'hotspot', 'layer', 'plugin', 'action', 'style', 'scene', 'events', 'cube', 'level', 'events', 'preview', 'include', 'image'])
    assert.ok(krpanoElementNames.includes(el), `缺少元素 ${el}`)
  for (const junk of ['network', 'memory', 'security', 'debug', 'set', 'if', 'progress'])
    assert.ok(!krpanoElementNames.includes(junk), `不应包含变量命名空间 ${junk}`)
  for (const attr of ['name', 'url', 'ath', 'atv', 'type', 'align'])
    assert.ok(krpanoData.elements.hotspot.includes(attr), `hotspot 缺少属性 ${attr}`)
  for (const fn of ['set', 'get', 'calc', 'tween', 'loadscene', 'lookto', 'ifnot'])
    assert.ok(krpanoData.builtinActions.includes(fn), `内建 action 缺少 ${fn}`)
})

test('诊断:标签错配与未闭合', () => {
  const mismatch = messages('<krpano><a></b></krpano>')
  assert.ok(mismatch.some(m => m.includes('Closing tag </b> has no matching opening tag')), mismatch.join(' | '))
  const unclosed = messages('<krpano><hotspot name="x"></krpano>')
  assert.ok(unclosed.some(m => m.includes('Unclosed tag <hotspot>')), unclosed.join(' | '))
  assert.ok(!unclosed.some(m => m.includes('Unclosed tag <krpano>')), 'krpano 已被正确闭合:' + unclosed.join(' | '))
  const orphan = messages('</foo>')
  assert.ok(orphan.some(m => m.includes('has no matching opening tag')), orphan.join(' | '))
  const eof = messages('<krpano><action name="a">')
  assert.ok(eof.some(m => m.includes('Unclosed tag <action>')) && eof.some(m => m.includes('Unclosed tag <krpano>')), eof.join(' | '))
})

test('诊断:未知元素、自由格式元素内部不报', () => {
  const unknown = messages('<krpano><foo/></krpano>')
  assert.ok(unknown.some(m => m.includes('Unknown krpano element <foo>')), unknown.join(' | '))
  const freeForm = messages('<krpano><cssstyles><mystyle font="Arial"/></cssstyles></krpano>')
  assert.ok(!freeForm.some(m => m.includes('mystyle')), freeForm.join(' | '))
  const known = messages('<krpano><hotspot name="a"/><layer name="b"/></krpano>')
  assert.ok(!known.some(m => m.includes('Unknown krpano element')), known.join(' | '))
})

test('诊断:action type 取值', () => {
  assert.ok(messages('<krpano><action type="typescript"/></krpano>').some(m => m.includes('Unknown action type')))
  assert.ok(!messages('<krpano><action type="js"/></krpano>').some(m => m.includes('Unknown action type')))
  assert.ok(!messages('<krpano><action type="Javascript"/></krpano>').some(m => m.includes('Unknown action type')))
})

test('诊断:未定义动作引用(本文件范围)', () => {
  const missing = messages('<krpano>\n<hotspot name="h" onclick="my_missing_action();"/>\n</krpano>')
  assert.ok(missing.some(m => m.includes('Action "my_missing_action"')), missing.join(' | '))

  const defined = messages('<krpano>\n<action name="my_action">trace(1);</action>\n<hotspot name="h" onclick="my_action();"/>\n</krpano>')
  assert.ok(!defined.some(m => m.includes('my_action')), defined.join(' | '))

  const builtin = messages('<krpano>\n<hotspot name="h" onclick="tween(alpha,1);"/>\n</krpano>')
  assert.ok(!builtin.some(m => m.includes('Action "tween"')), builtin.join(' | '))

  const js = messages('<krpano>\n<action name="j" type="javascript"><![CDATA[\nconsole.log(1);\n]]></action>\n</krpano>')
  assert.ok(!js.some(m => m.includes('console')), js.join(' | '))
})

test('补全:元素名与部分输入', () => {
  const text = '<krpan'
  const items = getCompletions(text, text.length)
  assert.ok(items.some(i => i.label === 'krpano' && i.kind === 'element'))

  const partial = '<ho'
  const hotspots = getCompletions(partial, partial.length)
  assert.deepEqual(hotspots.map(i => i.label), ['hotspot'])
})

test('补全:标签内属性名(排除已有属性)与特殊属性', () => {
  const text = '<hotspot name="a" at'
  const items = getCompletions(text, text.length)
  const labels = items.map(i => i.label)
  assert.ok(labels.includes('ath'), labels.join(','))
  assert.ok(!labels.includes('name'), '已有属性不应再建议')
  assert.ok(labels.every(l => l.startsWith('at')))

  const empty = '<hotspot '
  const all = getCompletions(empty, empty.length).map(i => i.label)
  assert.ok(all.includes('devices') && all.includes('if'), all.join(','))
})

test('补全:action type 的取值', () => {
  const text = '<action name="a" type="'
  const items = getCompletions(text, text.length)
  assert.deepEqual(items.map(i => i.label).sort(), ['Javascript', 'js'])
  assert.ok(items.every(i => i.kind === 'value'))
})

test('悬停:元素与属性', () => {
  const elementText = '<hotspot name="a" ath="0"/>'
  const elementHover = getHover(elementText, offsetOf(elementText, 'hotspot') + 2)
  assert.ok(elementHover.contents.includes('hotspot'))
  assert.ok(elementHover.contents.includes('element'))

  const attrHover = getHover(elementText, offsetOf(elementText, 'ath'))
  assert.ok(attrHover.contents.includes('Horizontal position'), attrHover.contents)
})

test('跳转:从事件属性中的调用跳到 action 定义', () => {
  const text = '<krpano>\n<action name="do_thing">trace(1);</action>\n<hotspot name="h" onclick="do_thing();"/>\n</krpano>'
  const callOffset = offsetOf(text, 'do_thing', 2) + 2
  const location = getDefinition(text, callOffset)
  assert.ok(location, '应能找到定义')
  assert.deepEqual(location.range.start, { line: 1, character: 14 })
  assert.deepEqual(location.range.end, { line: 1, character: 22 })
  assert.equal(location.uri, undefined, '同文件定义不带 uri')

  // 定义处自身不跳转;内建动作不跳转
  assert.equal(getDefinition(text, offsetOf(text, 'do_thing') + 2), null)
  assert.equal(getDefinition('<krpano>\n<action name="a">tween(x,1);</action>\n</krpano>', offsetOf('<krpano>\n<action name="a">tween(x,1);</action>\n</krpano>', 'tween') + 1), null)

  // 非调用场景(属性值里没有括号)不跳转
  const plain = '<krpano>\n<action name="a"/>\n<hotspot name="a" url="a"/>\n</krpano>'
  assert.equal(getDefinition(plain, offsetOf(plain, '"a"', 2) + 1), null)
})

const externalContext = () => ({
  externalDefinitions: new Map([
    ['from_include', { uri: 'file:///pano/actions.xml', range: { start: { line: 2, character: 14 }, end: { line: 2, character: 26 } } }],
  ]),
})

test('跨文件:include 链中的动作不再报"未定义",真笔误仍报', () => {
  const text = [
    '<krpano>',
    '  <include url="actions.xml"/>',
    '  <action name="local_action" autorun="onstart">',
    '    from_include(1);',
    '    really_missing(2);',
    '  </action>',
    '</krpano>',
  ].join('\n')
  const messages = getDiagnostics(text, externalContext()).map(d => d.message)
  assert.ok(!messages.some(m => m.includes('from_include')), `include 中的定义不应被报:${messages.join(' | ')}`)
  assert.ok(messages.some(m => m.includes('really_missing')), messages.join(' | '))
})

test('跨文件:无法解析的 include 目标给出警告', () => {
  const text = '<krpano>\n  <include url="nope.xml"/>\n</krpano>'
  const diagnostics = getDiagnostics(text, {
    unresolvedIncludes: [{ url: 'nope.xml', range: { start: { line: 1, character: 17 }, end: { line: 1, character: 25 } } }],
  })
  const warning = diagnostics.find(d => d.severity === 'warning' && d.message.includes('nope.xml'))
  assert.ok(warning, diagnostics.map(d => `${d.severity}:${d.message}`).join(' | '))
})

test('跨文件:跳转到 include 文件中的定义', () => {
  const text = '<krpano>\n  <action name="local_action" autorun="onstart">\n    from_include(1);\n  </action>\n</krpano>'
  const location = getDefinition(text, offsetOf(text, 'from_include') + 2, externalContext())
  assert.ok(location, '应能找到跨文件定义')
  assert.equal(location.uri, 'file:///pano/actions.xml')
  assert.deepEqual(location.range.start, { line: 2, character: 14 })

  // 同文件定义优先于 include 链
  const sameName = '<krpano>\n  <action name="from_include">trace(1);</action>\n  <hotspot name="h" onclick="from_include();"/>\n</krpano>'
  const local = getDefinition(sameName, offsetOf(sameName, 'from_include', 2) + 2, externalContext())
  assert.ok(local && local.uri === undefined, '同文件定义应优先且不带 uri')
})
