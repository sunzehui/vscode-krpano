import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { getCodeActions } = require('./build/lsp/actions.js')

function lineRange(text, needle, occurrence = 1) {
  let index = -1
  for (let i = 0; i < occurrence; i++)
    index = text.indexOf(needle, index + 1)
  let line = 0
  let lineStart = 0
  for (let i = 0; i < index; i++) {
    if (text[i] === '\n') {
      line++
      lineStart = i + 1
    }
  }
  const character = index - lineStart
  return { start: { line, character }, end: { line, character: character + needle.length } }
}

test('快速修复:未知元素 → 建议最接近的元素(开闭标签一起改)', () => {
  const text = '<krpano>\n  <hotspott name="h">\n  </hotspott>\n</krpano>'
  const actions = getCodeActions(text, lineRange(text, 'hotspott'))
  const fix = actions.find(a => a.title === 'Change to <hotspot>')
  assert.ok(fix, actions.map(a => a.title).join(' | '))
  const edits = fix.edit.changes[0].edits
  assert.equal(edits.length, 2, '开标签与闭标签都要改')
  assert.ok(edits.every(edit => edit.newText === 'hotspot'))
})

test('快速修复:action 上的 lang 属性', () => {
  const ts = '<krpano>\n  <action name="a" lang="ts">trace(1);</action>\n</krpano>'
  const tsActions = getCodeActions(ts, lineRange(ts, 'lang="ts"'))
  const convert = tsActions.find(a => a.title.includes('type="Javascript"'))
  assert.ok(convert, tsActions.map(a => a.title).join(' | '))
  assert.equal(convert.edit.changes[0].edits[0].newText, 'type="Javascript"')

  const coffee = '<krpano>\n  <action name="a" lang="coffee">trace(1);</action>\n</krpano>'
  const coffeeActions = getCodeActions(coffee, lineRange(coffee, 'lang="coffee"'))
  assert.ok(coffeeActions.some(a => a.title.includes('Remove')), coffeeActions.map(a => a.title).join(' | '))
})

test('快速修复:未定义的动作调用 → 生成 action 骨架', () => {
  const text = '<krpano>\n  <action name="a" autorun="onstart">missing_action(1);</action>\n</krpano>'
  const actions = getCodeActions(text, lineRange(text, 'missing_action'))
  const create = actions.find(a => a.title === 'Create action "missing_action"')
  assert.ok(create, actions.map(a => a.title).join(' | '))
  const edit = create.edit.changes[0].edits[0]
  assert.equal(edit.newText, '\t<action name="missing_action">\n\t\t\n\t</action>\n')
  assert.equal(edit.range.start.line, 2, '应插在 </krpano> 之前')
})

test('快速修复:重复 name → 建议改名', () => {
  const text = '<krpano>\n  <scene name="room">\n    <hotspot name="hs"/>\n    <hotspot name="hs"/>\n  </scene>\n</krpano>'
  const actions = getCodeActions(text, lineRange(text, 'name="hs"', 2))
  const rename = actions.find(a => a.title.includes('Rename this duplicate'))
  assert.ok(rename, actions.map(a => a.title).join(' | '))
  assert.equal(rename.edit.changes[0].edits[0].newText, 'hs_2')
})

test('快速修复:缺失的 include → 新建文件', () => {
  const text = '<krpano>\n  <include url="actions.xml"/>\n</krpano>'
  const range = lineRange(text, 'url="actions.xml"')
  const withoutContext = getCodeActions(text, range)
  assert.ok(!withoutContext.some(a => a.title.includes('Create file')), '没有解析结果时不建议建文件')

  const withContext = getCodeActions(text, range, { unresolvedIncludes: [{ url: 'actions.xml', range }] })
  const create = withContext.find(a => a.title === 'Create file "actions.xml"')
  assert.ok(create, withContext.map(a => a.title).join(' | '))
  assert.equal(create.edit.createFile.url, 'actions.xml')
  assert.ok(create.edit.createFile.content.includes('<krpano>'))
})

test('快速修复:提取为 style', () => {
  const text = '<krpano>\n  <hotspot name="hs" ath="0" atv="0" bgcolor="0xFFFFFF" bgalpha="0.8" scale="0.5"/>\n</krpano>'
  const actions = getCodeActions(text, lineRange(text, 'bgcolor'))
  const extract = actions.find(a => a.title.startsWith('Extract attributes to style'))
  assert.ok(extract, actions.map(a => a.title).join(' | '))
  const edits = extract.edit.changes[0].edits
  const styleEdit = edits.find(edit => edit.newText.includes('<style'))
  assert.ok(styleEdit.newText.includes('<style name="hotspot_style" bgcolor="0xFFFFFF" bgalpha="0.8" scale="0.5"/>'), styleEdit.newText)
  const tagEdit = edits.find(edit => edit.newText.includes('style='))
  assert.equal(tagEdit.newText, 'name="hs" ath="0" atv="0" style="hotspot_style"', tagEdit.newText)
})

test('快速修复:选中的脚本片段提取为 action', () => {
  const text = [
    '<krpano>',
    '  <action name="a" autorun="onstart">',
    '    set(x, 1);',
    '    inc(x);',
    '  </action>',
    '</krpano>',
  ].join('\n')
  const range = lineRange(text, 'set(x, 1);')
  const actions = getCodeActions(text, range)
  const extract = actions.find(a => a.title.startsWith('Extract selection to action'))
  assert.ok(extract, actions.map(a => a.title).join(' | '))
  const edits = extract.edit.changes[0].edits
  const actionEdit = edits.find(edit => edit.newText.includes('<action'))
  assert.ok(actionEdit.newText.includes('<action name="extracted_action">'), actionEdit.newText)
  assert.ok(actionEdit.newText.includes('set(x, 1);'), actionEdit.newText)
  const callEdit = edits.find(edit => edit.newText.includes('();'))
  assert.equal(callEdit.newText, 'extracted_action();')
})
