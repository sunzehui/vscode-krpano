// 语法快照:对 sample/ 下的示例统计"最内层 scope → token 数"。
// 目的不是断言每个 scope 的正确性,而是在语法改动导致大面积着色变化时立刻暴露出来
// (合理的改动需要同步更新下面的期望值)。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { tokenize } from './helpers/grammar.mjs'

const expected = {
  'sample/test.xml': {
    'comment.block.html': 15,
    'comment.line.test.js': 1,
    'constant.language.boolean.true.krpano-boolean': 1,
    'constant.language.null.krpano-null': 1,
    'constant.numeric.decimal.krpano-number': 6,
    'entity.name.tag.action.html': 11,
    'entity.other.attribute-name.html': 11,
    'keyword.control.krpano-statement': 4,
    'keyword.operator.krpano-operator': 3,
    'keyword.operator.logical.krpano-operator': 1,
    'keyword.operator.relational.krpano-operator': 2,
    'keyword.test.js': 3,
    'punctuation.accessor.krpano-accessor': 18,
    'punctuation.definition.cdata.begin.html': 1,
    'punctuation.definition.cdata.end.html': 1,
    'punctuation.definition.comment.html': 30,
    'punctuation.definition.generic.begin.html': 1,
    'punctuation.definition.generic.end.html': 1,
    'punctuation.definition.krpano-punctuation': 94,
    'punctuation.definition.string.begin.html': 11,
    'punctuation.definition.string.end.html': 11,
    'punctuation.definition.tag.begin.html': 11,
    'punctuation.definition.tag.end.html': 11,
    'punctuation.separator.comma.krpano-comma': 37,
    'storage.type.krpano-def': 1,
    'string.quoted.double.html': 10,
    'string.quoted.single.krpano-string': 9,
    'string.quoted.single.test.js': 6,
    'support.class.krpano-global-class': 10,
    'support.function.krpano-global-function': 24,
    'support.variable.krpano-global-variable': 9,
    'variable.other.property.krpano-property': 18,
    'variable.other.readwrite.krpano-variable': 46,
  },
  'sample/format.xml': {
    'comment.block.html': 4,
    'constant.language.null.krpano-null': 1,
    'constant.numeric.decimal.krpano-number': 5,
    'entity.name.tag.action.html': 2,
    'entity.other.attribute-name.html': 3,
    'keyword.control.krpano-statement': 3,
    'keyword.operator.logical.krpano-operator': 1,
    'keyword.operator.relational.krpano-operator': 1,
    'punctuation.accessor.krpano-accessor': 12,
    'punctuation.definition.comment.html': 8,
    'punctuation.definition.krpano-punctuation': 67,
    'punctuation.definition.string.begin.html': 3,
    'punctuation.definition.string.end.html': 3,
    'punctuation.definition.tag.begin.html': 2,
    'punctuation.definition.tag.end.html': 2,
    'punctuation.separator.comma.krpano-comma': 20,
    'storage.type.krpano-def': 1,
    'string.quoted.double.html': 3,
    'string.quoted.single.krpano-string': 7,
    'support.class.krpano-global-class': 10,
    'support.function.krpano-global-function': 16,
    'support.variable.krpano-global-variable': 3,
    'variable.other.property.krpano-property': 12,
    'variable.other.readwrite.krpano-variable': 29,
  },
}

for (const [file, snapshot] of Object.entries(expected)) {
  test(`语法快照:${file}`, async () => {
    const text = readFileSync(file, 'utf8')
    const tokenized = await tokenize('source.krpano-xml', text)
    const counts = {}
    for (const line of tokenized.tokenLines) {
      for (const token of line) {
        const deepest = token.scopes[token.scopes.length - 1]
        if (deepest.startsWith('source.'))
          continue
        counts[deepest] = (counts[deepest] || 0) + 1
      }
    }
    assert.deepEqual(counts, snapshot, '语法改动导致 scope 统计变化时,请确认是否符合预期并同步此快照')
  })
}
