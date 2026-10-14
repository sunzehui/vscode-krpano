import * as vscode from 'vscode'
import { beautify } from './beautifyHtml'
import getOptions from './getOptions'
import { localeOf, messagesFor } from './lsp/messages'
import { enclosingElementNames, reindentLines, selectionLineBounds } from './shared/reindent'

// krpano-xml 用于 .xml 文件;krpano 用于手动切换到脚本语言模式的场景
const FORMATTED_LANGUAGES = ['krpano-xml', 'krpano']

/** 少量面向用户的提示文案:按 VS Code 显示语言选择 */
const isChinese = (): boolean => localeOf(vscode.env.language) === 'zh'

export function activate(context: vscode.ExtensionContext): void {
  registerFormatter(context)
  registerCommands(context)
  startLanguageServer(context)
}

/** 命令面板命令:插入 scene 骨架、格式化工作区内所有 XML */
function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('krpano.insertSceneSkeleton', insertSceneSkeleton))
  context.subscriptions.push(vscode.commands.registerCommand('krpano.formatAllXml', formatAllXml))
}

/** 场景名:取自文件名(去掉扩展名),只保留合法字符 */
export function sceneNameFromPath(fsPath: string): string {
  const base = fsPath.replace(/\\/g, '/').split('/').pop() ?? ''
  const name = base.replace(/\.xml$/i, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '')
  return name || 'scene1'
}

/** 在光标处插入一份 <scene> 骨架(view + preview + cube 占位) */
export async function insertSceneSkeleton(): Promise<boolean> {
  const t = messagesFor(localeOf(vscode.env.language))
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    void vscode.window.showWarningMessage(t.noActiveEditor)
    return false
  }
  if (!FORMATTED_LANGUAGES.includes(editor.document.languageId)) {
    void vscode.window.showWarningMessage(t.notKrpanoDocument)
    return false
  }
  const name = sceneNameFromPath(editor.document.uri.fsPath)
  const skeleton = [
    '',
    `<scene name="${name}" title="${name}">`,
    '\t<view hlookat="0" vlookat="0" fovtype="MFOV" fov="90" fovmin="70" fovmax="140"/>',
    '\t<preview url="preview.jpg" type="grid(2,2)"/>',
    '\t<image>',
    '\t\t<cube url="pano_%s_%l_%v_%h.jpg" multires="512,1024,2048"/>',
    '\t</image>',
    '</scene>',
    '',
  ].join('\n')
  const ok = await editor.edit(builder => builder.insert(editor.selection.active, skeleton))
  if (ok)
    void vscode.window.showInformationMessage(t.sceneInserted(name))
  return ok
}

/** 格式化工作区内所有 .xml:只应用"结构未变"的结果,避免静默改写标签结构 */
export async function formatAllXml(): Promise<number> {
  const t = messagesFor(localeOf(vscode.env.language))
  const files = await vscode.workspace.findFiles('**/*.xml', '**/{node_modules,.git,out,dist}/**', 500)
  if (!files.length) {
    void vscode.window.showInformationMessage(t.noXmlFiles)
    return 0
  }
  const options = getOptions(vscode.workspace.getConfiguration())
  let formatted = 0
  let skipped = 0
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: t.formattingAllXml },
    async () => {
      for (const uri of files) {
        let document: vscode.TextDocument
        try {
          document = await vscode.workspace.openTextDocument(uri)
        }
        catch {
          skipped++
          continue
        }
        const original = document.getText()
        const result = beautify(original, options)
        if (result.failed || result.structureChanged || result.text === original) {
          skipped++
          continue
        }
        const edit = new vscode.WorkspaceEdit()
        edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(original.length)), result.text)
        if (await vscode.workspace.applyEdit(edit)) {
          await document.save()
          formatted++
        }
        else {
          skipped++
        }
      }
    },
  )
  void vscode.window.showInformationMessage(t.formatAllXmlDone(formatted, skipped))
  return formatted
}

function registerFormatter(context: vscode.ExtensionContext): void {
  const provider: vscode.DocumentFormattingEditProvider = {
    async provideDocumentFormattingEdits(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
      const fullText = document.getText()
      const options = getOptions(vscode.workspace.getConfiguration())
      const result = beautify(fullText, options) // xml 格式化

      if (result.failed) {
        const detail = result.reason ? ` (${result.reason})` : ''
        vscode.window.showWarningMessage(isChinese()
          ? `krpano:格式化失败${detail},内容保持不变。`
          : `krpano: formatting failed${detail} - content kept unchanged.`)
        return []
      }
      if (result.text === fullText)
        return []

      // 未闭合/错配的标签会被 xml-formatter 容错修复,先让用户确认再改写文档
      if (result.structureChanged) {
        const proceed = 'Format anyway'
        const answer = await vscode.window.showWarningMessage(
          isChinese()
            ? 'krpano:文档存在未闭合或错配的 XML 标签,格式化会修复标签结构,请之后检查差异。'
            : 'krpano: the document contains unclosed or mismatched XML tags. Formatting will repair the tag structure; please review the diff afterwards.',
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
    void vscode.window.showWarningMessage(messagesFor(localeOf(vscode.env.language)).serverFailedToLoad)
  }
}
