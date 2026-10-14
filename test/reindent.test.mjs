import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { depthAt, enclosingElementNames, reindentLines } = require('./build/shared/reindent.js')

test('选区格式化:按标签层级对齐缩进', () => {
  const text = [
    '<krpano>',
    '<scene name="a">',
    '<hotspot name="h"/>',
    '</scene>',
    '</krpano>',
  ].join('\n')
  const result = reindentLines(text, text.indexOf('<scene'), text.indexOf('</krpano>'), '  ')
  assert.equal(result.changed, true)
  assert.equal(result.text, [
    '  <scene name="a">',
    '    <hotspot name="h"/>',
    '  </scene>',
  ].join('\n'))
})

test('选区格式化:已经对齐时不产生改动', () => {
  const text = '<krpano>\n  <scene name="a">\n    <hotspot name="h"/>\n  </scene>\n</krpano>'
  const result = reindentLines(text, text.indexOf('<scene'), text.indexOf('</scene>'), '  ')
  assert.equal(result.changed, false)
  assert.equal(result.text, '  <scene name="a">\n    <hotspot name="h"/>\n  </scene>')
})

test('选区格式化:注释与 CDATA 内部保持原样', () => {
  const text = [
    '<krpano>',
    '<data name="d">',
    '<![CDATA[',
    '   keep   this   ',
    ']]>',
    '<!--  <a>  -->',
    '</data>',
    '</krpano>',
  ].join('\n')
  const result = reindentLines(text, text.indexOf('<data'), text.indexOf('</data>'), '  ')
  assert.ok(result.text.includes('   keep   this   '), `CDATA 内容不应被重排:\n${result.text}`)
  assert.ok(result.text.includes('  <data name="d">'), result.text)
  assert.ok(result.text.includes('<!--  <a>  -->'), result.text)
})

test('缩进宽度可配置(Tab)', () => {
  const text = '<krpano>\n<scene name="a">\n<hotspot name="h"/>\n</scene>\n</krpano>'
  const result = reindentLines(text, text.indexOf('<scene'), text.indexOf('</scene>'), '\t')
  assert.ok(result.text.startsWith('\t<scene'), JSON.stringify(result.text))
  assert.ok(result.text.includes('\n\t\t<hotspot'), JSON.stringify(result.text))
})

test('祖先元素与深度(用于 ignoredPaths 判断)', () => {
  const text = '<krpano>\n  <scene name="a">\n    <action name="x">\n      trace(1);\n    </action>\n  </scene>\n</krpano>'
  const offset = text.indexOf('trace(1)')
  assert.deepEqual(enclosingElementNames(text, offset), ['krpano', 'scene', 'action'])
  assert.equal(depthAt(text, offset), 3)
  assert.deepEqual(enclosingElementNames(text, text.indexOf('<scene')), ['krpano'])
})
