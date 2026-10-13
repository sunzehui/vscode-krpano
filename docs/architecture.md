# 架构说明

## 总览

krpano-lang 是一个"声明式为主"的 VS Code 扩展：高亮、语言行为、代码片段全部由 `package.json` 的 `contributes` 字段静态注册，只有 XML 格式化需要运行时 TypeScript 代码。

```mermaid
graph TD
  P[package.json / contributes] --> G[grammars<br/>krpano-xml、krpano]
  P --> L[languages<br/>krpano-xml、krpano + language-configuration.json]
  P --> S[snippets<br/>krpano.code-snippets]
  P --> A[activationEvents<br/>onLanguage:krpano-xml / onLanguage:krpano]
  A --> E[src/extension.ts · activate()]
  E --> F[DocumentFormattingEditProvider<br/>语言: krpano-xml / krpano]
  F --> O[src/getOptions.ts<br/>读取 VS Code 配置]
  F --> B[src/beautifyHtml.ts<br/>封装 xml-formatter]
```

## 目录结构

```
├── src/                        # 扩展运行时代码（TypeScript，经 tsup 打包）
│   ├── extension.ts            # 入口：注册格式化器
│   ├── beautifyHtml.ts         # 格式化逻辑封装（默认值、根节点兜底、异常回退）
│   ├── getOptions.ts           # 从 VS Code 配置读取格式化选项
│   └── types/options.ts        # 选项类型（xml-formatter 选项 + handleRootNode）
├── syntaxes/                   # TextMate 语法定义（高亮核心，纯 JSON）
│   ├── krpano-xml.tmLanguage.json   # source.krpano-xml：宿主语法
│   └── krpano.tmLanguage.json       # source.krpano：action 脚本语法
├── snippets/krpano.code-snippets    # 代码片段
├── language-configuration.json      # 注释、括号配对、折叠、缩进规则（两个语言共用）
├── sample/                     # 调试用示例
│   ├── test.xml                # 高亮示例（各类 action 写法）
│   └── format.xml              # 格式化示例（krpano 官方 animated hotspots）
├── doc/                        # 图片与扩展图标（krpano.ico 会随扩展打包）
├── docs/                       # 本开发文档（已加入 .vscodeignore，不打包进 vsix）
├── test/                       # 测试（node --test；grammar 为 vscode-textmate 词法断言）
│   ├── grammar.test.mjs        # 语法 scope 断言（含 sample 中的各种 action 写法）
│   ├── format.test.mjs         # getOptions/beautify 纯函数断言
│   └── helpers/grammar.mjs     # 语法加载与 tokenize/scope 定位工具
└── .vscode/                    # 调试与构建任务配置（launch.json / tasks.json）
```

## 运行时链路

### 1. 扩展激活

`package.json` 声明了两个激活事件：`onLanguage:krpano-xml` 与 `onLanguage:krpano`。当打开的 `.xml` 文件处于这两种语言模式之一时，VS Code 加载 `dist/extension.js`。

`activate()` 中只注册了一件事：为 `krpano-xml` 与 `krpano` 两个语言模式都提供 `DocumentFormattingEditProvider`（同一个 provider 实例注册两次，见 src/extension.ts）。

### 2. 语法高亮

高亮完全由 TextMate 语法驱动，不经过运行时代码：

| 语言 ID | scopeName | 语法文件 | 角色 |
| --- | --- | --- | --- |
| krpano-xml | source.krpano-xml | syntaxes/krpano-xml.tmLanguage.json | 宿主：XML 标签、属性、注释、字符串（其余交给内置 `text.xml` 兜底），并按 `<action>` 的 `type` 把正文分发给 krpano 或 JS 语法 |
| krpano | source.krpano | syntaxes/krpano.tmLanguage.json | action 脚本：关键字、全局变量、函数、操作符、数字等 |

机制细节（分支匹配顺序、scope 命名、如何扩展）见 [syntax-highlighting.md](./syntax-highlighting.md)。

### 3. 语言配置

`language-configuration.json` 被两个语言 ID 共用，定义了：

- 块注释 `<!-- -->`（没有定义行注释，快捷键注释依赖它）；
- 输入 `<action>` 时自动补全为 `<action>…</action>` 并在其间留空行；
- `<action>` 标签边界作为代码折叠标记；
- 括号、引号自动配对。

注意其中的 `indentationRules` 内容偏向 Ruby 语义（`def`/`end`/`rescue` 等），对 XML 场景基本不生效，实际缩进行为由 VS Code 的 XML 规则与格式化功能保证。

### 4. 格式化数据流

`触发格式化 → getOptions（读配置）→ beautify（xml-formatter）→ 单个 TextEdit 全量替换`，详见 [formatting.md](./formatting.md)。

### 5. 构建与产物

- 包管理器为 pnpm（仓库有 `pnpm-lock.yaml`）；脚本里写的是 `npm run build`，两者均可。
- `npm run build`：tsup 把 `src/extension.ts` 打包为 `dist/extension.js`（`--external=vscode`，同时生成 dts）。
- `npm run dev`：watch 模式，供 F5 调试使用（`preLaunchTask` 已配置）。
- `npm test`：词法断言 + 格式化纯函数测试（见 [development.md](./development.md)）。
- `dist/` 被 `.gitignore` 排除，但会进入 vsix（`.vscodeignore` 未排除它）。
- `vscode:prepublish` 钩子在打包前自动执行构建，保证发布产物存在。

## 设计取舍

- **用 TextMate 而不是 LSP**：实现成本低、没有语言服务器进程，足以满足高亮需求；代价是无法做语义级校验（如变量未定义、标签是否合法）。LSP 在 TODO 中。
- **复用 `xml.format.*` 命名**：格式化选项沿用 vscode-xml 扩展的配置风格，键名与 xml-formatter 的选项一一对应。需要说明的是这些键并未在 `package.json` 中声明（没有 `contributes.configuration`），详见 [formatting.md](./formatting.md#配置项)。
- **格式化失败不破坏文件**：`beautify` 捕获解析异常，完全无法解析时原样返回输入文本并通过 `failed` 标记让调用方给出警告。注意 xml-formatter 对标签未闭合/错配是容错"修复"而非报错，可能静默改变结构，详见 [formatting.md](./formatting.md)。
