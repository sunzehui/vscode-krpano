import * as vscode from 'vscode'
import { beautify } from './beautifyHtml'
import getOptions from './getOptions'

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider('krpano-xml', {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
      const fullText = document.getText()
      const fullRange = new vscode.Range(
        document.positionAt(0),
        document.positionAt(fullText.length),
      )
      const config = vscode.workspace.getConfiguration()
      const options = getOptions(config)
      const beautifiedText = beautify(fullText, options) // xml 格式化
      return [vscode.TextEdit.replace(fullRange, beautifiedText)]
    },
  }))
}
