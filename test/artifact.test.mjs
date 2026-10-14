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

const FAKE_SOURCE = `const state = { registered: {}, rangeProviders: {}, commands: {}, messages: [], config: null, modalAnswer: undefined, inserted: [], appliedEdits: [], xmlFiles: [], documents: {}, activeEditor: undefined }
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
  workspace: {
    getConfiguration: () => state.config,
    findFiles: () => Promise.resolve(state.xmlFiles),
    openTextDocument: (uri) => {
      const doc = state.documents[uri.fsPath]
      return doc ? Promise.resolve(doc) : Promise.reject(new Error('not found'))
    },
    applyEdit: (edit) => {
      state.appliedEdits.push(edit.edits)
      return Promise.resolve(true)
    },
    createFileSystemWatcher: () => ({ dispose() {} }),
  },
  commands: {
    registerCommand: (id, callback) => {
      state.commands[id] = callback
      return { dispose() {} }
    },
  },
  ProgressLocation: { Window: 10 },
  WorkspaceEdit: class {
    constructor() { this.edits = [] }
    replace(uri, range, text) { this.edits.push({ uri, range, text }) }
  },
  env: { language: 'en' },
  window: {
    activeTextEditor: undefined,
    showWarningMessage: (msg, ...rest) => {
      state.messages.push({ msg, kind: 'warning', modal: typeof rest[0] === 'object' })
      return Promise.resolve(state.modalAnswer)
    },
    showInformationMessage: (msg) => {
      state.messages.push({ msg, kind: 'information' })
      return Promise.resolve(undefined)
    },
    withProgress: (options, task) => Promise.resolve(task({ report() {} })),
    createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
    get activeTextEditor() { return state.activeEditor },
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
    const failed = await provider.provideDocumentFormattingEdits(document('<krpano><view/></krpano>garbage'))
    assert.equal(failed.length, 0, '解析失败时不应修改文档')
    assert.ok(
      vscode.state.messages.some(m => m.msg.includes('formatting failed')),
      '解析失败应给出警告',
    )

    // 语言由 .xml 扩展名绑定:非 krpano 的 XML(pom.xml 等)既不格式化也不提示
    vscode.state.messages.length = 0
    const pom = '<project>\n    <modelVersion>4.0.0</modelVersion>\n</project>'
    assert.deepEqual(await provider.provideDocumentFormattingEdits(document(pom)), [], '非 krpano 文档不应被整篇格式化')
    assert.deepEqual(
      vscode.state.rangeProviders['krpano-xml'].provideDocumentRangeFormattingEdits(document(pom), new vscode.Range({ line: 0, character: 0 }, { line: 2, character: 0 })),
      [],
      '非 krpano 文档的选区格式化也应跳过',
    )
    assert.equal(vscode.state.messages.length, 0, '跳过非 krpano 文档时不应打扰用户')
  },
)

test(
  '打包产物:命令面板命令(scene 骨架 / 格式化工作区)',
  { skip: existsSync(EXTENSION) ? false : 'dist/extension.js 未构建,先运行 npm run build' },
  async () => {
    const { extension } = loadWithFakeVscode()
    const vscode = createRequire(import.meta.url)(FAKE_MODULE)
    assert.equal(typeof extension.sceneNameFromPath, 'function')
    assert.equal(extension.sceneNameFromPath('/pano/my tour-01.xml'), 'my_tour-01')
    assert.equal(extension.sceneNameFromPath('C:\\pano\\scene.xml'), 'scene')
    assert.equal(extension.sceneNameFromPath('/pano/中文.xml'), 'scene1', '非法字符全部剔除后回退默认名')

    extension.activate({
      subscriptions: [],
      asAbsolutePath: relative => path.resolve(relative),
    })

    assert.deepEqual(
      Object.keys(vscode.state.commands).sort(),
      ['krpano.formatAllXml', 'krpano.insertSceneSkeleton'],
      '命令应在激活时注册',
    )

    // 没有活动编辑器 / 非 krpano 文档 → 警告且不插入
    vscode.state.messages.length = 0
    assert.equal(await vscode.state.commands['krpano.insertSceneSkeleton'](), false)
    assert.ok(vscode.state.messages.some(m => m.msg.includes('open an XML file first')), JSON.stringify(vscode.state.messages))

    vscode.state.activeEditor = {
      document: { languageId: 'plaintext', uri: { fsPath: '/pano/a.xml' } },
      selection: { active: 0 },
      edit: () => Promise.resolve(true),
    }
    assert.equal(await vscode.state.commands['krpano.insertSceneSkeleton'](), false)
    assert.ok(vscode.state.messages.some(m => m.msg.includes('krpano XML documents')), JSON.stringify(vscode.state.messages))

    // 正常插入骨架
    vscode.state.messages.length = 0
    const inserted = []
    vscode.state.activeEditor = {
      document: { languageId: 'krpano-xml', uri: { fsPath: '/pano/night_walk.xml' } },
      selection: { active: 3 },
      edit: (callback) => {
        callback({ insert: (position, text) => inserted.push({ position, text }) })
        return Promise.resolve(true)
      },
    }
    assert.equal(await vscode.state.commands['krpano.insertSceneSkeleton'](), true)
    assert.equal(inserted.length, 1)
    assert.equal(inserted[0].position, 3)
    assert.ok(inserted[0].text.includes('<scene name="night_walk"'), inserted[0].text)
    assert.ok(inserted[0].text.includes('<preview url='), inserted[0].text)
    assert.ok(inserted[0].text.includes('</scene>'), inserted[0].text)
    assert.ok(vscode.state.messages.some(m => m.msg.includes('inserted the scene skeleton')), JSON.stringify(vscode.state.messages))

    // 工作区没有 XML 文件
    vscode.state.messages.length = 0
    vscode.state.xmlFiles = []
    assert.equal(await vscode.state.commands['krpano.formatAllXml'](), 0)
    assert.ok(vscode.state.messages.some(m => m.msg.includes('no XML files')), JSON.stringify(vscode.state.messages))

    // 四个文件:一个可格式化、一个结构会变(跳过)、一个不是 krpano(跳过)、一个打不开(跳过)
    vscode.state.messages.length = 0
    vscode.state.config = { editor: { tabSize: 2, insertSpaces: true }, xml: { format: {} } }
    const messy = '<krpano><view/><hotspot name="a"/></krpano>'
    const broken = '<krpano><a></b></krpano>'
    vscode.state.xmlFiles = [
      { fsPath: '/pano/messy.xml' },
      { fsPath: '/pano/broken.xml' },
      { fsPath: '/pano/pom.xml' },
      { fsPath: '/pano/missing.xml' },
    ]
    vscode.state.documents = {
      '/pano/messy.xml': {
        getText: () => messy,
        positionAt: offset => offset,
        save: () => Promise.resolve(true),
      },
      '/pano/broken.xml': {
        getText: () => broken,
        positionAt: offset => offset,
        save: () => Promise.resolve(true),
      },
      '/pano/pom.xml': {
        getText: () => '<project>\n    <modelVersion>4.0.0</modelVersion>\n</project>',
        positionAt: offset => offset,
        save: () => Promise.resolve(true),
      },
    }
    const formattedCount = await vscode.state.commands['krpano.formatAllXml']()
    assert.equal(formattedCount, 1, '只有 krpano 且结构不变的文件会被改写')
    assert.equal(vscode.state.appliedEdits.length, 1)
    assert.ok(vscode.state.appliedEdits[0][0].text.includes('\n  <view/>'), vscode.state.appliedEdits[0][0].text)
    assert.ok(
      vscode.state.messages.some(m => m.msg.includes('formatted 1 file(s), skipped 3')),
      JSON.stringify(vscode.state.messages.map(m => m.msg)),
    )
  },
)
