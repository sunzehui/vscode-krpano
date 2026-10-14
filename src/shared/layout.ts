// 属性排版:把标签的属性按 krpano 常见风格重排(每行一个 / 等号对齐)。
// 纯文本变换,作用于已经格式化过的文本;标签顺序、属性顺序都不变。
import { scanXml } from './xml'

export type AttributeLayout = 'preserve' | 'one-per-line' | 'align'

interface Replacement {
  start: number
  end: number
  text: string
}

/**
 * 重排多属性标签:第一个属性留在标签行,其余各占一行并缩进一级;
 *  结束符(> 或 />)独占一行(标签后同行还有内容时跟在最后一行属性后面)。
 */
export function applyAttributeLayout(text: string, layout: AttributeLayout, indentation: string): string {
  if (layout === 'preserve')
    return text
  const scan = scanXml(text)
  const edits: Replacement[] = []

  for (const tag of scan.tags) {
    if (tag.kind === 'close' || tag.attributes.length < 2)
      continue
    if (scan.skipped.some(region => tag.start > region.start && tag.start < region.end))
      continue

    const lineStart = text.lastIndexOf('\n', Math.max(0, tag.start - 1)) + 1
    const lineIndent = /^[ \t]*/.exec(text.slice(lineStart, tag.start))?.[0] ?? ''
    const attributeIndent = lineIndent + indentation
    const selfClosing = tag.kind === 'self'
    const terminator = selfClosing ? '/>' : '>'
    const rest = text.slice(tag.end)
    const newlineIndex = rest.indexOf('\n')
    const inline = newlineIndex === -1 ? rest : rest.slice(0, newlineIndex)
    const keepTerminatorInline = !selfClosing && inline.trim().length > 0

    const width = Math.max(...tag.attributes.map(attr => attr.name.length))
    const lines = tag.attributes.map((attr, index) => {
      const raw = text.slice(attr.nameStart, attr.valueEnd !== undefined ? attr.valueEnd + (attr.quote ? 1 : 0) : attr.nameEnd)
      const name = layout === 'align' ? attr.name.padEnd(width, ' ') : attr.name
      const rendered = `${name}${raw.slice(attr.name.length)}`
      return index === 0 ? rendered : `${attributeIndent}${rendered}`
    })
    const body = lines.join('\n')
    edits.push({
      // 从第一个属性开始替换,标签名与它前面的空白原样保留
      start: tag.attributes[0].nameStart,
      end: tag.end,
      text: keepTerminatorInline ? `${body}${terminator}` : `${body}\n${lineIndent}${terminator}`,
    })
  }

  if (!edits.length)
    return text

  let out = text
  for (const edit of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}
