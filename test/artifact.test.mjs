// 打包产物冒烟:用最小的假 vscode API 加载构建产物 dist/extension.js,
// 验证注册、格式化、结构确认弹窗与失败提示的真实行为。
// 需要先 `npm run build`;未构建时跳过。
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { test } from 'node:test'

const EXTENSION = path.resolve('dist/extension.js')
const FAKE_DIR = path.resolve('test/build/fake-vscode')
const FAKE_MODULE = path.join(FAKE_DIR, 'index.js')

const FAKE_SOURCE = `const state = { registered: {}, rangeProviders: {}, messages: [], config: null, modalAnswer: undefined }
class Range { constructor(start, end) { this.start = start; this.end = end } }
module.exports = {
  state,
  Range,
  TextEdit: { replace: (range, text) => ({ range, text }) },
  languages: {
    registerDocumentFormattingEditProvider: (language, provider) => {
      state.registered[language] = provider
      return { dispose() {} }
    },
    registerDocumentRangeFormattingEditProvider: (language, provider) => {
      state.rangeProviders[language] = provider
      return { dispose() {} }
    },
  },
  env: { language: 'en' },
  workspace: { getConfiguration: () => state.config },
  window: {
    showWarningMessage: (msg, ...rest) => {
      state.messages.push({ msg, modal: typeof rest[0] === 'object' })
      return Promise.resolve(state.modalAnswer)
    },
  },
}
`

function loadWithFakeVscode() {
  mkdirSync(FAKE_DIR, { recursive: true })
  writeFileSync(FAKE_MODULE, FAKE_SOURCE)
  const require = createRequire(import.meta.url)
  const Module = require('node:module')
  const originalResolve = Module._resolveFilename
  // 绝对路径(macOS 的 /、Windows 的 D:\ 与 UNC \\server)都不是外部包名
  const isBareSpecifier = request =>
    !request.startsWith('.')
    && !request.startsWith('/')
    && !/^[a-z]:[\\/]/i.test(request)
    && !request.startsWith('\\\\')
    && !request.startsWith('node:')
    && !Module.builtinModules.includes(request)
  Module._resolveFilename = function (request, ...args) {
    if (request === 'vscode')
      return FAKE_MODULE
    // 产物必须自包含:除了 vscode 与 Node 内置模块,不允许在运行时 require 任何外部包
    // (依赖应被 tsup 打进 dist,否则装到用户机器上会因缺少 node_modules 而失效)
    if (isBareSpecifier(request))
      throw new Error(`extension bundle must not require external package "${request}" at runtime`)
    return originalResolve.apply(this, [request, ...args])
  }
  try {
    const extension = require(EXTENSION)
    const vscode = require(FAKE_MODULE)
    return { extension, vscode }
  }
  finally {
    Module._resolveFilename = originalResolve
  }
}

test(
  '打包产物:扩展宿主冒烟(假 vscode API)',
  { skip: existsSync(EXTENSION) ? false : 'dist/extension.js 未构建,先运行 npm run build' },
  async () => {
    const logged = []
    const originalError = console.error
    console.error = (...args) => logged.push(args.map(String).join(' '))
    let vscode
    try {
      const { extension } = loadWithFakeVscode()
      vscode = createRequire(import.meta.url)(FAKE_MODULE)
      extension.activate({
        subscriptions: [],
        asAbsolutePath: relative => path.resolve(relative),
      })
    }
    finally {
      console.error = originalError
    }

    assert.deepEqual(
      Object.keys(vscode.state.registered).sort(),
      ['krpano', 'krpano-xml'],
      '格式化器应注册到 krpano-xml 与 krpano 两个语言',
    )
    assert.ok(
      logged.some(line => line.includes('language server failed to load')),
      '语言服务在缺少 vscode API 时应被捕获,不应中断激活',
    )
    assert.ok(
      vscode.state.messages.some(m => m.msg.includes('language service failed to load')),
      '语言服务加载失败应提示用户(高亮与格式化不受影响)',
    )
    // 激活阶段的提示与实际格式化行为无关,清空以免干扰后续断言
    vscode.state.messages.length = 0

    const provider = vscode.state.registered['krpano-xml']
    const document = text => ({ getText: () => text, positionAt: offset => offset })
    vscode.state.config = { editor: { tabSize: 2, insertSpaces: true }, xml: { format: {} } }

    const formatted = await provider.provideDocumentFormattingEdits(document('<krpano><view/><hotspot name="a"/></krpano>'))
    assert.equal(formatted.length, 1)
    assert.ok(formatted[0].text.includes('\n  <view/>'), '正常文档应直接格式化')
    assert.equal(vscode.state.messages.length, 0, '正常文档不应有提示')

    vscode.state.modalAnswer = undefined // 用户取消
    const cancelled = await provider.provideDocumentFormattingEdits(document('<krpano><a></b></krpano>'))
    assert.equal(cancelled.length, 0, '标签错配且用户取消时不应修改文档')
    assert.ok(
      vscode.state.messages.some(m => m.modal && m.msg.includes('unclosed or mismatched')),
      '标签错配应弹出模态确认框',
    )

    vscode.state.modalAnswer = 'Format anyway'
    const confirmed = await provider.provideDocumentFormattingEdits(document('<krpano><a></b></krpano>'))
    assert.equal(confirmed.length, 1, '用户确认后应应用格式化')
    assert.ok(confirmed[0].text.includes('</a>'), '格式化结果应包含修复后的闭合标签')

    vscode.state.messages.length = 0
    const failed = await provider.provideDocumentFormattingEdits(document('hello world'))
    assert.equal(failed.length, 0, '解析失败时不应修改文档')
    assert.ok(
      vscode.state.messages.some(m => m.msg.includes('formatting failed')),
      '解析失败应给出警告',
    )
  },
)
