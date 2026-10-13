'use strict'
import type { xmlOptions } from './types/options'

export default function getOptions(config: any): xmlOptions {
  const xmlFormat = config?.xml?.format ?? {}
  const editor = config?.editor ?? {}
  const tabSize = Number.isInteger(editor.tabSize) && editor.tabSize > 0 ? editor.tabSize : 4
  // 缩进只由 xml.format.indentation 与 editor.tabSize/insertSpaces 决定,未配置时与 VS Code 默认(空格、tabSize)一致
  const indentation = xmlFormat.indentation ?? (editor.insertSpaces === false ? '\t' : ' '.repeat(tabSize))

  return {
    // xml 格式化选项
    ignoredPaths: xmlFormat.ignoredPaths,
    indentation,
    collapseContent: xmlFormat.collapseContent,
    lineSeparator: xmlFormat.lineSeparator,
    whiteSpaceAtEndOfSelfclosingTag: xmlFormat.whiteSpaceAtEndOfSelfclosingTag,
    forceSelfClosingEmptyTag: xmlFormat.forceSelfClosingEmptyTag,
    // 自定义选项
    handleRootNode: xmlFormat.handleRootNode,
  }
}
