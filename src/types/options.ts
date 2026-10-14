import type { XMLFormatterOptions } from 'xml-formatter'
import type { AttributeLayout } from '../shared/layout'

export type xmlOptions = XMLFormatterOptions & {
  handleRootNode: boolean
  /** 属性排版方式(默认 preserve,不做重排) */
  attributeLayout?: AttributeLayout
  /** 是否按括号层级重新缩进 action 正文(默认关闭) */
  actionIndentation?: boolean
  /** 是否把同一行里以 ";" 分隔的多条脚本语句拆到多行(默认关闭) */
  scriptStatements?: boolean
}
