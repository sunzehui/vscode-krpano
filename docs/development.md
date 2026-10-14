# 开发与发布

## 环境准备

- **Node.js**：建议 22 及以上（构建用 tsup；lint 的 eslint-plugin-unicorn 74 用到 ES2025 的 `Set.prototype.union`，Node 20 会报 `mapTypes.union is not a function`）。CI 同样使用 Node 22。
- **包管理器**：以 **npm** 为准（CI 用 `npm ci --legacy-peer-deps`，`package-lock.json` 是唯一有效的锁文件）。`pnpm-lock.yaml` 是早期遗留（`lockfileVersion: '6.0'`，需 pnpm 8；用 pnpm 9+ 会报 `ERR_PNPM_LOCKFILE_BREAKING_CHANGE`），不再随 CI 更新，建议下次维护时删除。
- **VS Code**：`engines.vscode` 为 `^1.63.0`（Marketplace 只对 `>= 1.63` 的扩展开放预发布通道；代码本身没有用到更新的 API）。

```bash
npm install        # 安装依赖
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 用 tsup 构建一次（`--clean`，先清空 `dist`），输出 `dist/extension.js`、`dist/lsp/server.js`、`dist/lsp/client.js`；`vscode` 为 external，其余依赖都打进产物 |
| `npm run dev` | watch 模式（同样带 `--clean`），源文件变更时自动重建，供 F5 调试使用 |
| `npm run bench` | 生成合成大文档跑语言服务关键路径(含预算断言;CI 也会跑) |
| `npm run lint` / `npm run lint:fix` | ESLint 9 + @antfu/eslint-config 9(flat config);CI 会跑 `npm run lint` |
| `npm run typecheck` | `tsc --noEmit` 全量类型检查（CI 会跑） |
| `npm run coverage` | 在测试之上统计纯逻辑模块的覆盖率（c8，阈值 90% 行 / 90% 分支 / 88% 函数；当前 99%+ / 90%+ / 92%） |
| `npm run test:integration` | 用 `@vscode/test-electron` 下载真实 VS Code，在扩展宿主里跑端到端用例（格式化、命令面板、LSP 诊断/补全/悬停、批量格式化） |
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
npm run typecheck
npm test
npm run coverage               # 纯逻辑模块覆盖率(带阈值:行 90 / 分支 90 / 函数 88;仅在 Linux 卡阈值)
xvfb-run -a npm run test:integration   # 仅 Linux:真实 VS Code 集成测试(下载的 VS Code 会缓存)
npm run bench                  # 性能基准(合成 0.9MB 文档 + 200 文件索引)
npx @vscode/vsce package --out krpano-lang.vsix
# 回归检查:产物自包含(dist 三个入口在包里,且不应有 node_modules——依赖已打进 dist)
unzip -l krpano-lang.vsix | grep -q 'extension/dist/extension.js'
unzip -l krpano-lang.vsix | grep -q 'extension/dist/lsp/server.js'
unzip -l krpano-lang.vsix | grep -q 'extension/dist/lsp/client.js'
! unzip -l krpano-lang.vsix | grep -q 'extension/node_modules/'
```

最后把 vsix 作为构建产物上传（Actions 页面可下载）。推 tag 时 `Release` workflow 会另外创建 GitHub Release 并附上 vsix。CI 跑在 ubuntu / macos / windows 三平台矩阵上；另有 `CodeQL` 静态分析与 `Dependabot` 依赖更新。

## 打包与发布

```bash
# 1. 构建会由 vscode:prepublish 钩子自动执行（vsce 打包前调用 npm run build）
npx @vscode/vsce package          # 生成 krpano-lang-<version>.vsix

# 2. 建议先在本地用 vsix 安装验证：VS Code → 扩展面板 → … → Install from VSIX

# 3. 发布
npx @vscode/vsce publish
```

发布产物：每次推 `v*` tag，Release workflow 会跑 lint/测试/打包，然后 **创建 GitHub Release**（说明文字取 `CHANGELOG.md` 对应版本段落，由 `scripts/changelog-notes.mjs` 抽取，并把 `krpano-lang.vsix` 作为附件挂上），配置了 `VSCE_PAT` 时再发布到 Marketplace。重新推同一个 tag 会更新说明并覆盖附件，不会失败。

预发布：`Pre-Release` workflow（手动触发，需输入 `publish` 确认）以 `--pre-release` 上传到 Marketplace，用户需显式选择加入。（Open VSX 不再发布：注册流程繁琐，改用 GitHub Release 提供 vsix。）

发布自动化：`.github/workflows/release.yml` 在推送 `v*` tag 时校验 tag 与 `package.json` 版本一致、跑测试、打包并发布到 Marketplace（读 `VSCE_PAT` secret；未配置时只打包上传 vsix）。配置命令：`gh secret set VSCE_PAT`。手动发布仍可用 `npx @vscode/vsce publish --packagePath krpano-lang-<version>.vsix`。

版本号流程：`npm run release`（bumpp）会更新 `package.json` 版本、打 tag 并推送。发布前请确认目标版本高于 Marketplace 上的现有版本（本仓库首次修复发布时为 0.1.0 → 0.3.0），并保持 tag 与 `package.json` 一致。

`.vscodeignore` 控制哪些文件不进包：`src/`、`.vscode/`、`test/`、`sample/`、`scripts/`、`docs/` 与各类配置文件都会被排除。**`node_modules/` 必须排除**：`package.json` 没有 `dependencies`（全部依赖由 tsup 打进 `dist`），CI 也会断言包里没有 `extension/node_modules/`。`dist/`（含 `dist/lsp/server.js` 语言服务器与 `dist/lsp/client.js` 客户端入口）、`snippets/`、`syntaxes/`、`language-configuration.json`、`package.nls*.json`、`media/`、`doc/icon.png` 会进入 vsix。因为 tsup 的 chunk 名带哈希，构建脚本必须保持 `--clean`，否则历史 chunk 会一直留在 `dist` 里并随包发布（发布前可用 `npx @vscode/vsce ls` 核对清单）。

## 适用范围（哪些 .xml 会被处理）

语言 `krpano-xml` 绑定在 `.xml` 扩展名上，所以每个 XML 文件都会进入本扩展；诊断与格式化会先用 `looksLikeKrpanoXml()`（`src/shared/xml.ts`，判据是出现 `<krpano>` 根或 krpano 专有元素）确认"这确实是 krpano 文档"，否则不报诊断、不格式化（`pom.xml`、`AndroidManifest.xml` 之类因此不再被误报或改写）。

只有 `<action>` 等通用元素的片段文件不会通过这个判定；需要诊断时把该文件的语言模式切到 **krpano**（脚本模式，`krpano` 语言 id 始终按 krpano 处理）。改动这条规则时，`test/xml.test.mjs` 与 `test/artifact.test.mjs` 里都有对应断言。

## 改动指南

| 要改的内容 | 位置 |
| --- | --- |
| action 脚本关键字 / 变量 / 函数高亮 | `syntaxes/krpano.tmLanguage.json`（见 [syntax-highlighting.md](./syntax-highlighting.md)） |
| XML 标签、`<action>` 分支、内嵌语言 | `syntaxes/krpano-xml.tmLanguage.json` |
| 代码片段 | `snippets/krpano.code-snippets` |
| 注释、折叠、括号配对等编辑器行为 | `language-configuration.json` |
| 格式化选项与默认值 | `src/getOptions.ts`、`src/beautifyHtml.ts`、`src/types/options.ts` |
| 选区格式化 / action 缩进 | `src/shared/reindent.ts`（纯函数，断言见 `test/reindent.test.mjs`） |
| 属性排版（每行一个 / 对齐） | `src/shared/layout.ts`（纯函数，断言见 `test/format.test.mjs`） |
| 语法 scope 断言 / 格式化断言 / LSP 断言 | `test/grammar.test.mjs`、`test/format.test.mjs`、`test/lsp.test.mjs`、`test/xml.test.mjs`（改行为时同步补用例） |
| 打包产物行为断言 | `test/artifact.test.mjs`（假 vscode API 加载 `dist/extension.js`）、`test/server.test.mjs`（语言服务器进程） |
| 语言服务能力（诊断/补全/悬停/跳转） | `src/lsp/features.ts`（纯函数）；服务器接线在 `src/lsp/server.ts` |
| krpano 文档判定（哪些 .xml 会被诊断/格式化） | `src/shared/xml.ts` 的 `looksLikeKrpanoXml()`；入口在 `src/lsp/server.ts` 的 `validate()` 与 `src/extension.ts` |
| 查找引用 / 重命名（跨文件、同文件定义） | `src/lsp/server.ts` 的 `nameLocations()`（把定义与引用分开收集，再由 references/rename 各自取用） |
| include 链解析与符号索引 | `src/lsp/symbols.ts`（纯逻辑，文件读取注入；断言见 `test/includes.test.mjs`） |
| 引用解析 / 重命名 / 括号索引 | `src/lsp/references.ts`（纯逻辑；断言见 `test/references.test.mjs`） |
| 快速修复（Code Actions） | `src/lsp/actions.ts`（纯逻辑；断言见 `test/actions.test.mjs`） |
| 文档大纲 / 工作区索引 | `src/lsp/outline.ts`、`src/lsp/workspace.ts`（工作区扫描上限 2000 文件、60 秒 TTL） |
| 元素/属性/版本/签名数据 | `scripts/gen-krpano-data.mjs` → `src/lsp/krpanoData.json`（XML Reference 抽元素属性；v1.21–v1.24 四份文档差分出属性版本；Actions 文档抽内建 action 与参数签名；升级 krpano 后重跑并把新版本页放到 `/tmp`） |
| 悬停说明文字 | `src/lsp/krpanoDocs.ts`（手写，不复用官方文档原文） |
| 扩展贡献点（语言、语法、设置、激活事件、图标） | `package.json` 的 `contributes` 与 `main` |

## 代码风格与提交约定

- ESLint 使用 `@antfu/eslint-config`（无分号、单引号风格）。
- 提交信息参考现有历史，采用 conventional commits 前缀：`feat:`、`fix:`、`chore:`，描述中英文皆可。

## 仓库维护待办

从当前仓库状态整理出的改进点，供后续维护参考：

- include 索引在每次校验时重建（磁盘文件有 mtime 缓存与按文件版本增量解析、校验有 250ms 去抖；offset→行列位置已改为行索引 + 二分）。
- 覆盖率只统计 `src/` 纯逻辑模块（扩展宿主与语言服务器进程内的代码由冒烟测试覆盖，不计入百分比）；测试构建产物在 `test/build/`（V8 覆盖率不采集 `test/` 下的文件）。
- 变量类型推断、`get:`/`calc:` 表达式校验未做：属性值的 `calc:`/`get:`/`link:` 前缀与 `%s` 占位符只在 `<action>` 标签的属性里着色，其它标签由内置 XML 语法处理（避免自研标签解析带来的回归）。
- 未做：语言服务器的诊断/悬停文案本地化（快速修复标题与扩展宿主提示已按显示语言切换，服务端诊断仍是英文）。
- `looksLikeKrpanoXml()` 是"通用元素名不算"的白名单：只含 `<action>` / `<style>` 一类通用元素的片段文件不参与诊断与格式化（出口是把语言模式切到 `krpano`，见上文"适用范围"）。若要放宽，注意别让 `AndroidManifest.xml` 之类重新被误报。
- 版本感知基于 v1.21–v1.24 四份官方文档的差分：声明更早/更晚版本的文件才会得到提示；如需更细粒度，把更多版本页放进 `/tmp` 并扩展 `DOC_VERSIONS`。
- `krpano` 模式（脚本-only）未内嵌 XML 标签处理（原因见 [syntax-highlighting.md](./syntax-highlighting.md#现状说明030)）；XML 文档统一用 `krpano-xml`。
- 元素/属性数据来自官方文档的抽取脚本，只在升级 krpano 版本后需要重跑（页面需先 `curl` 到本地，见脚本头部注释）。
- 诊断开关见 `krpano.lsp.diagnostics.*`（`enable` 关闭全部诊断）；语言服务本身不可关闭，启动失败只记录日志并提示（高亮与格式化不受影响）。
- 真实 VS Code 集成测试（`npm run test:integration`）下载的是**当前最新** VS Code，声明的最低版本（`engines.vscode`）没有被验证；要卡最低版本可把版本号传给 `downloadAndUnzipVSCode`。
