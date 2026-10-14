'use strict'
import type { xmlOptions as xmlOptionsType } from './types/options'
import xmlFormat from 'xml-formatter'
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
  }

  // 空文档没有格式化的意义,也不应作为解析失败提示
  if (originalText.trim() === '')
    return { text: originalText, failed: false }

  try {
    const formatted = xmlFormat(originalText, options)
    return { text: formatted, failed: false, structureChanged: signaturesDiffer(originalText, formatted) }
  }
  catch (e: any) {
    if (options.handleRootNode && e?.message?.includes('Found multiple root nodes')) {
      // 缺少 krpano 根节点时自动补上;XML 声明必须留在文件最前,不能包进根节点
      const prolog = XML_PROLOG.exec(originalText)
      const body = prolog ? originalText.slice(prolog[0].length) : originalText
      try {
        const formatted = xmlFormat(`<krpano>${body}</krpano>`, options)
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
