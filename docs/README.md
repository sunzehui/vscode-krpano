# krpano-lang 项目文档

krpano-lang 是一个 VS Code 扩展，为 krpano 全景项目提供 **语法高亮**、**XML 格式化** 和 **代码片段**。本目录是项目的开发文档；面向使用者的功能介绍与安装说明见仓库根目录的 [README](../README.md)。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [architecture.md](./architecture.md) | 项目结构、运行时链路、模块职责与设计取舍 |
| [syntax-highlighting.md](./syntax-highlighting.md) | 两套 TextMate 语法（krpano-xml / krpano）的实现细节、扩展方式与已知问题 |
| [formatting.md](./formatting.md) | XML 格式化的触发条件、实现流程、全部配置项 |
| [snippets.md](./snippets.md) | 全部代码片段前缀速查表 |
| [development.md](./development.md) | 本地开发、调试、打包与发布流程 |
| [faq.md](./faq.md) | 常见问题与排错 |

## 项目速览

- **类型**：VS Code 扩展。高亮、语言配置、片段由 `package.json` 的 `contributes` 静态声明；格式化与语言服务（LSP）需要运行时代码（`src/`，语言服务器为独立进程）。
- **语言 ID**：`krpano-xml`（唯一认领 `.xml` 的宿主语言）、`krpano`（别名 "krpano Action Script"，脚本模式）。
- **能力**：TextMate 语法高亮、XML 格式化（xml-formatter）、语言服务（诊断/补全/悬停/跨文件跳转，含 `<include>` 链解析）、53 个代码片段。
- **核心依赖**：[xml-formatter](https://github.com/chrisbottin/xml-formatter)、vscode-languageclient / vscode-languageserver（client 7.x，对应 VS Code ^1.52）；0.5.0 起全部由 tsup 打进 `dist/`，发布的 vsix 不再包含 `node_modules`。
- **测试**：`npm test`（TextMate 词法断言 + 格式化/LSP 纯函数断言 + 语言服务器 stdio 端到端冒烟）；CI 见 `.github/workflows/ci.yml`。
- **尚未实现**：变量类型推断、`get:`/`calc:` 表达式校验、include 索引的增量更新。
