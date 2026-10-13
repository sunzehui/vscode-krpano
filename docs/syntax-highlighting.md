# 语法高亮实现

高亮基于 TextMate 语法（两个 `.tmLanguage.json` 文件），不依赖任何运行时代码。本页说明两个语法的分工、`<action>` 的分支匹配、scope 命名规则，以及如何扩展和调试。

## 两个语法的分工

- **`source.krpano-xml`**（`syntaxes/krpano-xml.tmLanguage.json`，`fileTypes: ["xml"]`）
  宿主语法。负责普通 XML 结构（标签、属性、注释、字符串、实体）；在 `patterns` 末尾用 `include: text.xml` 兜底——凡是自己没匹配到的部分，交给 VS Code 内置 XML 语法处理。

- **`source.krpano`**（`syntaxes/krpano.tmLanguage.json`）
  action 脚本语法。定义 krpano action 语言的关键字、变量、函数、操作符等；自身不处理 XML，只被 `source.krpano-xml` 内嵌调用，同时作为独立语言 ID `krpano` 注册。

两个语言 ID 都声明了 `.xml` 扩展名，VS Code 会为 `.xml` 文件选择其中一个语言模式（可用编辑器右下角状态栏手动切换）。高亮的完整效果要求文件处于 `krpano-xml` 模式，因为只有它内嵌了 `source.krpano`。

## krpano-xml：宿主语法

### `<action>` 标签的分支匹配

规则按声明顺序匹配，命中第一个满足的分支：

| 顺序 | 匹配形态 | 内容处理 |
| --- | --- | --- |
| 1–2 | 自闭合 `<action …/>` | 仅属性高亮。有两条条件高度重叠的规则（对行尾空白、命名 scope 的处理略有差异） |
| 3 | 单行 `<action …>…</action>`（正文中不含 `/`、`>`） | 内容不做脚本高亮 |
| 4 | `<action lang="ts" …>` 多行写法 | 当前按 `source.krpano` 高亮（见下方已知问题） |
| 5 | `<action lang="coffee" …>` 多行写法 | 按 `source.coffee` 高亮（需系统内存在 CoffeeScript 语法） |
| 6 | 其它多行 `<action …>…</action>` | 按 `source.krpano` 高亮 |

由于按序匹配，单行写法会先被第 3 条吃掉，因此 `lang="ts|coffee"` 分支只对多行写法生效。

每个分支的写法一致：用 `begin`/`end` 覆盖整个 action 块，`patterns` 里先 `include: "#tag-stuff"` 处理属性，再对 `>` 之后的正文设置 `contentName` 并 `include` 目标语法。例如默认多行分支的正文以 `source.krpano` 为 contentName 递归包含脚本语法。

### repository 复用块

`repository` 中的命名块可被本语法自身及其它语法引用：

- `comments`：`<!-- -->` 块注释。`source.krpano` 通过 `include: "source.krpano-xml#comments"` 复用它，因此 action 脚本里的 XML 注释也有注释高亮。
- `entities`：HTML 实体（如 `&amp;`）与非法裸 `&`。
- `string-double-quoted` / `string-single-quoted`：标签属性字符串；内部继续包含 `#krpano-interpolations` 与 `#entities`。
- `tag-stuff`：属性名（`tag-generic-attribute`）、特殊处理的 `id` 属性（`tag-id-attribute`，带 TOC scope）、两种字符串。
- `krpano-interpolations`：`{{ … }}` / `{{{ … }}}` 插值定界符，内部引用 `source.krpano#expression`（见已知问题）。

### 兜底

除 `<action>` 外的所有标签（`<krpano>`、`<hotspot>`、`<layer>`、`<view>` 等）、注释、实体、属性、字符串都由上面的规则或末尾的 `include: "text.xml"` 处理，表现与 VS Code 内置 XML 高亮一致。

## source.krpano：action 脚本语法

`patterns` 按顺序匹配，列表靠后的规则兜底。主要类别：

| 类别 | scope | 覆盖内容示例 |
| --- | --- | --- |
| 注释 | `comment.block.html` | `<!-- -->`（复用宿主语法的规则） |
| 字符串 | `string.quoted.*.krpano-string` | `'…'`、`"…"` |
| 控制关键字 | `keyword.control.krpano-statement` | `krpano` `if` `for` `switch` `break` `loop` `asyncloop` |
| 全局类 | `support.class.krpano-global-class` | `Math` `caller` |
| 全局变量 | `support.variable.krpano-global-variable` | `xml` `device` `mouse` `stagex` `random` `scene` `view` `local` …（数量很多） |
| 全局函数 | `support.function.krpano-global-function` | `set` `calc` `copy` `tween` `loadscene` `spheretoscreen` `add` `sub` `min` `max` … |
| 定义 | `storage.type.krpano-def` | `def` |
| 关系操作符 | `keyword.operator.relational.krpano-operator` | `EQ` `NE` `LT` `LE` `GT` `GE` |
| 逻辑/算术操作符 | `keyword.operator.*.krpano-operator` | `AND` `OR` `XOR` `!` `>=` `+` `-` `*` `/` `%` `=` 等 |
| 常量 | `constant.*.krpano-*` | 数字（含 `%` 后缀）、`true`、`false`、`null` |
| 属性访问 | `punctuation.accessor.krpano-accessor` + `variable.other.property.krpano-property` | `caller.name` 中的 `.name` |
| 变量兜底 | `variable.other.readwrite.krpano-variable` | 任意 `\w+` 单词 |

## 扩展方式

**新增全局函数 / 变量 / 关键字**：在 `syntaxes/krpano.tmLanguage.json` 对应规则的正则 alternation 中追加单词即可。注意：

- 规则顺序即优先级（TextMate 先声明先匹配），新词加到已有规则里比新建规则更安全；
- 单词用 `|` 分隔、`\b` 包围，注意词边界；
- 列表中混有一些来自 krpano 文档章节标题的中文/带空格条目（如 `Loading information`、`Coordinate transformation`），它们不构成有效分支（单独出现的 "Loading" 并不会命中），清理时可直接删除；
- 全局变量列表中含单字母 `x`、`y`，加上末尾的变量兜底规则会匹配任意单词，个别上下文可能误高亮。调整时优先改规则顺序或收窄正则，而不是简单删词。

**新增嵌入了其它语言的 action 分支**：复制 `lang="coffee"` 分支，修改语言判定正则、`contentName` 与 `include` 三处即可。

**新增 XML 层结构**：在 `krpano-xml.tmLanguage.json` 的 `patterns` 前部加 `begin`/`end` 规则；能落到 `text.xml` 的部分不需要自己写。

## 调试方法

1. 在 VS Code 中按 F5 启动扩展开发宿主（`launch.json` 会以 `--disable-extensions` 打开 `sample/` 目录，避免其它扩展干扰）。
2. 打开 `sample/test.xml`，光标放到目标位置，命令面板执行 **Developer: Inspect Editor Tokens and Scopes**，查看命中的 scope 与语法规则。
3. 修改 `syntaxes/*.json` 后，在扩展开发宿主里执行 **Developer: Reload Window** 即可生效，不需要重新构建（语法文件在运行时按需加载）。

## 已知问题

- **`lang="ts"` 分支未接入 TypeScript 语法**：该分支的 `patterns` 引用的是 `source.krpano` 而非 `source.ts`，与 `lang="coffee"` 分支的处理方式不对称，疑似遗留问题。
- **`{{…}}` 插值内部无脚本高亮**：`krpano-interpolations` 引用 `source.krpano#expression`，但 `source.krpano` 中并未定义名为 `expression` 的 repository 项，引用不会生效，目前只会高亮插值定界符本身。
- **兜底变量规则的 captures 键有误**：`source.krpano` 末条规则 `(\w+)` 的 `captures` 写成 `"2"`，而正则只有一个捕获组，该捕获项不会生效（对整体效果影响不大）。
- **单行 `<action>…</action>` 无脚本高亮**：见分支表第 3 条，这是当前的设计边界。
