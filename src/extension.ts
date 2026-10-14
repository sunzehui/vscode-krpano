import * as vscode from 'vscode'
import { beautify } from './beautifyHtml'
import getOptions from './getOptions'
import { enclosingElementNames, reindentLines, selectionLineBounds } from './shared/reindent'

// krpano-xml 用于 .xml 文件;krpano 用于手动切换到脚本语言模式的场景
const FORMATTED_LANGUAGES = ['krpano-xml', 'krpano']

export function activate(context: vscode.ExtensionContext): void {
  registerFormatter(context)
  startLanguageServer(context)
}

function registerFormatter(context: vscode.ExtensionContext): void {
  const provider: vscode.DocumentFormattingEditProvider = {
    async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
      const fullText = document.getText()
      const options = getOptions(vscode.workspace.getConfiguration())
      const result = beautify(fullText, options) // xml 格式化

      if (result.failed) {
        const detail = result.reason ? ` (${result.reason})` : ''
        vscode.window.showWarningMessage(`krpano: formatting failed${detail} - content kept unchanged.`)
        return []
      }
      if (result.text === fullText)
        return []

      // 未闭合/错配的标签会被 xml-formatter 容错修复,先让用户确认再改写文档
      if (result.structureChanged) {
        const proceed = 'Format anyway'
        const answer = await vscode.window.showWarningMessage(
          'krpano: the document contains unclosed or mismatched XML tags. Formatting will repair the tag structure; please review the diff afterwards.',
          { modal: true },
          proceed,
        )
        if (answer !== proceed)
          return []
      }

      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(fullText.length),
      )
      return [vscode.TextEdit.replace(fullRange, result.text)]
    },
  }

  // 选区格式化:只按标签层级对齐缩进(不重排属性、不拆行),落在 xml.format.ignoredPaths 内的选区不动
  const rangeProvider: vscode.DocumentRangeFormattingEditProvider = {
    provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range): vscode.TextEdit[] {
      const fullText = document.getText()
      const startOffset = document.offsetAt(range.start)
      const endOffset = document.offsetAt(range.end)
      const options = getOptions(vscode.workspace.getConfiguration())
      const ignored = options.ignoredPaths ?? []
      if (ignored.length && enclosingElementNames(fullText, startOffset).some(name => ignored.includes(name)))
        return []

      const indentation = options.indentation || '  '
      const result = reindentLines(fullText, startOffset, endOffset, indentation)
      if (!result.changed)
        return []

      const bounds = selectionLineBounds(fullText, startOffset, endOffset)
      return [vscode.TextEdit.replace(new vscode.Range(document.positionAt(bounds.start), document.positionAt(bounds.end)), result.text)]
    },
  }

  for (const language of FORMATTED_LANGUAGES) {
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(language, provider))
    context.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider(language, rangeProvider))
  }
}

function startLanguageServer(context: vscode.ExtensionContext): void {
  try {
    // 语言客户端单独打包为 dist/lsp/client.js,在激活后再加载:语言服务不可用时
    // (依赖缺失、加载或启动失败)只记录日志,高亮与格式化照常工作。
    const clientPath = context.asAbsolutePath('dist/lsp/client.js')
    const { startLanguageClient } = require(clientPath) as typeof import('./lsp/client') // eslint-disable-line ts/no-require-imports -- 语言客户端需在激活后按需加载
    startLanguageClient(context)
  }
  catch (error) {
    console.error('[krpano-lang] language server failed to load:', error)
  }
}
