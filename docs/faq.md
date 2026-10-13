# 常见问题

## 打开 .xml 文件没有高亮

1. 看编辑器右下角状态栏的语言模式，应为 **krpano-xml** 或 **krpano**；不是的话点击切换。
2. 若想固定关联，在 `settings.json` 中配置：

   ```json
   { "files.associations": { "*.xml": "krpano-xml" } }
   ```

   注意 `krpano-xml` 与 `krpano` 两个语言 ID 都声明了 `.xml` 扩展名，默认选中哪个由 VS Code 决定，手动指定最可靠。
3. 其它扩展（如 vscode-xml）也声明 `.xml` 时可能参与竞争，可用 **Format Document With…** 单独指定格式化器，但语言模式仍需为 krpano 系。

## 格式化没有反应，文件内容没变化

- 确认语言模式是 **krpano-xml**（`krpano` 模式没有注册格式化器）。
- 只有当文档完全无法解析为 XML（空文档、不含标签的纯文本等）时才会静默返回原文，没有任何提示，文件也不变化。
- 反过来，标签未闭合、错配**不会**导致失败：xml-formatter 会容错修复（例如把 `<a></b>` 改成 `<a></a>`）并照常输出。如果格式化后结构变了，先检查原文档是否是合法 XML。
- 如果安装了多个提供 XML 格式化的扩展，用 **Format Document With…** 明确选择本扩展。

## 格式化后多出了一个 `<krpano>` 标签

这是 `xml.format.handleRootNode`（默认 `true`）的预期行为：文件有多个根节点时，扩展会自动包裹 `<krpano>…</krpano>` 再格式化。不想要这个行为就把它设为 `false`，此时格式化会失败并原样返回。

## 注释快捷键（Ctrl/Cmd + /）不可用

- 语言配置只定义了**块注释** `<!-- -->`，没有行注释，快捷键会插入块注释。
- 该问题的修复包含在 v0.0.3 及之后的版本中；如果仍无效，请升级扩展并确认文件语言模式为 krpano 系。

## `<action lang="ts">` 里的 TypeScript 没有高亮

已知问题：该分支目前引用的是 `source.krpano`，未接入 TypeScript 语法，详见 [syntax-highlighting.md](./syntax-highlighting.md#已知问题)。

## 属性里 `{{…}}` 的表达式没有高亮

已知问题：插值规则引用了未定义的 `source.krpano#expression`，目前只高亮 `{{ }}` 定界符本身。详见 [syntax-highlighting.md](./syntax-highlighting.md#已知问题)。

## settings.json 里写 `xml.format.*` 出现"未知配置项"警告

正常现象。这些键未在 `package.json` 的 `contributes.configuration` 中声明，但值会被扩展正常读取（键名对齐 Red Hat vscode-xml 扩展的风格）。详见 [formatting.md](./formatting.md#配置项)。

## 代码片段（snippets）不出现

片段只绑定到 **krpano-xml** 语言模式，切到该模式即可；`krpano` 模式下不提供片段。

## 和 auto-close-tag、vscode-xml 扩展会冲突吗

不会。auto-close-tag 需要按根 README 的说明，把 `krpano-xml` 加入 `auto-close-tag.activationOnLanguage` 才能自动补全标签；vscode-xml 与本文档中的 `xml.format.*` 选项命名兼容，可同时安装。

## 支持哪些版本的 krpano

语法规则是一份固定的 action 关键字/函数清单，不按 krpano 版本区隔。某个较新版本新增的 action 如果没有高亮，可以在 `syntaxes/krpano.tmLanguage.json` 的对应正则里补充（见 [syntax-highlighting.md](./syntax-highlighting.md#扩展方式)）。
