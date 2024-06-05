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

## Release Notes

### 0.1.0

- Supports XML formatting

### 0.0.3

- Initial release

## TODO

- [ ] LSP support
- [ ] more snippets
