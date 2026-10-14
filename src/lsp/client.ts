// 语言客户端:在扩展宿主里启动语言服务器进程。
import * as vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

export function startLanguageClient(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath('dist/lsp/server.js')
  const client = new LanguageClient(
    'krpano-lang',
    'krpano-lang',
    {
      run: { module: serverModule, transport: TransportKind.ipc },
      // 调试时给服务器进程挂 --inspect;配合 .vscode/launch.json 的 "Attach to Language Server"
      debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ['--inspect=6011'] } },
    },
    {
      documentSelector: [{ language: 'krpano-xml' }, { language: 'krpano' }],
      // 监听 xml 文件变化:include 进来的动作文件被修改时,依赖它的文档诊断需要刷新
      synchronize: {
        fileEvents: [vscode.workspace.createFileSystemWatcher('**/*.xml')],
        configurationSection: 'krpano.lsp',
      },
    },
  )
  // vscode-languageclient 7.x 的 start() 返回 Disposable(而非 Promise),启动失败由客户端自行记录日志
  context.subscriptions.push(client.start())
}
