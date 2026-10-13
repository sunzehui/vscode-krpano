// krpano 文件的符号提取与 <include> 依赖解析(纯逻辑,文件读取通过参数注入,便于测试)。
import path from 'node:path'
import { offsetToPosition, scanXml } from '../shared/xml'
import type { PlainLocation, PlainRange } from './types'

/** 可以定义 name 的元素(其名字可被动作/事件引用) */
export const NAME_DEFINING_ELEMENTS = ['action', 'hotspot', 'layer', 'plugin', 'scene', 'style', 'events', 'data']

export interface SymbolDefinition {
  name: string
  /** 定义它的元素名(小写) */
  element: string
  range: PlainRange
}

export interface IncludeReference {
  /** 原始 url 属性值 */
  url: string
  range: PlainRange
}

export interface IncludeIndex {
  /** 名字 → 定义(含定义所在文件路径) */
  definitions: Map<string, { path: string, range: PlainRange }>
  /** 解析不到的 include 目标 */
  unresolved: Array<{ path: string, url: string, range: PlainRange }>
}

/** 依赖注入:读取文件内容(找不到时返回 undefined) */
export type ReadFile = (path: string) => string | undefined

function rangeOf(text: string, start: number, end: number): PlainRange {
  return { start: offsetToPosition(text, start), end: offsetToPosition(text, end) }
}

/** 收集文件中所有 name 定义(action/hotspot/layer/plugin/scene/style/events/data) */
export function collectDefinitions(text: string): SymbolDefinition[] {
  const definitions: SymbolDefinition[] = []
  for (const tag of scanXml(text).tags) {
    const element = tag.name.toLowerCase()
    if (!NAME_DEFINING_ELEMENTS.includes(element))
      continue
    const nameAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'name')
    if (!nameAttr?.value?.trim() || nameAttr.valueStart === undefined)
      continue
    definitions.push({
      name: nameAttr.value,
      element,
      range: rangeOf(text, nameAttr.valueStart, nameAttr.valueEnd ?? nameAttr.valueStart),
    })
  }
  return definitions
}

/** 收集 <include url="..."> 引用 */
export function extractIncludes(text: string): IncludeReference[] {
  const includes: IncludeReference[] = []
  for (const tag of scanXml(text).tags) {
    if (tag.name.toLowerCase() !== 'include')
      continue
    const urlAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'url')
    if (!urlAttr?.value?.trim() || urlAttr.valueStart === undefined)
      continue
    includes.push({ url: urlAttr.value, range: rangeOf(text, urlAttr.valueStart, urlAttr.valueEnd ?? urlAttr.valueStart) })
  }
  return includes
}

/** url 是否可以在本地解析(krpano 占位符、http、绝对路径等交给 krpano 自己处理) */
export function isLocalRelativeUrl(url: string): boolean {
  if (!url || url.startsWith('/') || url.startsWith('\\'))
    return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(url))
    return false
  if (url.includes('%'))
    return false
  return true
}

/** 把 include 的 url 解析为相对当前文件的路径(归一化 . 与 ..) */
export function resolveIncludePath(fromPath: string, url: string): string | undefined {
  if (!isLocalRelativeUrl(url))
    return undefined
  const impl = fromPath.includes('\\') ? path.win32 : path.posix
  const cleaned = url.split(/[?#]/)[0]
  return impl.normalize(impl.join(impl.dirname(fromPath), cleaned))
}

/** file:// URI → 文件路径(非 file 协议返回 undefined) */
export function uriToPath(uri: string): string | undefined {
  if (!uri.startsWith('file://'))
    return undefined
  let path = decodeURIComponent(uri.slice('file://'.length))
  // Windows 形如 file:///C:/x → 去掉前导斜杠
  if (/^\/[A-Za-z]:/.test(path))
    path = path.slice(1)
  return path
}

/** 文件路径 → file:// URI */
export function pathToUri(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return `file://${normalized.startsWith('/') ? '' : '/'}${encodeURI(normalized)}`
}

/** 沿 include 链收集定义(广度优先,带环检测与深度上限) */
export function buildIncludeIndex(entryPath: string, readFile: ReadFile, maxDepth = 16): IncludeIndex {
  const definitions = new Map<string, { path: string, range: PlainRange }>()
  const unresolved: IncludeIndex['unresolved'] = []
  const visited = new Set<string>()
  let frontier: Array<{ path: string, depth: number }> = [{ path: entryPath, depth: 0 }]

  while (frontier.length) {
    const next: typeof frontier = []
    for (const { path, depth } of frontier) {
      if (visited.has(path))
        continue
      visited.add(path)
      const text = readFile(path)
      if (text === undefined)
        continue
      for (const definition of collectDefinitions(text)) {
        if (!definitions.has(definition.name))
          definitions.set(definition.name, { path, range: definition.range })
      }
      if (depth >= maxDepth)
        continue
      for (const include of extractIncludes(text)) {
        const resolved = resolveIncludePath(path, include.url)
        if (!resolved)
          continue
        if (readFile(resolved) === undefined) {
          unresolved.push({ path, url: include.url, range: include.range })
          continue
        }
        next.push({ path: resolved, depth: depth + 1 })
      }
    }
    frontier = next
  }

  return { definitions, unresolved }
}

/** 把索引里"非当前文件"的定义整理成 features 需要的上下文 */
export function contextForFile(index: IncludeIndex, currentPath: string, currentUri: string): {
  externalDefinitions: Map<string, PlainLocation>
  unresolvedIncludes: Array<{ url: string, range: PlainRange }>
} {
  const externalDefinitions = new Map<string, PlainLocation>()
  for (const [name, definition] of index.definitions) {
    if (definition.path === currentPath)
      continue
    externalDefinitions.set(name, {
      uri: pathToUri(definition.path),
      range: definition.range,
    })
  }
  const unresolvedIncludes = index.unresolved
    .filter(item => item.path === currentPath)
    .map(item => ({ url: item.url, range: item.range }))
  void currentUri
  return { externalDefinitions, unresolvedIncludes }
}
