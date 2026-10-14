import type { XmlTag } from '../shared/xml'
import type { SymbolDefinition } from './symbols'
import type { DiagnosticSettings, ExternalDefinition, PlainCompletion, PlainDiagnostic, PlainHover, PlainLocation, PlainRange, ProjectContext } from './types'
import { attributeAtOffset, offsetToPosition, scanXml, tagAtOffset } from '../shared/xml'
// krpano XML 语言特性实现(纯函数,不依赖 vscode / vscode-languageserver,便于单元测试)。
import krpanoData from './krpanoData.json'
import { docForAttribute, docForElement } from './krpanoDocs'
import { collectReferences, findUnknownIndexes, indexContextAt } from './references'
import { collectDefinitions } from './symbols'

export type { DiagnosticSettings, PlainCompletion, PlainDiagnostic, PlainHover, PlainLocation, PlainRange, ProjectContext } from './types'

interface KrpanoData {
  elements: Record<string, string[]>
  builtinActions: string[]
  controlKeywords: string[]
}

const data = krpanoData as unknown as KrpanoData
const elements: Record<string, string[]> = data.elements
const elementNames = Object.keys(elements).sort()
const builtins = new Set([...data.builtinActions, ...data.controlKeywords, 'parent', 'caller', 'global', 'local', 'Math'])

/** 允许任意子标签的元素(其子元素名不是 krpano 元素) */
const FREE_FORM = new Set(['textstyle', 'cssstyles', 'style'])
/** 特殊 XML 属性,任何元素都可以使用 */
const SPECIAL_ATTRIBUTES = ['devices', 'if']

const SOURCE = 'krpano-lang'

function rangeOf(text: string, start: number, end: number): PlainRange {
  return { start: offsetToPosition(text, start), end: offsetToPosition(text, end) }
}

function tagDisplayName(tag: XmlTag): string {
  return `<${tag.name}>`
}

function offsetInRange(text: string, range: PlainRange, offset: number): boolean {
  const position = offsetToPosition(text, offset)
  if (position.line < range.start.line || position.line > range.end.line)
    return false
  if (position.line === range.start.line && position.character < range.start.character)
    return false
  if (position.line === range.end.line && position.character > range.end.character)
    return false
  return true
}

/** 是否为 JavaScript 动作(type="Javascript"/"js") */
function isJavascriptTag(tag: XmlTag): boolean {
  const typeAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'type')
  const value = typeAttr?.value?.toLowerCase()
  return value === 'javascript' || value === 'js'
}

export function getDiagnostics(text: string, context: ProjectContext = {}, settings: DiagnosticSettings = {}): PlainDiagnostic[] {
  const diagnostics: PlainDiagnostic[] = []
  const scan = scanXml(text)
  const ignoredNames = new Set((settings.ignoredNames ?? []).filter(name => !!name))
  const undefinedActions = settings.undefinedActions ?? 'information'

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
    if (!(name in elements) && !insideFreeForm && !ignoredNames.has(tag.name)) {
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

  // 4) 未定义的动作引用(本文件 + include 链;仍可能是插件提供的,故用 information)
  const definitions = collectDefinitions(text)
  const declared = new Set(definitions.map(definition => definition.name))
  const external: Map<string, ExternalDefinition> = context.externalDefinitions ?? new Map()
  const isKnownName = (name: string): boolean =>
    declared.has(name) || external.has(name) || builtins.has(name) || name in elements

  const reportReference = (name: string, start: number, end: number): void => {
    if (undefinedActions === 'off' || ignoredNames.has(name))
      return
    if (isKnownName(name))
      return
    diagnostics.push({
      message: `Action "${name}" is not defined in this file or in the files it includes (it may be provided by a plugin).`,
      severity: undefinedActions === 'warning' ? 'warning' : 'information',
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
      for (const m of value.matchAll(/(?:^|[^\w.$])([A-Z_]\w*)\(/gi)) {
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
    const typeMatch = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(attrText)
    const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? '').toLowerCase()
    if (type === 'javascript' || type === 'js')
      continue
    const bodyStart = m.index! + m[0].indexOf(m[2])
    const body = m[2]
    for (const call of body.matchAll(/(?:^|[^\w.$])([A-Z_]\w*)\(/gi)) {
      const name = call[1]
      const offset = bodyStart + (call.index ?? 0) + call[0].length - name.length - 1
      reportReference(name, offset, offset + name.length)
    }
  }

  // 5) 同一容器内重复的 name(不同 scene 之间同名是合法的)
  const seenDefinitions = new Map<string, SymbolDefinition>()
  for (const definition of definitions) {
    const key = `${definition.container ?? ''}|${definition.element}|${definition.name}`
    const first = seenDefinitions.get(key)
    if (first) {
      diagnostics.push({
        message: `Duplicate ${definition.element} name "${definition.name}" (already defined on line ${first.range.start.line + 1}).`,
        severity: 'warning',
        range: definition.range,
        source: SOURCE,
      })
      continue
    }
    seenDefinitions.set(key, definition)
  }

  // 6) linkedscene / style 引用是否能在本文件或 include 链中找到
  const hasDefinition = (element: string, name: string): boolean =>
    definitions.some(definition => definition.element === element && definition.name === name)
    || [...external.entries()].some(([key, value]) => key === name && (value.element === undefined || value.element === element))
  for (const tag of scan.tags) {
    for (const attr of tag.attributes) {
      if (!attr.value || attr.valueStart === undefined || attr.valueEnd === undefined)
        continue
      const attrName = attr.name.toLowerCase()
      const target = attr.value.trim()
      if (!target || target.includes('%'))
        continue
      if (ignoredNames.has(target))
        continue
      if (attrName === 'linkedscene' && !hasDefinition('scene', target)) {
        diagnostics.push({
          message: `Scene "${target}" is not defined in this file or in the files it includes.`,
          severity: 'warning',
          range: rangeOf(text, attr.valueStart, attr.valueEnd),
          source: SOURCE,
        })
      }
      else if (attrName === 'style' && !hasDefinition('style', target)) {
        diagnostics.push({
          message: `Style "${target}" is not defined in this file or in the files it includes (it may come from a skin or plugin).`,
          severity: 'information',
          range: rangeOf(text, attr.valueStart, attr.valueEnd),
          source: SOURCE,
        })
      }
    }
  }

  // 7) 方括号索引引用了不存在的名字(layer[ghost])
  const knownIndexTarget = (element: string, name: string): boolean =>
    isKnownName(name)
    || definitions.some(definition => definition.element === element && definition.name === name)
    || [...external.entries()].some(([key, value]) => key === name && (value.element === undefined || value.element === element))
  for (const reference of findUnknownIndexes(text, knownIndexTarget)) {
    if (undefinedActions === 'off' || ignoredNames.has(reference.name))
      continue
    diagnostics.push({
      message: `${reference.element} "${reference.name}" is not defined in this file or in the files it includes.`,
      severity: 'information',
      range: reference.range,
      source: SOURCE,
    })
  }

  // 8) action 上的 lang 属性(krpano 不支持,官方写法是 type="Javascript"/"js")
  for (const tag of scan.tags) {
    if (tag.name.toLowerCase() !== 'action')
      continue
    const langAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'lang')
    if (langAttr && langAttr.value !== undefined && langAttr.valueStart !== undefined && langAttr.valueEnd !== undefined) {
      diagnostics.push({
        message: `krpano does not support a "lang" attribute; use type="Javascript" (or type="js") for JavaScript actions.`,
        severity: 'information',
        range: rangeOf(text, langAttr.nameStart, langAttr.valueEnd),
        source: SOURCE,
      })
    }
  }

  // 9) include 目标不存在(相对当前文件解析;krpano 同样会因此报错)
  for (const item of context.unresolvedIncludes ?? []) {
    diagnostics.push({
      message: `Included file "${item.url}" was not found (include paths are resolved relative to this file).`,
      severity: 'warning',
      range: item.range,
      source: SOURCE,
    })
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

export function getCompletions(text: string, offset: number, context: ProjectContext = {}): PlainCompletion[] {
  const scan = scanXml(text)
  const tag = tagAtOffset(scan, offset)

  const indexContext = indexContextAt(text, offset)
  if (indexContext) {
    const names = new Set<string>()
    for (const definition of collectDefinitions(text)) {
      if (definition.element === indexContext.element)
        names.add(definition.name)
    }
    for (const [name, definition] of (context.externalDefinitions ?? new Map<string, ExternalDefinition>())) {
      if (definition.element === undefined || definition.element === indexContext.element)
        names.add(name)
    }
    const items = [...names].sort().filter(candidate => candidate.startsWith(indexContext.prefix)).map(candidate => ({
      label: candidate,
      kind: 'value' as const,
      detail: `krpano ${indexContext.element} name`,
      documentation: `Name of a ${indexContext.element} defined in this file or in the files it includes.`,
      insertText: candidate,
    }))
    if (items.length)
      return items
  }

  /** 本文件 + include 链中某一类元素定义的名字 */
  const namesOfElement = (element: string): string[] => {
    const names = new Set<string>()
    for (const definition of collectDefinitions(text)) {
      if (definition.element === element)
        names.add(definition.name)
    }
    for (const [name, definition] of (context.externalDefinitions ?? new Map<string, ExternalDefinition>())) {
      if (definition.element === undefined || definition.element === element)
        names.add(name)
    }
    return [...names].sort()
  }

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

  // 方括号索引:layer[hs1 处补全热点名
  const attr = attributeAtOffset(tag, offset)
  if (attr) {
    // 属性值内部:只对 action 的 type 给出取值建议
    if (attr.valueStart !== undefined && attr.valueEnd !== undefined && offset >= attr.valueStart && offset <= attr.valueEnd) {
      const attrName = attr.name.toLowerCase()
      if (name === 'action' && attrName === 'type') {
        return ['Javascript', 'js'].map(value => ({
          label: value,
          kind: 'value' as const,
          detail: 'action code type',
          documentation: value === 'js' ? 'Short form of "Javascript".' : 'JavaScript action code (krpano script when empty).',
          insertText: value,
        }))
      }
      // 名字引用型属性:补全本文件/include 链里定义的名字
      const referenceKind = attrName === 'style'
        ? 'style'
        : attrName === 'linkedscene' ? 'scene' : undefined
      if (referenceKind) {
        const prefix = text.slice(attr.valueStart, offset)
        return namesOfElement(referenceKind)
          .filter(candidate => candidate.startsWith(prefix))
          .map(candidate => ({
            label: candidate,
            kind: 'value' as const,
            detail: `krpano ${referenceKind}`,
            documentation: `Name of a ${referenceKind} defined in this file or in the files it includes.`,
            insertText: candidate,
          }))
      }
      // 事件属性:补全动作名
      if (/^on[a-z]+$/.test(attrName)) {
        const prefix = text.slice(attr.valueStart, offset)
        const word = /[\w-]*$/.exec(prefix)?.[0] ?? ''
        return namesOfElement('action')
          .filter(candidate => candidate.startsWith(word))
          .map(candidate => ({
            label: candidate,
            kind: 'value' as const,
            detail: 'krpano action',
            documentation: 'Action defined in this file or in the files it includes.',
            insertText: candidate,
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

  // 方括号索引:layer[hs1 处补全热点名
  const indexContext = indexContextAt(text, offset)
  if (indexContext) {
    const names = new Set<string>()
    for (const definition of collectDefinitions(text)) {
      if (definition.element === indexContext.element)
        names.add(definition.name)
    }
    for (const [name, definition] of (context.externalDefinitions ?? new Map<string, ExternalDefinition>())) {
      if (definition.element === undefined || definition.element === indexContext.element)
        names.add(name)
    }
    const items = [...names].sort().filter(candidate => candidate.startsWith(indexContext.prefix)).map(candidate => ({
      label: candidate,
      kind: 'value' as const,
      detail: `krpano ${indexContext.element} name`,
      documentation: `Name of a ${indexContext.element} defined in this file or in the files it includes.`,
      insertText: candidate,
    }))
    if (items.length)
      return items
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

export function getDefinition(text: string, offset: number, context: ProjectContext = {}): PlainLocation | null {
  const definitions = collectDefinitions(text)
  const external = context.externalDefinitions ?? new Map()
  if (!definitions.length && !external.size)
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

  // 只在"引用"场景跳转:标识符后跟 ( 视为动作调用
  let probe = end
  while (probe < text.length && (text[probe] === ' ' || text[probe] === '\t'))
    probe++
  if (text[probe] !== '(')
    return null

  const local = definitions.find(definition => definition.name === word)
  if (local) {
    // 光标本身就在定义处时不跳转
    if (offsetInRange(text, local.range, offset))
      return null
    return { range: local.range }
  }

  // include 链中的定义(跨文件跳转)
  return external.get(word) ?? null
}

export interface DuplicateDefinition {
  name: string
  element: string
  range: PlainRange
  firstLine: number
}

/** 同一容器内重复的 name 定义(供诊断与快速修复共用) */
export function findDuplicateDefinitions(text: string): DuplicateDefinition[] {
  const seen = new Map<string, SymbolDefinition>()
  const duplicates: DuplicateDefinition[] = []
  for (const definition of collectDefinitions(text)) {
    const key = `${definition.container ?? ''}|${definition.element}|${definition.name}`
    const first = seen.get(key)
    if (first) {
      duplicates.push({
        name: definition.name,
        element: definition.element,
        range: definition.range,
        firstLine: first.range.start.line,
      })
      continue
    }
    seen.set(key, definition)
  }
  return duplicates
}

export interface UndefinedReference {
  name: string
  range: PlainRange
  /** 引用形式(用于生成不同的修复) */
  form: 'index' | 'attribute' | 'call' | 'argument'
}

/** 引用了但本文件与 include 链都没有定义的名字(供诊断与快速修复共用) */
export function findUndefinedReferences(text: string, context: ProjectContext = {}): UndefinedReference[] {
  const declared = new Set(collectDefinitions(text).map(definition => definition.name))
  const external = context.externalDefinitions ?? new Map()
  const result: UndefinedReference[] = []
  for (const reference of collectReferences(text)) {
    if (reference.form === 'index')
      continue // 索引引用由 index 校验负责
    if (declared.has(reference.name) || external.has(reference.name) || builtins.has(reference.name) || reference.name in elements)
      continue
    result.push({ name: reference.name, range: reference.range, form: reference.form })
  }
  return result
}

export const krpanoElementNames = elementNames
export const krpanoBuiltinCount = builtins.size
