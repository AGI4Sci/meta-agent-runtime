# ii-agent 迁移报告

## 1. 背景

本次工作的目标，是将已有 `ii-agent` 的最小运行单元抽取并迁移到 `meta-agent-runtime` 的共享框架中，满足以下约束：

- 遵守当前仓库设计文档与迁移规范
- `runtime` 内部保持英文 prompt 单轨
- 文档层保持中英文分离
- agent-specific 代码优先放在 `packages/agents/ii-agent/`
- 只做必要的 runtime registry 接入
- 不修改其他 agent 目录
- 优先交付“最小可运行骨架”

本次迁移工作目录：

- `/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent`

参考源仓库：

- `/Applications/workspace/ailab/research/code-agent/ii-agent`

工作分支：

- `codex/migrate-ii-agent`

## 2. 迁移前阅读与约束确认

本次迁移前，先阅读并确认了目标仓库中的以下文档：

- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/agent_runtime_design.md`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/agent_runtime_design.md)
- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/docs/migration.zh.md`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/docs/migration.zh.md)
- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/README.md`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/README.md)

从上述文档中确认了以下关键约束：

- `runtime/` 必须保持 agent-agnostic
- agent-specific 行为应进入 `packages/agents/<agent-name>/`
- 核心可插拔模块是 `PromptBuilder`、`ActionParser`、`ContextStrategy`、`ToolSpec`
- runtime 内 prompt、tool description 统一用英文
- 迁移优先做兼容层，而不是把原 agent 全部运行时语义直接塞入核心 loop

## 3. 参考源仓库分析

### 3.1 查看过的关键文件

为识别 `ii-agent` 的最小运行单元，本次重点阅读了以下源码：

- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/agents/function_call.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/agents/function_call.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/controller/agent_controller.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/controller/agent_controller.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/controller/state.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/controller/state.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/llm/base.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/llm/base.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/llm/context_manager/base.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/llm/context_manager/base.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/llm/context_manager/llm_compact.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/llm/context_manager/llm_compact.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/prompts/agent_prompts.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/prompts/agent_prompts.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/prompts/system_prompt.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/prompts/system_prompt.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/controller/tool_manager.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/controller/tool_manager.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/base.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/base.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/manager.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/manager.py)

### 3.2 识别出的最小运行骨架

从参考仓库中识别出的最小运行链路如下：

1. 用户输入进入 `State`
2. `FunctionCallAgent` 使用：
   - `messages=state.get_messages_for_llm()`
   - `system_prompt=config.system_prompt`
   - `tools=[tool.get_tool_params() for tool in tools]`
3. LLM 返回：
   - 文本块
   - tool call 块
4. `AgentController` 将 assistant 响应写回 history
5. `AgentController` 提取 pending tool calls
6. `AgentToolManager` 按工具名执行工具
7. tool result 再写回 history
8. 重复 loop，直到没有工具调用，或用户中断，或达到 turn 上限

### 3.3 本次迁移所抽取的核心能力

本次迁移只聚焦下列共享 runtime 可表达的部分：

- prompt 构建
- action 解析
- context 裁剪
- tool schema / tool name 映射
- 最小共享 runtime 接入

### 3.4 本次没有直接迁移的能力

以下能力在原仓库中存在，但不属于本次最小骨架迁移范围：

- 事件流与实时事件发布
- 数据库存储与 run 状态管理
- 用户中断检查
- 原生 provider function calling 细节
- 多工具串/并行调度语义
- 压缩总结中的 todo 保留与 LLM 摘要
- 多 agent type 的大系统 prompt 拼装逻辑
- MCP 加载与完整工具生态

## 4. 迁移设计决策

### 4.1 总体策略

采用“兼容层优先”的迁移策略，而不是强行复刻整个 `ii-agent` 运行时：

- 在 `packages/agents/ii-agent/` 中实现 ii-agent adapter
- 通过 registry 将其注册进共享 runtime
- 让 ii-agent 先能在共享 loop 中完成基本 tool-use + finish 闭环
- 对原仓库复杂能力用 TODO 明确标注，避免一次迁移过深

### 4.2 PromptBuilder 策略

原始 `ii-agent` 的 prompt 体系非常大，包含：

- 通用工程任务规范
- todo 管理规范
- 浏览器与媒体规范
- 子代理委派规范
- 各类 agent type specialized instructions

共享 runtime 当前并不适合直接承载整套复杂 prompt 体系，因此本次只抽取最小英文骨架：

- 强调真实代码工作区
- 强调先收集信息再行动
- 强调使用工具而非猜测
- 规定输出一个 JSON action
- 任务完成时必须调用 `finish`

这满足了“runtime 内 prompt 英文单轨”的要求。

### 4.3 ActionParser 策略

原始 `ii-agent` 更偏向 provider-native function calling 返回结构，而共享 runtime 当前是“文本 -> parser -> Action”模式。

因此本次实现了一个文本兼容层，支持以下三类 action 载荷：

- `{"name":"Tool","args":{...}}`
- `{"tool":"Tool","input":{...}}`
- `{"tool_name":"Tool","tool_input":{...}}`

同时支持 fenced JSON 提取，方便兼容“模型输出代码块包裹 JSON”的常见情况。

### 4.4 ContextStrategy 策略

原始 `ii-agent` 的 context 管理较复杂，尤其是：

- token budget 控制
- tool output token 估算
- image token 估算
- 超预算后的 LLM 压缩摘要
- TodoWrite 状态保留

本次不直接迁移这套复杂逻辑，而是实现了最小 recent-history 保留策略：

- 按近似 token 估算截断
- 从最新 entry 开始向前保留
- 至少保留最新上下文

这使其可以在共享 runtime 中先工作起来，同时为未来接入更强摘要策略留出接口位置。

### 4.5 ToolSpec 映射策略

原始 `ii-agent` 有自己的工具命名与 schema 组织方式，例如：

- `ShellRunCommand`
- `FileRead`
- `FileWrite`
- `FileEdit`
- 以及大量 web/browser/media/productivity tools

共享 runtime 已经存在一组基础工具：

- `bash`
- `file_read`
- `file_write`
- `file_edit`
- `search`

本次采用 alias 映射，而不是重写工具实现：

- 保留 runtime 现有 `call` / `interpreter`
- 仅把对外暴露给 ii-agent prompt/parser 的工具名字改成 ii-agent 风格
- 形成最小 `ii_agent` tool preset

## 5. 本次实际修改

### 5.1 新增文件

新增了以下 ii-agent 适配文件：

- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/constants.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/constants.ts)
- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/promptBuilder.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/promptBuilder.ts)
- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/actionParser.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/actionParser.ts)
- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/contextStrategy.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/contextStrategy.ts)
- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/toolPreset.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/toolPreset.ts)
- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/index.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/index.ts)

新增测试文件：

- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/tests/iiAgentAdapter.test.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/tests/iiAgentAdapter.test.ts)

### 5.2 修改文件

修改了以下共享 runtime 文件以完成必要接入：

- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/src/server/registry.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/src/server/registry.ts)
- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/src/server/schema.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/src/server/schema.ts)
- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/tsconfig.json`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/tsconfig.json)
- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/package.json`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/package.json)

## 6. 已完成迁移的能力

### 6.1 PromptBuilder

已完成最小版 `IIAgentPromptBuilder`，具备以下特征：

- 英文 system prompt
- 注入任务内容
- 注入工具列表及 schema
- 注入上下文历史
- 强约束模型返回单个 JSON action

当前实现位置：

- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/promptBuilder.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/promptBuilder.ts)

### 6.2 ActionParser

已完成 `IIAgentActionParser`，支持：

- 标准 `{name,args}` 形式
- ii-agent 风格 `{tool_name,tool_input}` 形式
- 兼容 `{tool,input}` 形式
- 从 fenced code block 中提取 JSON

当前实现位置：

- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/actionParser.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/actionParser.ts)

### 6.3 ContextStrategy

已完成 `IIAgentContextStrategy`，支持：

- 基于近似 token 的 history 裁剪
- 优先保留最近上下文
- 保留 `task`

当前实现位置：

- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/contextStrategy.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/contextStrategy.ts)

### 6.4 ToolSpec 映射

已完成最小 `ii_agent` tool preset，当前包含：

- `ShellRunCommand`
- `FileRead`
- `FileWrite`
- `FileEdit`
- `SearchCode`

底层仍复用 runtime 现有工具实现。

当前实现位置：

- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/toolPreset.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/packages/agents/ii-agent/src/toolPreset.ts)

### 6.5 Runtime registry 接入

已完成以下最小接入：

- `prompt_builder = ii_agent`
- `action_parser = ii_agent`
- `context_strategy = ii_agent`
- `tools = ii_agent`

对应文件：

- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/src/server/registry.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/src/server/registry.ts)
- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/src/server/schema.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/src/server/schema.ts)

## 7. 未完成项与 TODO

以下内容尚未迁移，当前视为后续工作项：

### 7.1 Prompt 语义完整性

当前 PromptBuilder 只保留最小行为约束，未迁移：

- TodoWrite 使用规范
- browser/media/researcher/codex 等专门规则
- 多 agent type specialized instructions
- 大量工作流级提示模板

TODO：

- 评估是否需要将 ii-agent prompt 进一步拆成“稳定核心层 + 可选 profile 层”
- 仅在共享 runtime 能稳定容纳时逐步补充

### 7.2 Provider-native function calling

当前是“文本 JSON action”兼容层，不是完整 function calling 复刻。

TODO：

- 如后续实验需要 apples-to-apples 对比 provider-native tool calling，可考虑为 runtime 增加更贴近 provider 调用语义的 parser / llm adapter

### 7.3 Context 压缩

尚未迁移：

- `LLMCompact`
- summary prompt
- TodoWrite 状态保留
- image/tool output 的精细 token 估算

TODO：

- 如后续需要长程任务对比，应为 ii-agent adapter 补一个更接近原仓库的 summarization strategy

### 7.4 Tool 生态

当前只迁移了最小骨架所需工具映射，未覆盖：

- browser tools
- web tools
- media tools
- todo tools
- message user
- mcp tools
- sub-agent tools

TODO：

- 按实验或任务需要逐步扩展 `ii_agent` tool preset
- 仅在通用 runtime 能承载时引入更复杂工具

### 7.5 Controller 级语义

尚未迁移：

- interruption handling
- event stream
- tool batch concurrency
- run status 生命周期
- assistant/tool event replay

TODO：

- 若未来需要更高保真迁移，应在 runtime 外围增加 adapter-specific orchestration layer，而不是污染核心 loop

## 8. 兼容性说明

### 8.1 与原始 ii-agent 的一致部分

当前迁移结果与原始 ii-agent 在以下层面保持了结构一致性：

- 都是 task + history + tools 驱动的迭代 loop
- 都允许模型输出工具调用
- 都将工具结果写回上下文
- 都通过 finish 或无后续动作结束任务

### 8.2 与原始 ii-agent 的差异

当前迁移结果与原始 ii-agent 存在以下明确差异：

- 不依赖 provider 原生 tool call block
- 不包含数据库、事件流、中断等控制层
- 不包含原始复杂 prompt 体系
- 不包含长程对话压缩摘要
- 不包含完整工具生态

### 8.3 差异的原因

这些差异是有意为之，主要原因是：

- 当前目标是迁移“最小可运行骨架”
- 设计文档要求 runtime 保持 agent-agnostic
- 复杂控制层逻辑不适合直接塞进共享 runtime
- 先交付可运行且可测试的 adapter，能降低后续增量迁移成本

## 9. 验证与结果

### 9.1 新增测试

新增测试文件：

- [`/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/tests/iiAgentAdapter.test.ts`](/Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime/tests/iiAgentAdapter.test.ts)

覆盖点包括：

- parser 能解析 ii-agent 风格 action envelope
- parser 能解析 fenced JSON
- prompt builder 能渲染 task、tools、history
- context strategy 能按预算保留最近历史
- `ii_agent` tool preset 能在共享 runtime 中跑通最小闭环

### 9.2 构建与测试命令

实际执行过：

```bash
cd /Applications/workspace/ailab/research/code-agent/meta-agent-runtime-ii-agent/runtime
npm install
npm run build
npm test
```

### 9.3 验证结果

结果如下：

- `npm install` 成功
- `npm run build` 成功
- `npm test` 成功
- 测试总计 `10/10` 通过

## 10. 遇到的问题与处理

### 10.1 TypeScript 构建边界

问题：

- `runtime/tsconfig.json` 原本只覆盖 `runtime` 目录
- 新增 `packages/agents/ii-agent` 后，构建时无法将 adapter 纳入同一编译图

处理：

- 将 `rootDir` 调整为上级目录
- 将 `../packages/**/*.ts` 纳入 `include`

### 10.2 构建产物路径变化

问题：

- 调整 `rootDir` 后，`dist` 目录结构发生变化

处理：

- 同步更新 `runtime/package.json` 中的 `start` 与 `test` 脚本路径，使其指向新的 `dist/runtime/...` 位置

### 10.3 ContextStrategy 测试阈值

问题：

- 初版测试中的 token budget 过宽，导致裁剪行为没有触发

处理：

- 收紧测试阈值，确保测试真正覆盖“保留最新上下文”的行为

## 11. 当前迁移状态结论

本次迁移已经完成以下目标：

- 完成 `ii-agent` 最小可运行骨架迁移
- 完成 `PromptBuilder`、`ActionParser`、`ContextStrategy`、`ToolSpec` 映射
- 完成必要的 runtime registry 接入
- 完成最小测试补充
- 完成 build/test 验证

当前状态可定义为：

**“ii-agent 已进入共享 runtime，可作为最小兼容 adapter 运行，但尚未达到原始仓库高保真行为复刻。”**

## 12. 后续建议

建议后续按以下顺序继续推进：

1. 先补 `TodoWrite` / `MessageUser` / 更多文件与搜索类工具映射
2. 再补更接近原仓库的 context compression / summarization
3. 如实验确实需要，再评估 provider-native function calling 兼容路径
4. 最后再考虑中断、事件流、批量调度等控制层语义

这样可以保证：

- 每一步都可验证
- 不污染共享 runtime 主循环
- 不影响其他 agent 的并行迁移工作
- 逐步提高 ii-agent 适配器保真度

## 13. 本次变更文件清单

### 新增

- `packages/agents/ii-agent/src/constants.ts`
- `packages/agents/ii-agent/src/promptBuilder.ts`
- `packages/agents/ii-agent/src/actionParser.ts`
- `packages/agents/ii-agent/src/contextStrategy.ts`
- `packages/agents/ii-agent/src/toolPreset.ts`
- `packages/agents/ii-agent/src/index.ts`
- `runtime/tests/iiAgentAdapter.test.ts`
- `docs/ii-agent-migration-report.zh.md`

### 修改

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/tsconfig.json`
- `runtime/package.json`

## 14. 总结

本次迁移没有追求“一次性搬完整个 ii-agent”，而是严格按共享 runtime 的设计边界，提炼出一个可运行、可测试、可继续扩展的 adapter 骨架。

这意味着：

- 现在已经有了 `ii-agent` 在 `meta-agent-runtime` 中的落点
- 后续增强可以围绕这个 adapter 增量进行
- 当前 runtime 仍保持 agent-agnostic
- 其他 agent 的迁移目录没有被破坏

如果后续需要继续推进，本报告可以作为下一轮迁移的状态基线。
