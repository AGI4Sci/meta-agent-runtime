# ii-agent 迁移报告

## 1. 当前状态

`ii-agent` 已经完成从“最小可跑骨架”到“研究友好的兼容 adapter”的第一轮收敛，当前代码位于：

- [`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src)

当前状态可以概括为：

**`ii-agent` 已可在 shared runtime 中稳定运行，并且其 prompt / parser / context / tool preset 已经对齐到更接近原始 `ii-agent` 的行为契约，但仍未完全复刻原项目的 controller、event、provider-native function calling 和长程压缩语义。**

## 2. 迁移目标与边界

本次迁移以 [`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/agent_runtime_design_raw.md`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/agent_runtime_design_raw.md) 为设计边界，以源仓库 [`/Applications/workspace/ailab/research/code-agent/ii-agent`](/Applications/workspace/ailab/research/code-agent/ii-agent) 为行为参考，目标是：

- 将 `ii-agent` 的最小运行单元抽取到 shared runtime
- 保持 `runtime/` agent-agnostic
- 将 agent-specific 逻辑限制在 `packages/agents/ii-agent/`
- 优先保留可研究、可消融的模块边界
- 不为了“看起来能跑”而明显偏离原始 agent 的关键算法语义

本次迁移不追求一次性复刻整个 `ii-agent` 系统，尤其不把以下复杂控制层逻辑直接塞进 runtime core：

- 数据库 run 生命周期
- event stream / realtime event
- interruption handling
- MCP 加载与外部工具生态
- controller 级并发 / batch tool execution

## 3. 参考源仓库分析

### 3.1 重点查看过的文件

- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/agents/function_call.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/agents/function_call.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/controller/agent_controller.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/controller/agent_controller.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/controller/state.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/controller/state.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/llm/context_manager/llm_compact.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/llm/context_manager/llm_compact.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/prompts/agent_prompts.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/prompts/agent_prompts.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/prompts/system_prompt.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_agent/prompts/system_prompt.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/base.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/base.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/shell/shell_run_command.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/shell/shell_run_command.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/file_system/file_read_tool.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/file_system/file_read_tool.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/file_system/file_write_tool.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/file_system/file_write_tool.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/file_system/file_edit_tool.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/file_system/file_edit_tool.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/file_system/grep_tool.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/file_system/grep_tool.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/productivity/todo_write_tool.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/productivity/todo_write_tool.py)
- [`/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/productivity/todo_read_tool.py`](/Applications/workspace/ailab/research/code-agent/ii-agent/src/ii_tool/tools/productivity/todo_read_tool.py)

### 3.2 从源仓库识别出的关键行为

迁移过程中确认了原始 `ii-agent` 的几个关键算法语义：

- 主 loop 是 `messages + system_prompt + tools` 驱动的迭代 agent loop
- 模型原生输出里可以包含 text block 和 tool call block
- 没有 pending tool call 时，controller 直接视为任务结束
- `TodoWrite` / `TodoRead` 是 coding agent 工作流中的重要组成部分，不只是可有可无的附加工具
- `LLMCompact` 在压缩上下文时会显式保留 todo 状态
- prompt 虽然很大，但 coding 行为上最关键的是：先搜集信息、频繁更新 todo、逐步验证

这些点里，最容易在“最小可跑迁移”中被弱化的是：

- 工具名与参数结构
- “无工具调用即可完成”的完成语义
- todo 状态在 prompt / context 中的持续保留

## 4. 当前实现与实际文件

### 4.1 Adapter 入口

- [`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/index.ts`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/index.ts)

导出：

- `IIAgentPromptBuilder`
- `IIAgentActionParser`
- `IIAgentContextStrategy`
- `createIIAgentToolPreset`
- `iiAgentToolPreset`
- todo 状态 helper

### 4.2 PromptBuilder

- [`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/promptBuilder.ts`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/promptBuilder.ts)
- [`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/constants.ts`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/constants.ts)

当前已实现：

- runtime 内保持英文 prompt 单轨
- 注入 `Workspace`、`Operating System`、`Today`
- 注入任务、工具列表、历史记录
- 对非平凡任务显式鼓励使用 `TodoWrite`
- 提示先搜索 / 读取再修改
- 在存在 todo 快照时注入 `<preserved_todo_state>`
- 允许两种完成路径：
  - `finish`
  - 直接输出最终文本，由 parser 兼容映射到 `finish`

### 4.3 ActionParser

- [`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/actionParser.ts`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/actionParser.ts)

当前支持：

- `{name, args}`
- `{tool, input}`
- `{tool_name, tool_input}`
- `{function: {name, arguments}}`
- fenced JSON
- 非 JSON 的 plain text completion 自动映射为 runtime `finish`

这一点是本次修正的关键，因为它把 shared runtime 的结构性 `finish` 契约，与源项目“没有 pending tool call 就结束”的语义桥接起来了。

### 4.4 ContextStrategy

- [`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/contextStrategy.ts`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/contextStrategy.ts)

当前不是简单的 sliding window，而是：

- 基于近似 token budget 裁剪
- 优先保留最近历史
- 额外保留最近的 todo 快照
- 返回新 `Context` 对象，不做副作用更新

这虽然还不是原始 `LLMCompact`，但已经把其最关键的“todo 不能被压掉”的语义保住了。

### 4.5 ToolSpec 映射

- [`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/toolPreset.ts`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/toolPreset.ts)

当前 tool preset 不再只是 runtime 工具的重命名别名，而是显式构造了更接近原始 `ii-agent` 的工具面：

- `Bash`
- `Read`
- `Write`
- `Edit`
- `Grep`
- `TodoWrite`
- `TodoRead`

其中已经对齐的关键点包括：

- 工具名贴近源仓库
- 参数字段名贴近源仓库，例如 `file_path`、`old_string`、`replace_all`、`pattern`
- `TodoWrite` / `TodoRead` 引入了最小 session-local todo 状态
- 通过 `createIIAgentToolPreset()` 每次 run 创建新工具实例，避免状态跨 run 泄漏

### 4.6 Todo 协议模块

- [`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/todoState.ts`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/ii-agent/src/todoState.ts)

这是后续为“研究友好性”新增的收敛模块，用来避免 todo 协议散落在多个文件里。当前收口了：

- `TodoItem`
- `formatTodos()`
- `normalizeTodos()`
- `isTodoSnapshotEntry()`
- `findLatestTodoSnapshot()`
- `findLatestTodoSnapshotIndex()`

这样后面如果要单独替换 `PromptBuilder`、`ContextStrategy` 或 todo tools，就不会把实验变量埋进字符串前缀和重复逻辑里。

### 4.7 Runtime registry 接入

- [`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/runtime/src/server/agentRegistry.ts`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/runtime/src/server/agentRegistry.ts)

当前接入方式：

- `prompt_builder = ii_agent`
- `action_parser = ii_agent`
- `context_strategy = ii_agent`
- `tools = ii_agent`

且 `tools` 通过 `createIIAgentToolPreset()` 按需创建 fresh preset，而不是共享单例数组。

## 5. 迁移中发现并已修正的偏移

### 5.1 工具名与工具参数漂移

最初迁移版本使用了更偏 shared runtime 的别名，例如：

- `ShellRunCommand`
- `FileRead`
- `FileWrite`
- `FileEdit`
- `SearchCode`

这虽然可跑，但对原始 `ii-agent` 的工具语义并不忠实。当前已经修正为更接近源仓库的：

- `Bash`
- `Read`
- `Write`
- `Edit`
- `Grep`
- `TodoWrite`
- `TodoRead`

### 5.2 完成语义漂移

最初迁移版本要求模型必须显式调用 `finish`。

这和 shared runtime 的设计契约一致，但和原始 `ii-agent` 的 controller 语义并不完全一致，因为源项目在“没有 pending tool call”时就会直接结束。当前已通过 parser 兼容层修正：

- 如果模型输出是合法 tool action，按 action 执行
- 如果模型输出是普通文本结论，则映射为 `finish`

### 5.3 Todo 状态保留漂移

最初迁移版本没有保留 `TodoWrite` / `TodoRead`，也没有保留 todo 快照。

这会导致和源项目相比，长任务时上下文策略明显失真。当前已修正为：

- tool preset 包含 `TodoWrite` / `TodoRead`
- todo 状态有独立 helper 模块
- prompt 可以回灌最近 todo 状态
- context trim 会优先保留最近 todo 快照

## 6. 当前已对齐的内容

从 shared runtime 研究平台的角度看，当前 `ii-agent` 已对齐这些关键点：

- adapter 代码都放在 `packages/agents/ii-agent/`
- runtime core 没被 agent-specific 逻辑污染
- `PromptBuilder`、`ActionParser`、`ContextStrategy`、`ToolSpec` 边界清晰
- prompt 保持英文单轨
- 文档保持中英文分离
- 对源项目的关键 coding agent 行为有了最小高保真兼容：
  - 先收集信息
  - 复杂任务用 todo
  - 工具结果回写上下文
  - 无工具调用可视为完成
  - todo 状态不能轻易被裁掉

## 7. 仍未完成的部分

以下内容仍然是 stub / TODO，不应误认为已经高保真迁移完成：

### 7.1 Provider-native function calling

当前仍是 shared runtime 的：

- 文本 prompt
- 文本 parser
- runtime `Action`

而不是真正 provider-native tool block end-to-end 复刻。

### 7.2 Controller / orchestration 层

尚未迁移：

- `AgentController`
- event stream
- interruption handling
- run status 生命周期
- 多工具批量执行
- tool confirmation

### 7.3 长程上下文压缩

尚未迁移完整的：

- `LLMCompact`
- summary prompt
- LLM 驱动摘要
- image-aware token 估算
- tool-output-aware 精细压缩

当前仅迁移了 todo 保留这一条最关键行为。

### 7.4 完整工具生态

尚未迁移：

- browser tools
- web tools
- media tools
- `message_user`
- sub-agent tools
- MCP tools

## 8. 研究视角下的当前评价

如果从“方便模块化研究”的角度评价，当前版本已经明显优于最初的最小骨架，原因是：

- 关键适配逻辑不再埋在 runtime core
- 工具协议更接近源项目
- todo 语义被显式抽成共享 helper，而不是散落字符串约定
- 可以更干净地做以下消融：
  - 换 prompt，不换 parser
  - 换 context strategy，不换 todo tool
  - 换 tool preset，不换 prompt

但如果目标变成“严格 apples-to-apples 复现原项目端到端系统行为”，当前还不够。

## 9. 验证

### 9.1 相关测试文件

- [`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/runtime/tests/iiAgentAdapter.test.ts`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/runtime/tests/iiAgentAdapter.test.ts)

当前覆盖：

- parser 解析 ii-agent 风格 envelope
- fenced JSON
- plain text completion 到 `finish`
- prompt 中的工具和 history 注入
- context 中 todo 快照保留
- todo helper 的共享协议
- 最小 tool loop 闭环
- tool preset 工具名集合

### 9.2 实际执行过的验证

执行过：

```bash
cd /Applications/workspace/ailab/research/code-agent/meta_agent_runtime/runtime
npm run build
node --test dist/runtime/tests/iiAgentAdapter.test.js
node --test dist/runtime/tests/serverContract.test.js dist/runtime/tests/runtimeCoreAlignment.test.js
```

结果：

- `npm run build` 通过
- `iiAgentAdapter.test.js` 通过
- `serverContract.test.js` 通过
- `runtimeCoreAlignment.test.js` 通过

补充说明：

- 在继续整理文档时，`npx tsc -p tsconfig.json --pretty false` 还暴露了一个与 `ii-agent` 无关的既有 build 问题：[`/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/openhands/src/index.ts`](/Applications/workspace/ailab/research/code-agent/meta_agent_runtime/packages/agents/openhands/src/index.ts) 重复导出 `createOpenHandsTools`。这不是 `ii-agent` 迁移本身造成的漂移，因此本报告只记录，不在此处修复。

## 10. 当前结论

当前 `ii-agent` 的迁移状态，应定义为：

**“已完成研究友好的兼容层迁移，可作为 shared runtime 中的独立 adapter 参与 prompt / parser / context / tool preset 维度的受控实验；但仍不是原始 `ii-agent` controller 级行为的完整复刻。”**

这意味着：

- 对 shared runtime 研究平台来说，`ii-agent` 已经有可用落点
- 对迁移正确性来说，关键偏移已经修正到合理范围
- 对高保真复现来说，后续仍需独立推进 controller / provider / compression 三条线
