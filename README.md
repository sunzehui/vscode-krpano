# krpano-lang

[![CI](https://github.com/sunzehui/vscode-krpano/actions/workflows/ci.yml/badge.svg)](https://github.com/sunzehui/vscode-krpano/actions/workflows/ci.yml)
[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/sunzehui.krpano-lang)](https://marketplace.visualstudio.com/items?itemName=sunzehui.krpano-lang)

krpano syntax highlighting, language server, XML formatting and snippets for Visual Studio Code.

VS Code 下的 krpano 开发插件：语法高亮、语言服务（LSP）、XML 格式化与代码片段。

![test](https://github.com/sunzehui/vscode-krpano/blob/master/doc/test.png?raw=true)

## 功能

- **语法高亮**：krpano XML、action 脚本（含 `type="Javascript"` 的 JS action）、`<data>` 里的 JSON、`<cssstyles>` 里的 CSS
- **语言服务（LSP）**：
  - 补全：元素与属性（插入 `ath="$1"` 形式）、`style=` / `linkedscene=` 取值、事件属性里的动作名、`layer[…]` 括号索引、`layer[info].` 后面的属性、`loadscene(` 等名字参数
  - 诊断与快速修复：标签未闭合/错配、未知元素、未定义的动作与引用、重名 `name`、`%N` 占位符越界；常见问题一键修复
  - 导航与重构：悬停说明、`F12` 跳转、`Shift+F12` 查引用、`F2` 重命名，都能跨 `<include>` 的文件
  - 大纲与工作区符号：Outline 按 scene 树展示结构，`Ctrl+T` 搜索整个工作区的动作与场景
- **XML 格式化**：`Shift+Alt+F` 整篇格式化（用 `<!-- krpano-lang-format: off -->` … `on` 保护区域），或选中一段后 `Ctrl+K Ctrl+F` 只对齐缩进
- **代码片段**：53 个常用写法片段（action、标签结构、image/scene/tour 等）
- 安装后欢迎页提供 4 步引导（打开、诊断、导航、格式化）

## 安装

- **Marketplace**：扩展面板搜索 `krpano-lang`，或[在线安装](https://marketplace.visualstudio.com/items?itemName=sunzehui.krpano-lang)
- **离线/手动安装**：执行 `npx @vscode/vsce package` 自行打包，或从 CI 构建产物（Actions 页面）下载 `.vsix`，再在扩展面板 `…` → **Install from VSIX** 安装

`.xml` 文件自动使用 **krpano-xml** 语言模式；单独编辑 krpano 脚本时可用 **krpano**（别名 "krpano Action Script"）模式，它是纯脚本模式、不含 XML 标签处理。

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

## 设置

### 语言服务（krpano.lsp.*）

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `krpano.lsp.diagnostics.enable` | `true` | 是否启用诊断；关闭后补全/悬停/跳转仍然可用 |
| `krpano.lsp.diagnostics.undefinedActions` | `information` | "动作未定义"的提示级别：`information` / `warning` / `off`（插件或动态生成的动作可设为 `off`） |
| `krpano.lsp.diagnostics.ignoredNames` | `[]` | 不再提示的名字（动作、元素、style、scene），用于压掉插件或动态名字的噪音 |

### XML 格式化（xml.format.*）

Here is the list of native vscode settings I pass to xml formatter which control how your XML will be formatted. You can change any of these to configure how the XML will be formatted.
[xml-formatter#options](https://github.com/chrisbottin/xml-formatter#options)
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

## 文档

- [文档索引](docs/README.md)
- [架构说明](docs/architecture.md)
- [语法高亮实现](docs/syntax-highlighting.md)
- [XML 格式化](docs/formatting.md)
- [代码片段速查](docs/snippets.md)
- [开发与发布](docs/development.md)
- [常见问题](docs/faq.md)

## Release Notes

### 0.10.0

- 大幅性能修复：offset→行列换算由线性扫描改为预建行索引 + 二分，大文档上的诊断与大纲不再卡顿（0.9 MB 的 tour：诊断 108 s → 0.6 s，大纲 50 s → 38 ms，200 文件的工作区索引 4.1 s → 0.39 s）
- 名字参数补全与校验：`loadscene(`、`loadstyle(`、`removehotspot(`、`callwith(caller, …)` 等补全当前文件与 include 里定义的名字，指向不存在的名字会给出提示
- `layer[info].` 后面的属性补全（858 个属性）；`%N` 占位符超出 `args` 声明数量时按信息级提示
- 格式化忽略区：`<!-- krpano-lang-format: off -->` … `on` 之间的内容逐字保留，可跨多个元素
- 安装后提供 4 步欢迎引导（打开、诊断、导航、格式化）
- 工程：`npm run bench` 性能基准（含预算断言）进入 CI；CI 覆盖 ubuntu / macos / windows 三平台，加入 Dependabot、CodeQL 与手动预发布（Pre-Release）workflow

### 0.9.0

- **引用与重命名**：查找所有引用（`Shift+F12`）与 `F2` 重命名可跨文件（include 文件中的定义与引用一并更新）；识别 `layer[info]` 索引、`style="…"` / `linkedscene="…"` 取值、`action_name(…)` 调用与 `loadscene(scene1)` 之类的名字参数
- **括号索引补全与校验**：`layer[`、`hotspot[`、`scene[` 等补全已定义的名字，指向未知名字会给出提示（`layer[get(x)]` 这类动态索引不处理）
- **快速修复**：未知元素 → 改成最接近的元素（开闭标签同步）、`lang="ts"` → `type="Javascript"`、未定义动作调用 → 创建 `<action>` 骨架、重名 `name` → 加后缀重命名、`<include>` 目标缺失 → 创建文件
- **文档大纲与工作区符号**：Outline 按 scene 树展示场景/动作/热点/图层/样式等结构，`Ctrl+T` 搜索整个工作区的动作与场景
- 工作区索引改为惰性扫描（60 秒 TTL，上限 2000 文件 / 单文件 2 MB），文档或文件变化时失效重建

### 0.8.1

- 修正 0.8.0 说明中的 ESLint 版本号（实际为 9）

### 0.8.0

- 悬停说明新增约 105 条(常见属性现在都有说明);属性数据清理掉被文档混排进来的 krpano API 方法(如 `layer.getfullpath`),不再出现在补全里
- include 链解析改为增量:只重新解析版本变化的文件(打开中的文档按编辑器版本号,磁盘文件按 mtime+size)
- 覆盖率(c8)接入 CI,阈值 90% 语句 / 88% 函数 / 75% 分支(当前 95%+/95%+)
- lint 升级到 ESLint 9 + @antfu/eslint-config 9(flat config),`npm run lint` 进入 CI
- 扩展图标换成 128×128 PNG,仓库大图不再随包发布(安装包更小)

### 0.7.0

- 内嵌语言高亮:`<data>` 的 CDATA 正文按 JSON 着色,`<cssstyles>` 内的 `<style>` 正文按 CSS 着色(与 JS action 同一机制)
- 新增 `krpano.lsp.*` 设置:开关诊断、调整"未定义动作"级别(information / warning / off)、忽略指定名字(压掉插件或动态名字的噪音)
- 内建 action 清单改为同时从官方 Actions 文档生成(131 → 145,补入 `forall`、`renderloop`、`looktohotspot` 等)
- 诊断加 250ms 去抖,配置变化时自动重新校验
- 新增语法快照与文档一致性测试(片段/元素数量写死会立刻被测出来)

### 0.6.0

- 更多引用诊断:同一容器内重名的 `name`(scene 之间同名合法)、`linkedscene` 指向不存在的 scene(警告)、`style` 指向不存在的 style(信息级,皮肤/插件可能提供)
- 取值补全:`style` / `linkedscene` 属性补全已定义的名字;事件属性(`onclick` 等)里补全动作名(含 include 文件中的定义)
- 支持**选区格式化**(Format Selection):按标签层级对齐选中行的缩进,注释与 CDATA 内部保持原样,`xml.format.ignoredPaths` 内的选区不动
- 格式化失败时给出解析器的具体原因,不再是笼统提示
- 新增 `Release` workflow:推送 `v*` tag 时校验版本号并发布到 Marketplace(需配置 `VSCE_PAT` secret)

### 0.5.0

- 语言服务支持 `<include>` 链:include 进来的动作不再提示"未定义",可直接从调用处跳转到 include 文件里的定义;include 目标不存在会给警告;include 的文件被修改后会自动刷新诊断
- 打包自包含:运行时依赖(xml-formatter、vscode-languageclient、vscode-languageserver)由 tsup 打进 `dist/`,安装包从 354 个文件/910KB 降到 23 个文件/约 520KB,不再携带 `node_modules`
- 修复 include 路径未归一化 `..`/`.` 导致的依赖环与归属判断问题

### 0.4.0

- 新增语言服务(LSP):
  - 诊断:标签未闭合/错配、未知元素、`<action type>` 取值、当前文件中未定义的动作调用
  - 补全:元素名、元素属性(插入 `attr="$1"`)、特殊属性 `devices`/`if`、`<action type>` 取值
  - 悬停:元素与属性的简短说明(基于 krpano XML Reference 的 31 个元素、858 个属性)
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

- [ ] 变量类型推断与 `get:` / `calc:` 表达式的校验
- [ ] 更多代码片段

评估后未实现的能力（krpano 版本/废弃项感知、属性排版选项、脚本重排缩进、LSP 消息本地化）与原因见[开发文档](docs/development.md)。
