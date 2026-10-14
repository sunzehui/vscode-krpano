'use strict'
import type { xmlOptions } from './types/options'

/** editorOverride 来自格式化请求携带的 FormattingOptions(优先于工作区配置) */
export default function getOptions(config: any, editorOverride?: { tabSize?: number, insertSpaces?: boolean }): xmlOptions {
  const xmlFormat = config?.xml?.format ?? {}
  const editor = { ...(config?.editor ?? {}), ...(editorOverride ?? {}) }
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
