'use strict'
import xmlFormat from 'xml-formatter'
import type { xmlOptions as xmlOptionsType } from './types/options'

export interface BeautifyResult {
  text: string
  failed: boolean
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
    return { text: xmlFormat(originalText, options), failed: false }
  }
  catch (e: any) {
    if (options.handleRootNode && e?.message?.includes('Found multiple root nodes')) {
      // 缺少 krpano 根节点时自动补上;XML 声明必须留在文件最前,不能包进根节点
      const prolog = XML_PROLOG.exec(originalText)
      const body = prolog ? originalText.slice(prolog[0].length) : originalText
      try {
        const formatted = xmlFormat(`<krpano>${body}</krpano>`, options)
        return { text: prolog ? `${prolog[0].trim()}\n${formatted}` : formatted, failed: false }
      }
      catch {
        // 补根后仍无法解析,按失败处理
      }
    }
    return { text: originalText, failed: true }
  }
}
