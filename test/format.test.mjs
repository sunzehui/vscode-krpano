import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)

// 先由 `npm run test:build` 把 src 下两个纯模块编译到 test/build(CJS)
const { beautify } = require('./build/beautifyHtml.js')
const getOptionsModule = require('./build/getOptions.js')

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

test('C3: 无法解析为 XML 时返回原文、标记 failed 并给出原因', () => {
  const r = beautify('hello world', base)
  assert.equal(r.failed, true)
  assert.equal(r.text, 'hello world')
  assert.ok(typeof r.reason === 'string' && r.reason.length > 0, `应带上解析失败原因:${JSON.stringify(r)}`)
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

test('项12:krpano-lang-format off/on 之间的内容保持原样', () => {
  const src = [
    '<krpano>',
    '<action name="a">',
    '<!-- krpano-lang-format: off -->',
    '   if(x,   set(y,1)  );',
    '        tween(fov, 90);',
    '<!-- krpano-lang-format: on -->',
    '</action>',
    '<hotspot name="h"/>',
    '</krpano>',
  ].join('\n')
  const r = beautify(src, base)
  assert.equal(r.failed, false)
  assert.ok(r.text.includes('   if(x,   set(y,1)  );'), `忽略区内容应逐字保留:\n${r.text}`)
  assert.ok(r.text.includes('        tween(fov, 90);'), r.text)
  assert.ok(r.text.includes('<!-- krpano-lang-format: off -->') && r.text.includes('<!-- krpano-lang-format: on -->'), '标记本身应保留')
  assert.ok(r.text.includes('  <hotspot name="h"/>'), '标记之外的内容正常格式化')
  assert.equal(Boolean(r.structureChanged), false, '忽略区不应造成结构变化误报')
})

test('项12:忽略区跨越多个元素时也能还原且不误报结构变化', () => {
  const src = [
    '<krpano>',
    '<!-- krpano-lang-format: off -->',
    '<hotspot name="a" ath="0"/>   <hotspot name="b" ath="1"/>',
    '<!-- krpano-lang-format: on -->',
    '<layer name="c"/>',
    '</krpano>',
  ].join('\n')
  const r = beautify(src, base)
  assert.equal(r.failed, false)
  assert.ok(r.text.includes('<hotspot name="a" ath="0"/>   <hotspot name="b" ath="1"/>'), r.text)
  assert.equal(Boolean(r.structureChanged), false, '还原后的结构应与原文一致')
})

test('项12:没有配对 on 标记时不保护也不报错', () => {
  const src = '<krpano>\n<!-- krpano-lang-format: off -->\n<hotspot name="a"/>\n</krpano>'
  const r = beautify(src, base)
  assert.equal(r.failed, false)
  assert.ok(r.text.includes('<hotspot name="a"/>'))
})

test('项5:属性排版 one-per-line / align', () => {
  const { applyAttributeLayout } = require('./build/shared/layout.js')
  const formatted = '<krpano>\n  <hotspot name="h" ath="0" atv="10"/>\n  <layer name="l">text</layer>\n</krpano>'
  const onePerLine = applyAttributeLayout(formatted, 'one-per-line', '  ')
  assert.equal(onePerLine, [
    '<krpano>',
    '  <hotspot name="h"',
    '    ath="0"',
    '    atv="10"',
    '  />',
    '  <layer name="l">text</layer>',
    '</krpano>',
  ].join('\n'))

  const aligned = applyAttributeLayout('<krpano>\n  <hotspot name="h" ath="0" atv="10"/>\n</krpano>', 'align', '  ')
  assert.equal(aligned, ['<krpano>', '  <hotspot name="h"', '    ath ="0"', '    atv ="10"', '  />', '</krpano>'].join('\n'), aligned)

  assert.equal(applyAttributeLayout(formatted, 'preserve', '  '), formatted, 'preserve 不改动')
})

test('项5:beautify 应用属性排版选项', () => {
  const src = '<krpano><hotspot name="h" ath="0" atv="10"/></krpano>'
  const r = beautify(src, { ...base, attributeLayout: 'one-per-line' })
  assert.equal(r.failed, false)
  assert.ok(r.text.includes('<hotspot name="h"\n    ath="0"'), r.text)
  assert.equal(Boolean(r.structureChanged), false, '属性排版不应被当作结构变化')
})

test('项6:action 正文按括号层级缩进(默认关闭)', () => {
  const { reindentActionBodies } = require('./build/shared/reindent.js')
  const text = [
    '<krpano>',
    '\t<action name="a">',
    '\t\tif(x,',
    '\t\tset(y, 1);',
    '\t\t);',
    '\t</action>',
    '\t<action name="js" type="Javascript">',
    '\tconsole.log(1);',
    '\t</action>',
    '</krpano>',
  ].join('\n')
  const indented = reindentActionBodies(text, '\t')
  assert.ok(indented.includes('\t\tif(x,\n\t\t\tset(y, 1);\n\t\t);'), indented)
  assert.ok(indented.includes('\tconsole.log(1);'), 'JS 动作不应被重排')

  const src = '<krpano><action name="a">if(x, set(y,1));</action></krpano>'
  assert.equal(beautify(src, { ...base, actionIndentation: true }).text, beautify(src, base).text, '单行脚本不受影响')

  // 注释里的 action 不是代码:整体原样保留
  const commented = '<krpano>\n  <!-- <action name="old">\nif(x,\n1);\n</action> -->\n</krpano>'
  assert.equal(reindentActionBodies(commented, '  '), commented, '注释里的 action 不应被重新缩进')
})

test('语句拆分:同一行的多条脚本语句拆到多行(opt-in)', async () => {
  const { splitActionStatements } = require('./build/shared/statements.js')
  const text = '<krpano>\n\tset(v1, 1); set(v2, 2); trace("a;b");\n\t</krpano>'

  const single = '<krpano>\n  <action name="a">set(v1, 1); set(v2, 2);</action>\n</krpano>'
  const result = splitActionStatements(single)
  assert.equal(result.changed, true)
  assert.equal(
    result.text,
    '<krpano>\n  <action name="a">set(v1, 1);\n    set(v2, 2);</action>\n</krpano>',
    result.text,
  )

  // 字符串与括号内的 ";" 不拆
  const quoted = '<krpano>\n  <action name="a">trace("a;b"); set(x, calc(1;2));</action>\n</krpano>'
  const quotedResult = splitActionStatements(quoted)
  assert.equal(
    quotedResult.text,
    '<krpano>\n  <action name="a">trace("a;b");\n    set(x, calc(1;2));</action>\n</krpano>',
    quotedResult.text,
  )

  // JS 动作不动
  const js = '<krpano>\n  <action name="a" type="Javascript">let a = 1; let b = 2;</action>\n</krpano>'
  assert.equal(splitActionStatements(js).changed, false)
  assert.equal(splitActionStatements(js).text, js)

  // 已经一行一条时不改动
  const done = '<krpano>\n  <action name="a">set(a, 1);\n    set(b, 2);\n  </action>\n</krpano>'
  assert.equal(splitActionStatements(done).changed, false)

  // 行内有标签(注释等)时不拆
  const commented = '<krpano>\n  <action name="a">set(a, 1); <!-- 说明 --> set(b, 2);</action>\n</krpano>'
  assert.equal(splitActionStatements(commented).changed, false)

  // 注释掉的整个 action 也不拆(注释内容应保持原样)
  const commentedAction = '<krpano>\n  <!-- <action name="old">set(a, 1); set(b, 2);</action> -->\n</krpano>'
  assert.equal(splitActionStatements(commentedAction).changed, false)
  assert.equal(splitActionStatements(commentedAction).text, commentedAction)

  void text
})

test('语句拆分:与格式化选项联动(scriptStatements)', () => {
  const legacyFormat = require('./build/beautifyHtml.js')
  const beautify = legacyFormat.beautify ?? legacyFormat.default
  const input = '<krpano><action name="a">set(a, 1); set(b, 2);</action></krpano>'

  const preserved = beautify(input, { indentation: '  ', handleRootNode: false })
  assert.ok(!preserved.text.includes('set(b, 2);\n'))

  const split = beautify(input, { indentation: '  ', handleRootNode: false, scriptStatements: true })
  assert.ok(split.text.includes('\n'), split.text)
  assert.ok(/set\(a, 1\);[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*set\(b, 2\);/.test(split.text), split.text)
  assert.equal(split.failed, false)
})
