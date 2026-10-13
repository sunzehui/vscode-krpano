## Features

krpano action high-light code, use textMate syntaxes.

krpano 语法高亮插件，使用 textMate 语法。
![test](https://github.com/sunzehui/vscode-krpano/blob/master/doc/test.png?raw=true)

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
