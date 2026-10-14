import type { PlainRange } from './types'
// 引用解析:在一段 krpano 文本里找出某个名字被引用的位置。
// 纯逻辑(不依赖 fs / vscode),供查找引用、重命名、括号索引补全与校验共用。
import { createLineIndex, offsetToPosition, scanXml } from '../shared/xml'
import { collectDefinitions } from './symbols'

/** krpano 里可以用 [name] 索引的元素类型 */
export const INDEXABLE_ELEMENTS = ['layer', 'hotspot', 'plugin', 'scene', 'data', 'events', 'style', 'action'] as const

/** 名字型属性:值本身就是一个 name 引用 */
export const NAME_ATTRIBUTES = ['style', 'linkedscene'] as const

/** 第一个参数是名字的内建动作 → 该名字所属的元素类型(callwith 的名字在第二个参数) */
export const NAME_ARGUMENT_ACTIONS: Record<string, string | undefined> = {
  loadscene: 'scene',
  loadstyle: 'style',
  looktohotspot: 'hotspot',
  removescene: 'scene',
  removehotspot: 'hotspot',
  removelayer: 'layer',
  removeplugin: 'plugin',
  removeevent: 'events',
  addhotspot: 'hotspot',
  addlayer: 'layer',
  addplugin: 'plugin',
  addevent: 'events',
  callwith: 'action',
}

export interface NameReference {
  name: string
  range: PlainRange
  /** 引用形式:索引 layer[x] / 属性取值 style="x" / 动作调用 x() / 名字参数 loadscene(x) */
  form: 'index' | 'attribute' | 'call' | 'argument'
  /** 引用涉及的元素名(索引与属性形式可用) */
  element?: string
}

function isPlainName(value: string): boolean {
  return /^[\w.-]+$/.test(value)
}

function rangeOf(lineIndex: ReturnType<typeof createLineIndex>, start: number, end: number): PlainRange {
  return { start: lineIndex.toPosition(start), end: lineIndex.toPosition(end) }
}

function isJavascriptAction(tag: { attributes: Array<{ name: string, value?: string }> }): boolean {
  const typeAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'type')
  const value = typeAttr?.value?.toLowerCase()
  return value === 'javascript' || value === 'js'
}

interface SkipRegion { start: number, end: number }

/** 收集文本里所有可能的 name 引用(跳过注释、CDATA 与 JS 动作体) */
export function collectReferences(text: string): NameReference[] {
  const scan = scanXml(text)
  const lineIndex = createLineIndex(text)
  const skip: SkipRegion[] = scan.skipped.map(region => ({ start: region.start, end: region.end }))
  const references: NameReference[] = []

  // 动作体范围:用于跳过 JS 动作、并作为脚本引用的扫描范围
  const scriptRanges: SkipRegion[] = []
  const actionBodyRe = /<action\b([^>]*)>([\s\S]*?)<\/action>/g
  for (const match of text.matchAll(actionBodyRe)) {
    const typeMatch = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(match[1])
    const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? '').toLowerCase()
    const bodyStart = match.index! + match[0].indexOf(match[2])
    const bodyEnd = bodyStart + match[2].length
    if (type === 'javascript' || type === 'js')
      skip.push({ start: bodyStart, end: bodyEnd })
    else
      scriptRanges.push({ start: bodyStart, end: bodyEnd })
  }

  const isSkipped = (offset: number): boolean => skip.some(region => offset >= region.start && offset < region.end)

  const pushIndexes = (start: number, end: number): void => {
    const slice = text.slice(start, end)
    const indexRe = new RegExp(`(?<![\\w.$])(${INDEXABLE_ELEMENTS.join('|')})\\[([^\\]]+)\\]`, 'g')
    for (const match of slice.matchAll(indexRe)) {
      const raw = match[2]
      if (!isPlainName(raw))
        continue // 动态索引(layer[get(x)]、hotspot[%1])不算引用
      const offset = start + (match.index ?? 0) + match[0].length - raw.length - 1
      if (isSkipped(offset))
        continue
      references.push({ name: raw, range: rangeOf(lineIndex, offset, offset + raw.length), form: 'index', element: match[1] })
    }
  }

  const pushCalls = (start: number, end: number): void => {
    const slice = text.slice(start, end)
    for (const match of slice.matchAll(/(?<![\w.$])([A-Z_][\w-]*)[ \t]*\(/gi)) {
      const name = match[1]
      const offset = start + (match.index ?? 0) + match[0].length - name.length - 1
      if (isSkipped(offset))
        continue
      references.push({ name, range: rangeOf(lineIndex, offset, offset + name.length), form: 'call' })
    }
    const argRe = new RegExp(`(?<![\\w.$])(${Object.keys(NAME_ARGUMENT_ACTIONS).join('|')})[ \\t]*\\(([^)]*)`, 'g')
    for (const match of slice.matchAll(argRe)) {
      const action = match[1]
      const args = match[2]
      const target = action === 'callwith' ? args.split(',')[1] : args.split(',')[0]
      if (!target)
        continue
      const trimmed = target.trim()
      if (!isPlainName(trimmed))
        continue
      const base = start + (match.index ?? 0) + match[0].indexOf(args)
      const offset = base + target.indexOf(trimmed)
      if (isSkipped(offset))
        continue
      references.push({ name: trimmed, range: rangeOf(lineIndex, offset, offset + trimmed.length), form: 'argument', element: NAME_ARGUMENT_ACTIONS[action] })
    }
  }

  // 标签属性:名字型取值、事件属性里的索引与调用
  for (const tag of scan.tags) {
    const element = tag.name.toLowerCase()
    if (element === 'action' && isJavascriptAction(tag))
      continue
    for (const attr of tag.attributes) {
      if (attr.value === undefined || attr.valueStart === undefined)
        continue
      const name = attr.name.toLowerCase()
      const valueEnd = attr.valueEnd ?? attr.valueStart
      if ((NAME_ATTRIBUTES as readonly string[]).includes(name)) {
        const trimmed = attr.value.trim()
        if (isPlainName(trimmed)) {
          const offset = attr.valueStart + attr.value.indexOf(trimmed)
          references.push({ name: trimmed, range: rangeOf(lineIndex, offset, offset + trimmed.length), form: 'attribute', element: name === 'linkedscene' ? 'scene' : 'style' })
        }
      }
      pushIndexes(attr.valueStart, valueEnd)
      if (name.startsWith('on'))
        pushCalls(attr.valueStart, valueEnd)
    }
  }

  // krpano 脚本动作体
  for (const range of scriptRanges) {
    pushIndexes(range.start, range.end)
    pushCalls(range.start, range.end)
  }

  return dedupeReferences(references)
}

function dedupeReferences(references: NameReference[]): NameReference[] {
  const seen = new Set<string>()
  return references.filter((reference) => {
    const key = `${reference.range.start.line}:${reference.range.start.character}:${reference.form}`
    if (seen.has(key))
      return false
    seen.add(key)
    return true
  })
}

/** 找出某个名字的全部引用 */
export function findReferences(text: string, name: string): NameReference[] {
  return collectReferences(text).filter(reference => reference.name === name)
}

/** 校验索引引用:`layer[foo]` 里的名字是否已知 */
export function findUnknownIndexes(text: string, known: (element: string, name: string) => boolean): NameReference[] {
  return collectReferences(text).filter(reference =>
    reference.form === 'index' && !!reference.element && !known(reference.element, reference.name),
  )
}

export interface NameAtOffset {
  name: string
  range: PlainRange
  kind: 'definition' | 'reference'
  /** 定义/引用所属的元素名 */
  element?: string
}

function offsetInRange(text: string, range: PlainRange, offset: number): boolean {
  const position = offsetToPosition(text, offset)
  const { start, end } = range
  return (position.line > start.line || (position.line === start.line && position.character >= start.character))
    && (position.line < end.line || (position.line === end.line && position.character <= end.character))
}

/** 光标处的名字(定义或引用),用于查找引用与重命名 */
export function nameAtOffset(text: string, offset: number): NameAtOffset | undefined {
  for (const definition of collectDefinitions(text)) {
    if (offsetInRange(text, definition.range, offset))
      return { name: definition.name, range: definition.range, kind: 'definition', element: definition.element }
  }

  let start = offset
  while (start > 0 && /[\w.-]/.test(text[start - 1]))
    start--
  let end = offset
  while (end < text.length && /[\w.-]/.test(text[end]))
    end++
  const word = text.slice(start, end)
  if (!word || !isPlainName(word))
    return undefined

  for (const reference of findReferences(text, word)) {
    if (offsetInRange(text, reference.range, offset))
      return { name: word, range: reference.range, kind: 'reference', element: reference.element }
  }
  return undefined
}

/** 括号索引 `layer[` 处的上下文(用于补全与校验) */
export function indexContextAt(text: string, offset: number): { element: string, prefix: string } | undefined {
  const lineStart = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const before = text.slice(Math.max(0, offset - 200), offset)
  const match = new RegExp(`(${INDEXABLE_ELEMENTS.join('|')})\\[([^\\]]*)$`).exec(before)
  if (!match)
    return undefined
  const prefix = match[2]
  if (offset - prefix.length < lineStart)
    return undefined
  return { element: match[1], prefix }
}

/** 处于 `动作名(` 的参数位置时的上下文(用于按元素类型补全名字) */
export function callArgumentContextAt(text: string, offset: number): { action: string, element?: string, prefix: string } | undefined {
  const lineStart = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const before = text.slice(Math.max(0, offset - 300), offset)
  const match = /(?<![\w.$])([A-Z_][\w-]*)\(([^()]*)$/i.exec(before)
  if (!match)
    return undefined
  const action = match[1]
  const args = match[2]
  if (!(action in NAME_ARGUMENT_ACTIONS))
    return undefined
  const isCallwithSecond = action === 'callwith' && args.includes(',')
  const target = isCallwithSecond ? args.slice(args.indexOf(',') + 1) : args
  if (target.includes(','))
    return undefined
  const start = offset - target.length
  if (start < lineStart)
    return undefined
  return { action, element: NAME_ARGUMENT_ACTIONS[action], prefix: target.trim() }
}
