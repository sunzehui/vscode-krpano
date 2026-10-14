'use strict'
import type { xmlOptions as xmlOptionsType } from './types/options'
import xmlFormat from 'xml-formatter'
import { applyAttributeLayout } from './shared/layout'
import { reindentActionBodies } from './shared/reindent'
import { signaturesDiffer } from './shared/xml'

export interface BeautifyResult {
  text: string
  failed: boolean
  /** 解析失败的原因(来自 xml-formatter),用于提示用户 */
  reason?: string
  /** 格式化改变了标签结构(未闭合/错配标签被容错修复),调用方应提示用户 */
  structureChanged?: boolean
}

const XML_PROLOG = /^\s*<\?xml[^>]*\?>/
const FORMAT_OFF = /<!--\s*krpano-lang-format:\s*off\s*-->/
const FORMAT_ON = /<!--\s*krpano-lang-format:\s*on\s*-->/

interface ProtectedRegions {
  text: string
  regions: Array<{ token: string, content: string }>
}

/** 把 `<!-- krpano-lang-format: off -->` … `on` 之间的内容替换成占位文本,格式化后再原样放回 */
function protectFormatOffRegions(text: string): ProtectedRegions {
  const regions: ProtectedRegions['regions'] = []
  let out = ''
  let cursor = 0
  let counter = 0
  for (;;) {
    const offMatch = FORMAT_OFF.exec(text.slice(cursor))
    if (!offMatch)
      break
    const contentStart = cursor + offMatch.index + offMatch[0].length
    const onMatch = FORMAT_ON.exec(text.slice(contentStart))
    if (!onMatch)
      break // 没有配对的 on:后面的内容不保护
    const contentEnd = contentStart + onMatch.index
    const token = `KRPANO_FORMAT_OFF_${counter++}`
    regions.push({ token, content: text.slice(contentStart, contentEnd) })
    out += text.slice(cursor, contentStart) + token
    cursor = contentEnd
  }
  out += text.slice(cursor)
  return { text: out, regions }
}

function restoreFormatOffRegions(text: string, protectedRegions: ProtectedRegions): string {
  let out = text
  for (const region of protectedRegions.regions)
    out = out.replace(region.token, () => region.content)
  return out
}

export function beautify(originalText: string, xmlOptions: xmlOptionsType): BeautifyResult {
  const options: xmlOptionsType = {
    indentation: xmlOptions.indentation || '  ',
    collapseContent: xmlOptions.collapseContent !== undefined ? xmlOptions.collapseContent : true,
    ignoredPaths: xmlOptions.ignoredPaths || ['action'],
    lineSeparator: xmlOptions.lineSeparator || '\n',
    handleRootNode: xmlOptions.handleRootNode !== undefined ? xmlOptions.handleRootNode : true,
    forceSelfClosingEmptyTag: xmlOptions.forceSelfClosingEmptyTag,
    throwOnFailure: true,
    whiteSpaceAtEndOfSelfclosingTag: xmlOptions.whiteSpaceAtEndOfSelfclosingTag,
    attributeLayout: xmlOptions.attributeLayout,
    actionIndentation: xmlOptions.actionIndentation,
  }

  const applyPostProcessing = (formatted: string): string => {
    let result = formatted
    if (options.attributeLayout && options.attributeLayout !== 'preserve')
      result = applyAttributeLayout(result, options.attributeLayout, options.indentation || '  ')
    if (options.actionIndentation)
      result = reindentActionBodies(result, options.indentation || '  ')
    return result
  }

  // 空文档没有格式化的意义,也不应作为解析失败提示
  if (originalText.trim() === '')
    return { text: originalText, failed: false }

  try {
    const protectedRegions = protectFormatOffRegions(originalText)
    const formatted = applyPostProcessing(restoreFormatOffRegions(xmlFormat(protectedRegions.text, options), protectedRegions))
    return { text: formatted, failed: false, structureChanged: signaturesDiffer(originalText, formatted) }
  }
  catch (e: any) {
    if (options.handleRootNode && e?.message?.includes('Found multiple root nodes')) {
      // 缺少 krpano 根节点时自动补上;XML 声明必须留在文件最前,不能包进根节点
      const prolog = XML_PROLOG.exec(originalText)
      const body = prolog ? originalText.slice(prolog[0].length) : originalText
      try {
        const protectedRegions = protectFormatOffRegions(body)
        const formatted = applyPostProcessing(restoreFormatOffRegions(xmlFormat(`<krpano>${protectedRegions.text}</krpano>`, options), protectedRegions))
        // 补根本身会新增一层 krpano 标签,不做结构差异比较
        return { text: prolog ? `${prolog[0].trim()}\n${formatted}` : formatted, failed: false }
      }
      catch {
        // 补根后仍无法解析,按失败处理
      }
    }
    return {
      text: originalText,
      failed: true,
      reason: typeof e?.message === 'string' ? e.message : undefined,
    }
  }
}
