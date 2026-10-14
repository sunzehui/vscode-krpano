import type { NameReference } from './references'
import type { SymbolDefinition } from './symbols'
import type { PlainRange } from './types'
// 工作区级 XML 索引:为查找引用、重命名与工作区符号提供跨文件数据。
// 说明:只在需要时惰性扫描(上限保护),按 mtime:size 增量刷新。
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { collectReferences } from './references'
import { collectDefinitions, pathToUri } from './symbols'

const MAX_FILES = 2000
const MAX_FILE_SIZE = 2 * 1024 * 1024
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.vscode-test', '.zcode', '.workbuddy', '.vscode'])

export interface WorkspaceFileEntry {
  path: string
  uri: string
  version: string
  definitions: SymbolDefinition[]
  references: NameReference[]
}

/** 递归收集工作区里的 xml 文件(有数量与大小上限) */
export function scanWorkspaceXmlFiles(roots: string[], maxFiles = MAX_FILES): string[] {
  const found: string[] = []
  const queue = [...roots]
  while (queue.length && found.length < maxFiles) {
    const dir = queue.shift()!
    let entries: string[]
    try {
      entries = readdirSync(dir)
    }
    catch {
      continue
    }
    for (const entry of entries) {
      if (entry.startsWith('.') && entry !== '.')
        continue
      const full = path.join(dir, entry)
      let stat
      try {
        stat = statSync(full)
      }
      catch {
        continue
      }
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(entry))
          queue.push(full)
        continue
      }
      if (entry.toLowerCase().endsWith('.xml') && stat.size <= MAX_FILE_SIZE)
        found.push(full)
    }
  }
  return found
}

/** 工作区索引:按文件缓存定义与引用,版本变化时刷新 */
export class WorkspaceIndex {
  private entries = new Map<string, WorkspaceFileEntry>()
  private scannedAt = 0

  constructor(private readFile: (path: string) => { text: string, version: string } | undefined) {}

  /** 扫描/刷新工作区(默认 60 秒内不重复扫描,除非 forced) */
  refresh(roots: string[], forced = false): void {
    if (!forced && Date.now() - this.scannedAt < 60_000)
      return
    this.scannedAt = Date.now()
    const files = new Set(scanWorkspaceXmlFiles(roots))
    // 移除已不存在的文件
    for (const known of [...this.entries.keys()]) {
      if (!files.has(known))
        this.entries.delete(known)
    }
    for (const file of files)
      this.entryFor(file)
  }

  /** 使某个文件失效(内容变化时调用) */
  invalidate(filePath: string): void {
    this.entries.delete(filePath)
  }

  /** 单个文件的索引(带版本缓存) */
  entryFor(filePath: string): WorkspaceFileEntry | undefined {
    const content = this.readFile(filePath)
    if (!content)
      return undefined
    const cached = this.entries.get(filePath)
    if (cached && cached.version === content.version)
      return cached
    const entry: WorkspaceFileEntry = {
      path: filePath,
      uri: pathToUri(filePath),
      version: content.version,
      definitions: collectDefinitions(content.text),
      references: collectReferences(content.text),
    }
    this.entries.set(filePath, entry)
    return entry
  }

  /** 文件集合(已扫描到的) */
  files(): WorkspaceFileEntry[] {
    return [...this.entries.values()]
  }

  /** 某个名字在本文件之外的定义 */
  definitionsOf(name: string, excludePath: string): Array<{ path: string, uri: string, range: PlainRange, element: string }> {
    const result: Array<{ path: string, uri: string, range: PlainRange, element: string }> = []
    for (const entry of this.entries.values()) {
      if (entry.path === excludePath)
        continue
      for (const definition of entry.definitions) {
        if (definition.name === name)
          result.push({ path: entry.path, uri: entry.uri, range: definition.range, element: definition.element })
      }
    }
    return result
  }
}
