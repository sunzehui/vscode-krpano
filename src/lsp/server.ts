// krpano XML 语言服务器(LSP):诊断、补全、悬停、跳转。
// 作为独立进程由 vscode-languageclient 以 IPC 传输启动(见 client.ts)。
import { readFileSync, statSync } from 'node:fs'
import {
  CompletionItemKind,
  DiagnosticSeverity,
  InsertTextFormat,
  MarkupKind,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { getCompletions, getDefinition, getDiagnostics, getHover } from './features'
import { buildIncludeIndex, contextForFile, uriToPath } from './symbols'
import type { ProjectContext } from './types'

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

/** 磁盘文件缓存(已打开的文档直接取内存文本) */
const fileCache = new Map<string, { mtimeMs: number, size: number, text: string }>()

function openDocumentText(path: string): string | undefined {
  for (const document of documents.all()) {
    if (uriToPath(document.uri) === path)
      return document.getText()
  }
  return undefined
}

function readFileCached(path: string): string | undefined {
  const open = openDocumentText(path)
  if (open !== undefined)
    return open
  try {
    const stat = statSync(path)
    const cached = fileCache.get(path)
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size)
      return cached.text
    const text = readFileSync(path, 'utf8')
    fileCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, text })
    return text
  }
  catch {
    return undefined
  }
}

/** 当前文档的上下文:沿 <include> 链收集到的外部定义与解析失败的 include */
function projectContext(document: TextDocument): ProjectContext {
  const path = uriToPath(document.uri)
  if (!path)
    return {}
  const index = buildIncludeIndex(path, readFileCached)
  return contextForFile(index, path, document.uri)
}

function validate(document: TextDocument): void {
  const diagnostics = getDiagnostics(document.getText(), projectContext(document)).map(item => ({
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

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: { triggerCharacters: ['<', ' ', '"', '\'', '='] },
    hoverProvider: true,
    definitionProvider: true,
  },
}))

documents.onDidChangeContent((change) => {
  validateAll()
})

documents.onDidClose((event) => {
  void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] })
})

// 磁盘上的 xml 变化(例如编辑了 include 的动作文件)也要刷新诊断
connection.onDidChangeWatchedFiles(() => {
  validateAll()
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
