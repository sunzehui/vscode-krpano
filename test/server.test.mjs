// LSP 服务器端到端冒烟:以 stdio 传输启动真实构建产物,走一遍 initialize / 诊断 / 补全 / 悬停 / 跳转。
// 需要先 `npm run build`(dist/lsp/server.js);未构建时跳过,便于单独跑 npm test。
// 进程以临时目录为 cwd 启动:产物必须自包含,不依赖 node_modules。
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const SERVER = path.resolve('dist/lsp/server.js')
const hasServer = existsSync(SERVER)

function createClient(child) {
  let buffer = Buffer.alloc(0)
  const pending = new Map()
  const notifications = []

  let configurationHandler = () => [{}]

  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    for (;;) {
      const headerEnd = buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1)
        return
      const header = buffer.slice(0, headerEnd).toString('utf8')
      const match = /Content-Length:\s*(\d+)/i.exec(header)
      const start = headerEnd + 4
      if (!match) {
        buffer = buffer.slice(start)
        continue
      }
      const length = Number(match[1])
      if (buffer.length < start + length)
        return
      const message = JSON.parse(buffer.slice(start, start + length).toString('utf8'))
      buffer = buffer.slice(start + length)
      if (message.id !== undefined && message.method === undefined) {
        const resolve = pending.get(message.id)
        pending.delete(message.id)
        resolve?.(message)
      }
      else if (message.id !== undefined && message.method !== undefined) {
        // 服务器发起的请求(workspace/configuration):按注册的处理器应答
        send({ jsonrpc: '2.0', id: message.id, result: configurationHandler(message) })
      }
      else {
        notifications.push(message)
      }
    }
  })

  function send(message) {
    const body = JSON.stringify(message)
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }

  return {
    send,
    setConfigurationHandler: (handler) => {
      configurationHandler = handler
    },
    request: (id, method, params) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 10000)
      pending.set(id, (message) => {
        clearTimeout(timer)
        resolve(message)
      })
      send({ jsonrpc: '2.0', id, method, params })
    }),
    notifications,
    async waitFor(predicate, label) {
      const deadline = Date.now() + 10000
      while (Date.now() < deadline) {
        const found = notifications.find(predicate)
        if (found)
          return found
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      throw new Error(`timeout waiting for ${label}`)
    },
  }
}

test('LSP server:initialize 与能力声明', { skip: hasServer ? false : 'dist/lsp/server.js 未构建,先运行 npm run build' }, async () => {
  const child = spawn(process.execPath, [SERVER, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'], cwd: tmpdir() })
  const client = createClient(child)
  try {
    const response = await client.request(1, 'initialize', { processId: process.pid, rootUri: null, capabilities: { workspace: { configuration: true } } })
    assert.equal(response.result.capabilities.hoverProvider, true)
    assert.equal(response.result.capabilities.definitionProvider, true)
    assert.ok(response.result.capabilities.completionProvider)
    client.send({ jsonrpc: '2.0', method: 'initialized', params: {} })

    const uri = 'file:///smoke.xml'
    const text = '<krpano>\n  <foo/>\n  <hotspot name="h" onclick="do_thing();"/>\n  <action name="do_thing">trace(1);</action>\n</krpano>'
    client.send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, languageId: 'krpano-xml', version: 1, text } },
    })

    // 诊断:未知元素 foo
    const publish = await client.waitFor(
      n => n.method === 'textDocument/publishDiagnostics' && n.params.uri === uri && n.params.diagnostics.length > 0,
      'diagnostics',
    )
    assert.ok(
      publish.params.diagnostics.some(d => d.message.includes('Unknown krpano element <foo>')),
      JSON.stringify(publish.params.diagnostics),
    )

    // 补全:<ho 前缀
    const text2 = '<hotspot/>\n<ho'
    client.send({ jsonrpc: '2.0', method: 'textDocument/didChange', params: { textDocument: { uri, version: 2 }, contentChanges: [{ text: text2 }] } })
    const completion = await client.request(2, 'textDocument/completion', { textDocument: { uri }, position: { line: 1, character: 3 } })
    const labels = (completion.result ?? []).map(item => item.label)
    assert.ok(labels.includes('hotspot'), JSON.stringify(labels))

    // 悬停:热点元素名
    client.send({ jsonrpc: '2.0', method: 'textDocument/didChange', params: { textDocument: { uri, version: 3 }, contentChanges: [{ text }] } })
    const hover = await client.request(3, 'textDocument/hover', { textDocument: { uri }, position: { line: 2, character: 5 } })
    assert.ok(hover.result && hover.result.contents.value.includes('hotspot'), JSON.stringify(hover.result))

    // 跳转:onclick 里的 do_thing → <action name="do_thing">
    const definition = await client.request(4, 'textDocument/definition', { textDocument: { uri }, position: { line: 2, character: 32 } })
    assert.ok(definition.result, JSON.stringify(definition))
    assert.deepEqual(definition.result.range.start, { line: 3, character: 16 })

    // 关闭文档后诊断清空
    client.send({ jsonrpc: '2.0', method: 'textDocument/didClose', params: { textDocument: { uri } } })
    const cleared = await client.waitFor(
      n => n.method === 'textDocument/publishDiagnostics' && n.params.uri === uri && n.params.diagnostics.length === 0,
      'cleared diagnostics',
    )
    assert.ok(cleared)
  }
  finally {
    child.kill()
  }
})

test('LSP server:跨文件 include(诊断不再噪音 + 跨文件跳转)', { skip: hasServer ? false : 'dist/lsp/server.js 未构建,先运行 npm run build' }, async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const dir = mkdtempSync(path.join(tmpdir(), 'krpano-lsp-'))
  const entry = path.join(dir, 'tour.xml')
  const actions = path.join(dir, 'actions.xml')
  writeFileSync(actions, '<krpano>\n  <action name="from_include" args="v">\n    trace(v);\n  </action>\n</krpano>\n')
  const entryText = [
    '<krpano>',
    '  <include url="actions.xml"/>',
    '  <include url="missing_actions.xml"/>',
    '  <action name="local_action" autorun="onstart">',
    '    from_include(1);',
    '    really_missing(2);',
    '  </action>',
    '</krpano>',
  ].join('\n')
  writeFileSync(entry, `${entryText}\n`)

  const child = spawn(process.execPath, [SERVER, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'], cwd: tmpdir() })
  const client = createClient(child)
  try {
    await client.request(1, 'initialize', { processId: process.pid, rootUri: null, capabilities: { workspace: { configuration: true } } })
    client.send({ jsonrpc: '2.0', method: 'initialized', params: {} })

    const uri = `file://${entry}`
    client.send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, languageId: 'krpano-xml', version: 1, text: entryText } },
    })

    const publish = await client.waitFor(
      n => n.method === 'textDocument/publishDiagnostics' && n.params.uri === uri && n.params.diagnostics.length > 0,
      'diagnostics',
    )
    const messages = publish.params.diagnostics.map(d => d.message)
    assert.ok(!messages.some(m => m.includes('from_include')), `include 里的动作不应被报:${messages.join(' | ')}`)
    assert.ok(messages.some(m => m.includes('really_missing')), messages.join(' | '))
    assert.ok(
      publish.params.diagnostics.some(d => d.severity === 2 && d.message.includes('missing_actions.xml')),
      `缺失的 include 应给警告:${messages.join(' | ')}`,
    )

    // 跨文件跳转:from_include( → actions.xml 中的定义
    const offset = entryText.indexOf('from_include')
    const definition = await client.request(2, 'textDocument/definition', {
      textDocument: { uri },
      position: { line: 4, character: offset - entryText.lastIndexOf('\n', offset) - 1 + 3 },
    })
    assert.ok(definition.result, JSON.stringify(definition))
    assert.equal(definition.result.uri, `file://${actions}`)
    assert.deepEqual(definition.result.range.start, { line: 1, character: 16 }, 'name 值 from_include 的起始列')
  }
  finally {
    child.kill()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('LSP server:krpano.lsp.diagnostics.enable=false 时不报诊断', { skip: hasServer ? false : 'dist/lsp/server.js 未构建,先运行 npm run build' }, async () => {
  const child = spawn(process.execPath, [SERVER, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'], cwd: tmpdir() })
  const client = createClient(child)
  client.setConfigurationHandler(() => [{ diagnostics: { enable: false, undefinedActions: 'information', ignoredNames: [] } }])
  try {
    await client.request(1, 'initialize', { processId: process.pid, rootUri: null, capabilities: { workspace: { configuration: true } } })
    client.send({ jsonrpc: '2.0', method: 'initialized', params: {} })

    const uri = 'file:///config-smoke.xml'
    client.send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, languageId: 'krpano-xml', version: 1, text: '<krpano><foo/><action name="a">missing_here();</action></krpano>' } },
    })

    const publish = await client.waitFor(
      n => n.method === 'textDocument/publishDiagnostics' && n.params.uri === uri,
      'diagnostics',
    )
    assert.deepEqual(publish.params.diagnostics, [], '关闭诊断后不应发布任何诊断')
  }
  finally {
    child.kill()
  }
})

test('LSP server:引用、跨文件重命名、符号与快速修复', { skip: hasServer ? false : 'dist/lsp/server.js 未构建,先运行 npm run build' }, async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const dir = mkdtempSync(path.join(tmpdir(), 'krpano-refs-'))
  const entry = path.join(dir, 'tour.xml')
  const actions = path.join(dir, 'actions.xml')
  writeFileSync(actions, '<krpano>\n  <action name="helper_action">\n    trace(1);\n  </action>\n</krpano>\n')
  const entryText = [
    '<krpano>',
    '  <include url="actions.xml"/>',
    '  <action name="startup" autorun="onstart" lang="ts">',
    '    helper_action(1);',
    '  </action>',
    '  <layer name="info"/>',
    '  <action name="use_layer" autorun="onstart">layer[info].visible = true;</action>',
    '</krpano>',
  ].join('\n')
  writeFileSync(entry, `${entryText}\n`)

  const child = spawn(process.execPath, [SERVER, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'], cwd: tmpdir() })
  const client = createClient(child)
  const uri = `file://${entry}`
  const position = (line, character) => ({ line, character })
  try {
    await client.request(1, 'initialize', {
      processId: process.pid,
      rootUri: `file://${dir}`,
      workspaceFolders: [{ uri: `file://${dir}`, name: 'ws' }],
      capabilities: { workspace: { configuration: true } },
    })
    client.send({ jsonrpc: '2.0', method: 'initialized', params: {} })
    client.send({
      jsonrpc: '2.0',
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, languageId: 'krpano-xml', version: 1, text: entryText } },
    })

    // 查找引用:helper_action 的调用处 + actions.xml 里的定义
    const references = await client.request(2, 'textDocument/references', {
      textDocument: { uri },
      position: position(3, 6),
      context: { includeDeclaration: true },
    })
    const referenceLocations = references.result ?? []
    assert.ok(referenceLocations.some(item => item.uri === `file://${actions}`), `应包含 actions.xml 中的定义:${JSON.stringify(referenceLocations)}`)
    assert.ok(referenceLocations.some(item => item.uri === uri), '应包含本文件的调用处')

    // 重命名:同时改本文件调用处与 include 文件里的定义
    const rename = await client.request(3, 'textDocument/rename', {
      textDocument: { uri },
      position: position(3, 6),
      newName: 'renamed_helper',
    })
    const changes = rename.result?.changes ?? {}
    assert.ok(changes[uri]?.length >= 1, `本文件应有编辑:${JSON.stringify(changes)}`)
    assert.ok(changes[`file://${actions}`]?.length === 1, `include 文件应有定义改动:${JSON.stringify(changes)}`)
    assert.equal(changes[`file://${actions}`][0].newText, 'renamed_helper')

    // 文档大纲:只包含本文档的元素(include 文件里的定义不算)
    const documentSymbols = await client.request(4, 'textDocument/documentSymbol', { textDocument: { uri } })
    const names = JSON.stringify(documentSymbols.result ?? [])
    assert.ok(names.includes('startup') && names.includes('info') && names.includes('use_layer'), names)
    assert.ok(!names.includes('helper_action'), `include 文件里的动作不应出现在本文档大纲:${names}`)

    // 工作区符号:能搜到 include 文件里的动作
    const workspaceSymbols = await client.request(6, 'workspace/symbol', { query: 'helper' })
    const workspaceUris = (workspaceSymbols.result ?? []).map(item => item.location?.uri)
    assert.ok(workspaceUris.includes(`file://${actions}`), `工作区符号应包含 actions.xml:${JSON.stringify(workspaceSymbols.result)}`)

    // 快速修复:lang="ts" → type="Javascript"
    const action = await client.request(5, 'textDocument/codeAction', {
      textDocument: { uri },
      range: { start: position(2, 30), end: position(2, 39) },
      context: { diagnostics: [] },
    })
    const titles = (action.result ?? []).map(item => item.title)
    assert.ok(titles.some(title => title.includes('type="Javascript"')), `应提供 lang 修复:${JSON.stringify(titles)}`)
  }
  finally {
    child.kill()
    rmSync(dir, { recursive: true, force: true })
  }
})
