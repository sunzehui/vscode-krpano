'use strict'
import type { xmlOptions } from './types/options'

export default function getOptions(config: any): xmlOptions {
  const xmlFormat = config?.xml?.format ?? {}
  const editor = config?.editor ?? {}
  const tabSize = Number.isInteger(editor.tabSize) && editor.tabSize > 0 ? editor.tabSize : 4
  // 缩进优先级:xml.format.indentation(留空视为未设置)> editor.insertSpaces/tabSize
  const configured = typeof xmlFormat.indentation === 'string' && xmlFormat.indentation !== ''
    ? xmlFormat.indentation
    : undefined
  const indentation = configured ?? (editor.insertSpaces === false ? '\t' : ' '.repeat(tabSize))

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
    attributeLayout: xmlFormat.attributeLayout,
    actionIndentation: xmlFormat.actionIndentation,
    scriptStatements: xmlFormat.scriptStatements,
  }
}
