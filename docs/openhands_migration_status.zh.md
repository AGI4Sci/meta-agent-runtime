# OpenHands 迁移状态报告

## 1. 本次迁移目标

本次工作的目标是将 OpenHands 的最小可运行单元迁移到 `meta-agent-runtime` 的共享框架中，并遵守以下平台约束：

- agent-specific 逻辑尽量收敛到 `packages/agents/openhands/` 和对应 adapter 位置
- `runtime/` 保持 agent-agnostic，只做必要的 registry 接入
- runtime 内 prompt、tool description、接口交互保持英文单轨
- 文档层保持中英文分离
- 不修改其他 agent 目录，不影响其他迁移线

本次没有尝试完整复刻 OpenHands 全量行为，而是优先落地一个可以在共享线性 loop 上运行的最小兼容骨架。

## 2. 迁移前阅读与分析范围

### 2.1 目标仓库文档

已阅读：

- `agent_runtime_design.md`
- `docs/migration.zh.md`
- `README.md`

从这些文档中确认了以下关键约束：

- runtime 主循环固定为线性单步 `LLM -> Action -> Tool -> Observation`
- `PromptBuilder`、`ActionParser`、`ContextStrategy`、`ToolSpec` 是首要迁移映射点
- agent-specific 逻辑不应直接侵入 `runtime/src/core/*`
- 新能力优先通过 registry 接入
- runtime 英文单轨，中文保留在文档与协作层

### 2.2 参考源仓库阅读范围

已重点阅读 OpenHands 参考源仓库中的以下位置：

- `openhands/controller/agent_controller.py`
- `openhands/controller/action_parser.py`
- `openhands/agenthub/codeact_agent/codeact_agent.py`
- `openhands/agenthub/codeact_agent/function_calling.py`
- `openhands/memory/conversation_memory.py`

并用全文搜索辅助识别了以下边界：

- controller / state / delegation
- action / observation 类型体系
- memory / condensation / recall
- tool / sandbox / MCP / browser 边界

## 3. 对 OpenHands 的结构理解

## 3.1 最小运行单元

从 V0 OpenHands 代码路径看，最小可运行单元可压缩为：

1. `CodeActAgent` 根据当前状态构造消息和 tools
2. LLM 返回 function-calling 风格结果
3. `function_calling.py` 将模型输出解析为 OpenHands action
4. controller 驱动 action 执行并产生 observation
5. memory / condenser 将事件历史整理回下一轮上下文

其中真正适合映射到共享 runtime 的最小核心是：

- prompt 组装
- action 解析
- history trimming / condensation 兼容
- tool schema 与 runtime tool 调用边界

## 3.2 原项目中的关键复杂度

OpenHands 原生运行链路明显比共享 runtime 更复杂，主要体现在：

- `AgentController` 负责状态机、pending action、loop recovery、stuck detection
- 支持 delegate controller / parent-child controller
- action / observation 是丰富事件体系，而非单一 `Action` / `Observation`
- `ConversationMemory` 会处理 tool call 发起消息与 tool response 的匹配关系
- condensation 是显式动作与 memory 视图协同，不只是简单裁剪
- runtime/sandbox 是独立环境层，支持 browser、MCP、Jupyter、远程/容器执行

这些能力大多不能直接等价映射到当前线性单线程 runtime loop。

## 4. 可映射能力与不可等价能力

## 4.1 已确认可映射到共享线性 loop 的能力

本次确认以下能力可自然映射：

- `PromptBuilder`
  - 可将 CodeAct 风格 system instruction 压缩成共享 runtime 的英文 prompt builder
- `ActionParser`
  - 可将 OpenHands function-calling 结果规约为 runtime `Action`
- `ContextStrategy`
  - 可实现最小的历史保留/裁剪兼容层
- `ToolSpec`
  - 可将最核心工具映射为共享 runtime tool preset
- `finish`
  - 可映射为 runtime 内建 `finish` action

## 4.2 本次无法等价迁移、只能先做兼容层的能力

以下能力未做等价迁移，而是显式降级：

- 多控制器 / delegation
- pending actions 队列
- loop recovery / stuck detection
- 完整 event stream 语义
- tool call metadata 关联
- browser tool 交互
- MCP tool 动态接入
- repo microagent / recall / memory augmentation
- 原始 condensation action + summary insertion 语义
- 交互式持久 Jupyter 会话
- sandbox 生命周期管理

## 5. 本次实际实现内容

## 5.1 新增 OpenHands adapter 目录实现

新增目录：

- `runtime/src/agents/openhands/`

新增文件：

- `runtime/src/agents/openhands/index.ts`
- `runtime/src/agents/openhands/prompt.ts`
- `runtime/src/agents/openhands/parser.ts`
- `runtime/src/agents/openhands/context.ts`
- `runtime/src/agents/openhands/tools.ts`

这些文件承载了 OpenHands 的最小 compatibility adapter。

## 5.2 PromptBuilder 映射

实现文件：

- `runtime/src/agents/openhands/prompt.ts`

本次 prompt builder 的设计要点：

- 全英文输出，符合 runtime 单轨约束
- 明确告知当前运行在 shared linear runtime loop 中
- 明确声明不应假设 delegation / browser / MCP / concurrent controller 可用
- 指定输出必须是单个 JSON 对象
- 将工具描述与历史上下文压入统一 prompt

该实现不是 OpenHands 原 prompt 的逐字复刻，而是保留其“CodeAct + tool call”风格的最小兼容表达。

## 5.3 ActionParser 映射

实现文件：

- `runtime/src/agents/openhands/parser.ts`

当前 parser 支持：

- 解析 `{"tool":{"name":"...","arguments":{...}}}` 结构
- 解析顶层 `{"name":"...","arguments":{...}}` 结构
- 将 OpenHands 风格 `finish.message` 归一化为 runtime `finish.result`

这样做的目的是让 OpenHands adapter 不依赖 runtime 通用 JSON parser 的字段约定，而是保留一层 agent-specific 兼容行为。

## 5.4 ContextStrategy 映射

实现文件：

- `runtime/src/agents/openhands/context.ts`

当前策略：

- 当历史 token 估算超出上限时，按 assistant/tool 成对删除最旧内容
- 保留较近的 action-observation 对
- 在裁剪后插入一条 condensed 提示，明确告知部分 OpenHands 历史已丢失

这是对原 OpenHands condensation/memory 的极简兼容层，不包含：

- summary_offset
- forgotten_event_ids 显式追踪
- recall/microagent 注入
- tool-call pairing memory 修复

## 5.5 ToolSpec 映射

实现文件：

- `runtime/src/agents/openhands/tools.ts`

本次迁移的最小工具集为：

- `execute_bash`
- `execute_ipython_cell`
- `str_replace_editor`
- `think`
- `request_condensation`

其中：

- `execute_bash`
  - 映射原 OpenHands 最核心 shell 执行能力
- `execute_ipython_cell`
  - 以 `python3 -c` 兼容层方式提供最小 Python 执行能力
- `str_replace_editor`
  - 提供 `view/create/str_replace/insert` 最小编辑子集
- `think`
  - 作为无副作用 trace 工具保留
- `request_condensation`
  - 作为 compatibility shim 保留名称与基本语义，但实际 condensation 仍由共享 runtime context strategy 负责

## 5.6 packages 导出桥接

更新文件：

- `packages/agents/openhands/src/index.ts`

本次没有把完整实现放进 `packages/agents/openhands/` 内部，而是让 `packages` 作为对 `runtime/src/agents/openhands/` 的轻量导出桥接。这样做的原因是：

- 当前 runtime registry 需要直接消费 TS 实现
- 本次优先完成最小可运行 adapter
- 避免为尚未稳定的目录层次引入额外打包复杂度

后续如果仓库希望进一步收敛 agent adapter 物理位置，可以再把实现整体移动到 `packages/agents/openhands/` 并调整 import。

## 5.7 runtime registry 最小接入

更新文件：

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`

完成内容：

- 注册 `openhands` prompt builder
- 注册 `openhands` action parser
- 注册 `openhands` context strategy
- 注册 `openhands_minimal` tool preset
- 将这些枚举加入 server schema

遵循了“只做必要 registry 接入”的要求，没有修改 runtime core loop。

## 5.8 最小测试

新增文件：

- `runtime/tests/openhands.test.ts`

测试覆盖：

- OpenHands parser 能解析 compatibility tool envelope
- `finish.message` 能归一化为 runtime finish args
- OpenHands prompt builder 包含兼容层约束说明
- OpenHands context strategy 能执行最小裁剪

## 6. 相对原 OpenHands 的损失点

本次迁移是“最小可运行骨架迁移”，相对原项目存在明确损失。

## 6.1 控制器能力损失

未迁移：

- `AgentController` 状态机
- `set_initial_state`
- `status_callback`
- replay manager
- stuck detector
- loop recovery
- parent/delegate controller
- pending actions deque

影响：

- 当前 adapter 只能在线性共享 loop 内执行单步 tool action
- 无法复用 OpenHands 的复杂控制流与恢复策略

## 6.2 memory / condensation 语义损失

未迁移：

- `ConversationMemory` 中对 assistant tool call 与 tool response 的配对
- condensed view / condensation action 双路径逻辑
- `forgotten_event_ids`
- recall observation / microagent knowledge
- cacheable message 与 provider-specific message formatting

影响：

- 当前上下文是 runtime 通用 `ContextEntry[]`
- 无法严格保证与原 OpenHands memory 构造出的消息序列一致
- condensation 仅是“裁剪 + 提示”，不是真正的总结管线

## 6.3 工具与 sandbox 能力损失

未迁移或仅 stub：

- browser tool
- MCP tools
- remote runtime / docker / kubernetes / local sandbox 抽象
- 持久 ipython / jupyter plugin
- security risk / confirmation mode

影响：

- 当前只保留最小 shell / python / file editing 能力
- 运行边界更接近 reference runtime，而不是 OpenHands sandbox runtime

## 7. 当前状态评估

## 7.1 已完成状态

可以认为本次迁移已经完成“最小骨架可运行”阶段，具体表现为：

- OpenHands adapter 已具备独立 prompt/parser/context/tools 组合
- 已能通过 runtime registry 进行选择
- 已补最小测试
- 已通过 build/test 验证

## 7.2 当前仍是 stub / TODO 的部分

以下内容在文义上已保留接口或兼容名义，但本质仍是 stub 或简化实现：

- `request_condensation`
- `execute_ipython_cell` 的持久交互语义
- `str_replace_editor` 的完整 OpenHands ACI 兼容性
- OpenHands memory pairing / event serialization 语义

## 8. 验证过程

本次实际执行的验证包括：

- `npm install`
- `npx tsc -p tsconfig.json --noEmit`
- `npm run build`
- `npm test`

验证结果：

- 类型检查通过
- 构建通过
- 测试通过
- 新增 OpenHands 测试与原有测试均通过

## 9. 后续建议

如果继续推进 OpenHands 迁移，建议按以下优先级展开：

1. 补基于 fixture 的 prompt/parser 对照测试
2. 扩展 `str_replace_editor` 以更贴近 OpenHands ACI 命令语义
3. 设计 tool-call pairing 的轻量兼容层
4. 为 browser/MCP 明确“不可迁移”还是“以 shim 方式接入”
5. 评估是否需要把 adapter 实现从 `runtime/src/agents/openhands/` 进一步收敛回 `packages/agents/openhands/`

## 10. 本次结论

本次工作没有尝试把 OpenHands 完整“搬过来”，而是将其最小可运行核心压缩成共享 runtime 可消费的 adapter 组合，并显式记录了损失点。结果是：

- 已得到一个能在 `meta-agent-runtime` 中被注册、编译、测试的 OpenHands 最小兼容骨架
- 已完成 prompt / parser / context / tools 四个优先映射点
- 未破坏其他 agent 目录
- 为后续逐步补齐 OpenHands 特有能力留出了清晰边界
