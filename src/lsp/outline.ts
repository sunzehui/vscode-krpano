import type { PlainRange } from './types'
// 文档大纲:把 krpano XML 结构整理成可折叠的符号树(DocumentSymbol 用)。
import { createLineIndex, scanXml } from '../shared/xml'

export interface OutlineSymbol {
  name: string
  detail?: string
  kind: 'file' | 'module' | 'namespace' | 'class' | 'method' | 'property' | 'field' | 'object'
  range: PlainRange
  selectionRange: PlainRange
  children: OutlineSymbol[]
}

/** 有意义的元素类型(其余元素不进大纲,避免噪音) */
const OUTLINE_ELEMENTS: Record<string, OutlineSymbol['kind']> = {
  scene: 'class',
  action: 'method',
  hotspot: 'object',
  layer: 'field',
  plugin: 'field',
  style: 'property',
  events: 'namespace',
  data: 'property',
  include: 'module',
  view: 'property',
  image: 'object',
}

function rangeOf(lineIndex: ReturnType<typeof createLineIndex>, start: number, end: number): PlainRange {
  return { start: lineIndex.toPosition(start), end: lineIndex.toPosition(end) }
}

/** 生成文档大纲(按标签嵌套组织,成对标签的 range 覆盖整个元素) */
export function getDocumentSymbols(text: string): OutlineSymbol[] {
  const roots: OutlineSymbol[] = []
  const lineIndex = createLineIndex(text)
  const stack: Array<{ tag: string, symbol: OutlineSymbol, start: number }> = []

  for (const tag of scanXml(text).tags) {
    const element = tag.name.toLowerCase()
    if (tag.kind === 'close') {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === element) {
          stack[i].symbol.range = rangeOf(lineIndex, stack[i].start, tag.end)
          stack.length = i
          break
        }
      }
      continue
    }

    const kind = OUTLINE_ELEMENTS[element]
    if (!kind)
      continue

    const nameAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'name')
    const label = nameAttr?.value?.trim() || `<${element}>`
    const selectionRange = nameAttr?.valueStart !== undefined
      ? rangeOf(lineIndex, nameAttr.valueStart, nameAttr.valueEnd ?? nameAttr.valueStart)
      : rangeOf(lineIndex, tag.nameStart, tag.nameEnd)

    const symbol: OutlineSymbol = {
      name: label,
      detail: element,
      kind,
      range: rangeOf(lineIndex, tag.start, tag.end),
      selectionRange,
      children: [],
    }
    const parent = stack[stack.length - 1]
    if (parent)
      parent.symbol.children.push(symbol)
    else
      roots.push(symbol)

    if (tag.kind === 'open')
      stack.push({ tag: element, symbol, start: tag.start })
  }

  return roots
}
