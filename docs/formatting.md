# XML 格式化

格式化是扩展中唯一的运行时功能：按 `Shift+Alt+F`（格式化文档）或启用保存时格式化，会把 krpano XML 重新排版。实现入口是 `src/extension.ts`，核心逻辑在 `src/beautifyHtml.ts` 与 `src/getOptions.ts`。

## 触发条件

- 文件语言模式必须是 **krpano-xml** 或 **krpano**（0.3.0 起两种模式都注册了格式化器，见 src/extension.ts）。
- 通过 `vscode.languages.registerDocumentFormattingEditProvider` 注册，采用 **整篇替换**：对全文构造一个 `Range`，返回单个 `TextEdit`；内容没有变化时不返回 Edit。
- 若同时安装了提供格式化能力的扩展（如 vscode-xml），可通过命令面板的 **Format Document With…** 选择使用哪个格式化器。

## 实现流程

```
文档全文
  └─ getOptions(workspace 配置)          # src/getOptions.ts
       └─ beautify(text, options)         # src/beautifyHtml.ts
            ├─ 空/纯空白文档 → 原样返回（failed: false，不提示）
            ├─ 填充默认值，throwOnFailure: true
            └─ xml-formatter
                 ├─ 成功 → 返回格式化结果
                 └─ 抛异常
                      ├─ handleRootNode 且错误含 "Found multiple root nodes"
                      │     → 提取 <?xml?> 声明，用 <krpano>…</krpano> 包裹正文后重试
                      └─ 其它解析失败 → 原样返回输入文本，failed: true
                           └─ extension.ts 弹出警告提示（内容保持不变）
```

> 注意：xml-formatter 的解析器相当宽容。**标签未闭合、错配不会被判为失败，而是被"修复"**（实测 `<krpano><a></b></krpano>` 会被改写为 `<krpano><a></a></krpano>`），格式化照常输出。也就是说，格式化可能静默改变不合规文档的标签结构；提交格式化结果前建议先看一遍 diff。

三个文件各司其职：

| 文件 | 职责 |
| --- | --- |
| `src/extension.ts` | 注册 provider（krpano-xml 与 krpano 两个语言），取全文、算 Range、返回替换 Edit；失败时提示 |
| `src/getOptions.ts` | 把 VS Code 配置映射为 xml-formatter 选项；`indentation` 缺省时按 `editor.insertSpaces`/`tabSize` 换算 |
| `src/beautifyHtml.ts` | 补默认值、调用 xml-formatter、处理多根节点与失败回退，返回 `{ text, failed }` |
| `src/types/options.ts` | 类型定义：`XMLFormatterOptions & { handleRootNode: boolean }` |

## 配置项

格式化选项通过 `vscode.workspace.getConfiguration()` 读取，因此 VS Code 的配置优先级（工作区 > 用户等）照常生效。

这些键已在 `package.json` 的 `contributes.configuration` 中声明（0.4.0 起，中英文说明），设置界面可获得补全与校验；键名沿用 vscode-xml 扩展的风格，但与本仓库实际使用的 xml-formatter 选项一一对应。

| 设置 | 代码中的默认值 | 说明 |
| --- | --- | --- |
| `editor.insertSpaces` | VS Code 自身配置（缺省视为 `true`） | 为 `false` 且未设置 `xml.format.indentation` 时使用 Tab 缩进 |
| `editor.tabSize` | VS Code 自身配置（缺失时兜底 4） | 缩进宽度基数；仅当 `xml.format.indentation` 未设置且用空格缩进时生效 |
| `xml.format.indentation` | 按上面两项换算 | 缩进字符串，如 `"  "`、`"    "` 或 `"\t"`；显式设置时优先级最高 |
| `xml.format.collapseContent` | `true` | 元素内容只含文本（且文本内无换行）时，把内容保持在标签同一行 |
| `xml.format.ignoredPaths` | `["action"]` | 跳过格式化的元素路径；默认忽略 `action`，其内容（含空白与换行）保持原样 |
| `xml.format.lineSeparator` | `"\n"` | 换行符 |
| `xml.format.whiteSpaceAtEndOfSelfclosingTag` | 不传（库默认 `false`） | 自闭合标签 `/>` 前是否加空格 |
| `xml.format.forceSelfClosingEmptyTag` | 不传（库默认 `false`） | 空元素是否强制写成自闭合形式 |
| `xml.format.handleRootNode` | `true` | **本扩展自定义**：解析失败且原因是多根节点时，自动包裹 `<krpano>…</krpano>` 重试 |
| `xml.format.attributeLayout` | `preserve` | **本扩展自定义**：`one-per-line` 每个属性一行；`align` 每行一个并把 `=` 对齐（krpano 官方示例风格） |
| `xml.format.actionIndentation` | `false` | **本扩展自定义**：按括号层级重新缩进 `<action>` 正文；开启后 action 内容即使列在 `ignoredPaths` 里也会被调整缩进，JS 动作不受影响 |
| `xml.format.scriptStatements` | `false` | **本扩展自定义**：把同一行里用 `;` 分隔的多条脚本语句拆到多行；只动普通 action 的语句边界，字符串/括号内的分号不动，JS 动作跳过 |

各选项的完整语义以 [xml-formatter 文档](https://github.com/chrisbottin/xml-formatter#options) 为准。两点补充说明：

- **缩进取值的优先级**：格式化请求携带的 `tabSize`/`insertSpaces`（VS Code 调用 provider 时传入，与编辑器当前设置一致）> `xml.format.indentation`（留空视为未设置）> `editor.insertSpaces`（`false` 用 `\t`）> 按 `editor.tabSize`（兜底 4）生成空格。
- **语句拆分的顺序**：`scriptStatements` 先拆行，`actionIndentation` 再按括号给拆出来的行统一缩进，两者同时开启时结果最整齐。
- 未设置 `whiteSpaceAtEndOfSelfclosingTag` / `forceSelfClosingEmptyTag` 时使用库默认值 `false`，即自闭合标签写成 `<tag/>`、空元素保持 `<tag></tag>`。

### 推荐配置（来自根 README）

```json
{
  "editor.insertSpaces": true,
  "editor.tabSize": 4,
  "xml.format.ignoredPaths": ["action"],
  "xml.format.collapseContent": true,
  "xml.format.lineSeparator": "\n",
  "xml.format.whiteSpaceAtEndOfSelfclosingTag": false,
  "xml.format.forceSelfClosingEmptyTag": false,
  "xml.format.handleRootNode": true
}
```

## 两个特殊行为

**多根节点自动补根**：krpano XML 片段（如只有若干 `<action>` 的文件）可能没有根节点，xml-formatter 会报 `Found multiple root nodes`。当 `handleRootNode` 为 `true`（默认）时，扩展会把正文用 `<krpano>` 包裹后重新格式化，因此结果会**多出**一层 `<krpano>` 根标签；文档开头的 `<?xml?>` 声明会被单独提取并留在文件最前，不会被包进根节点。

**结构变化会先确认**：`beautify` 会比较格式化前后的标签结构签名（`src/shared/xml.ts`）。当文档存在未闭合或错配标签、格式化会"修复"结构时，返回 `structureChanged: true`，扩展弹出模态确认框（Format anyway / 取消），取消则不修改文档。仅缩进变化、空标签的 `<a></a>` 与 `<a/>` 两种写法都不会触发确认。

**失败会给出提示**：解析器只在少数情况下真正失败（不含标签的纯文本等），此时内容原样保留，并在编辑器右下角弹出 `krpano: formatting failed …` 警告；空文档/纯空白则视为 no-op，不提示。注意标签未闭合、错配这类"半合法"文档**不会**失败——xml-formatter 会容错修复并照常输出（见上一节的提示），这时由上一条的确认框兜底。排查时可参考 `sample/format.xml` 这类标准结构。

## 示例

- `sample/format.xml`：krpano 官方 animated hotspots 示例，包含多行 `<action>` 与缩进不规范的标签，适合验证格式化效果。
- `sample/test.xml`：验证 `ignoredPaths` 对 `<action>` 内容的保留效果。
