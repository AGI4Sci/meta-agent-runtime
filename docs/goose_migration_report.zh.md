# Goose 迁移报告

## 1. 背景

本报告记录将参考仓库 `goose` 迁移到 `meta-agent-runtime` 共享框架中的当前状态、设计映射、实现范围、验证结果与后续工作建议。

本次迁移遵循以下约束：

- `runtime/` 保持 agent-agnostic
- agent-specific 代码尽量收敛到 `packages/agents/goose/`
- runtime 内部 prompt、tool description、实验路径保持英文
- 文档层中英文分离，不在同一文档中混排
- 优先迁移“最小可运行骨架”，复杂能力先落兼容层与 TODO
- 不修改其他 agent 目录，不回退其他迁移线的改动

## 2. 输入材料

### 2.1 目标仓库文档

本次迁移首先阅读了以下目标仓库文档：

- `agent_runtime_design.md`
- `docs/migration.zh.md`
- `README.md`

### 2.2 参考仓库实现

为了识别 Goose 的最小运行单元，本次重点阅读了以下参考实现：

- `crates/goose/src/agents/prompt_manager.rs`
- `crates/goose/src/prompts/system.md`
- `crates/goose/src/agents/agent.rs`
- `crates/goose/src/conversation/message.rs`
- `crates/goose/src/agents/platform_extensions/developer/mod.rs`
- `crates/goose/src/agents/platform_extensions/developer/tree.rs`
- `crates/goose/src/agents/platform_extensions/developer/shell.rs`

## 3. 迁移目标拆解

结合设计文档与 Goose 参考实现，本次迁移将 Goose 拆解为以下几类能力：

1. Prompt 构建
2. Action 解析
3. Context 裁剪
4. ToolSpec 映射
5. runtime registry 最小接入
6. 最小测试与构建验证

本轮不追求一比一复刻 Goose 全量行为，而是优先完成共享 runtime 下的最小闭环。

## 4. 参考 Goose 的关键特征识别

### 4.1 Prompt 构建

参考 Goose 的 `prompt_manager` 与 `system.md` 后，确认其 system prompt 的核心特征包括：

- 固定 agent persona，明确自己是 `goose`
- 使用英文 system prompt
- 按 extension 列出现有能力
- 强调工具使用效率与开发工作流
- 用独立的 response guideline 约束输出风格

在共享 runtime 中，本次只迁移最关键的 prompt framing：

- goose persona
- 当前日期时间
- developer extension 说明
- 工具使用原则
- JSON action contract
- 历史上下文渲染

### 4.2 Action 解析

参考 Goose 主循环与 provider/tool-call 处理逻辑后，可以看出 Goose 原生支持多种 provider-specific tool call 格式，并在内部 message 模型中保留丰富结构。

共享 runtime 当前的 `Action` 结构较简，因此本次迁移采用兼容层方案：

- 接收 `{"name":"...","args":{...}}`
- 接收 `{"tool":"...","arguments":{...}}`
- 接收 `{"function":{"name":"...","arguments":{...}}}`
- 接收 `{"function":{"name":"...","arguments":"{\"k\":\"v\"}"}}`
- 支持从 fenced JSON 中提取动作

这使 Goose 风格 prompt 与共享 runtime 的 action 执行契约可以对接，但不要求完整复刻参考仓库的 provider-native 结构。

### 4.3 Context 管理

参考 Goose 的真实上下文管理后可知，其能力远不止简单截断，还包括：

- conversation 修复
- compaction
- context 恢复
- 思维内容与 tool pair 处理

这些能力和 Goose 自身 provider / message 模型耦合较深，因此本轮只迁移最小 ContextStrategy：

- 按 token budget 近似保留最近上下文
- 保证共享 runtime 主 loop 可运行

### 4.4 工具定义

Goose 的通用开发工作流主要依赖 developer extension。综合参考代码后，本轮优先抽取最小开发闭环工具：

- `shell`
- `write`
- `edit`
- `tree`

原因：

- 这四个工具已足够支撑 inspect / edit / execute 的基本代理闭环
- 与共享 runtime 的实验场景更直接相关
- 相比 extension 管理、schedule、subagent 等平台能力，迁移成本更低，收益更高

### 4.5 主 loop 边界

参考 Goose 的 `agent.rs` 后，本次确认以下能力暂不纳入第一轮共享 runtime 迁移范围：

- permission approval
- tool inspection
- frontend tool request
- action required / elicitation
- extension 动态启停
- subagent orchestration
- compaction recovery
- provider-native thinking / reasoning echoing

这些能力被记录为后续兼容层或扩展迁移项。

## 5. 本次实际改动

### 5.1 新增 Goose 适配目录

新增目录：

- `packages/agents/goose/src/`

新增文件：

- `packages/agents/goose/src/index.ts`
- `packages/agents/goose/src/promptBuilder.ts`
- `packages/agents/goose/src/actionParser.ts`
- `packages/agents/goose/src/contextStrategy.ts`
- `packages/agents/goose/src/tools.ts`

### 5.2 PromptBuilder

`packages/agents/goose/src/promptBuilder.ts` 实现了 `GoosePromptBuilder`，主要包含：

- Goose 英文 persona
- 与 Goose `PromptManager` 一致的小时级固定时间戳
- developer extension 的英文指引
- 工具使用效率建议
- JSON 动作输出约束
- task 与 history 渲染

该实现不是对 `system.md` 的逐字迁移，而是对其最核心行为的最小化抽取。

### 5.3 ActionParser

`packages/agents/goose/src/actionParser.ts` 实现了 `GooseActionParser`，支持：

- 直接 JSON
- fenced JSON
- 多种字段别名兼容
- `function.arguments` 的字符串化 JSON 兼容
- `finish` 返回结果兼容

该 parser 的目的是让 Goose 风格提示词在共享 runtime 中可稳定落到 `Action`。

### 5.4 ContextStrategy

`packages/agents/goose/src/contextStrategy.ts` 提供了轻量的 `GooseContextStrategy`：

- 默认按 token budget 近似裁剪上下文
- 不引入 summary 或 compaction 逻辑

这是一个明显的兼容层，不是 Goose 全量上下文策略复刻。

### 5.5 ToolSpec 映射

`packages/agents/goose/src/tools.ts` 实现了四个最小工具：

#### `shell`

- 使用 `/bin/zsh -lc`
- 支持 `timeout_secs`
- 返回 `stdout`、`stderr`、`exitCode`
- 对长输出做 Goose 风格近似截断并写入临时文件
- interpreter 会把退出码与错误状态映射为 `Observation`

#### `write`

- 支持创建父目录
- 覆盖写入文本文件
- 返回 `Created/Wrote ... (N lines)` 风格结果

#### `edit`

- 参数契约与 Goose developer extension 一致，使用 `before/after`
- 仅允许唯一匹配替换
- 支持 `after=""` 的删除语义
- 当 `before` 不存在或重复匹配时返回错误

#### `tree`

- 支持 `depth`
- 优先使用 `rg --files` 枚举文件
- 显式加载根 `.gitignore`
- 输出目录和文件的近似行数
- 在无法使用 `rg` 时回退到简化文件树遍历

说明：

- `tree` 的当前实现是 Goose `TreeTool` 的近似兼容层
- 目前还未完全复刻参考仓库基于 `ignore` crate 的所有遍历语义

### 5.6 Registry 接入

本次只做必要 registry 接入，未修改 runtime 主循环。

修改文件：

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`

新增能力：

- `prompt_builder: "goose"`
- `action_parser: "goose"`
- `context_strategy.name: "goose"`
- `tools: "goose"`

### 5.7 TypeScript 编译边界调整

由于 runtime registry 需要引用 `packages/agents/goose/`，本次对 TypeScript 编译边界做了最小调整。

修改文件：

- `runtime/tsconfig.json`
- `runtime/package.json`

调整内容：

- `rootDir` 从 `runtime/` 扩展到仓库根
- build 输出路径随之落到 `dist/runtime/...`
- `start` / `test` 脚本同步调整

这是为了让共享 runtime 能正式编译包外 agent 适配器，而不是临时通过 `noEmit` 绕过。

## 6. 新增测试

新增文件：

- `runtime/tests/gooseAdapter.test.ts`

当前测试覆盖：

1. `GooseActionParser` 能解析 `name/args` 格式
2. `GooseActionParser` 能解析 fenced JSON 的 `tool/arguments` 格式
3. `GooseActionParser` 能解析 `function.arguments(string)` 格式
4. `GoosePromptBuilder` 能生成更接近 Goose source 的 prompt
5. `GooseContextStrategy` 能按 token budget 近似裁剪
6. `gooseTreeTool` 支持 `depth` 且尊重 `.gitignore`
7. `gooseEditTool` 对重复匹配报错
8. `gooseEditTool` 支持空 `after` 删除语义
9. `gooseShellTool` 能把非零退出码映射到 observation
10. `gooseShellTool` 支持 `timeout_secs`

## 7. 已完成能力

截至本报告撰写时，已经完成的 Goose 迁移能力包括：

- 最小 Goose PromptBuilder
- 最小 Goose ActionParser
- token-budget 近似 Goose ContextStrategy
- 最小 developer 工具集映射
- runtime registry 接入
- schema 接入
- 最小测试
- 定向 adapter 测试验证

## 8. 仍为 stub / TODO 的能力

以下能力尚未迁移，或当前仅以简化兼容层代替：

### 8.1 Prompt / 模式相关

- hints 文件加载
- Goose mode 切换
- additional system prompt extras
- 全量 extension 信息渲染

### 8.2 上下文管理

- compaction
- context overflow recovery
- conversation fix / repair
- tool pair summarization

### 8.3 工具与执行相关

- permission approval
- tool inspection
- frontend tool
- platform tool
- extension 动态 enable / disable

### 8.4 多代理 / 平台能力

- subagent
- schedule
- recipe 相关能力

### 8.5 provider-native 兼容

- 原生 tool calling message 结构
- thinking / reasoning 内容保留
- richer message event model

## 9. 设计上的取舍

本次迁移做了几个明确取舍：

### 9.1 优先最小可运行骨架

没有把 Goose 的整套 provider/message/event 系统搬进 runtime，而是只抽取共享实验框架最需要的部分。

### 9.2 优先 adapter 内聚

绝大多数 Goose-specific 逻辑都放在 `packages/agents/goose/` 中，仅通过 registry 接入 `runtime/`。

### 9.3 优先英文单轨 runtime

prompt 与工具描述保持英文，不把中文协作内容带入运行路径。

### 9.4 复杂能力先兼容层、后精确迁移

对于上下文压缩、provider-native tool-call、权限与 approval 等复杂能力，本次先不强行迁移，避免破坏共享框架边界。

## 10. 验证记录

已执行验证：

- `npx tsx --test ./tests/gooseAdapter.test.ts`
- `npx tsx --test ./tests/*.ts` 中 Goose 相关测试通过

验证结果：

- Goose 定向测试通过
- Goose 相关全仓测试通过
- 全仓 `tsc` / 全量 server 路径仍受仓库中与 Goose 无关的现存 adapter 问题影响，当前不应将其记为 Goose 迁移失败

## 11. 当前工作树状态

本次迁移相关未提交改动主要集中在：

- `packages/agents/goose/`
- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/tsconfig.json`
- `runtime/package.json`
- `runtime/tests/gooseAdapter.test.ts`

未修改其他 agent 适配目录。

## 12. 后续建议

建议按以下优先级继续推进：

1. 为 Goose prompt / parser 增加 fixture，对照参考仓库快照做稳定回归测试
2. 继续补 prompt fixture / snapshot，而不是继续增大 adapter 复杂度
3. 评估是否要为 Goose 增加独立的 compaction-compatible `ContextStrategy`
4. 设计 Goose provider-native message 到 runtime `Action/Observation` 的更系统映射
5. 在不污染 runtime 主循环的前提下，抽象 approval / inspection 接口

## 13. 结论

本次 Goose 迁移已完成“共享 runtime 下最小可运行骨架 + 基础 developer 工具兼容”的阶段性目标。

当前成果适合作为：

- 后续 Goose 兼容增强的基线
- 不同 agent 迁移线之间的对照样本
- prompt / parser / context / tools 的模块化实验起点

尚未完成 Goose 的高级平台能力与 provider-native 细节迁移，但当前实现已经满足：

- 结构清晰
- 对共享 runtime 入侵小
- 不影响其他 agent 迁移线
- 可构建、可测试、可继续增量演进
