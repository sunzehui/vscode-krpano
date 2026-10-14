# 常见问题

## 打开 .xml 文件没有高亮

1. 看编辑器右下角状态栏的语言模式，应为 **krpano-xml**（XML 文档用）或 **krpano Action Script**（0.4.0 起 `krpano` 模式的别名，只做脚本高亮，不含 XML 标签处理；XML 文档请用 `krpano-xml`）；不是的话点击切换。
2. 若想固定关联，在 `settings.json` 中配置：

   ```json
   { "files.associations": { "*.xml": "krpano-xml" } }
   ```

   0.3.0 起 `.xml` 由 `krpano-xml` 唯一认领（早期版本 `krpano` 也声明过 `.xml`，导致默认模式不确定），一般无需手动指定；需要时再用上面的关联固定。
3. 其它扩展（如 vscode-xml）也声明 `.xml` 时可能参与竞争，可用 **Format Document With…** 单独指定格式化器，但语言模式仍需为 krpano 系。

## 格式化没有反应，文件内容没变化

- 确认语言模式是 **krpano-xml** 或 **krpano**（0.3.0 起两种模式都注册了格式化器）。
- 格式化前如果检测到标签未闭合/错配,会弹出 "unclosed or mismatched XML tags" 确认框——格式化器会容错修复标签结构,继续前请确认。取消后文档不变。
- 只有当文档完全无法解析为 XML（不含标签的纯文本等）时才会返回原文，此时会弹出 `krpano: formatting failed …` 警告；空文档/纯空白是 no-op，不提示。
- 反过来，标签未闭合、错配**不会**导致失败：xml-formatter 会容错修复（例如把 `<a></b>` 改成 `<a></a>`）并照常输出。如果格式化后结构变了，先检查原文档是否是合法 XML。
- 如果安装了多个提供 XML 格式化的扩展，用 **Format Document With…** 明确选择本扩展。

## 格式化后多出了一个 `<krpano>` 标签

这是 `xml.format.handleRootNode`（默认 `true`）的预期行为：文件有多个根节点时，扩展会自动包裹 `<krpano>…</krpano>` 再格式化（若文件开头有 `<?xml?>` 声明，会保留在文件最前）。不想要这个行为就把它设为 `false`，此时格式化会失败并原样返回。

## 注释快捷键（Ctrl/Cmd + /）不可用

- 语言配置只定义了**块注释** `<!-- -->`，没有行注释，快捷键会插入块注释。
- 该问题的修复包含在 v0.0.3 及之后的版本中；如果仍无效，请升级扩展并确认文件语言模式为 krpano 系。

## krpano 支持 TypeScript 吗？为什么 `<action lang="ts">` 没有 TS 高亮？

**krpano 不支持 TypeScript。** krpano XML Reference（v1.21–v1.24 一致）中 `action` 的 `type` 只有三种取值：`""`（默认，普通 krpano action）、`"Javascript"`、`"js"`；文档全文没有 TypeScript，也没有 `lang=` 这种写法。所以本扩展 0.3.0 起不再特殊处理 `lang="ts"`（旧分支是模板残留，已删除），想写 TypeScript 请先在本地编译成 JavaScript，再用官方写法放进 action：

```xml
<action name="my_js" type="Javascript"><![CDATA[
  // 预编译后的 JS 代码
]]></action>
```

`type="Javascript"`/`"js"`（大小写兼容）的正文会按 VS Code 内置 JS 语法高亮，CDATA 与内联两种写法都支持。

## 属性里 `{{…}}` 的插值高亮

0.3.0 起 `{{…}}` 内部会按 krpano 语法着色（此前的引用缺失问题已修复）。两点说明：

- `{{ }}` **不是 krpano 官方语法**（官方用 `get:`/`calc:`/`link:` 属性前缀、`%0`–`%99` 参数占位符），这个高亮是为用 Vue/Handlebars 等模板生成 XML 的工程保留的便利特性。
- 该高亮只在 `<action>` 标签的属性字符串中生效；`<hotspot>`、`<layer>` 等标签的属性由 VS Code 内置 XML 语法处理，插件规则进不去。详见 [syntax-highlighting.md](./syntax-highlighting.md)。

## 语言服务（LSP）提供哪些能力？会不会误报？

0.4.0 起内置语言服务，在 `krpano-xml` / `krpano` 模式下自动生效：

| 能力 | 说明 |
| --- | --- |
| 诊断 | 标签未闭合/错配、`<action type>` 非法取值、`<include>` 目标不存在、`linkedscene` 指向不存在的 scene、同一容器内重名（均为警告）；未知元素、未定义的 `style`、本文件与 include 链中均未定义的动作调用（信息级） |
| 补全 | 元素名、该元素的属性（插入 `ath="$1"` 形式）、特殊属性 `devices`/`if`、`<action type>` 的取值、`style`/`linkedscene` 的已定义名字、事件属性里的动作名 |
| 悬停 | 元素与属性的简短说明（31 个元素、900+ 属性） |
| 跳转 | 事件属性或 action 体里的 `action_name(...)` → 对应 `name="..."` 声明（可跨 `<include>` 的文件） |

两点说明：

- "Action ... is not defined" 是 **information** 级别：0.5.0 起会沿 `<include>` 链解析，只有本文件与 include 的文件里都找不到时才会提示（插件提供的动作也可能不在其中）；不想要可在 Problems 面板按级别过滤。
- "Unknown krpano element" 同样是 **information**：白名单是官方 XML Reference 的 31 个元素，第三方插件自定义的元素可能被标记。

语言服务在独立进程里运行；启动失败只会在扩展宿主控制台打印日志，高亮与格式化不受影响。

## 怎么关掉或调整诊断？

`krpano.lsp.*` 三个设置:

| 设置 | 作用 |
| --- | --- |
| `krpano.lsp.diagnostics.enable` | 关掉全部诊断(补全/悬停/跳转仍可用) |
| `krpano.lsp.diagnostics.undefinedActions` | "未定义动作"的级别:`information`(默认)/ `warning` / `off` |
| `krpano.lsp.diagnostics.ignoredNames` | 不再提示的名字(动作、元素、style、scene),用于压掉插件或动态名字的噪音 |

## 选区格式化（Format Selection）与整篇格式化有什么区别？

整篇格式化（`Shift+Alt+F`）交给 xml-formatter 重排；**选区格式化**只按标签层级把选中行的缩进对齐（不重排属性、不拆行），注释与 CDATA 内部保持原样，落在 `xml.format.ignoredPaths`（默认 `action`）里的选区不做处理。

## 设置里怎么配置格式化选项？

0.4.0 起 `xml.format.*` 已在扩展清单中声明（含中英文说明），在设置界面搜索 `krpano` 或 `xml.format` 即可获得补全与校验；旧版本写入 `settings.json` 也可以，但会显示"未知配置项"提示。详见 [formatting.md](./formatting.md#配置项)。

## 代码片段（snippets）不出现

片段只绑定到 **krpano-xml** 语言模式，切到该模式即可；`krpano` 模式下不提供片段（但格式化可用）。

## 和 auto-close-tag、vscode-xml 扩展会冲突吗

不会。auto-close-tag 需要按根 README 的说明，把 `krpano-xml` 加入 `auto-close-tag.activationOnLanguage` 才能自动补全标签；vscode-xml 与本文档中的 `xml.format.*` 选项命名兼容，可同时安装。

## 支持哪些版本的 krpano

语法规则是一份固定的 action 关键字/函数清单，不按 krpano 版本区隔。某个较新版本新增的 action 如果没有高亮，可以在 `syntaxes/krpano.tmLanguage.json` 的对应正则里补充（见 [syntax-highlighting.md](./syntax-highlighting.md#扩展方式)）。
