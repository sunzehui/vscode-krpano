import type { ExternalDefinition, PlainRange } from './types'
// krpano 文件的符号提取与 <include> 依赖解析(纯逻辑,文件读取通过参数注入,便于测试)。
import path from 'node:path'
import { createLineIndex, memoizeByText, scanXml } from '../shared/xml'

/** 可以定义 name 的元素(其名字可被动作/事件引用) */
export const NAME_DEFINING_ELEMENTS = ['action', 'hotspot', 'layer', 'plugin', 'scene', 'style', 'events', 'data']

export interface SymbolDefinition {
  name: string
  /** 定义它的元素名(小写) */
  element: string
  /** 所属容器:scene 的名字(不在 scene 内时为空 = krpano 根) */
  container?: string
  range: PlainRange
}

export interface IncludeReference {
  /** 原始 url 属性值 */
  url: string
  range: PlainRange
}

export interface IncludeIndex {
  /** 名字 → 定义(含定义所在文件路径、定义它的元素与容器) */
  definitions: Map<string, { path: string, range: PlainRange, element: string, container?: string }>
  /** 解析不到的 include 目标 */
  unresolved: Array<{ path: string, url: string, range: PlainRange }>
  /** 沿链访问过的文件(含入口;编辑其中任一文件时用于反查受影响文档) */
  visitedPaths: string[]
}

/** 单个文件的读取结果:内容 + 版本(用于增量解析) */
export interface FileContent {
  text: string
  /** 版本标识(如 mtime:size 或 文档版本号),变化时才会重新解析 */
  version: string
}

/** 依赖注入:读取文件(找不到时返回 undefined);允许直接返回字符串(视为无版本) */
export type ReadFile = (path: string) => string | FileContent | undefined

/** 单文件的解析结果(定义与 include 引用) */
export interface ParsedFile {
  definitions: SymbolDefinition[]
  includes: IncludeReference[]
}

/** 跨次调用复用的解析缓存:路径 → { 版本, 解析结果 } */
export type ParseCache = Map<string, { version: string, parsed: ParsedFile }>

function rangeOf(lineIndex: ReturnType<typeof createLineIndex>, start: number, end: number): PlainRange {
  return { start: lineIndex.toPosition(start), end: lineIndex.toPosition(end) }
}

function collectDefinitionsParse(text: string): SymbolDefinition[] {
  const definitions: SymbolDefinition[] = []
  const stack: Array<{ element: string, name?: string }> = []
  const lineIndex = createLineIndex(text)

  const currentContainer = (): string | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].element === 'scene')
        return stack[i].name ?? ''
    }
    return undefined
  }

  for (const tag of scanXml(text).tags) {
    const element = tag.name.toLowerCase()
    if (tag.kind === 'close') {
      // 弹出匹配的祖先标签(对未闭合标签保持宽容)
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].element === element) {
          stack.length = i
          break
        }
      }
      continue
    }
    const nameAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'name')
    const name = nameAttr?.value?.trim()
    if (NAME_DEFINING_ELEMENTS.includes(element) && name && nameAttr?.valueStart !== undefined) {
      definitions.push({
        name,
        element,
        container: currentContainer(),
        range: rangeOf(lineIndex, nameAttr.valueStart, nameAttr.valueEnd ?? nameAttr.valueStart),
      })
    }
    // 只有 scene / krpano 会改变名字的作用域
    if (tag.kind === 'open' && (element === 'scene' || element === 'krpano'))
      stack.push({ element, name: name || undefined })
  }
  return definitions
}

/**
 * 收集文件中所有 name 定义(action/hotspot/layer/plugin/scene/style/events/data),
 *  并记录它所属的容器(scene 名字;不在 scene 内则为 krpano 根)。
 *  按文本缓存:同一份文档在诊断/补全/重命名等多次请求间不会重扫。
 */
export const collectDefinitions = memoizeByText(collectDefinitionsParse)

function extractIncludesParse(text: string): IncludeReference[] {
  const includes: IncludeReference[] = []
  const lineIndex = createLineIndex(text)
  for (const tag of scanXml(text).tags) {
    if (tag.name.toLowerCase() !== 'include')
      continue
    const urlAttr = tag.attributes.find(attr => attr.name.toLowerCase() === 'url')
    if (!urlAttr?.value?.trim() || urlAttr.valueStart === undefined)
      continue
    includes.push({ url: urlAttr.value, range: rangeOf(lineIndex, urlAttr.valueStart, urlAttr.valueEnd ?? urlAttr.valueStart) })
  }
  return includes
}

/** 收集 <include url="..."> 引用(按文本缓存) */
export const extractIncludes = memoizeByText(extractIncludesParse)

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
export function resolveIncludePath(fromPath: string | undefined, url: string): string | undefined {
  // 未保存的文档(untitled)没有路径,无法解析相对 include
  if (!fromPath || !isLocalRelativeUrl(url))
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
  if (/^\/[A-Z]:/i.test(path))
    path = path.slice(1)
  return path
}

/** 文件路径 → file:// URI(encodeURI 不会转义 `#`/`?`,不补上会让路径被当成 fragment/query) */
export function pathToUri(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const encoded = encodeURI(normalized).replace(/[#?]/g, char => (char === '#' ? '%23' : '%3F'))
  return `file://${encoded.startsWith('/') ? '' : '/'}${encoded}`
}

/** 解析一个文件(带缓存:版本未变则复用上次结果) */
function parseFile(path: string, content: FileContent, cache?: ParseCache): ParsedFile {
  const cached = cache?.get(path)
  if (cached && cached.version === content.version)
    return cached.parsed
  const parsed: ParsedFile = {
    definitions: collectDefinitions(content.text),
    includes: extractIncludes(content.text),
  }
  cache?.set(path, { version: content.version, parsed })
  return parsed
}

/** 沿 include 链收集定义(广度优先,带环检测、深度上限与按文件版本的增量解析) */
export function buildIncludeIndex(entryPath: string, readFile: ReadFile, maxDepth = 16, cache?: ParseCache): IncludeIndex {
  const definitions: IncludeIndex['definitions'] = new Map()
  const unresolved: IncludeIndex['unresolved'] = []
  const visited = new Set<string>()
  let frontier: Array<{ path: string, depth: number }> = [{ path: entryPath, depth: 0 }]
  while (frontier.length) {
    const next: typeof frontier = []
    for (const { path, depth } of frontier) {
      if (visited.has(path))
        continue
      visited.add(path)
      const content = readFile(path)
      if (content === undefined)
        continue
      const normalized: FileContent = typeof content === 'string' ? { text: content, version: '' } : content
      // 空版本表示调用方不提供版本信息:直接解析,不读也不写缓存
      const parsed = normalized.version === ''
        ? { definitions: collectDefinitions(normalized.text), includes: extractIncludes(normalized.text) }
        : parseFile(path, normalized, cache)
      for (const definition of parsed.definitions) {
        if (!definitions.has(definition.name))
          definitions.set(definition.name, { path, range: definition.range, element: definition.element, container: definition.container })
      }
      if (depth >= maxDepth)
        continue
      for (const include of parsed.includes) {
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

  return { definitions, unresolved, visitedPaths: [...visited] }
}

/** 把索引里"非当前文件"的定义整理成 features 需要的上下文 */
export function contextForFile(index: IncludeIndex, currentPath: string, currentUri: string): {
  externalDefinitions: Map<string, ExternalDefinition>
  unresolvedIncludes: Array<{ url: string, range: PlainRange }>
} {
  const externalDefinitions = new Map<string, ExternalDefinition>()
  for (const [name, definition] of index.definitions) {
    if (definition.path === currentPath)
      continue
    externalDefinitions.set(name, {
      uri: pathToUri(definition.path),
      range: definition.range,
      element: definition.element,
      container: definition.container,
    })
  }
  const unresolvedIncludes = index.unresolved
    .filter(item => item.path === currentPath)
    .map(item => ({ url: item.url, range: item.range }))
  void currentUri
  return { externalDefinitions, unresolvedIncludes }
}
