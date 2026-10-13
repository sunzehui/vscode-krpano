// LSP 服务器端到端冒烟:以 stdio 传输启动真实构建产物,走一遍 initialize / 诊断 / 补全 / 悬停 / 跳转。
// 需要先 `npm run build`(dist/lsp/server.js);未构建时跳过,便于单独跑 npm test。
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

const SERVER = 'dist/lsp/server.js'
const hasServer = existsSync(SERVER)

function createClient(child) {
  let buffer = Buffer.alloc(0)
  const pending = new Map()
  const notifications = []

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
      else {
        notifications.push(message)
      }
    }
  })

  const send = (message) => {
    const body = JSON.stringify(message)
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }

  return {
    send,
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
  const child = spawn(process.execPath, [SERVER, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] })
  const client = createClient(child)
  try {
    const response = await client.request(1, 'initialize', { processId: process.pid, rootUri: null, capabilities: {} })
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
