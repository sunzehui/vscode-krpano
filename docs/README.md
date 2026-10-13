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

- **类型**：VS Code 扩展。大部分能力通过 `package.json` 的 `contributes` 静态声明（语法、语言、代码片段），只有 XML 格式化需要运行时代码（`src/`）。
- **语言 ID**：`krpano-xml`（宿主，承载 XML 高亮与格式化）、`krpano`（action 脚本语法，被前者内嵌复用）。
- **核心依赖**：[xml-formatter](https://github.com/chrisbottin/xml-formatter)（格式化）、tsup（构建）。
- **运行环境**：VS Code `^1.52.0`，扩展入口 `dist/extension.js`。
- **尚未实现**：LSP 支持、更多代码片段（见根 README 的 TODO）。
