// 集成测试正文(在 VS Code 的扩展宿主里运行);导出 run() 供 @vscode/test-electron 调用。
// 这里的 console 输出就是测试报告(集成环境里没有别的输出通道)。
/* eslint-disable no-console */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vscode = require('vscode')

const EXTENSION_ID = 'sunzehui.krpano-lang'

/** 把 TextEdit 列表按当前位置应用到文本上(校验格式化结果用) */
function applyEdits(text, edits) {
  const lineStarts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n')
      lineStarts.push(i + 1)
  }
  const toOffset = position => lineStarts[position.line] + position.character
  const sorted = [...edits].sort((a, b) => toOffset(b.range.start) - toOffset(a.range.start))
  let result = text
  for (const edit of sorted)
    result = result.slice(0, toOffset(edit.range.start)) + edit.newText + result.slice(toOffset(edit.range.end))
  return result
}

/** 工作区目录 = 启动时打开的 test/.tmp/it-workspace */
function workspaceDir() {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]
  assert.ok(folder, '集成测试需要把 test/.tmp/it-workspace 作为工作区打开')
  return folder.uri.fsPath
}

async function openXml(name, content) {
  const file = path.join(workspaceDir(), name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
  const document = await vscode.workspace.openTextDocument(file)
  await vscode.window.showTextDocument(document)
  return document
}

async function setLanguage(document, language) {
  const updated = await vscode.languages.setTextDocumentLanguage(document, language)
  assert.equal(updated.languageId, language, `语言模式应切换为 ${language}`)
  return updated
}

async function waitFor(predicate, description, timeout = 15000) {
  const started = Date.now()
  for (;;) {
    const value = await predicate()
    if (value)
      return value
    if (Date.now() - started > timeout)
      throw new Error(`等待超时:${description}`)
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

async function run() {
  const failures = []
  const step = async (title, fn) => {
    try {
      await fn()
      console.log(`[it] ok   - ${title}`)
    }
    catch (error) {
      failures.push(`${title}: ${error && error.message ? error.message : error}`)
      console.log(`[it] FAIL - ${title}:`, error && error.message ? error.message : error)
    }
  }

  const extension = vscode.extensions.getExtension(EXTENSION_ID)
  assert.ok(extension, `扩展 ${EXTENSION_ID} 应能被找到`)
  await extension.activate()

  // 1) 命令注册
  const commands = await vscode.commands.getCommands(true)
  for (const id of ['krpano.insertSceneSkeleton', 'krpano.formatAllXml'])
    assert.ok(commands.includes(id), `命令 ${id} 应注册`)

  // 2) 文档格式化(走真实的格式化 provider)
  await step('语言模式与格式化', async () => {
    const tour = await setLanguage(await openXml('tour.xml', '<krpano><view/><hotspot name="a" ath="0"/></krpano>'), 'krpano-xml')
    const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', tour.uri, { tabSize: 2, insertSpaces: true })
    console.log('[it] format edits =', JSON.stringify(edits))
    assert.ok(Array.isArray(edits) && edits.length >= 1, `应返回格式化编辑,实际:${JSON.stringify(edits)?.slice(0, 200)}`)
    // VS Code 会把整文替换拆成最小编辑,应用后校验最终文本
    const formatted = applyEdits(tour.getText(), edits)
    assert.ok(/\n {2}<view\/>/.test(formatted), `格式化结果应换行缩进:${JSON.stringify(formatted)}`)
    assert.ok(formatted.includes('\n  <hotspot name="a" ath="0"/>'), formatted)
  })

  // 3) 命令:插入 scene 骨架
  await step('命令:插入 scene 骨架', async () => {
    await setLanguage(await openXml('scenes.xml', '<krpano>\n</krpano>\n'), 'krpano-xml')
    const before = vscode.window.activeTextEditor.document.getText()
    assert.equal(await vscode.commands.executeCommand('krpano.insertSceneSkeleton'), true)
    const after = vscode.window.activeTextEditor.document.getText()
    assert.ok(after.includes('<scene name="scenes"'), `应插入 scene 骨架:${after}`)
    assert.ok(after.length > before.length)
  })

  // 4) 语言服务:诊断(未知元素 + 属性取值)
  let broken
  await step('语言服务:诊断', async () => {
    broken = await setLanguage(await openXml('broken.xml', '<krpano>\n  <hotspott name="x"/>\n  <hotspot name="y" align="lef" ath="calc:(1+2"/>\n</krpano>\n'), 'krpano-xml')
    const diagnostics = await waitFor(
      () => {
        const found = vscode.languages.getDiagnostics(broken.uri)
        return found && found.length ? found : undefined
      },
      '语言服务诊断',
    )
    const messages = diagnostics.map(d => d.message).join(' | ')
    assert.ok(messages.includes('Unknown krpano element'), `应有未知元素提示:${messages}`)
    assert.ok(messages.includes('is not valid for align'), `应有枚举取值提示:${messages}`)
    assert.ok(messages.includes('Unbalanced parentheses'), `应有表达式配平提示:${messages}`)
    assert.ok(diagnostics.every(d => d.source === 'krpano-lang'), `诊断来源应为 krpano-lang:${messages}`)
    console.log('[it] diagnostics =', messages)
  })

  // 5) 语言服务:补全与悬停
  await step('语言服务:补全与悬停', async () => {
    const completions = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', broken.uri, new vscode.Position(1, 4))
    const labels = completions.items.map(item => (typeof item.label === 'string' ? item.label : item.label.label))
    assert.ok(labels.includes('hotspot'), `应在标签处补全元素名,实际:${labels.slice(0, 8).join(',')}`)

    const hover = await vscode.commands.executeCommand('vscode.executeHoverProvider', broken.uri, new vscode.Position(1, 12))
    const hoverText = (hover ?? []).flatMap(item => item.contents.map(content => (typeof content === 'string' ? content : content.value))).join('\n')
    assert.ok(hoverText.length > 0, '悬停应返回内容')
    console.log('[it] hover =', hoverText.slice(0, 120).replace(/\n/g, ' '))
  })

  // 6) 批量格式化命令(工作区里既有正常文档,也有结构错乱的文档)
  await step('命令:批量格式化', async () => {
    await openXml('messy.xml', '<krpano><view/><hotspot name="a"/></krpano>')
    await openXml('wrong.xml', '<krpano><a></b></krpano>')
    const formattedCount = await vscode.commands.executeCommand('krpano.formatAllXml')
    assert.ok(formattedCount >= 1, `批量格式化应至少改写 1 个文件,实际 ${formattedCount}`)
    const messy = fs.readFileSync(path.join(workspaceDir(), 'messy.xml'), 'utf8')
    assert.ok(/\n\s+<view\/>/.test(messy), `messy.xml 应被格式化:${messy}`)
    const wrong = fs.readFileSync(path.join(workspaceDir(), 'wrong.xml'), 'utf8')
    assert.equal(wrong, '<krpano><a></b></krpano>', '结构会变的文件应保持原样')
  })

  if (failures.length)
    throw new Error(`集成测试失败 ${failures.length} 项:\n - ${failures.join('\n - ')}`)
}

module.exports = { run }
