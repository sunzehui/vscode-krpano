import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
// 两个库都是 CJS,用 require 拿到标准的 module.exports 形状
const oniguruma = require('vscode-oniguruma')
const vsctm = require('vscode-textmate')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// 仓库里只有 krpano 的两个语法,外部依赖语法(内置 XML/JS、CoffeeScript)用最小替身,
// 替身用可识别的 xxx.test.* scope 证明"内容确实走了该语法"。
const stubs = {
  'text.xml': { scopeName: 'text.xml', patterns: [] },
  'source.js': {
    scopeName: 'source.js',
    patterns: [
      { match: '\\b(?:const|let|var|function|return|if|else|new|this|console)\\b', name: 'keyword.test.js' },
      { match: '\\b\\d+\\b', name: 'constant.numeric.test.js' },
      { match: '//.*$', name: 'comment.line.test.js' },
      { name: 'string.quoted.single.test.js', begin: "'", end: "'" },
    ],
  },
  'source.coffee': { scopeName: 'source.coffee', patterns: [{ match: '->', name: 'keyword.test.coffee' }] },
  'source.json': {
    scopeName: 'source.json',
    patterns: [
      { match: '"[^"]*"\\s*:', name: 'support.type.property-name.test.json' },
      { match: '"[^"]*"', name: 'string.quoted.double.test.json' },
      { match: '\\b(?:true|false|null)\\b', name: 'constant.language.test.json' },
      { match: '\\b\\d+\\b', name: 'constant.numeric.test.json' },
    ],
  },
  'source.css': {
    scopeName: 'source.css',
    patterns: [
      { match: '[a-z-]+(?=\\s*:)', name: 'support.type.property-name.test.css' },
      { match: '#[0-9a-fA-F]{3,8}\\b', name: 'constant.other.color.test.css' },
      { match: '\\b\\d+(?:px|em|%)\\b', name: 'constant.numeric.test.css' },
    ],
  },
}

function createRegistry() {
  const wasmPath = require.resolve('vscode-oniguruma/release/onig.wasm')
  const buf = readFileSync(wasmPath)
  const wasm = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  const onigLib = oniguruma.loadWASM(wasm).then(() => ({
    createOnigScanner: patterns => new oniguruma.OnigScanner(patterns),
    createOnigString: s => new oniguruma.OnigString(s),
  }))

  return new vsctm.Registry({
    onigLib,
    loadGrammar: async (scopeName) => {
      if (scopeName === 'source.krpano-xml' || scopeName === 'source.krpano') {
        const file = scopeName === 'source.krpano-xml'
          ? 'syntaxes/krpano-xml.tmLanguage.json'
          : 'syntaxes/krpano.tmLanguage.json'
        return JSON.parse(readFileSync(path.join(root, file), 'utf8'))
      }
      return stubs[scopeName] ?? null
    },
  })
}

/** 逐行 tokenize,返回 { lines, tokenLines }(tokenLines[i] 为第 i 行的 token 数组) */
export async function tokenize(scopeName, text) {
  const registry = createRegistry()
  const grammar = await registry.loadGrammar(scopeName)
  const lines = text.split('\n')
  const tokenLines = []
  let ruleStack = vsctm.INITIAL
  for (const line of lines) {
    const result = grammar.tokenizeLine(line, ruleStack)
    tokenLines.push(result.tokens)
    ruleStack = result.ruleStack
  }
  return { lines, tokenLines }
}

/** 在文本中定位 needle 第 occurrence 次出现的位置 */
function locate(tok, needle, occurrence = 1) {
  let seen = 0
  for (let i = 0; i < tok.lines.length; i++) {
    let from = 0
    while (true) {
      const at = tok.lines[i].indexOf(needle, from)
      if (at === -1)
        break
      seen++
      if (seen === occurrence)
        return { line: i, col: at }
      from = at + 1
    }
  }
  throw new Error(`needle not found in tokenized text: ${JSON.stringify(needle)}`)
}

/** 返回 needle 处 token 的 scope 数组(由外到内) */
export function scopeOf(tok, needle, occurrence = 1) {
  const { line, col } = locate(tok, needle, occurrence)
  for (const token of tok.tokenLines[line]) {
    if (token.startIndex <= col && col < token.endIndex)
      return token.scopes
  }
  throw new Error(`no token at ${line}:${col}`)
}
