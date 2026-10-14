// 选区格式化:按标签嵌套深度重排选中行的缩进。
// 不做属性重排/拆行(xml-formatter 面向整篇文档),因此选区格式化只保证缩进对齐。
import { scanXml } from './xml'

export interface ReindentResult {
  text: string
  changed: boolean
}

/** 偏移处的标签嵌套深度 */
export function depthAt(text: string, offset: number): number {
  let depth = 0
  for (const tag of scanXml(text).tags) {
    if (tag.start >= offset)
      break
    if (tag.kind === 'open')
      depth++
    else if (tag.kind === 'close')
      depth = Math.max(0, depth - 1)
  }
  return depth
}

/** 偏移处所有祖先元素名(由外到内) */
export function enclosingElementNames(text: string, offset: number): string[] {
  const stack: string[] = []
  for (const tag of scanXml(text).tags) {
    if (tag.start >= offset)
      break
    const name = tag.name.toLowerCase()
    if (tag.kind === 'open') {
      stack.push(name)
    }
    else if (tag.kind === 'close') {
      const index = stack.lastIndexOf(name)
      if (index !== -1)
        stack.length = index
    }
  }
  return stack
}

/** 一行内的标签嵌套净变化 */
function netDepthDelta(line: string): number {
  let delta = 0
  for (const tag of scanXml(line).tags) {
    if (tag.kind === 'open')
      delta++
    else if (tag.kind === 'close')
      delta--
  }
  return delta
}

/** 选区覆盖的整行范围:结束位置正好在行首时不含该行 */
export function selectionLineBounds(text: string, startOffset: number, endOffset: number): { start: number, end: number } {
  const start = text.lastIndexOf('\n', Math.max(0, startOffset - 1)) + 1
  let end: number
  if (endOffset > 0 && text[endOffset - 1] === '\n') {
    end = endOffset - 1
  }
  else {
    const nextBreak = text.indexOf('\n', endOffset)
    end = nextBreak === -1 ? text.length : nextBreak
  }
  return { start, end: Math.max(start, end) }
}

/** 重新缩进 [startOffset, endOffset] 覆盖的整行 */
export function reindentLines(text: string, startOffset: number, endOffset: number, indentation: string): ReindentResult {
  const { start: lineStart, end: lineEnd } = selectionLineBounds(text, startOffset, endOffset)
  const block = text.slice(lineStart, lineEnd)
  if (!block.trim())
    return { text: block, changed: false }

  const skipped = scanXml(text).skipped
  const lines = block.split('\n')
  let depth = depthAt(text, lineStart)
  let consumed = 0

  const out = lines.map((line) => {
    const lineOffset = lineStart + consumed
    consumed += line.length + 1
    const trimmed = line.trim()
    if (!trimmed)
      return ''
    // 注释 / CDATA 内部保持原样
    if (skipped.some(region => lineOffset > region.start && lineOffset < region.end))
      return line
    const lineDepth = trimmed.startsWith('</') ? Math.max(0, depth - 1) : depth
    depth = Math.max(0, depth + netDepthDelta(trimmed))
    return indentation.repeat(Math.max(0, lineDepth)) + trimmed
  })

  const result = out.join('\n')
  return { text: result, changed: result !== block }
}

/** 按括号层级重新缩进 <action> 正文(不重排语句;JS 动作不动) */
export function reindentActionBodies(text: string, indentation: string): string {
  const edits: Array<{ start: number, end: number, text: string }> = []
  const actionRe = /<action\b([^>]*)>([\s\S]*?)<\/action>/g
  for (const match of text.matchAll(actionRe)) {
    const typeMatch = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(match[1])
    const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? '').toLowerCase()
    if (type === 'javascript' || type === 'js')
      continue
    const body = match[2]
    if (!body.includes('\n'))
      continue
    const bodyStart = match.index! + match[0].indexOf(body)
    const tagLineStart = text.lastIndexOf('\n', match.index!) + 1
    const tagIndent = /^[ \t]*/.exec(text.slice(tagLineStart, match.index!))?.[0] ?? ''
    const baseIndent = tagIndent + indentation

    const lines = body.split('\n')
    let depth = 0
    const rendered = lines.map((line) => {
      const trimmed = line.trim()
      if (!trimmed)
        return ''
      const startsWithClose = trimmed.startsWith(')')
      const lineDepth = startsWithClose ? Math.max(0, depth - 1) : depth
      for (const char of trimmed) {
        if (char === '(')
          depth++
        else if (char === ')')
          depth = Math.max(0, depth - 1)
      }
      return baseIndent + indentation.repeat(lineDepth) + trimmed
    })
    const newBody = rendered.join('\n')
    if (newBody !== body)
      edits.push({ start: bodyStart, end: bodyStart + body.length, text: newBody })
  }

  let out = text
  for (const edit of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return out
}
