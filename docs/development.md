# 开发与发布

## 环境准备

- **Node.js**：建议 22 及以上（构建用 tsup；lint 的 eslint-plugin-unicorn 74 用到 ES2025 的 `Set.prototype.union`，Node 20 会报 `mapTypes.union is not a function`）。CI 同样使用 Node 22。
- **包管理器**：仓库含有 `pnpm-lock.yaml`，格式为 `lockfileVersion: '6.0'`（pnpm 8 生成）。**用更新版本的 pnpm（9+）直接 `pnpm install` 会报 `ERR_PNPM_LOCKFILE_BREAKING_CHANGE`**，可用 `npx pnpm@8 install --frozen-lockfile` 安装，或自行决定是否用 `--force` 重建锁文件（会产生锁文件改动）。`package.json` 中的脚本写作 `npm run …`，用 npm 同样可以。
- **VS Code**：`engines.vscode` 为 `^1.52.0`。

```bash
pnpm install        # 安装依赖
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm build`（或 `npm run build`） | 用 tsup 构建一次，输出 `dist/extension.js`（含 dts，`vscode` 为 external） |
| `pnpm dev`（或 `npm run dev`） | watch 模式，源文件变更时自动重建，供 F5 调试使用 |
| `npm run lint` / `npm run lint:fix` | ESLint 10 + @antfu/eslint-config 9(flat config);CI 会跑 `npm run lint` |
| `npm run coverage` | 在测试之上统计 `src/` 纯逻辑模块的覆盖率（c8，阈值 90% 语句 / 88% 函数 / 75% 分支） |
| `npm test` | 跑全部测试：`build:test`（把纯模块编译到 `test/build`）+ `node --test test/*.test.mjs`（语法 scope、格式化、LSP 纯函数；若已 `npm run build`，还会跑语言服务器 stdio 端到端冒烟与打包产物冒烟） |
| `npm run release` | 通过 bumpp 交互式选择版本号 → commit → tag → push |
| `npx @vscode/vsce package` | 打包出 `.vsix` |
| `npx @vscode/vsce publish` | 发布到 VS Code Marketplace（需要 Personal Access Token） |

## 本地调试

1. 用 VS Code 打开仓库根目录。
2. 按 **F5**，`launch.json` 会以 `--disable-extensions`（排除其它扩展干扰）启动扩展开发宿主，并直接打开 `sample/` 目录。
3. `preLaunchTask` 配置为后台运行 `npm: dev`（见 `.vscode/tasks.json`），它等待构建输出 `CJS Build success` 后才启动宿主。

调试技巧：

- 打开 `sample/test.xml` 验证高亮；命令面板执行 **Developer: Inspect Editor Tokens and Scopes** 查看 token 命中的 scope。
- 改语法/格式化逻辑后先跑 `npm test`：词法断言用仓库自带语法 + 最小替身语法（`text.xml`/`source.js`），改语法不必启动宿主就能看到回归结果；语法变更应同步在 `test/grammar.test.mjs` 补用例。
- 修改 `syntaxes/`、`snippets/`、`language-configuration.json` 后，在开发宿主窗口执行 **Developer: Reload Window** 即可生效；修改 `src/` 后等 watch 构建完成再 Reload。
- 验证格式化：在 `sample/format.xml` 上执行格式化文档（`Shift+Alt+F`）。

## CI

`.github/workflows/ci.yml`（push 到 master / PR / tag 时触发）依次执行：

```bash
npm ci --legacy-peer-deps      # 打包依赖收集需要 npm 形态的 node_modules
npm run build                  # 先生成 dist(含 dist/lsp/server.js,server 冒烟测试需要)
npm run lint
npm test
npm run coverage               # 纯逻辑模块覆盖率(带阈值)
npx @vscode/vsce package --out krpano-lang.vsix
unzip -l krpano-lang.vsix | grep -q 'extension/node_modules/xml-formatter/'   # 回归检查:运行时依赖必须进包
```

最后把 vsix 作为构建产物上传（Actions 页面可下载）。

## 打包与发布

```bash
# 1. 构建会由 vscode:prepublish 钩子自动执行（vsce 打包前调用 npm run build）
npx @vscode/vsce package          # 生成 krpano-lang-<version>.vsix

# 2. 建议先在本地用 vsix 安装验证：VS Code → 扩展面板 → … → Install from VSIX

# 3. 发布
npx @vscode/vsce publish
```

发布自动化：`.github/workflows/release.yml` 在推送 `v*` tag 时校验 tag 与 `package.json` 版本一致、跑测试、打包并发布到 Marketplace（读 `VSCE_PAT` secret；未配置时只打包上传 vsix）。配置命令：`gh secret set VSCE_PAT`。手动发布仍可用 `npx @vscode/vsce publish --packagePath krpano-lang-<version>.vsix`。

版本号流程：`npm run release`（bumpp）会更新 `package.json` 版本、打 tag 并推送。发布前请确认目标版本高于 Marketplace 上的现有版本（本仓库首次修复发布时为 0.1.0 → 0.3.0），并保持 tag 与 `package.json` 一致。

`.vscodeignore` 控制哪些文件不进包：`src/`、`.vscode/`、`test/`、配置文件与 `docs/` 等被排除。**注意不要排除 `node_modules/`**：扩展运行时需要 `xml-formatter`，语言客户端需要 `vscode-languageclient`（tsup 把 `dependencies` 视为 external），vsce 会自动只把生产依赖树打包进去；一旦把 `node_modules/` 加进 `.vscodeignore`，打出的 vsix 缺失依赖，安装后格式化与语言服务都会失效（发布前用 `unzip -l xxx.vsix | grep xml-formatter` 可快速自检）。`dist/`（含 `dist/lsp/server.js` 语言服务器与 `dist/lsp/client.js` 客户端入口）、`snippets/`、`syntaxes/`、`language-configuration.json`、`doc/krpano.ico`（扩展图标）会进入 vsix。

## 改动指南

| 要改的内容 | 位置 |
| --- | --- |
| action 脚本关键字 / 变量 / 函数高亮 | `syntaxes/krpano.tmLanguage.json`（见 [syntax-highlighting.md](./syntax-highlighting.md)） |
| XML 标签、`<action>` 分支、内嵌语言 | `syntaxes/krpano-xml.tmLanguage.json` |
| 代码片段 | `snippets/krpano.code-snippets` |
| 注释、折叠、括号配对等编辑器行为 | `language-configuration.json` |
| 格式化选项与默认值 | `src/getOptions.ts`、`src/beautifyHtml.ts`、`src/types/options.ts` |
| 选区格式化（缩进对齐） | `src/shared/reindent.ts`（纯函数，断言见 `test/reindent.test.mjs`） |
| 语法 scope 断言 / 格式化断言 / LSP 断言 | `test/grammar.test.mjs`、`test/format.test.mjs`、`test/lsp.test.mjs`、`test/xml.test.mjs`（改行为时同步补用例） |
| 打包产物行为断言 | `test/artifact.test.mjs`（假 vscode API 加载 `dist/extension.js`）、`test/server.test.mjs`（语言服务器进程） |
| 语言服务能力（诊断/补全/悬停/跳转） | `src/lsp/features.ts`（纯函数）；服务器接线在 `src/lsp/server.ts` |
| include 链解析与符号索引 | `src/lsp/symbols.ts`（纯逻辑，文件读取注入；断言见 `test/includes.test.mjs`） |
| 元素/属性/内建 action 数据 | `scripts/gen-krpano-data.mjs` → `src/lsp/krpanoData.json`（XML Reference 抽取属性；Actions 文档补内建 action；升级 krpano 版本后重跑） |
| 悬停说明文字 | `src/lsp/krpanoDocs.ts`（手写，不复用官方文档原文） |
| 扩展贡献点（语言、语法、设置、激活事件、图标） | `package.json` 的 `contributes` 与 `main` |

## 代码风格与提交约定

- ESLint 使用 `@antfu/eslint-config`（无分号、单引号风格）。
- 提交信息参考现有历史，采用 conventional commits 前缀：`feat:`、`fix:`、`chore:`，描述中英文皆可。

## 仓库维护待办

从当前仓库状态整理出的改进点，供后续维护参考：

- include 索引在每次校验时重建（磁盘文件有 mtime 缓存、校验有 250ms 去抖，仍未做增量解析）：超大项目偏重。
- 覆盖率只统计 `src/` 纯逻辑模块（扩展宿主与语言服务器进程内的代码由冒烟测试覆盖，不计入百分比）；测试构建产物在 `test/build/`（V8 覆盖率不采集 `test/` 下的文件）。
- 变量类型推断、`get:`/`calc:` 表达式校验未做。
- `krpano` 模式（脚本-only）未内嵌 XML 标签处理（原因见 [syntax-highlighting.md](./syntax-highlighting.md#现状说明030)）；XML 文档统一用 `krpano-xml`。
- 元素/属性数据来自官方文档的抽取脚本，只在升级 krpano 版本后需要重跑（页面需先 `curl` 到本地，见脚本头部注释）。
- `krpano.lsp.*` 之类的开关设置尚未提供：语言服务总是启用，启动失败只记录日志。
