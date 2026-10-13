## Features

krpano action high-light code, use textMate syntaxes.

krpano 语法高亮插件，使用 textMate 语法。
![test](https://github.com/sunzehui/vscode-krpano/blob/master/doc/test.png?raw=true)

- **语法高亮**:krpano XML 与 action 脚本(含 `type="Javascript"` 的 JS action)高亮
- **语言服务(LSP)**:元素/属性补全与悬停说明、标签配对与未知元素诊断、从 `action_name(...)` 跳转到定义(可跨 `<include>` 的文件)
- **XML 格式化**:按 `Shift+Alt+F` 格式化,选项见下方 Settings
- **代码片段**:53 个常用写法片段(action、标签结构、image/scene/tour 等)

推荐配合 auto-close-tag 插件使用，可以自动补全标签。
需要在 settings.json 中添加如下配置，以支持krpano：
```json
{
  "auto-close-tag.activationOnLanguage": [
    "xml",
    "html",
    "krpano-xml"
  ]
}
```
### XML Formatter Settings

Here is the list of native vscode settings I pass to xml formatter which control how your XML will be formatted. You can change any of these to configure how the XML will be formatted.
[xml-formatter#options](https://github.com/chrisbottin/xml-formatter#options)
```json
"editor.insertSpaces": true,
"editor.tabSize": 4
"xml.format.ignoredPaths": ["action"],
"xml.format.collapseContent": true,
"xml.format.lineSeparator": "\n",
"xml.format.whiteSpaceAtEndOfSelfclosingTag": false
"xml.format.forceSelfClosingEmptyTag": false,
"xml.format.handleRootNode": true, // when format error, auto add krpano tag
```

## 文档

- [文档索引](docs/README.md)
- [架构说明](docs/architecture.md)
- [语法高亮实现](docs/syntax-highlighting.md)
- [XML 格式化](docs/formatting.md)
- [代码片段速查](docs/snippets.md)
- [开发与发布](docs/development.md)
- [常见问题](docs/faq.md)

## Release Notes

### 0.5.0

- 语言服务支持 `<include>` 链:include 进来的动作不再提示"未定义",可直接从调用处跳转到 include 文件里的定义;include 目标不存在会给警告;include 的文件被修改后会自动刷新诊断
- 打包自包含:运行时依赖(xml-formatter、vscode-languageclient、vscode-languageserver)由 tsup 打进 `dist/`,安装包从 354 个文件/910KB 降到 23 个文件/约 520KB,不再携带 `node_modules`
- 修复 include 路径未归一化 `..`/`.` 导致的依赖环与归属判断问题

### 0.4.0

- 新增语言服务(LSP):
  - 诊断:标签未闭合/错配、未知元素、`<action type>` 取值、当前文件中未定义的动作调用
  - 补全:元素名、元素属性(插入 `attr="$1"`)、特殊属性 `devices`/`if`、`<action type>` 取值
  - 悬停:元素与属性的简短说明(基于 krpano XML Reference 的 31 个元素、900+ 属性)
  - 跳转:事件属性或 action 体中的 `action_name(...)` → 对应 `name="..."` 声明
- 格式化前检测到标签未闭合/错配时会先弹窗确认(格式化器会容错修复标签结构)
- 设置项 `xml.format.*` 已在清单中声明,设置界面有补全与说明
- 新增 12 个片段(include、scene、preview、cube/多分辨率 image、view、autorotate、cssstyles、textstyle、带参数的 action、文本 layer、onclick 等)
- 新增 `npm test` 测试体系(语法 scope 断言、格式化与 LSP 单测、语言服务器 stdio 端到端冒烟)与 GitHub Actions CI
- 编辑器缩进规则改为 XML 语义;`krpano` 语言模式明确标注为脚本模式(选 "krpano Action Script")

### 0.3.0

- JavaScript action 高亮:`<action type="Javascript">` / `type="js"`(大小写兼容)的正文按 VS Code 内置 JS 语法着色,CDATA 与内联两种官方写法都支持
- 修复:单行 `<action>…</action>` 正文没有脚本高亮;`{{…}}` 插值内部没有高亮;自闭合 action 的 scope 命名不一致
- 移除无效的 `lang="ts"` / `lang="coffee"` 分支:krpano 官方只支持 `type=""` / `"Javascript"` / `"js"`,不支持 TypeScript,也没有 `lang=` 写法
- 格式化:解析失败时给出警告提示(不再静默);`editor.insertSpaces` 生效(Tab/空格缩进);自动补根时 `<?xml?>` 声明保留在文件最前;`krpano` 语言模式下也可格式化
- 修复:打包配置遗漏运行时依赖(发布出去的 vsix 缺少 `xml-formatter`),格式化功能在安装后不可用
- `.xml` 文件固定归属 `krpano-xml` 语言(此前 `krpano` 也声明 `.xml`,默认语言模式不确定)
- 新增 `npm test`:TextMate 语法的词法断言 + 格式化纯函数测试

### 0.1.0

- Supports XML formatting

### 0.0.3

- Initial release

## TODO

- [ ] LSP support
- [ ] more snippets
