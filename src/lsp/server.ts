import type { DocumentSymbol } from 'vscode-languageserver/node'
import type { PlainCodeAction } from './actions'
import type { OutlineSymbol } from './outline'
import type { NameAtOffset } from './references'
import type { FileContent, ParseCache } from './symbols'
import type { DiagnosticSettings, IncludeTarget, PlainLocation, ProjectContext } from './types'
// krpano XML 语言服务器(LSP):诊断、补全、悬停、跳转。
// 作为独立进程由 vscode-languageclient 以 IPC 传输启动(见 client.ts)。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { TextDocument } from 'vscode-languageserver-textdocument'
import {
  CodeAction,
  CompletionItemKind,
  createConnection,
  CreateFile,
  DiagnosticSeverity,
  InsertTextFormat,
  MarkupKind,
  Position,
  ProposedFeatures,
  SymbolInformation,
  SymbolKind,
  TextDocumentEdit,
  TextDocuments,
  TextDocumentSyncKind,
  TextEdit,
} from 'vscode-languageserver/node'
import { looksLikeKrpanoXml } from '../shared/xml'
import { getCodeActions } from './actions'
import { getCompletions, getDefinition, getDiagnostics, getHover, getSignatureHelp } from './features'
import { localeOf } from './messages'
import { getDocumentSymbols } from './outline'
import { collectReferences, nameAtOffset } from './references'
import { buildIncludeIndex, collectDefinitions, contextForFile, extractIncludes, pathToUri, resolveIncludePath, uriToPath } from './symbols'
import { WorkspaceIndex } from './workspace'

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

/** 磁盘文件缓存(已打开的文档直接取内存文本) */
const fileCache = new Map<string, { mtimeMs: number, size: number, text: string }>()

/** 按文件版本复用的解析缓存:文件没变就不会重新解析 */
const parseCache: ParseCache = new Map()

const SYMBOL_KINDS: Record<OutlineSymbol['kind'], SymbolKind> = {
  file: SymbolKind.File,
  module: SymbolKind.Module,
  namespace: SymbolKind.Namespace,
  class: SymbolKind.Class,
  method: SymbolKind.Method,
  property: SymbolKind.Property,
  field: SymbolKind.Field,
  object: SymbolKind.Object,
}

/** 文档大纲 → LSP DocumentSymbol */
function toSymbolInformation(symbol: OutlineSymbol): DocumentSymbol {
  return {
    name: symbol.name,
    detail: symbol.detail,
    kind: SYMBOL_KINDS[symbol.kind],
    range: symbol.range,
    selectionRange: symbol.selectionRange,
    children: symbol.children.length ? symbol.children.map(toSymbolInformation) : undefined,
  }
}

/** 工作区根目录(来自 initialize 的 workspaceFolders) */
let workspaceRoots: string[] = []
/** 客户端界面语言(来自 initializationOptions.locale) */
let clientLocale = 'en'
let workspaceIndex: WorkspaceIndex | undefined

function getWorkspaceIndex(): WorkspaceIndex {
  workspaceIndex ??= new WorkspaceIndex(readFileCached)
  return workspaceIndex
}

/** 一个文件里某个名字的定义与引用位置 */
interface NameOccurrences {
  uri: string
  definitions: PlainLocation['range'][]
  references: PlainLocation['range'][]
}

/** 名字在 当前文档 + 工作区其它文件 中的定义与引用(查找引用与重命名共用) */
function nameLocations(document: TextDocument, target: NameAtOffset): NameOccurrences[] {
  const text = document.getText()
  const currentPath = uriToPath(document.uri)
  const grouped = new Map<string, NameOccurrences>()
  const entryFor = (uri: string): NameOccurrences => {
    let entry = grouped.get(uri)
    if (!entry) {
      entry = { uri, definitions: [], references: [] }
      grouped.set(uri, entry)
    }
    return entry
  }

  // 光标落在定义上时只算光标的那个定义(同名定义在别的 scene 里时不会被牵连);
  // 落在引用上时按名字补上本文件的定义 —— 引用不记录所属容器,无法更精确地对应
  const local = entryFor(document.uri)
  local.definitions.push(...(target.kind === 'definition'
    ? [target.range]
    : collectDefinitions(text).filter(definition => definition.name === target.name).map(definition => definition.range)))
  local.references.push(...collectReferences(text)
    .filter(reference => reference.name === target.name)
    .map(reference => reference.range))

  const index = getWorkspaceIndex()
  index.refresh(workspaceRoots)
  for (const entry of index.files()) {
    if (currentPath && entry.path === currentPath)
      continue
    const occurrences = entryFor(entry.uri)
    occurrences.definitions.push(...entry.definitions.filter(definition => definition.name === target.name).map(definition => definition.range))
    occurrences.references.push(...entry.references.filter(reference => reference.name === target.name).map(reference => reference.range))
  }

  return [...grouped.values()].filter(item => item.definitions.length || item.references.length)
}

/** 把纯逻辑的快速修复翻译成 LSP 的 CodeAction */
function toCodeActions(document: TextDocument, actions: PlainCodeAction[]): CodeAction[] {
  const currentPath = uriToPath(document.uri)
  const result: CodeAction[] = []
  for (const action of actions) {
    const documentChanges: Array<TextDocumentEdit | CreateFile> = []
    for (const change of action.edit.changes) {
      if (!change.edits.length)
        continue
      documentChanges.push(TextDocumentEdit.create(
        { uri: document.uri, version: document.version },
        change.edits.map(edit => TextEdit.replace(edit.range, edit.newText)),
      ))
    }
    if (action.edit.createFile) {
      const target = currentPath ? resolveIncludePath(currentPath, action.edit.createFile.url) : undefined
      if (target) {
        const uri = pathToUri(target)
        documentChanges.unshift(CreateFile.create(uri))
        documentChanges.push(TextDocumentEdit.create(
          { uri, version: null },
          [TextEdit.insert(Position.create(0, 0), action.edit.createFile.content)],
        ))
      }
    }
    if (documentChanges.length)
      result.push(CodeAction.create(action.title, { documentChanges }))
  }
  return result
}

/** krpano.lsp.* 设置(初始化与配置变化时刷新) */
interface LspConfiguration {
  diagnostics?: {
    enable?: boolean
    undefinedActions?: 'information' | 'warning' | 'off'
    ignoredNames?: string[]
    unknownAttributes?: boolean
    versionMismatch?: boolean
  }
}
let configuration: LspConfiguration = {}
let validateTimer: NodeJS.Timeout | undefined

async function refreshSettings(): Promise<void> {
  try {
    const value = await connection.workspace.getConfiguration('krpano.lsp')
    configuration = (value ?? {}) as LspConfiguration
  }
  catch {
    configuration = {}
  }
  scheduleValidateAll()
}

/** 数组加去抖:频繁输入时合并校验 */
function scheduleValidateAll(): void {
  if (validateTimer)
    clearTimeout(validateTimer)
  validateTimer = setTimeout(() => {
    validateTimer = undefined
    validateAll()
  }, 250)
}

function openDocumentContent(path: string): FileContent | undefined {
  for (const document of documents.all()) {
    if (uriToPath(document.uri) === path)
      return { text: document.getText(), version: `doc:${document.version}` }
  }
  return undefined
}

function readFileCached(path: string): FileContent | undefined {
  const open = openDocumentContent(path)
  if (open !== undefined)
    return open
  try {
    const stat = statSync(path)
    const version = `${stat.mtimeMs}:${stat.size}`
    const cached = fileCache.get(path)
    const text = cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size
      ? cached.text
      : readFileSync(path, 'utf8')
    fileCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, text })
    return { text, version }
  }
  catch {
    return undefined
  }
}

/** 当前文档的上下文:include 链的外部定义、include 目标(跳转)与同目录 xml 文件(补全) */
function projectContext(document: TextDocument): ProjectContext {
  const documentPath = uriToPath(document.uri)
  if (!documentPath)
    return {}
  const index = buildIncludeIndex(documentPath, readFileCached, 16, parseCache)
  const context = contextForFile(index, documentPath, document.uri)

  const knownUnresolved = new Set((context.unresolvedIncludes ?? []).map(item => item.url))
  const includeTargets: IncludeTarget[] = []
  for (const reference of extractIncludes(document.getText())) {
    if (knownUnresolved.has(reference.url))
      continue
    const resolved = resolveIncludePath(documentPath, reference.url)
    if (!resolved || !readFileCached(resolved))
      continue
    includeTargets.push({ url: reference.url, range: reference.range, uri: pathToUri(resolved) })
  }

  let siblingXmlFiles: string[] | undefined
  try {
    siblingXmlFiles = readdirSync(path.dirname(documentPath))
      .filter(entry => entry.toLowerCase().endsWith('.xml'))
      .slice(0, 200)
  }
  catch {
    siblingXmlFiles = undefined
  }

  return { ...context, includeTargets, siblingXmlFiles }
}

function validate(document: TextDocument): void {
  // 诊断的开关、以及"这个 .xml 是不是 krpano 文档"的前置判断:
  // 语言由 .xml 扩展名绑定,别的 XML(pom.xml、AndroidManifest.xml 等)不应收到 krpano 诊断。
  // 显式切到 krpano 脚本模式的文件按 krpano 处理,作为纯片段文件的出口。
  if (configuration.diagnostics?.enable === false
    || (document.languageId !== 'krpano' && !looksLikeKrpanoXml(document.getText()))) {
    void connection.sendDiagnostics({ uri: document.uri, diagnostics: [] })
    return
  }
  const settings: DiagnosticSettings = {
    undefinedActions: configuration.diagnostics?.undefinedActions,
    ignoredNames: configuration.diagnostics?.ignoredNames,
    unknownAttributes: configuration.diagnostics?.unknownAttributes,
    versionMismatch: configuration.diagnostics?.versionMismatch,
    locale: clientLocale,
  }
  const diagnostics = getDiagnostics(document.getText(), projectContext(document), settings).map(item => ({
    message: item.message,
    severity: item.severity === 'error'
      ? DiagnosticSeverity.Error
      : item.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Information,
    range: item.range,
    source: item.source,
  }))
  void connection.sendDiagnostics({ uri: document.uri, diagnostics })
}

/** 任一文档或 include 目标变化后,重新校验所有打开的文档 */
function validateAll(): void {
  fileCache.clear()
  for (const document of documents.all())
    validate(document)
}

connection.onInitialize(async (params) => {
  const options = params.initializationOptions as { locale?: string } | undefined
  clientLocale = options?.locale ?? 'en'
  workspaceRoots = (params.workspaceFolders ?? [])
    .map(folder => uriToPath(folder.uri))
    .filter((value): value is string => !!value)
  void refreshSettings()
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ['<', ' ', '"', '\'', '='] },
      hoverProvider: true,
      signatureHelpProvider: { triggerCharacters: ['(', ','] },
      definitionProvider: true,
    },
  }
})

connection.onDidChangeConfiguration(() => {
  void refreshSettings()
})

documents.onDidChangeContent((change) => {
  const changedPath = uriToPath(change.document.uri)
  if (changedPath)
    workspaceIndex?.invalidate(changedPath)
  scheduleValidateAll()
})

documents.onDidClose((event) => {
  void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] })
})

// 磁盘上的 xml 变化(例如编辑了 include 的动作文件)也要刷新诊断
connection.onDidChangeWatchedFiles(() => {
  workspaceIndex = undefined
  scheduleValidateAll()
})

connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return []
  const offset = document.offsetAt(params.position)
  return getCompletions(document.getText(), offset, projectContext(document)).map(item => ({
    label: item.label,
    kind: item.kind === 'element'
      ? CompletionItemKind.Class
      : item.kind === 'attribute' ? CompletionItemKind.Property : CompletionItemKind.Value,
    detail: item.detail,
    documentation: { kind: MarkupKind.Markdown, value: item.documentation },
    insertText: item.insertText ?? item.label,
    ...(item.snippet ? { insertTextFormat: InsertTextFormat.Snippet } : {}),
  }))
})

connection.onHover((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return null
  const hover = getHover(document.getText(), document.offsetAt(params.position))
  if (!hover)
    return null
  return { contents: { kind: MarkupKind.Markdown, value: hover.contents }, range: hover.range }
})

connection.onReferences((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return []
  const target = nameAtOffset(document.getText(), document.offsetAt(params.position))
  if (!target)
    return []
  const includeDeclaration = params.context?.includeDeclaration !== false
  return nameLocations(document, target).flatMap((item) => {
    const ranges = includeDeclaration ? [...item.definitions, ...item.references] : item.references
    return ranges.map(range => ({ uri: item.uri, range }))
  })
})

connection.onPrepareRename((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return null
  const target = nameAtOffset(document.getText(), document.offsetAt(params.position))
  if (!target)
    return null
  return { range: target.range, placeholder: target.name }
})

connection.onRenameRequest((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return null
  const target = nameAtOffset(document.getText(), document.offsetAt(params.position))
  if (!target)
    return null
  const changes: Record<string, ReturnType<typeof TextEdit.replace>[]> = {}
  for (const item of nameLocations(document, target)) {
    const ranges = [...item.definitions, ...item.references]
    if (ranges.length)
      changes[item.uri] = ranges.map(range => TextEdit.replace(range, params.newName))
  }
  return { changes }
})

connection.onDocumentSymbol((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return []
  return getDocumentSymbols(document.getText()).map(toSymbolInformation)
})

connection.onWorkspaceSymbol((params) => {
  const index = getWorkspaceIndex()
  index.refresh(workspaceRoots)
  const query = (params.query ?? '').toLowerCase()
  const symbols: SymbolInformation[] = []
  for (const entry of index.files()) {
    for (const definition of entry.definitions) {
      if (query && !definition.name.toLowerCase().includes(query))
        continue
      symbols.push(SymbolInformation.create(definition.name, SymbolKind.Variable, definition.range, entry.uri, definition.element))
      if (symbols.length >= 500)
        return symbols
    }
  }
  return symbols
})

connection.onCodeAction((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return []
  const context = projectContext(document)
  const text = document.getText()
  const actions = getCodeActions(text, params.range, {
    ...context,
    unresolvedIncludes: context.unresolvedIncludes,
  }, localeOf(clientLocale))
  return toCodeActions(document, actions)
})

connection.onSignatureHelp((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return null
  const help = getSignatureHelp(document.getText(), document.offsetAt(params.position))
  if (!help)
    return null
  return {
    signatures: [{
      label: `${help.name}(${help.params.map(param => (param.optional ? `[${param.name}]` : param.name)).join(', ')})`,
      parameters: help.params.map(param => ({ label: param.optional ? `[${param.name}]` : param.name })),
    }],
    activeSignature: 0,
    activeParameter: help.activeParameter,
  }
})

connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return null
  const location = getDefinition(document.getText(), document.offsetAt(params.position), projectContext(document))
  if (!location)
    return null
  return { uri: location.uri ?? document.uri, range: location.range }
})

documents.listen(connection)
connection.listen()
