# 代码片段速查

全部片段定义在 `snippets/krpano.code-snippets`（JSON 格式，key 为标识符，`prefix` 为触发词），通过 `package.json` 的 `contributes.snippets` 绑定到 **krpano-xml** 语言。只有文件处于该语言模式时片段才会出现。

在编辑器中输入前缀后按 Tab 展开，再用 Tab 在占位符之间跳转。`actjs`/`actjspi` 生成的 JavaScript action 会按 VS Code 内置 JS 语法高亮（0.3.0 起）。

## action 与脚本语句

| 前缀 | 生成内容 |
| --- | --- |
| `action` | `<action name="">…</action>` 空骨架 |
| `actjs` | `<action name="" type="javascript"><![CDATA[…]]></action>` |
| `actjspi` | 同 `actjs`，额外带 `autorun="preinit"`，在预初始化阶段自动执行 |
| `if` | `if (cond, 动作);` |
| `ifnot` | `ifnot (cond, 动作);` |
| `ife` | `if (cond, 动作, else动作);` |
| `ifce` | 带 else-if / else 分支的多段 if 骨架 |
| `for` | `for(set(i, 起点), i LT 终点, inc(i), 循环体);` |
| `asyncfor` | 异步版 for 循环骨架 |
| `loop` | `loop(数组或次数, 循环体);` |
| `asyncloop` | 异步 loop 骨架 |
| `callwhen` | `callwhen(条件, 动作);` |
| `asynccall` | `asynccall(动作, 参数);` |
| `delayedcall` | `delayedcall(0.1, 动作);` |
| `setinterval` | `setinterval(名称, 间隔秒, 动作);` |

## 标签结构

| 前缀 | 生成内容 |
| --- | --- |
| `krpano` | `<krpano>…</krpano>` 根标签 |
| `layer` | `<layer name="" keep="true" style="">` 骨架 |
| `l2` | `<layer name="" object="同名"/>` OOP 写法（name 与 object 使用同一占位符） |
| `l3` | OOP 写法并带嵌套内容 |
| `lsi` / `lsiv` | `<layer>` 加 `style="invisible_content"` / `"invisible_content|visible"` |
| `lsikt` / `lsivkt` | 上述两种再加 `keep="true"` |
| `hs` | `<hotspot name="">` 骨架 |
| `hs2` | `<hotspot name="" object="同名"/>` OOP 写法 |
| `hsi` / `hsiv` | `<hotspot>` 加 invisible 样式 |
| `hsikt` / `hsivkt` | 上述两种再加 `keep="true"` |
| `plugin` | `<plugin name="">` 骨架 |
| `style` | `<style name="">` 骨架 |
| `prototype` | `<prototype name="">` 骨架 |
| `object` | `<object name="" extends="">` 骨架 |
| `oeic` | `<object name="" extends="InvisibleContent">` |
| `events` | `<events name="" keep="true">` 骨架 |
| `data` | `<data name=""><![CDATA[…]]></data>` |
| `tag` | 任意标签空骨架 `<… />` |
| `this` | `<this />` |

## 其它

| 前缀 | 生成内容 |
| --- | --- |
| `onsro` | `onnewscene` 防重入模板：先用标志位拦住重复触发，`delayedcall` 延迟复位后再执行逻辑 |
| `++` | 字符串拼接片段 `' + … + '` |
| `""` | 多行引号代码块（引号起一行、内容缩进、引号收尾） |

## 维护说明

- 新增片段：在 `snippets/krpano.code-snippets` 顶层加一个 key，填写 `prefix`、`body`、`description`（现有片段的描述为英文，保持一致即可）；`description` 会显示在补全列表中，务必与实际生成内容一致（0.3.0 修正过一批误导描述）。
- `body` 中的 `\n`、`\t` 需转义；`${1}`、`${2}`… 为 Tab 跳转位，`$0`/`${-1}` 为最后停留位。
- 文件中大多数片段带有 `"scope": ""`，表示不额外限定语言（片段文件本身已绑定 krpano-xml）。
