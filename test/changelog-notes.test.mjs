import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractSection, extractSubsection, notesFor } from '../scripts/changelog-notes.mjs'

const changelog = [
  '# Changelog',
  '',
  '## 1.2.0',
  '',
  '### Added',
  '',
  '- 新功能 A',
  '- 新功能 B',
  '',
  '### Fixed',
  '',
  '- 修了 C',
  '',
  '## 1.1.0',
  '',
  '- 旧东西',
  '',
].join('\n')

test('抽取版本段落:不含标题、到下一个标题为止', () => {
  const section = extractSection(changelog, '1.2.0')
  assert.ok(section.startsWith('### Added'), section)
  assert.ok(section.includes('- 修了 C'), section)
  assert.ok(!section.includes('旧东西'), '不应包含下一个版本的段落')
  assert.ok(!section.includes('## 1.2.0'), '不应包含标题行')
})

test('抽取版本段落:不存在的版本返回 undefined', () => {
  assert.equal(extractSection(changelog, '9.9.9'), undefined)
})

test('抽取子节:到下一个 # 级标题为止', () => {
  assert.equal(extractSubsection(changelog, '1.2.0', '### Fixed'), '- 修了 C')
  assert.equal(extractSubsection(changelog, '1.2.0', '### Missing'), undefined)
})

test('预发布版本:退回基础版本段落并标注', () => {
  const notes = notesFor(changelog, '1.2.0-rc.1')
  assert.ok(notes.startsWith('> 预发布版本 1.2.0-rc.1'), notes)
  assert.ok(notes.includes('- 新功能 A'), notes)

  // 有精确段落时优先用它,不加标注
  assert.equal(notesFor(changelog, '1.2.0'), extractSection(changelog, '1.2.0'))
  // 两者都没有 → undefined(调用方据此报错)
  assert.equal(notesFor(changelog, '9.9.9-rc.2'), undefined)
})
