// 从 CHANGELOG.md 抽取某个版本的段落,供 GitHub Release 的 release notes 使用。
// 用法:node scripts/changelog-notes.mjs [版本号]  (省略版本号时取 package.json 的 version)
import { readFileSync } from 'node:fs'
import process from 'node:process'

/** 抽取 `## <version>` 到下一个 `## ` 之间的内容(不含标题行本身) */
export function extractSection(changelog, version) {
  const lines = changelog.split('\n')
  const startIndex = lines.findIndex(line => line.trim() === `## ${version}`)
  if (startIndex === -1)
    return undefined
  const section = []
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## '))
      break
    section.push(lines[i])
  }
  return section.join('\n').trim()
}

/** 抽取某个版本小节里的一个子节(如 ### Fixed),供需要时使用 */
export function extractSubsection(changelog, version, heading) {
  const section = extractSection(changelog, version)
  if (!section)
    return undefined
  const lines = section.split('\n')
  const startIndex = lines.findIndex(line => line.trim() === heading)
  if (startIndex === -1)
    return undefined
  const collected = []
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (lines[i].startsWith('#'))
      break
    collected.push(lines[i])
  }
  return collected.join('\n').trim()
}

const invokedDirectly = process.argv[1]?.endsWith('changelog-notes.mjs')
/**
 * 取某个版本的说明:预发布版本没有单独段落时(如临时用 0.13.0-rc.1 这样的标识),
 * 退回基础版本(0.13.0)的段落,并在开头标注这是预发布。
 */
export function notesFor(changelog, version) {
  const baseVersion = version.replace(/-.*$/, '')
  const exact = extractSection(changelog, version)
  if (exact)
    return exact
  const base = extractSection(changelog, baseVersion)
  if (!base)
    return undefined
  return `> 预发布版本 ${version}(正式版请以 ${baseVersion} 为准)\n\n${base}`
}

if (invokedDirectly) {
  const version = process.argv[2] ?? JSON.parse(readFileSync('package.json', 'utf8')).version
  const changelog = readFileSync('CHANGELOG.md', 'utf8')
  const notes = notesFor(changelog, version)
  if (!notes) {
    console.error(`CHANGELOG.md 中没有找到版本 ${version} 的段落`)
    process.exitCode = 1
  }
  else {
    process.stdout.write(`${notes}\n`)
  }
}
