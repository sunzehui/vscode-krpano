// 轻量 XML 扫描器:同时供格式化前的结构差异检查(extension 侧)与语言服务(server 侧)使用。
// 只做词法层面的标签/属性识别,不构建 DOM,对不完整或不合法的输入保持宽容(不抛异常)。

export interface XmlAttribute {
  name: string
  /** 属性名在文本中的偏移 */
  nameStart: number
  nameEnd: number
  /** 有值时给出值(不含引号)与值的范围 */
  value?: string
  valueStart?: number
  valueEnd?: number
  /** 引号字符,无值属性为 undefined */
  quote?: string
}

export interface XmlTag {
  /** 标签名(不含 < > /) */
  name: string
  kind: 'open' | 'close' | 'self'
  /** 整个标签的范围:< 与 > 之间(含两端) */
  start: number
  end: number
  /** 标签名范围 */
  nameStart: number
  nameEnd: number
  /** 属性列表(仅 open/self 标签) */
  attributes: XmlAttribute[]
}

export interface XmlDocumentScan {
  tags: XmlTag[]
  /** 注释、CDATA、处理指令、DOCTYPE 等非标签区域 */
  skipped: Array<{ kind: 'comment' | 'cdata' | 'pi' | 'doctype', start: number, end: number }>
}

const NAME_START = /[A-Z_:]/i
const NAME_CHAR = /[-\w.:]/

function isNameStart(ch: string): boolean {
  return ch !== undefined && NAME_START.test(ch)
}

function isNameChar(ch: string): boolean {
  return ch !== undefined && NAME_CHAR.test(ch)
}

/** 扫描整个文本,返回标签与属性(位置为 0 基偏移) */
export function scanXml(text: string): XmlDocumentScan {
  const tags: XmlTag[] = []
  const skipped: XmlDocumentScan['skipped'] = []
  let i = 0

  const readName = (from: number): number => {
    let j = from
    while (j < text.length && isNameChar(text[j]))
      j++
    return j
  }

  // 从一个标签起始位置解析属性(输入为属性区起点与结束 '>' 的位置)
  const readAttributes = (from: number, to: number): XmlAttribute[] => {
    const attributes: XmlAttribute[] = []
    let j = from
    while (j < to) {
      const ch = text[j]
      if (ch === '/' || /\s/.test(ch)) {
        j++
        continue
      }
      if (!isNameStart(ch)) {
        // 非法字符,跳过以免死循环
        j++
        continue
      }
      const nameStart = j
      j = readName(j)
      const nameEnd = j
      // 跳过空白与 '='
      let k = j
      while (k < to && /\s/.test(text[k]))
        k++
      if (text[k] !== '=') {
        attributes.push({ name: text.slice(nameStart, nameEnd), nameStart, nameEnd })
        j = nameEnd
        continue
      }
      k++
      while (k < to && /\s/.test(text[k]))
        k++
      const quote = text[k]
      if (quote !== '"' && quote !== '\'') {
        // 无引号的非法值,按无值属性处理
        attributes.push({ name: text.slice(nameStart, nameEnd), nameStart, nameEnd })
        j = nameEnd
        continue
      }
      const valueStart = k + 1
      const valueEnd = text.indexOf(quote, valueStart)
      const realEnd = valueEnd === -1 || valueEnd > to ? to : valueEnd
      attributes.push({
        name: text.slice(nameStart, nameEnd),
        nameStart,
        nameEnd,
        value: text.slice(valueStart, realEnd),
        valueStart,
        valueEnd: realEnd,
        quote,
      })
      j = realEnd + 1
    }
    return attributes
  }

  while (i < text.length) {
    const lt = text.indexOf('<', i)
    if (lt === -1)
      break

    if (text.startsWith('<!--', lt)) {
      const close = text.indexOf('-->', lt + 4)
      const end = close === -1 ? text.length : close + 3
      skipped.push({ kind: 'comment', start: lt, end })
      i = end
      continue
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const close = text.indexOf(']]>', lt + 9)
      const end = close === -1 ? text.length : close + 3
      skipped.push({ kind: 'cdata', start: lt, end })
      i = end
      continue
    }
    if (text.startsWith('<!', lt)) {
      const close = text.indexOf('>', lt + 2)
      const end = close === -1 ? text.length : close + 1
      skipped.push({ kind: 'doctype', start: lt, end })
      i = end
      continue
    }
    if (text.startsWith('<?', lt)) {
      const close = text.indexOf('?>', lt + 2)
      const end = close === -1 ? text.length : close + 2
      skipped.push({ kind: 'pi', start: lt, end })
      i = end
      continue
    }

    // 普通标签:< / 名称
    let j = lt + 1
    let kind: XmlTag['kind'] = 'open'
    if (text[j] === '/') {
      kind = 'close'
      j++
    }
    if (!isNameStart(text[j])) {
      // 不是标签(例如脚本里的 "a < b"),跳过这个 '<'
      i = lt + 1
      continue
    }
    const nameStart = j
    const nameEnd = readName(j)
    // 找到未被引号包裹的 '>'
    let k = nameEnd
    let quote: string | undefined
    let gt = -1
    let selfClosing = false
    while (k < text.length) {
      const ch = text[k]
      if (quote) {
        if (ch === quote)
          quote = undefined
      }
      else if (ch === '"' || ch === '\'') {
        quote = ch
      }
      else if (ch === '>') {
        gt = k
        break
      }
      k++
    }
    if (gt === -1) {
      // 未闭合的标签:到文本末尾为止
      const attributes = readAttributes(nameEnd, text.length)
      tags.push({ name: text.slice(nameStart, nameEnd), kind, start: lt, end: text.length, nameStart, nameEnd, attributes })
      break
    }
    if (text[gt - 1] === '/' && kind === 'open') {
      selfClosing = true
      kind = 'self'
    }
    const attributes = readAttributes(nameEnd, selfClosing ? gt - 1 : gt)
    tags.push({ name: text.slice(nameStart, nameEnd), kind, start: lt, end: gt + 1, nameStart, nameEnd, attributes })
    i = gt + 1
  }

  return { tags, skipped }
}

/**
 * 标签结构签名:用于格式化前后比较,判断是否发生了(容错修复导致的)结构变化。
 *  空的成对标签 <x></x> 与自闭合 <x/> 视为等价,避免 forceSelfClosingEmptyTag 造成的误判。
 */
export function structureSignature(text: string): string[] {
  const raw = scanXml(text).tags.map(tag => `${tag.kind === 'close' ? '/' : tag.kind === 'self' ? '#' : ''}${tag.name.toLowerCase()}`)
  const normalized: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const name = raw[i]
    if (!name.startsWith('/') && !name.startsWith('#') && raw[i + 1] === `/${name}`) {
      normalized.push(`#${name}`)
      i++
      continue
    }
    normalized.push(name)
  }
  return normalized
}

export function signaturesDiffer(a: string, b: string): boolean {
  const sigA = structureSignature(a)
  const sigB = structureSignature(b)
  if (sigA.length !== sigB.length)
    return true
  for (let i = 0; i < sigA.length; i++) {
    if (sigA[i] !== sigB[i])
      return true
  }
  return false
}

/**
 * krpano 专有元素:用于判断一个 `.xml` 是不是 krpano 文档。
 *  只收别的 XML 词汇表基本不会出现的名字(`action`、`style`、`image`、`view` 等通用名不算,
 *  否则 AndroidManifest.xml 之类会被当成 krpano)。
 */
const KRPANO_ONLY_ELEMENTS = new Set([
  'krpano',
  'scene',
  'hotspot',
  'preview',
  'cubestrip',
  'cube',
  'depthmap',
  'textstyle',
  'cssstyles',
  'autorotate',
  'splats',
])

/**
 * 文本是否像 krpano 文档(出现 krpano 根元素或 krpano 专有元素)。
 *  扩展把语言绑定在 `.xml` 扩展名上,诊断与格式化据此避开其它 XML 词汇表;
 *  只有 `<action>` 一类通用元素的片段文件可把语言模式切到 krpano。
 */
export function looksLikeKrpanoXml(text: string): boolean {
  return scanXml(text).tags.some(tag => KRPANO_ONLY_ELEMENTS.has(tag.name.toLowerCase()))
}

/** 偏移是否落在注释 / CDATA / 处理指令等非标签区域内 */
export function isSkippedOffset(skipped: XmlDocumentScan['skipped'], offset: number): boolean {
  return skipped.some(region => offset >= region.start && offset < region.end)
}

export interface XmlPosition {
  line: number
  character: number
}

/**
 * 预建的行索引:offset → 行列位置,二分查找,O(log n)。
 *  大文档里逐个 offset 线性扫描会退化成 O(n²)(曾导致 1MB 文档诊断耗时上百秒)。
 */
export interface LineIndex {
  toPosition: (offset: number) => XmlPosition
  lineStarts: number[]
}

export function createLineIndex(text: string): LineIndex {
  const lineStarts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10)
      lineStarts.push(i + 1)
  }
  return {
    lineStarts,
    toPosition(offset: number): XmlPosition {
      const limit = Math.max(0, Math.min(offset, text.length))
      let low = 0
      let high = lineStarts.length - 1
      while (low < high) {
        const mid = (low + high + 1) >> 1
        if (lineStarts[mid] <= limit)
          low = mid
        else
          high = mid - 1
      }
      return { line: low, character: limit - lineStarts[low] }
    },
  }
}

/** 偏移 → 行列位置(0 基,按 \n 分行)。批量转换请使用 createLineIndex。 */
export function offsetToPosition(text: string, offset: number): XmlPosition {
  return createLineIndex(text).toPosition(offset)
}

/** 找到包含指定偏移的最内层标签 */
export function tagAtOffset(scan: XmlDocumentScan, offset: number): XmlTag | undefined {
  let found: XmlTag | undefined
  for (const tag of scan.tags) {
    if (tag.start <= offset && offset <= tag.end)
      found = tag
    else if (tag.start > offset)
      break
  }
  return found
}

/** 找到包含指定偏移的属性 */
export function attributeAtOffset(tag: XmlTag, offset: number): XmlAttribute | undefined {
  for (const attr of tag.attributes) {
    const end = attr.valueEnd !== undefined ? attr.valueEnd + 1 : attr.nameEnd
    if (attr.nameStart <= offset && offset <= end)
      return attr
  }
  return undefined
}
