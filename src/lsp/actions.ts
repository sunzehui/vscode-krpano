import type { Locale } from './messages'
import type { PlainRange, ProjectContext } from './types'
import { offsetToPosition, scanXml, tagAtOffset } from '../shared/xml'
import {
  findDuplicateDefinitions,
  findUndefinedReferences,
  krpanoAttributes,
  krpanoCustomAttributeElements,
  krpanoSpecialAttributes,
} from './features'
// 快速修复(Code Actions):针对诊断给出可一键应用的修改。
// 纯逻辑:只计算编辑内容,由服务器翻译成 LSP 的 WorkspaceEdit。
import krpanoData from './krpanoData.json'
import { messagesFor } from './messages'
import { collectReferences } from './references'
import { collectDefinitions } from './symbols'

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
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }).fill(0) as number[])
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
export function getCodeActions(text: string, range: PlainRange, context: ProjectContext = {}, locale?: Locale): PlainCodeAction[] {
  const actions: PlainCodeAction[] = []
  const t = messagesFor(locale)
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
        actions.push({ title: t.changeToTag(suggestion), edit: { changes: [{ edits }] } })
      }
    }

    // 2) action 上的 lang 属性 → 官方 type 写法
    if (tag.name.toLowerCase() === 'action') {
      const langAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'lang')
      const value = langAttr?.value?.toLowerCase()
      if (langAttr && langAttr.valueStart !== undefined && langAttr.valueEnd !== undefined) {
        if (value === 'ts' || value === 'typescript') {
          actions.push({
            title: t.changeToJavascript,
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
            title: t.removeLangAttribute,
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
        title: t.createAction(reference.name),
        edit: { changes: [{ edits: [insert] }] },
      })
    }
  }

  // 4) 重复的 name → 改名(光标落在该定义的标签内即可)
  for (const duplicate of findDuplicateDefinitions(text)) {
    // 定义标签:name 属性的位置与诊断报告的位置一致
    const definitionTag = scan.tags.find((item) => {
      const nameAttr = item.attributes.find(attr => attr.name.toLowerCase() === 'name')
      if (nameAttr?.value !== duplicate.name || nameAttr.valueStart === undefined)
        return false
      const position = offsetToPosition(text, nameAttr.valueStart)
      return position.line === duplicate.range.start.line && position.character === duplicate.range.start.character
    })
    const withinDefinition = !!definitionTag && offset >= definitionTag.start && offset <= definitionTag.end
    if (!withinDefinition && !inRange(text, duplicate.range, offset))
      continue
    // 候选名不能与文件里任何已有名字冲突(不只是重名的那几个)
    const usedNames = new Set(collectDefinitions(text).map(item => item.name))
    let candidate = `${duplicate.name}_2`
    let index = 3
    while (usedNames.has(candidate)) {
      candidate = `${duplicate.name}_${index}`
      index++
    }
    // 同一容器(scene)内的同名引用很可能指向这个定义,一并改名;标题里说明这一启发式
    const containerRange = duplicate.container ? findElementRange(text, 'scene', duplicate.container) : undefined
    const related = collectReferences(text).filter((reference) => {
      if (reference.name !== duplicate.name)
        return false
      return containerRange ? rangeContains(containerRange, reference.range) : true
    })
    const edits: PlainTextEdit[] = [
      { range: duplicate.range, newText: candidate },
      ...related.map(reference => ({ range: reference.range, newText: candidate })),
    ]
    const scope = duplicate.container ? t.renameScopeScene : t.renameScopeFile
    actions.push({
      title: t.renameDuplicate(scope, candidate),
      edit: { changes: [{ edits }] },
    })
  }

  // 6) 未知属性 → 建议最接近的属性名
  if (tag) {
    const element = tag.name.toLowerCase()
    const documented = krpanoAttributes[element]
    if (documented && !krpanoCustomAttributeElements.has(element)) {
      const unknown = tag.attributes.filter(attr =>
        !documented.includes(attr.name.toLowerCase())
        && !krpanoSpecialAttributes.includes(attr.name.toLowerCase())
        && attr.valueStart !== undefined,
      )
      const target = unknown.find(attr => offset >= attr.nameStart && offset <= attr.nameEnd) ?? (unknown.length === 1 ? unknown[0] : undefined)
      if (target) {
        const suggestion = closestAttribute(documented, target.name)
        if (suggestion) {
          actions.push({
            title: t.changeAttribute(suggestion),
            edit: { changes: [{ edits: [{ range: rangeOf(text, target.nameStart, target.nameEnd), newText: suggestion }] }] },
          })
        }
      }
    }
  }

  // 7) 提取为 style:把标签样式类属性抽到 <style>,标签保留 name/定位属性
  if (tag && ['hotspot', 'layer', 'plugin'].includes(tag.name.toLowerCase()) && tag.attributes.length >= 3 && tag.kind !== 'close') {
    const keep = new Set(['name', 'ath', 'atv', 'x', 'y', 'align', 'edge'])
    const extractable = tag.attributes.filter(attr => !keep.has(attr.name.toLowerCase()) && attr.valueEnd !== undefined)
    if (extractable.length >= 2) {
      const styleName = nextFreeName(text, 'style', `${tag.name.toLowerCase()}_style`)
      const styleAttributes = extractable
        .map(attr => `${attr.name}="${attr.value ?? ''}"`)
        .join(' ')
      const styleLine = `\t<style name="${styleName}" ${styleAttributes}/>\n`
      const insertAt = insertBeforeClosingRoot(text)
      const remainingNames = tag.attributes.filter(attr => !extractable.includes(attr))
      // 保留属性原文:无值属性(如开关属性)不能被重写成 name=""
      const rendered = remainingNames
        .map(attr => text.slice(attr.nameStart, attr.valueEnd !== undefined ? attr.valueEnd + (attr.quote ? 1 : 0) : attr.nameEnd))
        .join(' ')
      actions.push({
        title: t.extractStyle(styleName),
        edit: {
          changes: [{
            edits: [
              { range: rangeOf(text, insertAt, insertAt), newText: styleLine },
              {
                range: rangeOf(text, tag.attributes[0].nameStart, tag.end - (tag.kind === 'self' ? 2 : 1)),
                newText: `${rendered} style="${styleName}"`,
              },
            ],
          }],
        },
      })
    }
  }

  // 8) 提取为 action:把选中的脚本片段抽成新 action,原位置替换为调用
  if (range.start.line !== range.end.line || range.start.character !== range.end.character) {
    const startOffset = offsetAtPosition(text, range.start)
    const endOffset = offsetAtPosition(text, range.end)
    const inner = text.slice(startOffset, endOffset)
    if (inner.trim() && isInsideActionBody(text, startOffset) && !inner.includes('</action>')) {
      const actionName = nextFreeName(text, 'action', 'extracted_action')
      const insertAt = insertBeforeClosingRoot(text)
      const indentedBody = inner.split('\n').map(line => (line.trim() ? `\t\t${line.trim()}` : '')).join('\n')
      actions.push({
        title: t.extractAction(actionName),
        edit: {
          changes: [{
            edits: [
              { range: rangeOf(text, insertAt, insertAt), newText: `\t<action name="${actionName}">\n${indentedBody}\n\t</action>\n` },
              { range: { start: range.start, end: range.end }, newText: `${actionName}();` },
            ],
          }],
        },
      })
    }
  }

  // 5) include 目标缺失 → 新建文件(只对调用方确认解析不到的目标提供)
  if (tag && tag.name.toLowerCase() === 'include') {
    const urlAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'url')
    const url = urlAttr?.value?.trim()
    const unresolved = url && isLocalUrl(url) && (context.unresolvedIncludes ?? []).some(item => item.url.trim() === url)
    if (unresolved) {
      actions.push({
        title: t.createFile(url),
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

/** 与给定名字最接近的已文档化属性名(编辑距离 ≤ 2) */
function closestAttribute(documented: string[], name: string): string | undefined {
  const lower = name.toLowerCase()
  let best: string | undefined
  let bestDistance = 3
  for (const candidate of documented) {
    if (candidate === lower)
      continue
    const distance = editDistance(lower, candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best
}

/** 找到某个带 name 的元素(如 scene)在文本中的整体范围 */
function findElementRange(text: string, element: string, name: string): PlainRange | undefined {
  const tags = scanXml(text).tags
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]
    if (tag.kind !== 'open' || tag.name.toLowerCase() !== element)
      continue
    const nameAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'name')
    if (nameAttr?.value !== name)
      continue
    let depth = 0
    for (let j = i; j < tags.length; j++) {
      if (tags[j].kind === 'open' && tags[j].name.toLowerCase() === element) {
        depth++
      }
      else if (tags[j].kind === 'close' && tags[j].name.toLowerCase() === element) {
        depth--
        if (depth === 0)
          return rangeOf(text, tag.start, tags[j].end)
      }
    }
    return rangeOf(text, tag.start, tag.end)
  }
  return undefined
}

/** a 是否完整包含 b */
function rangeContains(a: PlainRange, b: PlainRange): boolean {
  const startsBefore = a.start.line < b.start.line || (a.start.line === b.start.line && a.start.character <= b.start.character)
  const endsAfter = a.end.line > b.end.line || (a.end.line === b.end.line && a.end.character >= b.end.character)
  return startsBefore && endsAfter
}

/** 生成一个未被占用的名字(style / action 提取用) */
function nextFreeName(text: string, element: string, base: string): string {
  const existing = new Set(collectDefinitions(text).filter(definition => definition.element === element).map(definition => definition.name))
  if (!existing.has(base))
    return base
  for (let index = 2; index < 100; index++) {
    const candidate = `${base}_${index}`
    if (!existing.has(candidate))
      return candidate
  }
  return `${base}_x`
}

/** 插入位置:最后一个 </krpano> 之前;没有根节点时放在文本末尾 */
function insertBeforeClosingRoot(text: string): number {
  const closeIndex = text.lastIndexOf('</krpano>')
  if (closeIndex === -1)
    return text.length
  return text.lastIndexOf('\n', closeIndex - 1) + 1
}

/** 偏移是否位于 <action> 正文内(krpano 脚本) */
function isInsideActionBody(text: string, offset: number): boolean {
  const stack: string[] = []
  let inside = false
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
    inside = stack.includes('action')
  }
  return inside
}
