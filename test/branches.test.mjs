// 分支覆盖补充用例:针对 c8 报告里未覆盖的分支逐项构造输入。
// 这些用例不追求"功能描述",只锁定边界行为,避免回归。
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { getCodeActions } = require('./build/lsp/actions.js')
const { getCompletions, getDefinition, getDiagnostics, getHover, getSignatureHelp } = require('./build/lsp/features.js')
const { docForAttribute, docForElement } = require('./build/lsp/krpanoDocs.js')
const { getDocumentSymbols } = require('./build/lsp/outline.js')
const {
  callArgumentContextAt,
  collectReferences,
  findUnknownIndexes,
  indexContextAt,
  nameAtOffset,
} = require('./build/lsp/references.js')
const { collectDefinitions, extractIncludes, resolveIncludePath, uriToPath, pathToUri, buildIncludeIndex, contextForFile } = require('./build/lsp/symbols.js')
const { applyAttributeLayout } = require('./build/shared/layout.js')
const { depthAt, enclosingElementNames, reindentLines, reindentActionBodies, selectionLineBounds } = require('./build/shared/reindent.js')
const { splitActionStatements } = require('./build/shared/statements.js')
const { scanXml } = require('./build/shared/xml.js')

const range = (line, char) => ({ start: { line, character: char }, end: { line, character: char } })

// ---------- xml.ts ----------

test('分支:扫描器容错(非法属性、未闭合区域、非标签尖括号)', () => {
  // 无引号取值 / 属性区非法字符
  const scan = scanXml('<krpano a=1 b x @ c="2"/>')
  const names = scan.tags[0].attributes.map(attr => attr.name)
  assert.deepEqual(names, ['a', 'b', 'x', 'c'], `实际属性:${names.join(',')}`)
  assert.equal(scan.tags[0].attributes.at(-1).value, '2')

  // 未闭合的注释 / CDATA / DOCTYPE / 处理指令都吃到文末
  assert.equal(scanXml('<krpano><!-- 没关').skipped[0].end, '<krpano><!-- 没关'.length)
  assert.equal(scanXml('<krpano><![CDATA[ 没关').skipped[0].kind, 'cdata')
  assert.equal(scanXml('<!DOCTYPE krpano [ ').skipped[0].kind, 'doctype')
  assert.equal(scanXml('<?xml version="1.0"').skipped[0].kind, 'pi')

  // 非标签的尖括号(如脚本里的 a < b)不产生标签
  assert.deepEqual(scanXml('a < b').tags, [])
  // 值里带引号边界:值在 to 之后时截断到标签末尾
  const attrs = scanXml('<krpano a="b" >').tags[0].attributes
  assert.equal(attrs[0].value, 'b')
})

// ---------- layout.ts ----------

test('分支:属性排版的边界(单属性/自闭合/行内内容/对齐/保护区)', () => {
  assert.equal(applyAttributeLayout('<krpano a="1"/>', 'preserve', '  '), '<krpano a="1"/>')
  // 属性少于两个 → 不重排
  assert.equal(applyAttributeLayout('<krpano a="1"/>', 'one-per-line', '  '), '<krpano a="1"/>')
  // 结束标签不参与
  assert.equal(applyAttributeLayout('<krpano><a x="1" y="2"></a></krpano>', 'one-per-line', '  ').includes('</a>'), true)

  const selfClosing = applyAttributeLayout('<krpano>\n  <hotspot name="a" ath="1"/>\n</krpano>', 'one-per-line', '  ')
  assert.ok(selfClosing.includes('name="a"\n    ath="1"\n  />'), selfClosing)

  // 标签后有同行内容 → 结束符跟最后一行属性
  const inline = applyAttributeLayout('<krpano>\n  <action name="a" autorun="onstart">trace(1);</action>\n</krpano>', 'one-per-line', '  ')
  assert.ok(inline.includes('autorun="onstart">trace(1);</action>'), inline)

  const aligned = applyAttributeLayout('<krpano>\n  <hotspot name="a" ath="1"/>\n</krpano>', 'align', '  ')
  assert.ok(aligned.includes('name="a"'), aligned)
  assert.ok(aligned.includes('ath ="1"'), `对齐应补空格:${aligned}`)

  // CDATA / 注释里的内容不动
  const protectedText = '<krpano>\n  <data name="d"><![CDATA[<hotspot a="1" b="2"/>]]></data>\n</krpano>'
  assert.equal(applyAttributeLayout(protectedText, 'one-per-line', '  '), protectedText)
})

// ---------- reindent.ts ----------

test('分支:缩进辅助函数的边界', () => {
  const text = '<krpano>\n  <scene name="s">\n    <view/>\n  </scene>\n</krpano>'
  assert.equal(depthAt(text, text.indexOf('<view')), 2)
  assert.equal(depthAt(text, text.indexOf('</scene>')), 2)
  assert.deepEqual(enclosingElementNames(text, text.indexOf('<view')), ['krpano', 'scene'])
  // 与栈不匹配的闭合标签不影响结果
  assert.deepEqual(enclosingElementNames('<krpano><scene></foo><view', 20), ['krpano', 'scene'])

  // 空选区:不产生改动
  const empty = reindentLines(text, 8, 8, '  ')
  assert.equal(empty.changed, false)

  // 结束位置在行首时不含该行;没有换行的选区取到文末
  assert.deepEqual(selectionLineBounds('a\nb\nc', 2, 4), { start: 2, end: 3 })
  assert.deepEqual(selectionLineBounds('abc', 1, 3), { start: 0, end: 3 })

  // 单行注释行按当前深度对齐;多行注释内部的行保持原样
  const commented = '<krpano>\n      <!-- 保持原样 -->\n</krpano>'
  assert.equal(reindentLines(commented, 9, 25, '  ').text, '  <!-- 保持原样 -->')
  const multiLineComment = '<krpano>\n  <!-- 第一行\n        第二行 -->\n</krpano>'
  const multiResult = reindentLines(multiLineComment, multiLineComment.indexOf('第一行'), multiLineComment.indexOf('第二行') + 3, '  ')
  assert.equal(multiResult.text, '  <!-- 第一行\n        第二行 -->', `注释内部的行应保持原样:${JSON.stringify(multiResult.text)}`)

  // action 正文:单行不处理、单引号 type=js 跳过、tab 缩进的标签
  const oneLine = '<krpano><action name="a">set(x,1);</action></krpano>'
  assert.equal(reindentActionBodies(oneLine, '  '), oneLine)
  const jsAction = '<krpano>\n<action name="a" type=\'js\'>\nif (a) {\n}\n</action>\n</krpano>'
  assert.equal(reindentActionBodies(jsAction, '  '), jsAction)
  const tabbed = '<krpano>\n\t<action name="a">\nset(x, calc(\n1));\n\t</action>\n</krpano>'
  const reindented = reindentActionBodies(tabbed, '  ')
  // 正文缩进 = 标签缩进(\t) + 一级(两个空格);括号内的行再深一级
  assert.ok(reindented.includes('\n\t  set(x, calc(\n\t      1));'), reindented)
  assert.ok(reindented.includes('\n\t</action>'), `</action> 前的缩进应保留:${reindented}`)
})

// ---------- statements.ts ----------

test('分支:语句拆分的边界(转义引号、仅字符串内分号、单引号 type)', () => {
  // 字符串里的转义引号不影响判断
  const escaped = '<krpano>\n  <action name="a">trace("a\\""); set(x, 1);</action>\n</krpano>'
  const result = splitActionStatements(escaped)
  assert.ok(result.text.includes('trace("a\\"");\n    set(x, 1);'), result.text)

  // 只有字符串内的分号 → 不拆
  const onlyString = '<krpano>\n  <action name="a">trace("a;b")</action>\n</krpano>'
  assert.equal(splitActionStatements(onlyString).changed, false)

  // 没有分号 → 直接跳过
  const noSemicolon = '<krpano>\n  <action name="a">trace(1)</action>\n</krpano>'
  assert.equal(splitActionStatements(noSemicolon).changed, false)

  // 单引号 type='js' 也识别为 JS 动作
  const singleQuoted = '<krpano>\n  <action name="a" type=\'js\'>let a = 1; let b = 2;</action>\n</krpano>'
  assert.equal(splitActionStatements(singleQuoted).changed, false)

  // 行尾分号前后的空白不影响结果
  const trailing = '<krpano>\n  <action name="a">set(a, 1);   </action>\n</krpano>'
  assert.equal(splitActionStatements(trailing).changed, false)
})

// ---------- outline.ts ----------

test('分支:大纲的匿名元素与嵌套', () => {
  const text = '<krpano>\n  <view fov="90"/>\n  <scene name="s">\n    <events onload="x();"/>\n    <layer name="l"/>\n  </scene>\n</krpano>'
  const roots = getDocumentSymbols(text)
  const view = roots.find(symbol => symbol.name === '<view>')
  assert.ok(view, `没有 name 的元素用 <元素名> 作为标签:${roots.map(s => s.name).join(',')}`)
  assert.equal(view.selectionRange.start.line, 1, '无 name 时选区落在标签名上')
  const scene = roots.find(symbol => symbol.name === 's')
  assert.deepEqual(scene.children.map(child => child.name), ['<events>', 'l'])
  assert.equal(scene.range.start.line, 2)
  assert.equal(scene.range.end.line, 5, '成对标签的 range 覆盖整个元素')
})

// ---------- krpanoDocs.ts ----------

test('分支:文档文案的回退路径', () => {
  assert.ok(docForElement('hotspot', 5).length > 0)
  assert.ok(docForElement('unknown_element_xyz', 0).length > 0, '未知元素也要有兜底文案')
  assert.ok(docForAttribute('hotspot', 'ath').length > 0)
  assert.ok(docForAttribute('krpano', 'not_a_real_attribute').length > 0, '未知属性要兜底文案')
})

// ---------- symbols.ts ----------

test('分支:定义收集与 include 解析的边界', () => {
  // 没有 name 属性 / name 为空白 / name 无 valueStart
  const defs = collectDefinitions('<krpano>\n  <hotspot ath="1"/>\n  <layer name=""/>\n  <plugin name="p"/>\n</krpano>')
  assert.deepEqual(defs.map(d => d.name), ['p'])

  // include 缺 url / url 为空白 / url 有值
  const includes = extractIncludes('<krpano>\n  <include/>\n  <include url="  "/>\n  <include url="a.xml"/>\n</krpano>')
  assert.deepEqual(includes.map(i => i.url), ['a.xml'])

  // 路径解析:相对路径、绝对路径、上跳
  assert.equal(resolveIncludePath('/pano/tour.xml', 'sub/a.xml'), '/pano/sub/a.xml')
  assert.equal(resolveIncludePath('/pano/sub/tour.xml', '../a.xml'), '/pano/a.xml')
  assert.equal(resolveIncludePath('/pano/tour.xml', 'a.xml?v=1#x'), '/pano/a.xml', '查询串与锚点应被剥离')
  assert.equal(resolveIncludePath('C:\\pano\\tour.xml', 'sub\\a.xml'), 'C:\\pano\\sub\\a.xml', 'Windows 路径用 win32 规则')
  assert.equal(resolveIncludePath('/pano/tour.xml', 'https://x/a.xml'), undefined, '远程 url 不解析')
  assert.equal(resolveIncludePath(undefined, 'a.xml'), undefined)

  // uri 转换
  assert.equal(pathToUri('/pano/a b.xml'), 'file:///pano/a%20b.xml')
  assert.equal(uriToPath('file:///pano/a%20b.xml'), '/pano/a b.xml')
  assert.equal(uriToPath('file:///C:/pano/a.xml').replace(/\\/g, '/').endsWith('C:/pano/a.xml'), true)
  assert.equal(uriToPath('untitled:test'), undefined)

  // 索引:深度上限与重复访问
  const files = {}
  for (let i = 0; i < 5; i++)
    files[`/pano/f${i}.xml`] = { text: `<krpano>\n<include url="f${i + 1}.xml"/>\n<action name="a${i}"/>\n</krpano>`, version: 'v1' }
  const readFile = path => files[path]
  const shallow = buildIncludeIndex('/pano/f0.xml', readFile, 1)
  assert.deepEqual([...shallow.definitions.keys()].sort(), ['a0', 'a1'], '超过深度上限的 include 不再展开')

  // 版本相同的缓存命中(第二次调用不重新解析)
  const cache = new Map()
  buildIncludeIndex('/pano/f0.xml', readFile, 3, cache)
  const cachedEntry = cache.get('/pano/f0.xml')
  cachedEntry.parsed.definitions.push({ name: 'injected', element: 'action', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } })
  const second = buildIncludeIndex('/pano/f0.xml', readFile, 3, cache)
  assert.ok(second.definitions.has('injected'), '版本未变时应复用缓存结果')

  // contextForFile:当前文件的定义与 include 不进入 externalDefinitions
  const index = {
    definitions: new Map([
      ['mine', { path: '/pano/a.xml', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, element: 'action' }],
      ['theirs', { path: '/pano/b.xml', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } }, element: 'hotspot', container: 's1' }],
    ]),
    unresolved: [
      { path: '/pano/a.xml', url: 'missing.xml', range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } } },
      { path: '/pano/b.xml', url: 'other.xml', range: { start: { line: 3, character: 0 }, end: { line: 3, character: 1 } } },
    ],
  }
  const context = contextForFile(index, '/pano/a.xml', 'file:///pano/a.xml')
  assert.deepEqual([...context.externalDefinitions.keys()], ['theirs'])
  assert.equal(context.externalDefinitions.get('theirs').container, 's1')
  assert.deepEqual(context.unresolvedIncludes.map(i => i.url), ['missing.xml'])
})

// ---------- references.ts ----------

test('分支:引用收集的边界(动态索引、callwith、JS 动作、非法值)', () => {
  // 动态索引与非法索引不算引用
  const dynamic = '<krpano>\n  <action name="a">layer[get(x)].visible = false; layer[%1].visible = true;</action>\n</krpano>'
  assert.deepEqual(collectReferences(dynamic).filter(r => r.form === 'index'), [])

  // callwith 取第二个参数;参数非法时不产生引用
  const callwith = '<krpano>\n  <action name="a">callwith(first, layer2, set(x, 1)); callwith(a, get(x)); loadscene(sc2);</action>\n</krpano>'
  const argumentsRefs = collectReferences(callwith).filter(r => r.form === 'argument')
  assert.deepEqual(argumentsRefs.map(r => r.name).sort(), ['layer2', 'sc2'], JSON.stringify(argumentsRefs))

  // 单引号 type='js' 的动作体跳过
  const jsAction = '<krpano>\n  <action name="a" type=\'js\'>renderScenes();</action>\n</krpano>'
  assert.deepEqual(collectReferences(jsAction).filter(r => r.form === 'call'), [])

  // 名字型属性:带空格的值 trim 后仍是合法名字
  const attribute = '<krpano>\n  <hotspot name="h" style=" skin_1 "/>\n  <hotspot name="h2" linkedscene="scene2"/>\n</krpano>'
  const attributeRefs = collectReferences(attribute).filter(r => r.form === 'attribute')
  assert.deepEqual(attributeRefs.map(r => `${r.element}:${r.name}`).sort(), ['scene:scene2', 'style:skin_1'])

  // 已知名字表判定索引是否未知
  const unknown = findUnknownIndexes('<krpano>\n  <action name="a">hotspot[ghost].visible = false;</action>\n</krpano>', () => false)
  assert.deepEqual(unknown.map(r => r.name), ['ghost'])

  // 光标落在定义范围之外、非名字字符上 → undefined
  const text = '<krpano>\n  <hotspot name="h"/>\n</krpano>'
  assert.equal(nameAtOffset(text, 0), undefined)
  const atName = nameAtOffset(text, text.indexOf('"h"') + 1)
  assert.equal(atName.kind, 'definition')
  assert.equal(nameAtOffset('<krpano>\n  <hotspot name="h" onclick="h();"/>\n</krpano>', '<krpano>\n  <hotspot name="h" onclick="h();"/>\n</krpano>'.indexOf('h();') + 1).kind, 'reference')

  // 索引上下文:跨行/行首的 [ 不算
  const indexText = '<krpano>layer['
  assert.equal(indexContextAt(indexText, indexText.length).element, 'layer')
  const crossingLine = '<krpano>layer\n[hs'
  assert.equal(indexContextAt(crossingLine, crossingLine.length), undefined)

  // 名字参数上下文:callwith 的第二个参数、非参数位置
  const call = '<krpano>\n  <action name="a">callwith(first, sec'
  const callContext = callArgumentContextAt(call, call.length)
  assert.equal(callContext?.prefix, 'sec')
  assert.equal(callArgumentContextAt('<krpano>\n  <action name="a">trace(', 33), undefined)
})

// ---------- features.ts ----------

test('分支:补全/悬停/跳转/签名帮助的回退路径', () => {
  // 没有 context/元素未知时的补全
  // 刚敲下 "<" 还没有名字:给出全部元素
  const all = getCompletions('<krpano>\n  <', 12)
  assert.ok(all.length > 10 && all.some(item => item.label === 'hotspot'), all.map(i => i.label).join(','))
  // 未知元素的属性位置:只给 devices/if 这类通用属性
  assert.deepEqual(getCompletions('<krpano>\n  <unknown_el x', 23).map(item => item.label), ['devices', 'if'])
  const partial = '<krpano>\n  <hotsp'
  assert.ok(getCompletions(partial, partial.length).some(item => item.label === 'hotspot'))

  // 标签名处的悬停 / 未知元素 / 未知属性 / 无标签位置
  assert.equal(getHover('hello', 1), null)
  assert.equal(getHover('<krpano>', 2).contents.includes('krpano'), true)
  assert.ok(getHover('<krpano>\n  <custom_thing/>', 16).contents.includes('krpano element'))
  const unknownAttr = getHover('<krpano>\n  <hotspot name="h" zzz="1"/>', 31)
  assert.ok(unknownAttr.contents.includes('zzz'), `属性名应出现在悬停里:${unknownAttr.contents}`)

  // 跳转:光标不在名字上 / 没有上下文
  assert.equal(getDefinition('<krpano>\n  <hotspot name="h"/>\n</krpano>', 0), null)
  assert.equal(getDefinition('<krpano>\n  <action name="a">foo(1);</action>\n</krpano>', 30, {}), null)

  // 签名帮助:不在括号内 / 参数个数超出
  assert.equal(getSignatureHelp('<krpano>\n  <action name="a">tween', 29), undefined)
  const beyond = getSignatureHelp('<krpano>\n  <action name="a">tween(var, , ', 37)
  assert.equal(beyond.name, 'tween')
  assert.ok(Array.isArray(beyond.params))

  // 诊断:没有 context/空文本/非法输入不抛异常
  assert.deepEqual(getDiagnostics(''), [])
  assert.ok(Array.isArray(getDiagnostics('<krpano a=1></krpano>')))
})

test('分支:快速修复的其余路径', () => {
  // 未知属性建议最接近的写法(athh → ath;注意 atv 是合法属性,不会触发)
  const attribute = '<krpano>\n  <hotspot name="h" athh="0"/>\n</krpano>'
  const attributeActions = getCodeActions(attribute, range(1, 22)).map(a => a.title) // 光标落在 athh 上
  assert.ok(attributeActions.some(title => title.includes('Change attribute')), attributeActions.join(' | '))

  // 提取为 style:属性不足 / 保留属性不足时不提供
  const fewAttributes = '<krpano>\n  <hotspot name="h" ath="0"/>\n</krpano>'
  assert.deepEqual(getCodeActions(fewAttributes, range(1, 12)).filter(a => a.title.includes('Extract attributes')), [])

  const extractable = '<krpano>\n  <layer name="l" x="0" y="0" url="a.png" scale="2"/>\n</krpano>'
  const extract = getCodeActions(extractable, range(1, 20)).map(a => a.title)
  assert.ok(extract.some(title => title.includes('Extract attributes to style')), extract.join(' | '))

  // 选区提取为 action(多行选区)
  const multiLine = '<krpano>\n  <action name="a">\n    trace(1);\n    trace(2);\n  </action>\n</krpano>'
  const selection = { start: { line: 2, character: 4 }, end: { line: 3, character: 13 } }
  const extractAction = getCodeActions(multiLine, selection).map(a => a.title)
  assert.ok(extractAction.some(title => title.includes('Extract selection to action')), extractAction.join(' | '))

  // include 缺失 → 新建文件(仅限本地路径与已声明未解析的目标)
  const include = '<krpano>\n  <include url="extra/actions.xml"/>\n</krpano>'
  const context = { unresolvedIncludes: [{ url: 'extra/actions.xml', range: { start: { line: 1, character: 17 }, end: { line: 1, character: 33 } } }] }
  const createFile = getCodeActions(include, range(1, 20), context).map(a => a.title)
  assert.ok(createFile.some(title => title.includes('Create file')), createFile.join(' | '))
  const remote = getCodeActions('<krpano>\n  <include url="https://x/a.xml"/>\n</krpano>', range(1, 20), {
    unresolvedIncludes: [{ url: 'https://x/a.xml', range: { start: { line: 1, character: 17 }, end: { line: 1, character: 33 } } }],
  })
  assert.deepEqual(remote.filter(a => a.title.includes('Create file')), [], '远程 url 不提供新建')

  // 重名定义 → 改名(含 scene 内引用)
  const duplicate = '<krpano>\n  <scene name="s">\n    <hotspot name="h"/>\n    <hotspot name="h"/>\n    <hotspot name="h3" onclick="h();"/>\n  </scene>\n</krpano>'
  const renameActions = getCodeActions(duplicate, range(3, 20)).map(a => a.title)
  assert.ok(renameActions.some(title => title.includes('Rename this duplicate')), renameActions.join(' | '))
})

// ---------- 第二批:快速修复、引用与格式化辅助的回退路径 ----------

test('分支:快速修复的编辑细节', () => {
  // 未知元素且带闭合标签 → 同时替换开闭标签
  const typo = '<krpano>\n  <hotspott name="h">\n  </hotspott>\n</krpano>'
  const typoActions = getCodeActions(typo, range(1, 5))
  const changeTag = typoActions.find(a => a.title.includes('Change to <hotspot>'))
  assert.ok(changeTag, typoActions.map(a => a.title).join(' | '))
  assert.equal(changeTag.edit.changes[0].edits.length, 2, '开标签与闭标签都要改')
  assert.deepEqual(changeTag.edit.changes[0].edits[1].range.start, { line: 2, character: 4 })

  // 差太远的垃圾标签:不给建议
  const junk = '<krpano>\n  <zzzzzzzzzz/>\n</krpano>'
  assert.deepEqual(getCodeActions(junk, range(1, 5)).filter(a => a.title.includes('Change to')), [])

  // 单引号 lang='TypeScript' → 改成单引号 type='Javascript'
  const singleQuoted = '<krpano>\n  <action name="a" lang=\'TypeScript\'>trace(1);</action>\n</krpano>'
  const singleAction = getCodeActions(singleQuoted, range(1, 20)).find(a => a.title.includes('Javascript'))
  assert.ok(singleAction, '单引号 lang 也要提供改写')
  assert.ok(singleAction.edit.changes[0].edits[0].newText.includes(`type='Javascript'`), singleAction.edit.changes[0].edits[0].newText)

  // 其他取值的 lang(如 lang="coffee")→ 删除该属性
  const coffee = '<krpano>\n  <action name="a" lang="coffee">trace(1);</action>\n</krpano>'
  const removeAction = getCodeActions(coffee, range(1, 20)).find(a => a.title.includes('Remove the unsupported lang'))
  assert.ok(removeAction, '不支持的 lang 取值应提供删除')
  assert.equal(removeAction.edit.changes[0].edits[0].newText, '')

  // 重名且 h_2 已存在 → 顺延到 h_3
  const taken = '<krpano>\n  <hotspot name="h"/>\n  <hotspot name="h_2"/>\n  <hotspot name="h"/>\n</krpano>'
  const renameTitles = getCodeActions(taken, range(3, 18)).map(a => a.title)
  assert.ok(renameTitles.some(title => title.includes('"h_3"')), renameTitles.join(' | '))

  // 光标远离重复定义与未定义调用 → 不给对应修复
  const far = '<krpano>\n  <hotspot name="h"/>\n  <hotspot name="h"/>\n  <action name="a">missing();</action>\n</krpano>'
  const farTitles = getCodeActions(far, range(1, 3)).map(a => a.title)
  assert.ok(!farTitles.some(title => title.includes('Rename this duplicate')), farTitles.join(' | '))
  assert.ok(!farTitles.some(title => title.includes('Create action')), farTitles.join(' | '))

  // 只有一个未知属性(且光标不在其上)也会给建议
  const lone = '<krpano>\n  <hotspot name="h" athh="0"/>\n</krpano>'
  const loneTitles = getCodeActions(lone, range(1, 3)).map(a => a.title)
  assert.ok(loneTitles.some(title => title.includes('Change attribute to "ath"')), loneTitles.join(' | '))

  // 无值属性(bgborder 这类开关属性)不参与提取,避免变成 bgborder=""
  const valueless = '<krpano>\n  <layer name="l" x="0" url="a.png" bgborder visible="true"/>\n</krpano>'
  const strip = getCodeActions(valueless, range(1, 20)).find(a => a.title.includes('Extract attributes'))
  assert.ok(strip, '有多个可取属性时仍应提供提取')
  const styleLine = strip.edit.changes[0].edits[0].newText
  assert.ok(styleLine.includes('url="a.png"') && styleLine.includes('visible="true"'), styleLine)
  assert.ok(!styleLine.includes('bgborder'), `无值属性不应被提取:${styleLine}`)
  const kept = strip.edit.changes[0].edits[1].newText
  assert.ok(kept.includes('bgborder') && !kept.includes('bgborder=""'), `开关属性应原样保留:${kept}`)

  // include url 前后的空白会被去掉
  const padded = '<krpano>\n  <include url="  extra/x.xml  "/>\n</krpano>'
  const paddedTitles = getCodeActions(padded, range(1, 20), {
    unresolvedIncludes: [{ url: '  extra/x.xml  ', range: { start: { line: 1, character: 17 }, end: { line: 1, character: 30 } } }],
  }).map(a => a.title)
  assert.ok(paddedTitles.some(title => title.includes('Create file "extra/x.xml"')), paddedTitles.join(' | '))

  // 文档没有 krpano 根节点:骨架追加到文末
  const fragment = '<scene name="s">\n  <action name="a">missing_thing();</action>\n</scene>\n'
  const fragmentActions = getCodeActions(fragment, range(1, 30)).map(a => a.title)
  assert.ok(fragmentActions.some(title => title.includes('Create action "missing_thing"')), fragmentActions.join(' | '))
})

test('分支:未定义引用扫描(属性调用、占位符、JS 动作跳过)', () => {
  const { findUndefinedReferences } = require('./build/lsp/features.js')
  const text = '<krpano>\n  <events onload="preload_scene();"/>\n  <action name="known">trace(%1);</action>\n</krpano>'
  const references = findUndefinedReferences(text, {})
  assert.deepEqual(references.map(r => r.name), ['preload_scene'], JSON.stringify(references))

  // args 声明覆盖占位符 → 不再提示;超过声明个数 → 提示(占位符由诊断负责)
  const withArgs = '<krpano>\n  <action name="a" args="x">trace(%1);</action>\n</krpano>'
  assert.deepEqual(getDiagnostics(withArgs).filter(d => d.message.includes('%')), [])
  const beyond = '<krpano>\n  <action name="a" args="x">trace(%2);</action>\n</krpano>'
  assert.ok(getDiagnostics(beyond).some(d => d.message.includes('%2')), getDiagnostics(beyond).map(d => d.message).join(' | '))

  // JS 动作体里的调用不算
  const jsAction = '<krpano>\n  <action name="a" type="js">renderScene();</action>\n</krpano>'
  assert.deepEqual(findUndefinedReferences(jsAction, {}), [])

  // include 链里已有同名定义 → 不算未定义
  const external = { externalDefinitions: new Map([['from_include', { uri: 'file:///a.xml', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } }]]) }
  const used = '<krpano>\n  <action name="a">from_include();</action>\n</krpano>'
  assert.deepEqual(findUndefinedReferences(used, external), [])
})

test('分支:带 include 上下文的补全与悬停', () => {
  const external = {
    externalDefinitions: new Map([
      ['pano_a', { uri: 'file:///a.xml', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, element: 'hotspot' }],
      ['scene_b', { uri: 'file:///b.xml', range: { start: { line: 1, character: 0 }, end: { line: 1, character: 1 } }, element: 'scene' }],
      ['entypeless', { uri: 'file:///c.xml', range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } } }],
    ]),
  }
  // 索引补全带上 include 链里的名字
  const indexText = '<krpano>\n  <action name="a">hotspot[pa'
  const indexItems = getCompletions(indexText, indexText.length, external).map(i => i.label)
  assert.ok(indexItems.includes('pano_a'), indexItems.join(','))
  // 名称参数补全
  const callText = '<krpano>\n  <action name="a">loadscene(sc'
  assert.ok(getCompletions(callText, callText.length, external).some(i => i.label === 'scene_b'))
  // view. 属性补全(元素前缀上下文)
  const viewText = '<krpano>\n  <action name="a">tween(view.fo'
  assert.ok(getCompletions(viewText, viewText.length, external).some(i => i.label === 'fov'))
  // 未知元素前缀:没有属性可补
  const unknownPrefix = '<krpano>\n  <action name="a">unknown_el.'
  assert.deepEqual(getCompletions(unknownPrefix, unknownPrefix.length, external), [])
  // 悬停位置在标签名之前(行首)
  const text = '  <hotspot name="h"/>'
  assert.equal(getHover(text, 0), null, '标签之前的空白不属于任何标签')
  assert.ok(getHover(text, 3).contents.includes('hotspot'))
  // 签名帮助:未命名参数的位置
  const help = getSignatureHelp('<krpano>\n  <action name="a">tween(', 34) // 光标在 ( 之后
  assert.equal(help.params[0].name, 'objectpath')
  assert.equal(help.activeParameter, 0)
})

test('分支:引用收集的其余回退', () => {
  // 属性值里的调用与动态索引
  const text = '<krpano>\n  <hotspot name="h" onclick="do_thing(); layer[get(i)].visible = false;"/>\n</krpano>'
  const references = collectReferences(text)
  assert.deepEqual(references.filter(r => r.form === 'call').map(r => r.name), ['do_thing', 'get'], 'get(...) 也是调用')
  assert.deepEqual(references.filter(r => r.form === 'index'), [])

  // 名字参数:%1 这类占位符不算引用;带点的名字算(callwith 取第二个参数)
  const weird = '<krpano>\n  <action name="a">loadscene(%1); callwith(a, b.c);</action>\n</krpano>'
  assert.deepEqual(collectReferences(weird).filter(r => r.form === 'argument').map(r => r.name), ['b.c'])

  // 光标停在非名字字符上 → undefined
  assert.equal(nameAtOffset('<krpano>\n  <hotspot name="h"/>\n</krpano>', 9), undefined)
  // 是合法名字但没有任何引用 → undefined
  const pureValue = '<krpano>\n  <hotspot name="h" ath="90"/>\n</krpano>'
  assert.equal(nameAtOffset(pureValue, pureValue.indexOf('90') + 1), undefined)
  // 方括号索引跨行:前缀越过行首 → 不认为处于索引上下文
  const crossLine = 'layer[ab\nx'
  assert.equal(indexContextAt(crossLine, crossLine.length), undefined)
  assert.equal(nameAtOffset('<krpano>\n  <hotspot name="h"/>\n</krpano>', 17), undefined, '停在引号上')

  // 索引上下文:括号没有闭合到行尾 → 仍然给出上下文
  const open = '<krpano>\n  <action name="a">layer[hs'
  const context = indexContextAt(open, open.length)
  assert.equal(context.element, 'layer')
  assert.equal(context.prefix, 'hs')
  // 名字参数上下文:普通调用不算
  assert.equal(callArgumentContextAt('<krpano>\n  <action name="a">trace(1', 31), undefined)

  // 重命名相关:nameAtOffset 命中引用
  const refText = '<krpano>\n  <hotspot name="hh"/>\n  <action name="a">layer[hh].visible = false;</action>\n</krpano>'
  const atRef = nameAtOffset(refText, refText.indexOf('hh].visible') + 1)
  assert.equal(atRef.kind, 'reference')
  assert.equal(atRef.name, 'hh')
})

test('分支:格式化辅助的其余回退', () => {
  const beautifyModule = require('./build/beautifyHtml.js')
  const getOptionsModule = require('./build/getOptions.js')
  const getOptions = getOptionsModule.default ?? getOptionsModule

  // 配置为空 → 默认 4 空格缩进;insertSpaces=false → tab
  assert.equal(getOptions(undefined).indentation, '    ')
  assert.equal(getOptions({ editor: { tabSize: 3, insertSpaces: false } }).indentation, '\t')
  assert.equal(getOptions({ xml: { format: { indentation: '' } }, editor: { tabSize: 2, insertSpaces: true } }).indentation, '  ')
  assert.equal(getOptions({ xml: { format: { indentation: '\t\t' } } }).indentation, '\t\t')

  // 多根节点 + XML 声明:声明留在最前,内容包进 krpano
  const prolog = '<?xml version="1.0" encoding="utf-8"?>\n<a x="1"/>\n<b y="2"/>'
  const wrapped = beautifyModule.beautify(prolog, { handleRootNode: true, indentation: '  ' })
  assert.equal(wrapped.failed, false, JSON.stringify(wrapped))
  assert.ok(wrapped.text.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<krpano>'), wrapped.text)

  // format off 区域保持原样
  const offRegion = '<krpano>\n  <!-- krpano-lang-format: off -->\n<view   fov="90"/>\n  <!-- krpano-lang-format: on -->\n</krpano>'
  const offResult = beautifyModule.beautify(offRegion, { indentation: '  ' })
  assert.ok(offResult.text.includes('<view   fov="90"/>'), offResult.text)

  // 标签错配:xml-formatter 会修复结构,标记 structureChanged 让调用方决定是否应用
  const broken = beautifyModule.beautify('<krpano><a></b></krpano>', { handleRootNode: false, indentation: '  ' })
  assert.equal(broken.failed, false)
  assert.equal(broken.structureChanged, true)
  // 完全无法解析的文本 → failed 且原文返回
  const garbage = beautifyModule.beautify('这不是 xml', { handleRootNode: false, indentation: '  ' })
  assert.equal(garbage.failed, true)
  assert.equal(garbage.text, '这不是 xml')

  // 属性排版选项与语句拆分组合
  const combo = beautifyModule.beautify('<krpano><hotspot name="a" ath="0"/></krpano>', { indentation: '  ', handleRootNode: true, attributeLayout: 'one-per-line' })
  assert.ok(combo.text.includes('name="a"\n    ath="0"'), combo.text)

  // 空文档直接返回
  const empty = beautifyModule.beautify('   ', { indentation: '  ' })
  assert.equal(empty.failed, false)
  assert.equal(empty.text, '   ')
})

// ---------- 第三批:选项与边界(补齐 layout/statements/beautify 的剩余分支)----------

test('分支:属性排版与语句拆分的文件首行情形', () => {
  // 标签紧贴文件开头(前面没有换行):行缩进按空串处理
  const firstLine = applyAttributeLayout('<hotspot name="a" ath="0"/>', 'one-per-line', '  ')
  assert.equal(firstLine, '<hotspot name="a"\n  ath="0"\n/>', firstLine)

  // 无值属性保留原样参与重排
  const valueless = applyAttributeLayout('<krpano>\n  <hotspot name="a" bgborder/>\n</krpano>', 'one-per-line', '  ')
  assert.ok(valueless.includes('name="a"\n    bgborder\n  />'), valueless)

  // 注释里的标签不重排
  const commented = '<krpano>\n  <!-- <hotspot a="1" b="2"/> -->\n</krpano>'
  assert.equal(applyAttributeLayout(commented, 'one-per-line', '  '), commented)

  // action 标签紧贴文件开头:续行缩进 = 一级
  const inline = splitActionStatements('<action name="a">set(x, 1); set(y, 2);</action>', '  ')
  assert.equal(inline.text, '<action name="a">set(x, 1);\n  set(y, 2);</action>', inline.text)

  // 单条语句 + 行尾空白:没有第二句可拆
  assert.equal(splitActionStatements('<krpano>\n  <action name="a">trace(1);\n  </action>\n</krpano>').changed, false)
})

test('分支:格式化选项组合(lineSeparator / 自闭合 / 属性排版关闭)', () => {
  const { beautify } = require('./build/beautifyHtml.js')
  const input = '<krpano><view/><hotspot name="a" ath="0"/></krpano>'

  const crlf = beautify(input, { indentation: '  ', lineSeparator: '\r\n' })
  assert.ok(crlf.text.includes('\r\n'), JSON.stringify(crlf.text.slice(0, 60)))

  const selfClosing = beautify('<krpano><scene name="s"></scene></krpano>', { indentation: '  ', forceSelfClosingEmptyTag: true, whiteSpaceAtEndOfSelfclosingTag: true })
  assert.ok(selfClosing.text.includes('<scene name="s" />'), selfClosing.text)

  // attributeLayout: preserve 时不做后处理
  const preserved = beautify(input, { indentation: '  ', attributeLayout: 'preserve' })
  assert.ok(preserved.text.includes('<hotspot name="a" ath="0"/>'), preserved.text)

  // 多根节点且配置允许补根:prolog 之外的内容包进 krpano
  const noProlog = beautify('<a x="1"/>\n<b y="2"/>', { handleRootNode: true, indentation: '  ' })
  assert.equal(noProlog.failed, false)
  assert.ok(noProlog.text.startsWith('<krpano>'), noProlog.text)

  // 补根但内容依旧无法解析 → 维持失败
  const unparsable = beautify('<a x="1"/>\n<b y="2"/', { handleRootNode: true, indentation: '  ' })
  assert.equal(unparsable.failed, true)
})

test('分支:属性值里的索引与调用', () => {
  // 事件属性里的索引:动态索引忽略、静态索引收集
  const text = '<krpano>\n  <hotspot name="h" onclick="layer[info].visible=false; layer[get(i)].alpha=1;"/>\n</krpano>'
  const indexes = collectReferences(text).filter(r => r.form === 'index')
  assert.deepEqual(indexes.map(r => r.name), ['info'])
  // 事件属性里的调用
  assert.deepEqual(collectReferences(text).filter(r => r.form === 'call').map(r => r.name), ['get'])
})

test('分支:元素前缀/占位符上下文与未声明参数的占位符', () => {
  const { elementPrefixContextAt, percentContextAt, enclosingActionArgs } = require('./build/lsp/features.js')

  // 已知元素前缀 / 未知元素 / 没有点号
  const viewText = '<hotspot name="h" onclick="tween(view.fo'
  assert.deepEqual(elementPrefixContextAt(viewText, viewText.length), { element: 'view', prefix: 'fo' })
  const unknownPrefix = '<hotspot name="h" onclick="tween(zzz.fo'
  assert.equal(elementPrefixContextAt(unknownPrefix, unknownPrefix.length), undefined, '未知元素前缀不给上下文')
  assert.equal(elementPrefixContextAt('<hotspot name="h"', 12), undefined)
  // 带索引的元素前缀
  const layerText = '<hotspot name="h" onclick="layer[info].vi'
  assert.deepEqual(elementPrefixContextAt(layerText, layerText.length), { element: 'layer', prefix: 'vi' })

  // 占位符上下文
  const percentText = '<action name="a" args="x">trace(%'
  assert.deepEqual(percentContextAt(percentText, percentText.length), { prefix: '' })
  const percentTwo = '<action name="a" args="x">trace(%2'
  assert.deepEqual(percentContextAt(percentTwo, percentTwo.length), { prefix: '2' })
  assert.equal(percentContextAt('<action name="a">trace(x', 25), undefined)

  // 超出声明个数的占位符:不给候选(诊断会提示)
  const beyond = '<krpano>\n  <action name="a" args="x">trace(%2'
  assert.deepEqual(getCompletions(beyond, beyond.length), [])
  const declared = '<krpano>\n  <action name="a" args="x">trace(%'
  const items = getCompletions(declared, declared.length)
  assert.deepEqual(items.map(i => i.label), ['%1'])
  assert.ok(items[0].detail.includes('argument 1: x'), items[0].detail)

  // 单引号 args 声明同样生效
  const single = '<krpano>\n  <action name="a" args=\'x\'>trace(%2);</action>\n</krpano>'
  assert.ok(getDiagnostics(single).some(d => d.message.includes('%2')), getDiagnostics(single).map(d => d.message).join(' | '))
  assert.deepEqual(enclosingActionArgs('<krpano>\n  <action name="a" args="first, second">trace(%1', 50)[0] && enclosingActionArgs('x', 0), [])

  // 单引号 type='js' 的动作体不参与"未定义动作"扫描
  const jsAction = '<krpano>\n  <action name="a" type=\'js\'>renderScene();</action>\n</krpano>'
  assert.deepEqual(getDiagnostics(jsAction).filter(d => d.message.includes('renderScene')), [])

  // 未知元素上的属性悬停:标注"not documented for this element"
  const custom = '<krpano>\n  <custom_thing foo="1"/>'
  const hover = getHover(custom, custom.indexOf('foo') + 1)
  assert.ok(hover.contents.includes('not documented for this element'), hover.contents)
})

test('分支:缩进选项为空时的兜底与显式布尔选项', () => {
  const { beautify } = require('./build/beautifyHtml.js')
  const input = '<krpano><action name="a">set(x, 1); set(y, 2);</action></krpano>'

  // indentation 传空串 → 后处理统一回退到两个空格
  const fallback = beautify(input, {
    indentation: '',
    attributeLayout: 'one-per-line',
    scriptStatements: true,
    actionIndentation: true,
    collapseContent: true,
    handleRootNode: false,
  })
  assert.equal(fallback.failed, false)
  assert.ok(/set\(x, 1\);/.test(fallback.text), fallback.text)
  assert.ok(fallback.text.includes('\n'), fallback.text)

  // 显式 false 的开关不应被默认值覆盖
  const explicit = beautify('<krpano><scene name="s"></scene></krpano>', {
    indentation: '  ',
    collapseContent: false,
    forceSelfClosingEmptyTag: false,
    whiteSpaceAtEndOfSelfclosingTag: false,
    handleRootNode: true,
  })
  assert.equal(explicit.failed, false)
  assert.ok(explicit.text.includes('<scene name="s"></scene>'), explicit.text)

  // handleRootNode 打开但内容完全不可解析:按失败处理
  const broken = beautify('plain text', { handleRootNode: true, indentation: '  ' })
  assert.equal(broken.failed, true)
})

test('分支:零散兜底(非字符串缩进、等号两侧空白、空选区)', () => {
  const getOptionsModule = require('./build/getOptions.js')
  const getOptions = getOptionsModule.default ?? getOptionsModule
  // indentation 不是字符串 → 视为未设置,回退到 editor 配置
  assert.equal(getOptions({ xml: { format: { indentation: 2 } }, editor: { tabSize: 2, insertSpaces: true } }).indentation, '  ')

  // 属性等号两侧带空白同样解析
  const spaced = scanXml('<krpano a = "1"/>')
  assert.equal(spaced.tags[0].attributes[0].value, '1')

  // 空选区(起点在文首)不越界
  assert.deepEqual(selectionLineBounds('abc', 0, 0), { start: 0, end: 3 })
})

test('分支:跨文件上下文抑制索引与动作提示', () => {
  const external = {
    externalDefinitions: new Map([
      ['ghost', { uri: 'file:///a.xml', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, element: 'hotspot' }],
    ]),
  }
  const indexed = '<krpano>\n  <action name="a">hotspot[ghost].visible = false; ghost();</action>\n</krpano>'
  assert.deepEqual(
    getDiagnostics(indexed, external).map(d => d.message),
    [],
    'include 链里已定义的名字不应再提示(索引与动作调用)',
  )
  assert.ok(getDiagnostics(indexed).some(d => d.message.includes('ghost')), '没有上下文时应提示')

  // CDATA 包裹的动作体属于跳过区域:里面的调用与索引不参与引用收集
  const cdata = '<krpano>\n  <action name="a"><![CDATA[foo(); layer[bar].visible = false;]]></action>\n</krpano>'
  assert.deepEqual(collectReferences(cdata).filter(r => r.form === 'call' || r.form === 'index'), [])

  // 参数不全的名字参数调用不产生引用
  const shortArgs = '<krpano>\n  <action name="a">callwith(a); loadscene();</action>\n</krpano>'
  assert.deepEqual(collectReferences(shortArgs).filter(r => r.form === 'argument'), [])
})

test('分支:签名帮助的未收录动作与嵌套括号', () => {
  // 没有签名数据的动作:返回 undefined 而不是抛异常
  const unknownSig = '<krpano>\n  <action name="a">addevent('
  assert.equal(getSignatureHelp(unknownSig, unknownSig.length), undefined)

  // 嵌套括号:参数里的 calc((...)) 不改变"当前是第几个参数"的判断
  const nested = '<krpano>\n  <action name="a">screentosphere(calc((1+2)), '
  const help = getSignatureHelp(nested, nested.length)
  assert.equal(help.name, 'screentosphere')
  assert.equal(help.activeParameter, 1, '第二个参数位置')
  assert.deepEqual(help.params.map(p => p.name), ['x', 'y'])

  // 调用已闭合:不再给签名
  const closed = '<krpano>\n  <action name="a">tween(x)'
  assert.equal(getSignatureHelp(closed, closed.length), undefined)
})

test('分支:format off 没有配对的 on 时不保护后续内容', () => {
  const { beautify } = require('./build/beautifyHtml.js')
  const unpaired = '<krpano>\n  <!-- krpano-lang-format: off -->\n<view   fov="90"/>\n</krpano>'
  const result = beautify(unpaired, { indentation: '  ' })
  assert.equal(result.failed, false)
  assert.ok(result.text.includes('<view fov="90"/>'), `缺少 on 时内容照常格式化:${result.text}`)
})

test('分支:取值补全没有候选时返回空', () => {
  // style= 前缀匹配不到任何已定义名字
  const styleText = '<krpano>\n  <hotspot name="h" style="zz'
  assert.deepEqual(getCompletions(styleText, styleText.length), [])
  // 事件属性里的动作名:没有定义时也不报错
  const eventText = '<krpano>\n  <hotspot name="h" onclick="zz'
  assert.deepEqual(getCompletions(eventText, eventText.length), [])
})
