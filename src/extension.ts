import * as vscode from 'vscode'
import { beautify } from './beautifyHtml'
import getOptions from './getOptions'

// krpano-xml 用于 .xml 文件;krpano 用于手动切换到脚本语言模式的场景
const FORMATTED_LANGUAGES = ['krpano-xml', 'krpano']

export function activate(context: vscode.ExtensionContext) {
  const provider: vscode.DocumentFormattingEditProvider = {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
      const fullText = document.getText()
      const options = getOptions(vscode.workspace.getConfiguration())
      const result = beautify(fullText, options) // xml 格式化

      if (result.failed) {
        vscode.window.showWarningMessage('krpano: formatting failed - the document could not be parsed as XML, content kept unchanged.')
        return []
      }
      if (result.text === fullText)
        return []

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
