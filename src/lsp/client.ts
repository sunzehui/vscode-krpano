// 语言客户端:在扩展宿主里启动语言服务器进程。
import * as vscode from 'vscode'
import { State } from 'vscode-languageclient'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'
import { localeOf, messagesFor } from './messages'

export function startLanguageClient(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath('dist/lsp/server.js')
  const t = messagesFor(localeOf(vscode.env.language))
  const output = vscode.window.createOutputChannel('krpano-lang')
  context.subscriptions.push(output)

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
      // 让服务器按界面语言输出提示(诊断/悬停框架文案)
      initializationOptions: { locale: vscode.env.language },
      // 监听 xml 文件变化:include 进来的动作文件被修改时,依赖它的文档诊断需要刷新
      synchronize: {
        fileEvents: [vscode.workspace.createFileSystemWatcher('**/*.xml')],
        configurationSection: 'krpano.lsp',
      },
      outputChannel: output,
    },
  )

  // 服务状态可观测:状态变化写入输出通道;意外停止时提示用户(高亮与格式化不依赖语言服务)
  let stopping = false
  client.onDidChangeState((event) => {
    output.appendLine(`[krpano-lang] ${stateName(event.oldState)} → ${stateName(event.newState)}`)
    if (event.newState === State.Stopped && !stopping) {
      void vscode.window.showWarningMessage(t.serverStopped, t.showLogs).then((answer) => {
        if (answer === t.showLogs)
          output.show(true)
      })
    }
  })

  output.appendLine(`[krpano-lang] ${t.serverStarting} (${serverModule})`)
  // vscode-languageclient 7.x 的 start() 返回 Disposable(而非 Promise),启动失败由客户端自行记录日志
  context.subscriptions.push(client.start())
  context.subscriptions.push({
    dispose: () => {
      stopping = true
      void client.stop()
    },
  })
}

function stateName(state: State): string {
  switch (state) {
    case State.Stopped:
      return 'stopped'
    case State.Running:
      return 'running'
    case State.Starting:
      return 'starting'
    default:
      return String(state)
  }
}
