import type { PlainRange, ProjectContext } from './types'
import { offsetToPosition, scanXml, tagAtOffset } from '../shared/xml'
import { findDuplicateDefinitions, findUndefinedReferences } from './features'
// 快速修复(Code Actions):针对诊断给出可一键应用的修改。
// 纯逻辑:只计算编辑内容,由服务器翻译成 LSP 的 WorkspaceEdit。
import krpanoData from './krpanoData.json'

export interface PlainTextEdit {
  range: PlainRange
  newText: string
}

export interface PlainCodeAction {
  title: string
  edit: {
    changes: Array<{ uri?: string, edits: PlainTextEdit[] }>
    /** 需要新建的文件(相对当前文档的 url 与初始内容) */
    createFile?: { url: string, content: string }
  }
}

interface KrpanoData {
  elements: Record<string, string[]>
}

const elementNames = Object.keys((krpanoData as unknown as KrpanoData).elements)

function rangeOf(text: string, start: number, end: number): PlainRange {
  return { start: offsetToPosition(text, start), end: offsetToPosition(text, end) }
}

function offsetOf(text: string, offset: number): { line: number, character: number } {
  return offsetToPosition(text, offset)
}

function inRange(text: string, range: PlainRange, offset: number): boolean {
  const position = offsetOf(text, offset)
  const { start, end } = range
  return (position.line > start.line || (position.line === start.line && position.character >= start.character))
    && (position.line < end.line || (position.line === end.line && position.character <= end.character))
}

/** 简单的编辑距离,用于"是不是想写 xxx"的建议 */
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }).fill(0))
  for (let i = 0; i <= a.length; i++)
    dp[i][0] = i
  for (let j = 0; j <= b.length; j++)
    dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  }
  return dp[a.length][b.length]
}

/** 找出与给定名字最接近的已知元素名 */
function closestElement(name: string): string | undefined {
  let best: string | undefined
  let bestDistance = 3
  for (const candidate of elementNames) {
    const distance = editDistance(name.toLowerCase(), candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best
}

/** 找到与某个开始标签配对的结束标签标签名范围 */
function findClosingTagName(text: string, openTagStart: number): PlainRange | undefined {
  const tags = scanXml(text).tags
  let depth = 0
  let started = false
  for (const tag of tags) {
    if (tag.start === openTagStart) {
      started = true
      depth = 1
      continue
    }
    if (!started)
      continue
    if (tag.kind === 'open') {
      depth++
    }
    else if (tag.kind === 'close') {
      depth--
      if (depth === 0)
        return rangeOf(text, tag.nameStart, tag.nameEnd)
    }
  }
  return undefined
}

/** 计算可用的快速修复 */
export function getCodeActions(text: string, range: PlainRange, context: ProjectContext = {}): PlainCodeAction[] {
  const actions: PlainCodeAction[] = []
  const scan = scanXml(text)
  const offset = offsetAtPosition(text, range.start)
  const tag = tagAtOffset(scan, offset)

  // 1) 未知元素 → 建议最接近的元素名
  if (tag) {
    const name = tag.name
    if (!elementNames.includes(name.toLowerCase()) && !isInsideFreeForm(text, scan, tag.start)) {
      const suggestion = closestElement(name)
      if (suggestion) {
        const edits: PlainTextEdit[] = [{ range: rangeOf(text, tag.nameStart, tag.nameEnd), newText: suggestion }]
        if (tag.kind === 'open') {
          const closing = findClosingTagName(text, tag.start)
          if (closing)
            edits.push({ range: closing, newText: suggestion })
        }
        actions.push({ title: `Change to <${suggestion}>`, edit: { changes: [{ edits }] } })
      }
    }

    // 2) action 上的 lang 属性 → 官方 type 写法
    if (tag.name.toLowerCase() === 'action') {
      const langAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'lang')
      const value = langAttr?.value?.toLowerCase()
      if (langAttr && langAttr.valueStart !== undefined && langAttr.valueEnd !== undefined) {
        if (value === 'ts' || value === 'typescript') {
          actions.push({
            title: `Change to type="Javascript"`,
            edit: {
              changes: [{
                edits: [{
                  range: rangeOf(text, langAttr.nameStart, (langAttr.valueEnd ?? langAttr.nameEnd) + (langAttr.quote ? 1 : 0)),
                  newText: `type=${langAttr.quote ?? '"'}Javascript${langAttr.quote ?? '"'}`,
                }],
              }],
            },
          })
        }
        else {
          actions.push({
            title: `Remove the unsupported lang attribute`,
            edit: {
              changes: [{
                edits: [{
                  range: rangeOf(text, langAttr.nameStart, (langAttr.valueEnd ?? langAttr.nameEnd) + (langAttr.quote ? 1 : 0)),
                  newText: '',
                }],
              }],
            },
          })
        }
      }
    }
  }

  // 3) 未定义的动作调用 → 生成 action 骨架
  for (const reference of findUndefinedReferences(text, context)) {
    if (!inRange(text, reference.range, offset))
      continue
    if (reference.form !== 'call')
      continue
    const insert = buildActionSkeleton(text, reference.name)
    if (insert) {
      actions.push({
        title: `Create action "${reference.name}"`,
        edit: { changes: [{ edits: [insert] }] },
      })
    }
  }

  // 4) 重复的 name → 改名(光标落在该定义的标签内即可)
  for (const duplicate of findDuplicateDefinitions(text)) {
    const definitionTag = scan.tags.find((item) => {
      const nameAttr = item.attributes.find(attr => attr.name.toLowerCase() === 'name')
      return nameAttr?.valueStart === `${duplicate.range.start.line}:${duplicate.range.start.character}`.length - 1 + (nameAttr?.valueStart ?? -1)
        ? true
        : nameAttr?.value === duplicate.name && nameAttr.valueStart !== undefined
          && offsetToPosition(text, nameAttr.valueStart).line === duplicate.range.start.line
          && offsetToPosition(text, nameAttr.valueStart).character === duplicate.range.start.character
    })
    const withinDefinition = !!definitionTag && offset >= definitionTag.start && offset <= definitionTag.end
    if (!withinDefinition && !inRange(text, duplicate.range, offset))
      continue
    const usedNames = new Set(findDuplicateDefinitions(text).map(item => item.name))
    let candidate = `${duplicate.name}_2`
    let index = 3
    while (usedNames.has(candidate)) {
      candidate = `${duplicate.name}_${index}`
      index++
    }
    actions.push({
      title: `Rename this duplicate to "${candidate}"`,
      edit: { changes: [{ edits: [{ range: duplicate.range, newText: candidate }] }] },
    })
  }

  // 5) include 目标缺失 → 新建文件(只对调用方确认解析不到的目标提供)
  if (tag && tag.name.toLowerCase() === 'include') {
    const urlAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'url')
    const url = urlAttr?.value?.trim()
    const unresolved = url && isLocalUrl(url) && (context.unresolvedIncludes ?? []).some(item => item.url === url)
    if (unresolved) {
      actions.push({
        title: `Create file "${url}"`,
        edit: { changes: [{ edits: [] }], createFile: { url, content: '<krpano>\n\t\n</krpano>\n' } },
      })
    }
  }

  return dedupeActions(actions)
}

function dedupeActions(actions: PlainCodeAction[]): PlainCodeAction[] {
  const seen = new Set<string>()
  return actions.filter((action) => {
    if (seen.has(action.title))
      return false
    seen.add(action.title)
    return true
  })
}

function isLocalUrl(url: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('/') && !url.includes('%')
}

function isInsideFreeForm(text: string, scan: ReturnType<typeof scanXml>, tagStart: number): boolean {
  const stack: string[] = []
  for (const item of scan.tags) {
    if (item.start >= tagStart)
      break
    const name = item.name.toLowerCase()
    if (item.kind === 'open') {
      stack.push(name)
    }
    else if (item.kind === 'close') {
      const index = stack.lastIndexOf(name)
      if (index !== -1)
        stack.length = index
    }
  }
  return stack.some(name => name === 'textstyle' || name === 'cssstyles' || name === 'style')
}

/** 生成 `<action>` 骨架的插入编辑(优先插到最后一个 </krpano> 之前) */
function buildActionSkeleton(text: string, name: string): PlainTextEdit | undefined {
  const closeIndex = text.lastIndexOf('</krpano>')
  const skeleton = `\t<action name="${name}">\n\t\t\n\t</action>\n`
  if (closeIndex !== -1) {
    const lineStart = text.lastIndexOf('\n', closeIndex - 1) + 1
    return { range: rangeOf(text, lineStart, lineStart), newText: skeleton }
  }
  return { range: rangeOf(text, text.length, text.length), newText: `\n${skeleton}` }
}

/** 行列位置 → 文本偏移 */
function offsetAtPosition(text: string, position: { line: number, character: number }): number {
  let offset = 0
  let line = 0
  while (line < position.line && offset < text.length) {
    const next = text.indexOf('\n', offset)
    if (next === -1) {
      offset = text.length
      break
    }
    offset = next + 1
    line++
  }
  return Math.min(text.length, offset + position.character)
}

export { editDistance }
