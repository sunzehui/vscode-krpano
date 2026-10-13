// krpano XML 语言服务器(LSP):诊断、补全、悬停、跳转。
// 作为独立进程由 vscode-languageclient 以 IPC 传输启动(见 client.ts)。
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

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: { triggerCharacters: ['<', ' ', '"', '\'', '='] },
    hoverProvider: true,
    definitionProvider: true,
  },
}))

function validate(document: TextDocument): void {
  const diagnostics = getDiagnostics(document.getText()).map(item => ({
    message: item.message,
    severity: item.severity === 'error'
      ? DiagnosticSeverity.Error
      : item.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Information,
    range: item.range,
    source: item.source,
  }))
  void connection.sendDiagnostics({ uri: document.uri, diagnostics })
}

documents.onDidChangeContent((change) => {
  validate(change.document)
})

documents.onDidClose((event) => {
  void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] })
})

connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri)
  if (!document)
    return []
  const offset = document.offsetAt(params.position)
  return getCompletions(document.getText(), offset).map(item => ({
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
  const location = getDefinition(document.getText(), document.offsetAt(params.position))
  return location ? { uri: document.uri, range: location.range } : null
})

documents.listen(connection)
connection.listen()
