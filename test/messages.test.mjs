import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { localeOf, messagesFor } = require('./build/lsp/messages.js')
const { getCodeActions } = require('./build/lsp/actions.js')

test('本地化:localeOf 判定与文案表', () => {
  assert.equal(localeOf('zh-cn'), 'zh')
  assert.equal(localeOf('zh-tw'), 'zh')
  assert.equal(localeOf('ZH'), 'zh')
  assert.equal(localeOf('en'), 'en')
  assert.equal(localeOf('ja'), 'en')
  assert.equal(localeOf(undefined), 'en')

  assert.equal(messagesFor('zh').changeToTag('hotspot'), '改为 <hotspot>')
  assert.equal(messagesFor('en').changeToTag('hotspot'), 'Change to <hotspot>')
  assert.equal(messagesFor(undefined).createFile('a.xml'), 'Create file "a.xml"')
  assert.ok(messagesFor('zh').serverStopped.includes('语言服务'))
  assert.ok(messagesFor('en').serverStopped.includes('language service'))
})

test('本地化:快速修复标题随语言切换', () => {
  const text = '<krpano>\n  <action name="a" lang="ts">trace(1);</action>\n</krpano>'
  const range = { start: { line: 1, character: 20 }, end: { line: 1, character: 20 } }

  const en = getCodeActions(text, range, {}, 'en').map(a => a.title)
  assert.ok(en.some(title => title.includes('type="Javascript"')), en.join(' | '))

  const zh = getCodeActions(text, range, {}, 'zh').map(a => a.title)
  assert.ok(zh.some(title => title.includes('改为 type="Javascript"')), zh.join(' | '))
  assert.ok(!zh.some(title => title.startsWith('Change ')), '中文界面不应出现英文标题')

  const fallback = getCodeActions(text, range).map(a => a.title)
  assert.deepEqual(fallback, en, '未指定语言时默认英文(保持既有行为)')
})

test('本地化:未定义动作与提取类修复的标题', () => {
  const text = '<krpano>\n  <hotspot name="h" onclick="missing_thing();"/>\n</krpano>'
  const range = { start: { line: 1, character: 33 }, end: { line: 1, character: 33 } }
  const zh = getCodeActions(text, range, {}, 'zh').map(a => a.title)
  assert.ok(zh.some(title => title.includes('创建动作')), zh.join(' | '))

  const extractText = '<krpano>\n  <hotspot name="h" ath="0" atv="0" url="pano.jpg" scale="2"/>\n</krpano>'
  const extractRange = { start: { line: 1, character: 20 }, end: { line: 1, character: 20 } }
  const actions = getCodeActions(extractText, extractRange, {}, 'zh').map(a => a.title)
  assert.ok(actions.some(title => title.includes('提取为 style')), actions.join(' | '))
})
