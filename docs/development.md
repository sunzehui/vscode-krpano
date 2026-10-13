# 开发与发布

## 环境准备

- **Node.js**：用于构建与运行 tsup（建议 16 及以上）。
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
| `npm test` | 跑全部测试：`test:grammar`（vscode-textmate 词法断言）+ `test:format`（getOptions/beautify 纯函数断言） |
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

## 打包与发布

```bash
# 1. 构建会由 vscode:prepublish 钩子自动执行（vsce 打包前调用 npm run build）
npx @vscode/vsce package          # 生成 krpano-lang-<version>.vsix

# 2. 建议先在本地用 vsix 安装验证：VS Code → 扩展面板 → … → Install from VSIX

# 3. 发布
npx @vscode/vsce publish
```

版本号流程：`npm run release`（bumpp）会更新 `package.json` 版本、打 tag 并推送。发布前请确认目标版本高于 Marketplace 上的现有版本（本仓库首次修复发布时为 0.1.0 → 0.3.0），并保持 tag 与 `package.json` 一致。

`.vscodeignore` 控制哪些文件不进包：`src/`、`.vscode/`、`test/`、配置文件与 `docs/` 等被排除。**注意不要排除 `node_modules/`**：扩展运行时会 `require('xml-formatter')`（tsup 把 `dependencies` 视为 external），vsce 会自动只把生产依赖树打包进去（`xml-formatter`、`xml-parser-xo`）；一旦把 `node_modules/` 加进 `.vscodeignore`，打出的 vsix 缺失依赖，安装后格式化功能会直接失效（发布前用 `unzip -l xxx.vsix | grep xml-formatter` 可快速自检）。`dist/`、`snippets/`、`syntaxes/`、`language-configuration.json`、`doc/krpano.ico`（扩展图标）会进入 vsix。

## 改动指南

| 要改的内容 | 位置 |
| --- | --- |
| action 脚本关键字 / 变量 / 函数高亮 | `syntaxes/krpano.tmLanguage.json`（见 [syntax-highlighting.md](./syntax-highlighting.md)） |
| XML 标签、`<action>` 分支、内嵌语言 | `syntaxes/krpano-xml.tmLanguage.json` |
| 代码片段 | `snippets/krpano.code-snippets` |
| 注释、折叠、括号配对等编辑器行为 | `language-configuration.json` |
| 格式化选项与默认值 | `src/getOptions.ts`、`src/beautifyHtml.ts`、`src/types/options.ts` |
| 语法 scope 断言 / 格式化断言 | `test/grammar.test.mjs`、`test/format.test.mjs`（改行为时同步补用例） |
| 扩展贡献点（语言、语法、激活事件、图标） | `package.json` 的 `contributes` 与 `main` |

## 代码风格与提交约定

- ESLint 使用 `@antfu/eslint-config`（无分号、单引号风格）。
- 提交信息参考现有历史，采用 conventional commits 前缀：`feat:`、`fix:`、`chore:`，描述中英文皆可。

## 仓库维护待办

从当前仓库状态整理出的改进点，供后续维护参考：

- 无 CI（无 `.github/`）与 CHANGELOG；版本发布依赖本地手工执行（`npm test` 可放进 CI）。
- README TODO 中列出的 LSP 支持、更多代码片段尚未实现。
- `package.json` 未声明 `contributes.configuration`，格式化选项在设置编辑器中会有未知设置提示（见 [formatting.md](./formatting.md#配置项)）。
