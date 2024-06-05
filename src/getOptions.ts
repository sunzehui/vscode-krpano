'use strict'
import { xmlOptions } from './types/options'

export default function getOptions(config: any): xmlOptions {
  let indenation = config?.xml?.format.indentation
  if (indenation === undefined)
    indenation = ' '.repeat(config.editor.tabSize)

  const options: xmlOptions = {
    // xml 格式化选项
    ignoredPaths: config?.xml?.format.ignoredPaths,
    indentation: indenation,
    collapseContent: config?.xml?.format.collapseContent,
    lineSeparator: config?.xml?.format.lineSeparator,
    whiteSpaceAtEndOfSelfclosingTag: config?.xml?.format.whiteSpaceAtEndOfSelfclosingTag,
    forceSelfClosingEmptyTag: config?.xml?.format.forceSelfClosingEmptyTag,
    // 自定义选项
    handleRootNode: config?.xml?.format.handleRootNode,
  }

  return options
}
