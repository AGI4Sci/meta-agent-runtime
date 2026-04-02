# pi-mono 迁移报告

## 1. 任务背景

本次工作的目标是将已有 `pi-mono` code agent 的最小可运行单元迁移到 `meta-agent-runtime` 的共享框架中，并满足以下约束：

- runtime 内部保持英文 prompt 单轨
- 文档层保持中英文分离
- agent-specific 代码优先放在 `packages/agents/pi-mono/`
- 只做必要的 runtime registry 接入
- 不修改其他 agent 目录
- 如果原能力过于复杂，则先抽兼容层并保留 TODO

本轮迁移采用“先最小骨架、后逐步对齐”的策略，重点抽取：

- `PromptBuilder`
- `ActionParser`
- `ContextStrategy`
- `ToolSpec` 映射

## 2. 设计与迁移约束阅读情况

开始实施前，已阅读以下目标仓库文档：

- `agent_runtime_design.md`
- `docs/migration.zh.md`
- `README.md`

这些文档给出的关键约束如下：

- `runtime/` 必须保持 agent-agnostic
- 迁移应放在 `packages/agents/<agent-name>/`
- prompt / parser / context / tools 应通过 registry 注入，而不是把 agent 逻辑直接塞进 runtime 核心循环
- runtime 高速路径中的 prompt、tool description、实验接口统一为英文
- 中文主要保留在文档与协作层

## 3. 对源仓库的分析结论

### 3.1 阅读过的源仓库关键文件

为识别 `pi-mono` 的最小运行边界，本次重点阅读了源仓库中的以下文件：

- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/agent.ts`
- `packages/agent/src/types.ts`
- `packages/coding-agent/src/core/system-prompt.ts`
- `packages/coding-agent/src/core/messages.ts`
- `packages/coding-agent/src/core/tools/index.ts`
- `packages/coding-agent/src/core/sdk.ts`
- `packages/coding-agent/src/core/agent-session.ts`

### 3.2 源仓库中的模块边界识别

#### Prompt 构建

`pi-mono` 的 prompt 主要由 `packages/coding-agent/src/core/system-prompt.ts` 负责。其行为特点：

- 默认输出英文 system prompt
- 按当前激活工具动态生成 tool list
- 根据工具集合动态追加 guideline
- 在 prompt 末尾附加当前时间与 working directory
- 在复杂模式下还会拼接 context files、skills、extensions 等附加信息

本轮迁移保留了其中最稳定、最小且可复用的部分：

- 英文 system prompt 基调
- 动态工具列表
- 基于工具能力的基础 guideline
- 当前时间注入
- 历史上下文渲染

未迁移 skills / context files / extension prompt append 等复杂拼装路径。

补充说明：在首次接入后，本 adapter 又做了一轮“忠实性纠偏”。当前报告以下文都以纠偏后的状态为准，而不是第一次最小接线时的状态。

#### Action 解析

源仓库的真正执行路径依赖模型原生 tool call / assistant content 流，而不是 reference runtime 当前的单字符串 action parser 方案。也就是说，源实现的 action 解析边界和 meta-agent-runtime 当前协议并不完全一致。

因此本轮没有强行复刻源仓库的原生流式 tool-call 协议，而是引入了一个兼容层：

- 要求模型输出单个 JSON action 对象
- 支持 fenced JSON
- 兼容 runtime 共享工具与 `pi-mono` 风格工具名之间的别名映射
- 兼容 source-style tool envelope，例如 `toolCall` / `arguments` 结构

这是为了先让 `pi-mono` 能在共享 runtime 上跑通最小闭环。

#### Context 管理

源仓库中 context 管理较复杂，涉及：

- `convertToLlm` 对多种自定义消息的转换
- compaction summary / branch summary
- UI-only message 过滤
- steering / follow-up message 队列
- session state 与 extension 注入

本轮迁移没有照搬这些复杂机制，而是识别出一个最小共同模式：

- assistant 输出后跟随 tool observation
- 最近几轮 assistant/tool 对话对最重要

因此实现了一个轻量 `PiMonoContextStrategy`：

- 优先保留被显式 `pinned` 的 entry
- 其余部分优先按 assistant/tool 成对回溯截断
- 对非成对的 trailing entry 也能稳定保留，不再假设所有上下文都严格二元成对
- 避免只保留半轮记录

这能比简单滑窗更贴近 `pi-mono` 的“以 turn 为单位”语义，但仍然保持实现简单。

#### Tool 定义

源仓库常用的最小工具集合是：

- `read`
- `bash`
- `edit`
- `write`

另有扩展探索类工具：

- `grep`
- `find`
- `ls`

共享 runtime 当前已有工具命名并不完全一致，因此本轮采用“优先映射、必要时最小补齐”的方案，而不是重新实现整套工具：

- 用 alias 方式把 `file_read/file_edit/file_write` 暴露为 `read/edit/write`
- 保留共享 `bash`
- 为了维持源仓库只读探索面的结构，补齐了最小 `grep/find/ls` 工具 compat 实现
- `piMonoReadonlyTools` 现已恢复为 `read + grep + find + ls`

#### 主 loop 边界

源仓库 `agent-loop.ts` 的核心 loop 具备如下特征：

- 一轮 assistant response 后可触发多个 tool call
- 支持流式事件
- tool 执行期间可插入 steering message
- agent 将在 follow-up message 到来后再次进入 loop

reference runtime 当前 loop 更简化：

- 单次 `prompt -> raw_text -> action -> tool -> observation`
- 每一步只解析一个 action
- 错误转 observation，不中断 loop
- `finish` 由 runtime 结构性识别

这意味着本轮迁移的重点并不是复刻 `pi-mono` 的 loop 本身，而是把 `pi-mono` 中可插拔、可比对的组件抽离出来接入共享 loop。

## 4. 本次实际改动

### 4.1 新增 adapter 目录

新增目录：

- `packages/agents/pi-mono/src/`

新增文件：

- `packages/agents/pi-mono/src/index.ts`
- `packages/agents/pi-mono/src/promptBuilder.ts`
- `packages/agents/pi-mono/src/parser.ts`
- `packages/agents/pi-mono/src/contextStrategy.ts`
- `packages/agents/pi-mono/src/tools.ts`

### 4.2 PromptBuilder

新增 `PiMonoPromptBuilder`，实现要点：

- 维持英文 prompt
- 保留 `pi-mono` 风格的“expert coding assistant operating inside pi”语气
- 基于 tools 动态渲染工具列表
- 基于 tool set 生成更接近源仓库 `system-prompt.ts` 的基础 guidelines
- 注入当前日期时间与 working directory
- 渲染当前任务与上下文历史
- 强制输出单个 JSON action contract
- 为实验可复现性提供可注入的 `cwd` / `now()` 选项

这是对原 `system-prompt.ts` 的最小兼容抽取，而不是完整功能移植。

### 4.3 ActionParser

新增 `PiMonoActionParser`，实现要点：

- 接受纯 JSON 或 fenced JSON
- 解析 `{ name, args }` 结构
- 兼容 `toolCall` / `arguments` / `tool_input` 等 source-style envelope
- 对 `file_read/file_edit/file_write` 做别名归一化
- 解析错误时抛出 runtime 标准 `ParseError`

这样可以兼容共享 runtime 当前的 action 执行模型。

### 4.4 ContextStrategy

新增 `PiMonoContextStrategy`，实现要点：

- 支持 token budget 参数
- 优先按 assistant/tool 两条 entry 为一个 pair 回溯保留
- 优先保留 metadata 中被 `pinned` 的 entry
- 避免截断到半轮对话
- 对 trailing user entry 等非 pair 记录保持更稳健

这是面向最小实验可比性的实现，不包含 compaction summary / branch summary / custom message transform。

### 4.5 Tool preset 映射

新增两个 preset：

- `piMonoCodingTools`
- `piMonoReadonlyTools`

其中：

- `piMonoCodingTools = [read, bash, edit, write]`
- `piMonoReadonlyTools = [read, grep, find, ls]`

其中 `read/edit/write/bash` 优先复用共享 runtime 工具；`grep/find/ls` 为维持源仓库研究边界而补了最小 compat 实现。

### 4.6 Registry 接入

修改 `runtime/src/server/registry.ts`，新增：

- prompt builder: `pi_mono`
- action parser: `pi_mono`
- context strategy: `pi_mono`
- tool presets: `pi_mono_coding` / `pi_mono_readonly`

本次没有修改 runtime 核心 loop，也没有改动其他 agent adapter 目录。

### 4.7 编译配置调整

由于 adapter 位于 `runtime/` 目录之外，而 registry 需要直接引用 `packages/agents/pi-mono/src`，因此做了最小编译配置调整：

- 更新 `runtime/tsconfig.json` 以包含 `../packages/**/*.ts`
- 调整 `rootDir` 为仓库根范围
- 同步更新 `runtime/package.json` 中 build/start/test 对应的输出路径

这是为了让 runtime 可以编译跨目录 adapter 源码。

## 5. 当前已迁移能力

当前已经迁移或兼容的能力包括：

- `pi-mono` 风格英文 prompt 基线
- 最小工具列表动态渲染
- 更接近源 prompt 的工具感知 guideline 生成
- JSON action 兼容解析
- source-style tool envelope 兼容解析
- 与共享 runtime 工具命名之间的别名映射
- 以 turn pair 为中心、且对 trailing entry 更稳健的 context trimming
- 更接近源仓库的 readonly tool surface：`read/grep/find/ls`
- prompt builder 的可控时间 / cwd 注入，便于可复现实验
- runtime registry 中的最小接入
- 针对 adapter 的最小测试覆盖

## 6. 本轮未迁移能力 / Stub / TODO

以下能力尚未迁移，当前应视为 TODO：

### 6.1 原生 tool-call 流式协议

源仓库依赖原生 streaming tool call / assistant content 事件流。当前 adapter 仍运行在 shared runtime 的单 action loop 上，没有复刻这条协议。

### 6.2 `AgentSession` 级状态管理

以下复杂能力仍未迁：

- compaction summary
- branch summary
- steering / follow-up queue
- retry / overflow recovery
- extension runner / skill / resource loader
- UI-only message filtering 与 session persistence

### 6.3 source prompt 的文档 / skills / extension 拼装

当前 prompt builder 只保留最稳定的系统提示骨架，没有迁：

- docs path 注入
- context files 拼接
- skills section
- extension append prompt

## 7. 当前判断

从“方便模块化研究”的角度看，当前 `pi-mono` adapter 已经比首次接入时更适合作为受控研究对象：

- prompt 变量更接近 source algorithm
- tool 变量的探索面更接近 source preset
- context 变量更稳健，减少了实现偶然性
- 但 session / UI / streaming 机制仍被明确排除在共享 core 之外

因此，当前状态应理解为：

- 不是 `pi-mono` 全量移植
- 但已经是一个更忠实、更适合做 PromptBuilder / ActionParser / ContextStrategy / ToolSpec 对比实验的最小骨架

## 7. 验证情况

本次实际执行了以下验证：

1. 在 `runtime/` 下执行 `npm test`
2. 针对 `pi-mono` adapter 持续补充定向测试
3. 结合源码审计结果回查 prompt / parser / readonly preset / context trimming 的忠实性

验证结果：

- `test` 通过
- 当前仓库测试为 `79/79` 通过
- `pi-mono` 相关测试覆盖了最小骨架与最近一轮忠实性纠偏
- 另外，`npm run build` 在仓库当前状态下仍会被其他 adapter 的既有 TypeScript 问题影响，因此不能单独作为 `pi-mono` 迁移成败的结论依据

新增测试主要覆盖：

- adapter name 导出
- parser 对 fenced JSON 的解析
- source-style tool envelope 兼容
- tool alias normalization
- prompt builder 输出中包含 task / tools / JSON contract / working directory
- readonly exploration guidance 的存在
- context strategy 保持 assistant/tool 配对
- context strategy 对 trailing non-pair entry 的稳定保留
- tool preset 的名称集合正确

## 8. 风险与偏差说明

### 8.1 与原仓库行为并不完全等价

本次迁移优先目标是“跑通共享 runtime 上的最小骨架”，不是“一次性复制完整 `pi-mono` 执行语义”。因此目前更准确的描述是：

- 已建立 `pi-mono` compatibility adapter
- 尚未实现 full-fidelity migration

### 8.2 parser 协议已简化

当前 parser 假设模型返回单 JSON action，对比源仓库真实协议有明显收缩。这对 apples-to-apples 研究是一个潜在偏差来源，后续需要明确标注实验配置。

### 8.3 仍未覆盖 session / streaming 行为

虽然 `pi_mono_readonly` 已恢复到 `read + grep + find + ls`，但原仓库的重要 session / streaming 机制仍未迁入。这意味着当前 adapter 更适合做模块化研究，不适合作为 source 行为的全量代理。

## 9. 后续建议

建议按以下顺序继续推进：

1. 在 adapter 内增加更明确的 fixture 驱动测试，比较 source prompt / parser / readonly preset 与当前适配器输出
2. 评估是否需要增加 context message compatibility 层，以吸收 compaction / summary message
3. 评估是否需要为 runtime 增加更接近原生 tool-call transcript 的协议桥接
4. 如果后续研究问题确实依赖 session 行为，再分阶段引入 `AgentSession` 级兼容层
5. 保持当前“prompt/context/parser/tool 可单独替换”的边界，不要为了高保真而回退到 source 的整包运行时

## 10. 当前结论

当前 `pi-mono` 迁移状态可以概括为：

- 最小骨架已完成
- 忠实性已做一轮关键纠偏
- 完整 session / streaming 兼容仍未完成

已完成的部分已经足以让 `pi-mono` 以独立 adapter 的形式接入共享 runtime，并作为 PromptBuilder / ActionParser / ContextStrategy / ToolSpec 的受控研究对象继续演化。
