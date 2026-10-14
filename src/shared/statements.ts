// 脚本语句级排版:把同一行里用 ";" 分隔的多条 krpano 语句拆到各自的行。
// 只处理非 JS 的 <action> 正文(JS 交给 VS Code 的 JS 格式化),且只按语句边界拆分,
// 不重排语句、不改动字符串与括号内的 ";"。默认关闭(xml.format.scriptStatements)。
export interface StatementSplitResult {
  text: string
  changed: boolean
}

/** 找出该行里可安全切断的 ";" 位置(不在引号内、括号深度为 0) */
function splitPoints(line: string): number[] {
  const points: number[] = []
  let quote: string | undefined
  let depth = 0
  let escaped = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (quote) {
      if (escaped) {
        escaped = false
      }
      else if (char === '\\') {
        escaped = true
      }
      else if (char === quote) {
        quote = undefined
      }
      continue
    }
    if (char === '\'' || char === '"') {
      quote = char
      continue
    }
    if (char === '(') {
      depth++
    }
    else if (char === ')') {
      depth = Math.max(0, depth - 1)
    }
    else if (char === ';' && depth === 0) {
      points.push(i)
    }
    else if (char === '<' && depth === 0) {
      // 行内出现标签(如 <!-- 注释 -->)时不再拆分,避免误判
      return []
    }
  }
  return points
}

/** 拆分单行:保持首条语句的缩进,后续语句与首条对齐(可用 indentOverride 指定缩进) */
function splitLine(line: string, indentOverride?: string): string {
  const trimmedLine = line.trim()
  if (!trimmedLine)
    return line
  const lineIndent = /^[ \t]*/.exec(line)?.[0] ?? ''
  const indent = indentOverride ?? lineIndent
  const body = line.slice(lineIndent.length)
  const points = splitPoints(body)
  // 末尾的那一个是语句分隔符而不是"两条语句"
  const cutPoints = points.filter(point => body.slice(point + 1).trim() !== '')
  if (!cutPoints.length)
    return line
  const statements: string[] = []
  let start = 0
  for (const point of cutPoints) {
    const piece = body.slice(start, point + 1).trim()
    if (piece)
      statements.push(piece)
    start = point + 1
  }
  const rest = body.slice(start).trim()
  if (rest)
    statements.push(rest)
  if (statements.length < 2)
    return line
  // 第一条语句留在原位置(与 <action> 同行时保持内联),续行对齐到指定缩进
  return statements.map((statement, index) => (index === 0 ? lineIndent : indent) + statement).join('\n')
}

/** 把非 JS 的 <action> 正文里同一行的多条语句拆成多行 */
export function splitActionStatements(text: string, indentation = '  '): StatementSplitResult {
  const edits: Array<{ start: number, end: number, text: string }> = []
  const actionRe = /<action\b([^>]*)>([\s\S]*?)<\/action>/g
  for (const match of text.matchAll(actionRe)) {
    const typeMatch = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(match[1])
    const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? '').toLowerCase()
    if (type === 'javascript' || type === 'js')
      continue
    const body = match[2]
    if (!body.includes(';'))
      continue
    // 正文首行与 <action> 同行时,续行缩进 = 标签缩进 + 一级
    const tagIndent = /^[ \t]*/.exec(text.slice(text.lastIndexOf('\n', match.index!) + 1, match.index!))?.[0] ?? ''
    const firstLineIndent = tagIndent + indentation
    const rendered = body.split('\n').map((line, index) => splitLine(line, index === 0 ? firstLineIndent : undefined)).join('\n')
    if (rendered === body)
      continue
    const bodyStart = match.index! + match[0].indexOf(body)
    edits.push({ start: bodyStart, end: bodyStart + body.length, text: rendered })
  }

  if (!edits.length)
    return { text, changed: false }
  let out = text
  for (const edit of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return { text: out, changed: true }
}
