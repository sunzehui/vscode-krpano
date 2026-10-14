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
  /** 所属容器:scene 的名字(不在 scene 内时为空),用于区分不同 scene 的同名定义 */
  container?: string
}

/** include 目标(供 url 处的跳转) */
export interface IncludeTarget {
  url: string
  range: PlainRange
  uri: string
}

/** 当前文件之外(include 链)的上下文 */
export interface ProjectContext {
  /** 其它文件中定义的名字 → 定义位置 */
  externalDefinitions?: Map<string, ExternalDefinition>
  /** 无法解析的 <include url="..."> 目标 */
  unresolvedIncludes?: Array<{ url: string, range: PlainRange }>
  /** 已解析的 include 目标(给出目标文件 uri,供跳转) */
  includeTargets?: IncludeTarget[]
  /** 当前文档目录下可用的 xml 文件名(供 include url 补全) */
  siblingXmlFiles?: string[]
}

/** 诊断相关的可配置项(来自 krpano.lsp.* 设置) */
export interface DiagnosticSettings {
  /** 未定义动作引用的级别;off 表示不提示 */
  undefinedActions?: 'information' | 'warning' | 'off'
  /** 不再提示的名字(动作、元素、style、scene) */
  ignoredNames?: string[]
  /** 是否提示未知属性(默认开启) */
  unknownAttributes?: boolean
  /** 是否提示属性与声明版本不匹配 / 可能已废弃(默认开启) */
  versionMismatch?: boolean
  /** 界面语言(诊断与提示文案):zh 开头用中文,其余英文 */
  locale?: string
}
