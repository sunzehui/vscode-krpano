// 语言服务的公共类型(纯数据,便于单元测试)。
export interface PlainRange {
  start: { line: number, character: number }
  end: { line: number, character: number }
}

export interface PlainDiagnostic {
  message: string
  severity: 'error' | 'warning' | 'information'
  range: PlainRange
  source: string
}

export interface PlainCompletion {
  label: string
  kind: 'element' | 'attribute' | 'value'
  detail: string
  documentation: string
  insertText?: string
  snippet?: boolean
}

export interface PlainHover {
  contents: string
  range: PlainRange
}

export interface PlainLocation {
  /** 定义所在文件(跨文件跳转时给出);同文件内可省略 */
  uri?: string
  range: PlainRange
}

/** include 链中其它文件里的定义 */
export interface ExternalDefinition extends PlainLocation {
  /** 定义它的元素名(小写),用于按类型补全与校验 */
  element?: string
}

/** 当前文件之外(include 链)的上下文 */
export interface ProjectContext {
  /** 其它文件中定义的名字 → 定义位置 */
  externalDefinitions?: Map<string, ExternalDefinition>
  /** 无法解析的 <include url="..."> 目标 */
  unresolvedIncludes?: Array<{ url: string, range: PlainRange }>
}
