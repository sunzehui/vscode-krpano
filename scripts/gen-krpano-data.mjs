// 从 krpano 官方 XML Reference 抽取"元素 → 属性名"清单(只取事实性名称,不含文档正文)。
// 页面获取:curl -sSL "https://krpano.com/docu/xml/" -o /tmp/krpano_xml_ref.html
// 用法:node scripts/gen-krpano-data.mjs [页面缓存路径] [输出路径]
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'

const src = process.argv[2] ?? '/tmp/krpano_xml_ref.html'
const out = process.argv[3] ?? 'src/lsp/krpanoData.json'
const html = readFileSync(src, 'utf8')

// krpano 的真实 XML 元素白名单(文档里 network/memory/security/debug/set/if 等是变量命名空间或特殊属性,排除)
const ELEMENTS = [
  'krpano',
  'include',
  'preview',
  'image',
  'cube',
  'cubestrip',
  'level',
  'sphere',
  'cylinder',
  'flat',
  'fisheye',
  'depthmap',
  'view',
  'area',
  'display',
  'control',
  'cursors',
  'autorotate',
  'contextmenu',
  'textstyle',
  'cssstyles',
  'events',
  'action',
  'data',
  'hotspot',
  'layer',
  'plugin',
  'style',
  'scene',
  'model',
  'splats',
  // 历史写法:文档没有独立章节,但 krpano 里可用(样式模板类,允许自定义属性)
  'object',
  'prototype',
]

// 文档对这两个元素的属性写法特殊(style 允许任意属性,include 只列了 url),手工补齐
const EXTRA = {
  include: ['url'],
  style: ['name'],
}

// 文档把少数 krpano API 方法混排在属性表里(它们只能以函数形式调用,不是 XML 属性)
const API_METHODS = new Set(['addevent', 'removeevent', 'getchildzorder', 'getfullpath', 'getxml', 'getcenter', 'getnormalvec', 'loadstyle', 'registercontentsize', 'resetsize', 'remove'])

const attrs = new Map(ELEMENTS.map(el => [el, new Set(Object.entries(EXTRA).find(([k]) => k === el)?.[1] ?? [])]))
function add(path, attr) {
  const tag = path.split('.').pop()
  if (API_METHODS.has(attr))
    return
  if (attrs.has(tag) && /^[a-z][a-z0-9_]*$/.test(attr))
    attrs.get(tag).add(attr)
}

/** 从一份 XML Reference 页面里收集 (元素, 属性) 对 */
function collectAttributePairs(page) {
  const pairs = new Set()
  for (const m of page.matchAll(/<a href="#([A-Za-z][\w.-]*)\.([a-z][\w-]*)"[^>]*>[A-Za-z_][\w-]*<\/a>=/g))
    pairs.add(`${m[1].split('.').pop()}.${m[2]}`)
  for (const row of page.matchAll(/<tr class="xmlattrdocdesc">([\s\S]{0,2000}?)<\/tr>/g)) {
    const label = row[1].replace(/<[^>]*>/g, ' ')
    if (/Function\s*name/i.test(label))
      continue
    for (const anchor of row[1].matchAll(/<a name="([A-Za-z][\w.-]*)"><\/a>/g)) {
      const parts = anchor[1].split('.')
      if (parts.length < 2)
        continue
      pairs.add(`${parts[parts.length - 2]}.${parts[parts.length - 1]}`)
    }
  }
  return pairs
}

// 来源 1:元素文档里的 presyntax 属性清单(<a href="#ELEM.ATTR">attr</a>="...">)
for (const m of html.matchAll(/<a href="#([A-Za-z][\w.-]*)\.([a-z][\w-]*)"[^>]*>[A-Za-z_][\w-]*<\/a>=/g))
  add(m[1], m[2])

// 来源 2:属性表行内的所有锚点(同一行可能列出多个元素共用的属性,如 layer/hotspot/plugin.name)。
// 行标题(如 "Layer / Hotspot Attribute")表明该行同样适用于未单独列锚点的元素。
for (const row of html.matchAll(/<tr class="xmlattrdocdesc">([\s\S]{0,2000}?)<\/tr>/g)) {
  const anchors = [...row[1].matchAll(/<a name="([A-Za-z][\w.-]*)"><\/a>/g)].map(a => a[1])
  const label = row[1].replace(/<[^>]*>/g, ' ')
  // "Function name" 行记录的是 krpano API 函数(如 layer.getfullpath()),不是 XML 属性
  if (/Function\s*name/i.test(label))
    continue
  const shared = []
  if (/Hotspot/i.test(label))
    shared.push('hotspot')
  if (/Layer/i.test(label))
    shared.push('layer')
  if (/Plugin/i.test(label))
    shared.push('plugin')
  for (const anchor of anchors) {
    const parts = anchor.split('.')
    if (parts.length < 2)
      continue
    const attr = parts[parts.length - 1]
    add(parts.slice(0, -1).join('.'), attr)
    for (const el of shared)
      add(el, attr)
  }
}

// 官方 XML Reference 未收录、但在 krpano 皮肤与官方示例里通用的属性(不列入会误报"未知属性")
const EXTRA_ATTRIBUTES = {
  krpano: ['title'],
  scene: ['title', 'thumburl'],
  layer: ['title'],
  hotspot: ['linkedscene', 'onlastframe'],
}

const data = {}
for (const el of ELEMENTS) {
  const extra = EXTRA_ATTRIBUTES[el] ?? []
  data[el] = [...new Set([...attrs.get(el), ...extra])].sort()
}

// 从仓库内的 TextMate 语法提取内建 action 与关键字,供"未定义动作"诊断排除误报
const grammar = JSON.parse(readFileSync('syntaxes/krpano.tmLanguage.json', 'utf8'))
function wordsOf(ruleName) {
  const rule = grammar.patterns.find(p => p.name === ruleName)
  if (!rule)
    return []
  const alternation = rule.match.match(/\\b\(([^)]*)\)\\b/)
  if (!alternation)
    return []
  return alternation[1].split('|').map(w => w.trim()).filter(w => /^[A-Z_]\w*$/i.test(w))
}
// 语法文件里未收录、但确实是 krpano 动作的名字(避免"未定义动作"误报)
const EXTRA_ACTIONS = ['ifnot', 'asynccall', 'asyncfor']

// 官方 Actions 文档里的示例块(<div id="<action>examples" class="xmlexamplecontent">)用于补全语法文件的清单
function actionNamesFromDocs() {
  const actionsPage = process.argv[4] ?? '/tmp/krpano_actions_page.html'
  try {
    const page = readFileSync(actionsPage, 'utf8')
    const names = [...page.matchAll(/<div id="([a-z_][a-z0-9_]*)examples" class="xmlexamplecontent">/g)]
      .map(match => match[1])
      .filter(name => name.length >= 3)
    console.log(`Actions 文档示例块: ${names.length} 个动作`)
    return names
  }
  catch {
    console.log('(未找到 Actions 文档缓存,跳过;可用 curl -sSL "https://krpano.com/docu/actions/" -o /tmp/krpano_actions_page.html 生成)')
    return []
  }
}

const builtinActions = [...new Set([
  ...wordsOf('support.function.krpano-global-function'),
  ...wordsOf('support.class.krpano-global-class'),
  ...EXTRA_ACTIONS,
  ...actionNamesFromDocs(),
])].sort()
const controlKeywords = [...new Set(wordsOf('keyword.control.krpano-statement'))].sort()

// 版本感知:对比官方文档的 4 个版本,记录每个 元素.属性 出现在哪些版本里
const DOC_VERSIONS = [
  ['1.21', '/tmp/krpano_xml_v121.html'],
  ['1.22', '/tmp/krpano_xml_v122.html'],
  ['1.23', '/tmp/krpano_xml_v123.html'],
  ['1.24', '/tmp/krpano_xml_ref.html'],
]
const attributeVersions = {}
let versionInfo = false
for (const [version, file] of DOC_VERSIONS) {
  let page
  try {
    page = readFileSync(file, 'utf8')
  }
  catch {
    console.log(`(缺少 ${version} 的文档缓存,跳过版本差分;可 curl -sSL "https://krpano.com/docu/xml/?version=121" -o /tmp/krpano_xml_v121.html 生成)`)
    versionInfo = false
    break
  }
  versionInfo = true
  for (const key of collectAttributePairs(page)) {
    attributeVersions[key] ??= []
    attributeVersions[key].push(version)
  }
}

// 动作签名:官方 Actions 页面用 <pre><a href="#act" class="selflink">act(必选, <span class="optargs">可选…</span>)</a></pre> 描述参数
const actionSignatures = {}
try {
  const actionsPage = readFileSync(process.argv[4] ?? '/tmp/krpano_actions_page.html', 'utf8')
  for (const match of actionsPage.matchAll(/<pre><a href="#([a-z_][a-z0-9_]*)" class="selflink">([\s\S]*?)<\/a><\/pre>/g)) {
    const action = match[1]
    const text = match[2]
    const open = text.indexOf('(')
    if (open === -1 || !text.trimEnd().endsWith(')'))
      continue
    const inner = text.slice(open + 1, text.lastIndexOf(')'))
    const optionalPart = /<span class="optargs">([\s\S]*?)<\/span>/.exec(inner)
    const requiredText = inner.replace(/<span class="optargs">[\s\S]*?<\/span>/, '')
    const names = (raw, optional) => raw.replace(/<[^>]*>/g, ' ').split(',').map(item => item.trim()).filter(item => /^[A-Z_][\w-]*$/i.test(item)).map(name => (optional ? { name, optional: true } : { name }))
    const params = [...names(requiredText, false), ...(optionalPart ? names(optionalPart[1], true) : [])]
    if (params.length)
      actionSignatures[action] = params
  }
}
catch {
  console.log('(未找到 Actions 文档缓存,跳过动作签名)')
}

writeFileSync(out, `${JSON.stringify({ elements: data, builtinActions, controlKeywords, attributeVersions: versionInfo ? attributeVersions : {}, actionSignatures }, null, 2)}\n`)
console.log(`元素: ${ELEMENTS.length}, 属性合计: ${ELEMENTS.reduce((n, el) => n + data[el].length, 0)}`)
console.log(`内建 action: ${builtinActions.length}, 关键字: ${controlKeywords.join(' ')}`)
console.log(`属性版本记录: ${Object.keys(attributeVersions).length} 条${versionInfo ? '' : '(跳过)'}`)
console.log(`动作签名: ${Object.keys(actionSignatures).length} 个;示例 lookat = ${JSON.stringify(actionSignatures.lookat ?? null)}`)
console.log(`元素: ${ELEMENTS.join(' ')}`)
