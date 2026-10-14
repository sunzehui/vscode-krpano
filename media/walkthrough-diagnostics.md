诊断覆盖 krpano 项目里最常见的错误：

- 标签未闭合 / 错配、`<include>` 目标不存在
- `linkedscene` 指向不存在的 scene、同一 scene 内重名
- `layer[不存在的名字]`、未定义的动作调用（信息级，插件提供的动作可忽略）

把光标放到有问题的位置，灯泡里会给出**快速修复**：改成最接近的元素、`lang="ts"` → `type="Javascript"`、生成 action 骨架、一键建 include 文件。
