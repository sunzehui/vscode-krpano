import * as vscode from 'vscode'
import { beautify } from './beautifyHtml'
import getOptions from './getOptions'

// krpano-xml 用于 .xml 文件;krpano 用于手动切换到脚本语言模式的场景
const FORMATTED_LANGUAGES = ['krpano-xml', 'krpano']

export function activate(context: vscode.ExtensionContext) {
  registerFormatter(context)
  startLanguageServer(context)
}

function registerFormatter(context: vscode.ExtensionContext) {
  const provider: vscode.DocumentFormattingEditProvider = {
    async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
      const fullText = document.getText()
      const options = getOptions(vscode.workspace.getConfiguration())
      const result = beautify(fullText, options) // xml 格式化

      if (result.failed) {
        vscode.window.showWarningMessage('krpano: formatting failed - the document could not be parsed as XML, content kept unchanged.')
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

  for (const language of FORMATTED_LANGUAGES)
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(language, provider))
}

function startLanguageServer(context: vscode.ExtensionContext) {
  try {
    // 语言客户端单独打包为 dist/lsp/client.js,在激活后再加载:语言服务不可用时
    // (依赖缺失、加载或启动失败)只记录日志,高亮与格式化照常工作。
    const clientPath = context.asAbsolutePath('dist/lsp/client.js')
    // eslint-disable-next-line ts/no-var-requires
    const { startLanguageClient } = require(clientPath) as typeof import('./lsp/client')
    startLanguageClient(context)
  }
  catch (error) {
    console.error('[krpano-lang] language server failed to load:', error)
  }
}
