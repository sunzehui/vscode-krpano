## Features（特性）

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

**Enjoy!**



## TODO

- [ ] LSP support
- [ ] more snippets
