# 语法高亮实现

高亮基于 TextMate 语法（两个 `.tmLanguage.json` 文件），不依赖任何运行时代码。本页说明两个语法的分工、`<action>` 的分支匹配、scope 命名规则，以及如何扩展和调试。

## 两个语法的分工

- **`source.krpano-xml`**（`syntaxes/krpano-xml.tmLanguage.json`，`fileTypes: ["xml"]`）
  宿主语法。负责普通 XML 结构（标签、属性、注释、字符串、实体）；在 `patterns` 末尾用 `include: text.xml` 兜底——凡是自己没匹配到的部分，交给 VS Code 内置 XML 语法处理。

- **`source.krpano`**（`syntaxes/krpano.tmLanguage.json`）
  action 脚本语法。定义 krpano action 语言的关键字、变量、函数、操作符等；自身不处理 XML，只被 `source.krpano-xml` 内嵌调用，同时作为独立语言 ID `krpano` 注册。

`.xml` 文件由 `krpano-xml` 唯一认领（0.3.0 起 `krpano` 不再声明 `.xml` 关联，避免默认语言归属不确定）；高亮的完整效果要求文件处于 `krpano-xml` 模式，因为只有它内嵌了 `source.krpano`。`krpano` 模式仍可在状态栏手动切换，格式化器对两种模式都可用。

## krpano-xml：宿主语法

### `<action>` 标签的分支匹配

规则按声明顺序匹配，命中第一个满足的分支：

| 顺序 | 匹配形态 | 内容处理 |
| --- | --- | --- |
| 1 | 自闭合 `<action …/>`（容忍行尾空白） | 仅属性高亮 |
| 2 | `type="Javascript"` / `type="js"`（大小写兼容）且非自闭合 | 正文按 `source.js` 高亮；CDATA 包裹（官方骨架写法）与内联两种写法都支持 |
| 3 | 单行 `<action …>…</action>`（正文中不含 `/`、`>`） | 正文按 `source.krpano` 高亮 |
| 4 | 其它多行 `<action …>…</action>` | 正文按 `source.krpano` 高亮 |

krpano 官方只支持 `type=""`（默认）、`type="Javascript"` 与 `type="js"`（krpano XML Reference 的 `action[name].type`，v1.21–v1.24 一致），**不支持 TypeScript**。早期版本里的 `lang="ts"`/`lang="coffee"` 分支是针对不存在写法的模板残留，0.3.0 已删除。

每个分支的写法一致：用 `begin`/`end` 覆盖整个 action 块，`patterns` 里先 `include: "#tag-stuff"` 处理属性，再对 `>` 之后的正文设置 `contentName` 并 `include` 目标语法。例如默认多行分支的正文以 `source.krpano` 为 contentName 递归包含脚本语法。

### repository 复用块

`repository` 中的命名块可被本语法自身及其它语法引用：

- `comments`：`<!-- -->` 块注释。`source.krpano` 通过 `include: "source.krpano-xml#comments"` 复用它，因此 action 脚本里的 XML 注释也有注释高亮。
- `entities`：HTML 实体（如 `&amp;`）与非法裸 `&`。
- `string-double-quoted` / `string-single-quoted`：标签属性字符串；内部继续包含 `#krpano-interpolations` 与 `#entities`。
- `tag-stuff`：属性名（`tag-generic-attribute`）、特殊处理的 `id` 属性（`tag-id-attribute`，带 TOC scope）、两种字符串。
- `krpano-interpolations`：`{{ … }}` / `{{{ … }}}` 插值定界符，内部引用 `source.krpano#expression`（在 `source.krpano` 的 `repository.expression` 中定义）。注意 `{{ }}` **不是 krpano 官方语法**（官方用 `get:`/`calc:`/`link:` 属性前缀与 `%0`–`%99` 参数占位符），这里是为使用 Vue/Handlebars 等模板生成 XML 的工程保留的高亮；又因为非 action 标签由内置 XML 语法处理，插值高亮只在 `<action>` 标签的属性字符串中生效。

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
- 0.3.0 已清理混入列表的 krpano 文档章节标题（`Loading information`、`Coordinate transformation` 等，属死分支）；新增词条时不要把多词短语当单词加进去；
- 全局变量列表中含单字母 `x`、`y`，加上末尾的变量兜底规则会匹配任意单词，个别上下文可能误高亮。调整时优先改规则顺序或收窄正则，而不是简单删词。

**新增嵌入了其它语言的 action 分支**：复制 `type="Javascript"` 分支（含 CDATA 处理），修改语言判定正则、`contentName` 与 `include` 三处即可。

**新增 XML 层结构**：在 `krpano-xml.tmLanguage.json` 的 `patterns` 前部加 `begin`/`end` 规则；能落到 `text.xml` 的部分不需要自己写。

## 调试方法

1. 在 VS Code 中按 F5 启动扩展开发宿主（`launch.json` 会以 `--disable-extensions` 打开 `sample/` 目录，避免其它扩展干扰）。
2. 打开 `sample/test.xml`，光标放到目标位置，命令面板执行 **Developer: Inspect Editor Tokens and Scopes**，查看命中的 scope 与语法规则。
3. 修改 `syntaxes/*.json` 后，在扩展开发宿主里执行 **Developer: Reload Window** 即可生效，不需要重新构建（语法文件在运行时按需加载）。

## 现状说明（0.3.0）

- `type="Javascript"`/`"js"` 的 action 正文按 VS Code 内置 JS 语法高亮，CDATA 标记单独标为 punctuation；krpano 不支持 TypeScript，`lang="ts"` 写法不再特殊处理。
- 单行 `<action>…</action>` 正文与多行写法一致，按 krpano 脚本高亮。
- `{{…}}` 插值内部按 krpano 语法高亮，但只对 `<action>` 标签的属性字符串生效（非 action 标签的属性由内置 XML 语法处理，规则进不去）。
- 变量兜底规则不再带无效 captures；`x`、`y` 两个单字母全局变量仍保留（可能是真实变量），确认误高亮后可单独移除。
- 以上行为均有 `test/grammar.test.mjs` 的词法断言覆盖，改动语法后请跑 `npm test`。
