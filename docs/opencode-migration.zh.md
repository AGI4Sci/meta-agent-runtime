# OpenCode 迁移报告

本文记录 `opencode` 迁移到 `meta-agent-runtime` 共享框架的当前状态，并补充最近一轮“相对 raw 设计与迁移前项目算法的忠实度核查”结果。

- 首轮迁移日期：2026-04-02
- 最近更新：2026-04-02
- 目标仓库：`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime`
- 参考源仓库：`/Applications/workspace/ailab/research/code-agent/opencode`
- 本轮目标：在最小可运行骨架基础上，检查并修正相对 raw 设计和原始 `opencode` 算法的明显偏移，同时把适配器整理为更利于模块化研究的形态

## 1. 本轮遵循的约束

本轮迁移遵循以下仓库约束：

- 先阅读 `agent_runtime_design.md`、`docs/migration.zh.md`、`README.md`
- runtime 内部 prompt、tool description、实验路径统一保持英文
- 文档层中英文分离，不在同一文件混排
- agent-specific 代码优先放在 `packages/agents/opencode/`
- `runtime/` 保持 agent-agnostic，仅做必要 registry 接入
- 不修改其他 agent 目录
- 不回退他人改动

## 2. 迁移前分析范围

本轮重点阅读并分析了以下源仓库文件：

- `packages/opencode/loop.md`
- `packages/opencode/src/session/prompt.ts`
- `packages/opencode/src/session/processor.ts`
- `packages/opencode/src/session/system.ts`
- `packages/opencode/src/tool/registry.ts`
- `packages/opencode/src/tool/read.ts`
- `packages/opencode/src/tool/bash.ts`

分析结论如下：

### 2.1 prompt 构建

`opencode` 的 prompt 构建并不是单一模板，而是由以下几层共同组成：

- `SystemPrompt.provider()` 负责根据模型族切换不同 system prompt 头部
- `SystemPrompt.environment()` 注入 cwd、git 状态、平台、日期等环境信息
- `InstructionPrompt` 负责补充会话级或文件级额外指令
- `SessionPrompt.loop` 在运行时拼接消息历史、工具定义、structured output 等附加约束

这意味着原始实现是“动态 prompt 装配器”，而不是一个静态模板文件。

### 2.2 action 解析

`opencode` 原始循环依赖 AI SDK 的 tool-calling / stream event，而不是当前 runtime 的单一 `raw_text -> Action` 模式。

因此在共享 runtime 中不能直接照搬其 streaming tool protocol。本轮采用兼容层策略：

- 支持 `{"tool":"name","input":{...}}`
- 同时兼容 runtime 既有 `{"name":"name","args":{...}}`
- 将 `finish` 映射为普通终止 action

### 2.3 context 管理

原始 `opencode` 的 context 管理边界较复杂，包含：

- 消息历史过滤
- compaction task
- summary / prune
- synthetic user message
- 子任务结果回灌
- context overflow 检测

这些能力超出当前 reference runtime 的最小 loop 范畴。本轮只迁移了最小可运行的历史裁剪策略。

### 2.4 工具定义

`opencode` 的工具体系较重，除基本文件/命令工具外，还包括：

- permission gating
- metadata 回写
- plugin hooks
- MCP tools
- task/subagent
- todo
- apply_patch
- webfetch / websearch / codesearch
- truncation
- LSP

这些能力并不适合在第一轮全部迁入。本轮只抽取最小工具映射集合。

### 2.5 主 loop 边界

根据 `loop.md` 与 `session/prompt.ts`、`session/processor.ts`，原始 `opencode` 的 loop 分为两层：

- 外层：会话循环，负责 task/compaction/normal processing 分支调度
- 内层：step processor，负责流式 reasoning/text/tool event 消费

共享 runtime 当前是简化版单步循环：

- build prompt
- complete
- parse action
- execute tool
- append observation

因此本轮迁移的策略是：

- 不改 reference runtime 主循环
- 仅在适配层内迁移可被当前 loop 承载的最小能力
- 对超出边界的能力明确记录 TODO

## 3. 本轮实际修改

### 3.1 新增 OpenCode 适配目录

新增目录：

- `packages/agents/opencode/src/`

新增文件：

- `packages/agents/opencode/src/index.ts`
- `packages/agents/opencode/src/promptBuilder.ts`
- `packages/agents/opencode/src/actionParser.ts`
- `packages/agents/opencode/src/contextStrategy.ts`
- `packages/agents/opencode/src/toolPreset.ts`

### 3.2 PromptBuilder 迁移

新增 `OpenCodePromptBuilder`，目标是提供一个符合当前 runtime 接口、但保留 OpenCode 关键风格的 prompt 骨架。

首轮实现包含：

- OpenCode 身份描述
- CLI coding agent 定位
- 编辑/工具使用的最小规则
- 英文环境信息块
- 工具列表与 schema
- 历史消息渲染
- 明确的 JSON-only 输出约束
- `{"tool":"<tool-name>","input":{...}}` 调用格式
- `finish` 的显式格式说明

最近一轮又进一步向原项目靠拢，补回了更接近 `codex_header` / `system` 风格的约束语气，包括：

- OpenCode 身份描述
- 编辑约束
- 工具使用偏好
- git / workspace hygiene
- JSON-only 响应契约

当前实现仍不是源仓库 `SystemPrompt + InstructionPrompt + runtime assembly` 的完整复刻，而是面向共享 runtime 的兼容 prompt builder。

### 3.3 ActionParser 迁移

新增 `OpenCodeActionParser`。

支持的输入格式：

- `{"name":"bash","args":{"command":"pwd"}}`
- `{"name":"bash","arguments":{"command":"pwd"}}`
- `{"tool":"read","input":{"filePath":"README.md"}}`
- fenced JSON 代码块
- `toolCall` 包裹格式
- `{"result":"done"}`，自动映射到 `finish`

设计目标：

- 兼容当前 runtime 的 `Action` 数据结构
- 兼容 OpenCode 风格的 tool/input 命名
- 在不引入 streaming 协议的前提下，保留最小可运行解析行为

### 3.4 ContextStrategy 迁移

新增 `OpenCodeContextStrategy`。

当前行为：

- 采用轻量滑窗裁剪
- 以字符数近似 token
- 超出窗口后保留最近历史
- 在历史被裁剪时插入一条 synthetic omission marker
- omission marker 现在带有更明确的 `condensed` / `synthetic` 元数据
- `trim()` 明确返回新对象，不复用原 entries 引用

这样做的目的不是复刻 `SessionCompaction`，而是为未来的真实 compaction/summary 迁移预留语义位置。

### 3.5 ToolSpec 映射

新增 `openCodeToolPreset`，先迁移最小可运行工具集合：

- `bash`
- `read`
- `edit`
- `write`
- `grep`
- `glob`

其中：

- `bash` 补回了更接近源仓库的 `timeout` / `workdir` / `description` 参数形状
- `bash` 返回中补了 `<bash_metadata>` 兼容信息
- `read` 同时支持文件读取和目录列举，默认行数上限也更接近源仓库
- `edit` 支持 `replaceAll`
- `write` 会在必要时创建父目录
- `grep` / `glob` 基于 `rg`，参数形状也向源工具靠拢

这套工具是“共享 runtime 兼容版本”，而不是源仓库完整工具实现。当前未接入：

- permission ask
- metadata streaming
- plugin hooks
- truncation policy
- external directory protection
- file mtime discipline

### 3.6 为模块化研究做的整理

为了便于做 prompt / parser / tools 的消融实验，最近一轮又做了轻量整理：

- 在 `packages/agents/opencode/src/toolPreset.ts` 中将工具拆成可单独导出的命名部件：
  - `openCodeBashTool`
  - `openCodeReadTool`
  - `openCodeEditTool`
  - `openCodeWriteTool`
  - `openCodeGrepTool`
  - `openCodeGlobTool`
- 新增：
  - `OPEN_CODE_TOOL_NAMES`
  - `OpenCodeToolName`
  - `createOpenCodeToolPreset({ include })`
- 在 `packages/agents/opencode/src/index.ts` 中统一 re-export：
  - `OpenCodePromptBuilder`
  - `OpenCodeActionParser`
  - `OpenCodeContextStrategy`
  - `createOpenCodeToolPreset`
  - `openCodeToolPreset`

这样可以更方便地做：

- 工具子集 ablation
- prompt/parser/context 独立替换
- 不同 adapter 之间的 apples-to-apples 对照

### 3.7 runtime 最小注册

为了让适配器可被共享 runtime 调用，本轮仅做了必要 registry 接入：

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`

新增 registry 项：

- `prompt_builder: opencode`
- `action_parser: opencode`
- `context_strategy: opencode`
- `tools: opencode`

没有改动 `runtime/src/core/*` 主循环代码。

### 3.8 构建与测试脚本修正

由于 `runtime/tsconfig.json` 将 `packages/agents/opencode/src/**/*.ts` 纳入编译范围，`rootDir` 调整为上层目录后，编译产物路径变为：

- `dist/runtime/...`
- `dist/packages/...`

因此同步修正了：

- `runtime/package.json`
  - `start -> node dist/runtime/src/server/app.js`
  - `test -> node --test dist/runtime/tests/*.test.js`
- `runtime/tsconfig.json`
  - `rootDir`
  - `include`

## 4. 本轮已完成能力

本轮已经完成的迁移能力如下。

### 4.1 已完成

- OpenCode 风格英文 prompt builder
- OpenCode 风格 action parser
- OpenCode 最小 context trimming strategy
- OpenCode 最小工具映射集合
- OpenCode 工具集的可组合导出与子集工厂
- runtime registry 最小接入
- runtime schema 接入
- 最小自动化测试覆盖

### 4.2 已能运行的最小路径

当前已经可以在共享 runtime 中跑通如下最小路径：

1. 用 `opencode` prompt builder 构建英文 prompt
2. 让模型输出 OpenCode 风格 JSON action
3. 由 `OpenCodeActionParser` 解析
4. 调用最小工具集合
5. 将 observation 回灌到 context
6. 最终通过 `finish` action 结束

## 5. 当前未迁移 / Stub / TODO

以下能力尚未迁移，或者只做了兼容占位：

### 5.1 会话与流式执行层

- `SessionPrompt.loop` 的外层调度逻辑
- `SessionProcessor.process` 的流式事件消费
- reasoning/text/tool part 的分段记录
- step-start / finish-step 结构化事件
- blocked / retry / denied 分支

### 5.2 高级上下文能力

- compaction task
- summary 生成
- prune
- context overflow 自动任务化处理
- synthetic user message 注入策略

### 5.3 工具生态

- `task` / subagent
- `todo`
- `apply_patch`
- `webfetch`
- `websearch`
- `codesearch`
- `question`
- `skill`
- `lsp`
- `mcp` tools

### 5.4 权限与安全层

- permission ruleset
- doom loop 检测
- external directory guard
- mtime/read-before-write discipline
- tool metadata / ask hooks

### 5.5 输出与观测层

- snapshot / patch 记录
- SessionSummary diff
- provider-specific stream metadata
- structured output tool 注入

## 6. 与源仓库行为的差异说明

当前适配器和源仓库仍存在明显差异，需在后续实验中注意：

- 当前是“共享 runtime + OpenCode 兼容组件”，不是完整 OpenCode runtime
- 当前 parser 是离线 JSON parser，不是 streaming tool-call protocol
- 当前 context strategy 只是轻量裁剪，不含 compaction/summary
- 当前 tools 是最小运行集合，不包含原仓库权限、插件、MCP 等机制
- 当前 prompt 只保留了核心风格，不包含源仓库全部模型分流与注入逻辑
- 当前工具仍缺少原仓库中的 ask / permission / plugin / LSP / truncation 等真实侧效应边界
- 当前兼容层更适合“组件对照实验”，不适合直接拿来代表原始 OpenCode 完整 CLI 行为

因此，本轮结果适合用于：

- 建立最小 apples-to-apples 基线
- 验证共享 runtime 接口能否承载 OpenCode 风格组件
- 为后续逐块迁移提供落点

不适合用于：

- 直接宣称“完全复刻 OpenCode”
- 与源仓库完整 CLI 行为做一比一等价比较

## 7. 验证记录

本轮累计执行了以下验证：

- 在 `runtime/` 下执行 `npm install`
- 执行 `npm run build`
- 执行 `npm test`
- 对 `opencode` adapter 相关源码做定向 TypeScript 校验：
  - `runtime/tests/opencodeAdapter.test.ts`
  - `packages/agents/opencode/src/*.ts`
  - `runtime/src/core/*.ts`

测试结果：

- 首轮最小骨架验证通过
- 最近一轮定向 TypeScript 校验通过
- 全量 `runtime` build/test 不能单独作为 `opencode` 迁移结论，因为仓库内存在其他 agent 的既有 TypeScript 错误，会污染全量结果

其中包含的有效新增验证包括：

- OpenCode parser 解析 `tool/input` 格式
- OpenCode parser 解析 fenced JSON 与 `arguments` 别名
- OpenCode prompt 渲染 JSON action contract
- OpenCode prompt 保留更接近原项目的工具偏好与 workspace hygiene 约束
- OpenCode 工具预设完成一个最小 `read -> write -> finish` loop
- OpenCode context strategy 插入 condensed marker
- OpenCode tool preset 支持按工具名做子集裁剪

## 8. 后续建议

建议按以下顺序推进第二阶段迁移：

1. 迁移 `apply_patch` 与更贴近源仓库的文件编辑工具
2. 迁移 permission / ask / doom loop 的最小兼容层
3. 迁移 `task` 子代理能力
4. 迁移 compaction / summary 机制
5. 评估是否需要为 streaming processor 扩展 shared runtime 接口

## 9. 本轮结论

当前阶段已经完成“最小可运行骨架 + 一轮忠实度修正 + 一轮研究友好整理”。

当前状态可以概括为：

- 已完成 OpenCode 在 shared runtime 上的最小 prompt/parser/context/tools 适配
- 已修正一批相对原项目过度简化的 prompt / parser / tool 偏移
- 已把工具导出整理成更适合模块化研究与消融实验的结构
- 已完成必要 registry 接入
- 已通过定向源码校验与 adapter 测试验证
- 尚未迁移原仓库的高级 loop、权限、压缩、子代理、MCP 和观测能力

这为后续更细粒度的模块对比实验提供了一个可编译、可测试、可运行的起点。
