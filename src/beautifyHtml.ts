'use strict'
import xmlFormat from 'xml-formatter'
import { xmlOptions as xmlOptionsType } from './types/options'

export function beautify(originalText: string, xmlOptions: xmlOptionsType) {
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
  try {
    return xmlFormat(`${originalText}`, options)
  }
  catch (e: any) {
    if (options.handleRootNode) {
      // 不存在根节点krapno，自动添加
      if (e?.message.includes('Found multiple root nodes'))
        return xmlFormat(`<krpano>${originalText}</krpano>`, options)
    }
    return originalText
  }
}
