// krpano XML 语言特性实现(纯函数,不依赖 vscode / vscode-languageserver,便于单元测试)。
import krpanoData from './krpanoData.json'
import { docForAttribute, docForElement } from './krpanoDocs'
import { attributeAtOffset, offsetToPosition, scanXml, tagAtOffset } from '../shared/xml'
import type { XmlDocumentScan, XmlTag } from '../shared/xml'

export interface PlainRange {
  start: { line: number, character: number }
  end: { line: number, character: number }
}

export interface PlainDiagnostic {
  message: string
  severity: 'error' | 'warning' | 'information'
  range: PlainRange
  source: string
}

export interface PlainCompletion {
  label: string
  kind: 'element' | 'attribute' | 'value'
  detail: string
  documentation: string
  insertText?: string
  snippet?: boolean
}

export interface PlainHover {
  contents: string
  range: PlainRange
}

export interface PlainLocation {
  range: PlainRange
}

interface KrpanoData {
  elements: Record<string, string[]>
  builtinActions: string[]
  controlKeywords: string[]
}

const data = krpanoData as unknown as KrpanoData
const elements: Record<string, string[]> = data.elements
const elementNames = Object.keys(elements).sort()
const builtins = new Set([...data.builtinActions, ...data.controlKeywords, 'parent', 'caller', 'global', 'local', 'Math'])

/** 定义 name 的元素(可被事件/动作引用) */
const NAME_DEFINING = new Set(['action', 'hotspot', 'layer', 'plugin', 'scene', 'style', 'events', 'data'])
/** 允许任意子标签的元素(其子元素名不是 krpano 元素) */
const FREE_FORM = new Set(['textstyle', 'cssstyles', 'style'])
/** 特殊 XML 属性,任何元素都可以使用 */
const SPECIAL_ATTRIBUTES = ['devices', 'if']
const EVENT_ATTRIBUTES = /^on[a-z]+$/

const SOURCE = 'krpano-lang'

function rangeOf(text: string, start: number, end: number): PlainRange {
  return { start: offsetToPosition(text, start), end: offsetToPosition(text, end) }
}

function tagDisplayName(tag: XmlTag): string {
  return `<${tag.name}>`
}

/** 收集 name 定义:名称 → 取值范围 */
function collectDeclarations(scan: XmlDocumentScan): Map<string, { tag: XmlTag, start: number, end: number }> {
  const declarations = new Map<string, { tag: XmlTag, start: number, end: number }>()
  for (const tag of scan.tags) {
    if (!NAME_DEFINING.has(tag.name.toLowerCase()))
      continue
    const nameAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'name')
    if (!nameAttr || nameAttr.value === undefined || nameAttr.valueStart === undefined)
      continue
    if (!nameAttr.value.trim())
      continue
    if (!declarations.has(nameAttr.value))
      declarations.set(nameAttr.value, { tag, start: nameAttr.valueStart, end: nameAttr.valueEnd ?? nameAttr.valueStart })
  }
  return declarations
}

/** 是否为 JavaScript 动作(type="Javascript"/"js") */
function isJavascriptTag(tag: XmlTag): boolean {
  const typeAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'type')
  const value = typeAttr?.value?.toLowerCase()
  return value === 'javascript' || value === 'js'
}

/** 找到包含偏移的 <action> 标签(用于跳过 JS 动作体) */
function enclosingAction(scan: XmlDocumentScan, offset: number): XmlTag | undefined {
  const stack: XmlTag[] = []
  for (const tag of scan.tags) {
    if (tag.start > offset)
      break
    if (tag.kind === 'open')
      stack.push(tag)
    else if (tag.kind === 'close')
      stack.pop()
    else if (tag.start <= offset && offset <= tag.end)
      return tag.name.toLowerCase() === 'action' ? tag : undefined
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].name.toLowerCase() === 'action')
      return stack[i]
  }
  return undefined
}

export function getDiagnostics(text: string): PlainDiagnostic[] {
  const diagnostics: PlainDiagnostic[] = []
  const scan = scanXml(text)

  // 1) 标签配对:闭合标签与栈中更深处的元素同名时,报告中间被"隐式关闭"的元素
  const stack: XmlTag[] = []
  for (const tag of scan.tags) {
    if (tag.kind === 'open') {
      stack.push(tag)
      continue
    }
    if (tag.kind === 'self')
      continue
    const lower = tag.name.toLowerCase()
    const top = stack[stack.length - 1]
    if (top && top.name.toLowerCase() === lower) {
      stack.pop()
      continue
    }
    let matchedIndex = -1
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].name.toLowerCase() === lower) {
        matchedIndex = i
        break
      }
    }
    if (matchedIndex === -1) {
      diagnostics.push({
        message: `Closing tag </${tag.name}> has no matching opening tag.`,
        severity: 'warning',
        range: rangeOf(text, tag.nameStart, tag.nameEnd),
        source: SOURCE,
      })
      continue
    }
    for (let i = stack.length - 1; i > matchedIndex; i--) {
      diagnostics.push({
        message: `Unclosed tag <${stack[i].name}> (implicitly closed by </${tag.name}>).`,
        severity: 'warning',
        range: rangeOf(text, stack[i].nameStart, stack[i].nameEnd),
        source: SOURCE,
      })
    }
    stack.length = matchedIndex
  }
  for (const open of stack) {
    diagnostics.push({
      message: `Unclosed tag <${open.name}>.`,
      severity: 'warning',
      range: rangeOf(text, open.nameStart, open.nameEnd),
      source: SOURCE,
    })
  }

  // 2) 未知元素(忽略自由格式元素内部的子标签)
  const ancestors: string[] = []
  for (const tag of scan.tags) {
    const name = tag.name.toLowerCase()
    if (tag.kind === 'close') {
      const index = ancestors.lastIndexOf(name)
      if (index !== -1)
        ancestors.splice(index, 1)
      continue
    }
    const insideFreeForm = ancestors.some(a => FREE_FORM.has(a))
    if (tag.kind === 'open')
      ancestors.push(name)
    if (!(name in elements) && !insideFreeForm) {
      diagnostics.push({
        message: `Unknown krpano element <${tag.name}>.`,
        severity: 'information',
        range: rangeOf(text, tag.nameStart, tag.nameEnd),
        source: SOURCE,
      })
    }
    // 3) action type 取值
    if (name === 'action') {
      const typeAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'type')
      const value = typeAttr?.value
      if (typeAttr && value !== undefined && typeAttr.valueStart !== undefined && typeAttr.valueEnd !== undefined) {
        const lower = value.toLowerCase()
        if (lower !== '' && lower !== 'javascript' && lower !== 'js') {
          diagnostics.push({
            message: `Unknown action type "${value}": krpano supports "" (krpano action code), "Javascript" or "js".`,
            severity: 'warning',
            range: rangeOf(text, typeAttr.valueStart, typeAttr.valueEnd),
            source: SOURCE,
          })
        }
      }
    }
  }

  // 4) 未定义的动作引用(本文件范围;可能是 include 进来的,故用 information)
  const declarations = collectDeclarations(scan)
  const reportReference = (name: string, start: number, end: number) => {
    if (declarations.has(name) || builtins.has(name) || name in elements)
      return
    diagnostics.push({
      message: `Action "${name}" is not defined in this file (it may be defined in an included file).`,
      severity: 'information',
      range: rangeOf(text, start, end),
      source: SOURCE,
    })
  }

  // 属性值中的 ident(...) 调用
  for (const tag of scan.tags) {
    if (tag.name.toLowerCase() === 'action' && isJavascriptTag(tag))
      continue
    for (const attr of tag.attributes) {
      if (attr.value === undefined || attr.valueStart === undefined)
        continue
      const value = attr.value
      for (const m of value.matchAll(/(?:^|[^\w.$])([A-Za-z_][\w]*)\(/g)) {
        const name = m[1]
        const offset = attr.valueStart + (m.index ?? 0) + m[0].length - name.length - 1
        reportReference(name, offset, offset + name.length)
      }
    }
  }

  // <action> 体内的调用(krpano 脚本动作;跳过 JS 动作)
  const actionBodyRe = /<action\b([^>]*)>([\s\S]*?)<\/action>/g
  for (const m of text.matchAll(actionBodyRe)) {
    const attrText = m[1]
    const typeMatch = /\btype\s*=\s*("([^"]*)"|'([^']*)')/.exec(attrText)
    const type = (typeMatch?.[2] ?? typeMatch?.[3] ?? '').toLowerCase()
    if (type === 'javascript' || type === 'js')
      continue
    const bodyStart = m.index! + m[0].indexOf(m[2])
    const body = m[2]
    for (const call of body.matchAll(/(?:^|[^\w.$])([A-Za-z_][\w]*)\(/g)) {
      const name = call[1]
      const offset = bodyStart + (call.index ?? 0) + call[0].length - name.length - 1
      reportReference(name, offset, offset + name.length)
    }
  }

  return dedupe(diagnostics)
}

function dedupe(diagnostics: PlainDiagnostic[]): PlainDiagnostic[] {
  const seen = new Set<string>()
  const result: PlainDiagnostic[] = []
  for (const d of diagnostics) {
    const key = `${d.message}@${d.range.start.line}:${d.range.start.character}`
    if (seen.has(key))
      continue
    seen.add(key)
    result.push(d)
  }
  return result
}

function wordBefore(text: string, offset: number): string {
  let start = offset
  while (start > 0 && /[-\w.]/.test(text[start - 1]))
    start--
  return text.slice(start, offset)
}

export function getCompletions(text: string, offset: number): PlainCompletion[] {
  const scan = scanXml(text)
  const tag = tagAtOffset(scan, offset)

  const elementCompletions = (prefix: string): PlainCompletion[] => {
    const lower = prefix.toLowerCase()
    return elementNames
      .filter(name => name.startsWith(lower))
      .map(name => ({
        label: name,
        kind: 'element' as const,
        detail: 'krpano element',
        documentation: docForElement(name, elements[name].length),
        insertText: name,
      }))
  }

  if (!tag) {
    if (text[offset - 1] === '<')
      return elementCompletions('')
    return []
  }

  const name = tag.name.toLowerCase()
  // 标签名区域(或刚敲下 '<')
  if (offset <= tag.nameEnd) {
    const prefix = offset >= tag.nameStart ? text.slice(tag.nameStart, offset) : ''
    return elementCompletions(prefix)
  }

  const attr = attributeAtOffset(tag, offset)
  if (attr) {
    // 属性值内部:只对 action 的 type 给出取值建议
    if (attr.valueStart !== undefined && attr.valueEnd !== undefined && offset >= attr.valueStart && offset <= attr.valueEnd) {
      if (name === 'action' && attr.name.toLowerCase() === 'type') {
        return ['Javascript', 'js'].map(value => ({
          label: value,
          kind: 'value' as const,
          detail: 'action code type',
          documentation: value === 'js' ? 'Short form of "Javascript".' : 'JavaScript action code (krpano script when empty).',
          insertText: value,
        }))
      }
      return []
    }
    // 属性名区域
    const prefix = attr.nameStart <= offset && offset <= attr.nameEnd ? text.slice(attr.nameStart, offset) : ''
    const existing = new Set(tag.attributes.map(a => a.name.toLowerCase()))
    const candidates = [...(elements[name] ?? []), ...SPECIAL_ATTRIBUTES]
    return candidates
      .filter(candidate => candidate.startsWith(prefix.toLowerCase()) && !existing.has(candidate.toLowerCase()))
      .map(candidate => ({
        label: candidate,
        kind: 'attribute' as const,
        detail: `${tagDisplayName(tag)} attribute`,
        documentation: docForAttribute(name, candidate),
        insertText: `${candidate}="$1"`,
        snippet: true,
      }))
  }

  // 属性之间的空白处:给出尚未使用的属性
  const prefix = wordBefore(text, offset)
  const existing = new Set(tag.attributes.map(a => a.name.toLowerCase()))
  if (offset > tag.nameEnd) {
    const candidates = [...(elements[name] ?? []), ...SPECIAL_ATTRIBUTES]
    const items = candidates
      .filter(candidate => candidate.startsWith(prefix.toLowerCase()) && !existing.has(candidate.toLowerCase()))
      .map(candidate => ({
        label: candidate,
        kind: 'attribute' as const,
        detail: `${tagDisplayName(tag)} attribute`,
        documentation: docForAttribute(name, candidate),
        insertText: `${candidate}="$1"`,
        snippet: true,
      }))
    if (items.length || prefix)
      return items
  }
  return []
}

export function getHover(text: string, offset: number): PlainHover | null {
  const scan = scanXml(text)
  const tag = tagAtOffset(scan, offset)
  if (!tag)
    return null
  const name = tag.name.toLowerCase()

  if (offset >= tag.nameStart && offset <= tag.nameEnd) {
    return {
      contents: `**${tagDisplayName(tag)}** — krpano element\n\n${docForElement(name, (elements[name] ?? []).length)}`,
      range: rangeOf(text, tag.nameStart, tag.nameEnd),
    }
  }

  const attr = attributeAtOffset(tag, offset)
  if (attr) {
    const doc = docForAttribute(name, attr.name.toLowerCase())
    const known = (elements[name] ?? []).includes(attr.name.toLowerCase())
    return {
      contents: `**${attr.name}** — ${tagDisplayName(tag)} attribute${known ? '' : ' (not documented for this element)'}\n\n${doc}`,
      range: rangeOf(text, attr.nameStart, attr.nameEnd),
    }
  }

  return null
}

export function getDefinition(text: string, offset: number): PlainLocation | null {
  const scan = scanXml(text)
  const declarations = collectDeclarations(scan)
  if (!declarations.size)
    return null

  // 光标处的标识符
  let start = offset
  while (start > 0 && /[\w-]/.test(text[start - 1]))
    start--
  let end = offset
  while (end < text.length && /[\w-]/.test(text[end]))
    end++
  const word = text.slice(start, end)
  if (!word)
    return null
  const declaration = declarations.get(word)
  if (!declaration)
    return null

  // 只在"引用"场景跳转:标识符后跟 ( 视为动作调用
  let probe = end
  while (probe < text.length && (text[probe] === ' ' || text[probe] === '\t'))
    probe++
  if (text[probe] !== '(')
    return null

  // 光标本身就在定义处时不跳转
  if (declaration.start <= offset && offset <= declaration.end)
    return null

  return { range: rangeOf(text, declaration.start, declaration.end) }
}

export const krpanoElementNames = elementNames
export const krpanoBuiltinCount = builtins.size
