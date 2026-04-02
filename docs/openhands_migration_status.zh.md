# OpenHands 迁移状态报告

## 1. 当前结论

当前 OpenHands 迁移已经完成“最小可运行且适合模块化研究”的阶段。

现状可以概括为：

- OpenHands adapter 已收敛到 `packages/agents/openhands/`
- 已具备独立的 `PromptBuilder`、`ActionParser`、`ContextStrategy`、`ToolSpec` 映射
- 已完成 runtime registry 的最小接入
- 已补最小但更贴近源项目契约的测试
- 仍然保留若干明确的 compatibility loss，不伪装为“完整等价迁移”

## 2. 迁移边界

本次迁移的目标不是完整复刻 OpenHands，而是把最小可运行单元压缩到 shared linear runtime 可承接的边界内。

遵守的约束：

- agent-specific 逻辑尽量放在 `packages/agents/openhands/`
- `runtime/` 保持 agent-agnostic，只做必要 registry 接入
- runtime 内 prompt / tool description / 交互契约保持英文单轨
- 文档层保持中英文分离
- 不影响其他 agent 的迁移目录

## 3. 参考源与分析范围

迁移和后续校正时重点对照了以下 OpenHands V0 路径：

- `openhands/agenthub/codeact_agent/codeact_agent.py`
- `openhands/agenthub/codeact_agent/function_calling.py`
- `openhands/agenthub/codeact_agent/tools/bash.py`
- `openhands/agenthub/codeact_agent/tools/ipython.py`
- `openhands/agenthub/codeact_agent/tools/str_replace_editor.py`
- `openhands/agenthub/codeact_agent/tools/finish.py`
- `openhands/agenthub/codeact_agent/tools/condensation_request.py`
- `openhands/controller/agent_controller.py`
- `openhands/memory/conversation_memory.py`
- `openhands/events/observation/*.py`

重点识别的边界是：

- controller / pending action / delegation
- function-calling action envelope
- memory / condensation / pairing
- shell / ipython / editor / sandbox / browser / MCP

## 4. 当前实现位置

当前 OpenHands adapter 的主要实现位于：

- `packages/agents/openhands/src/adapter.ts`
- `packages/agents/openhands/src/prompt.ts`
- `packages/agents/openhands/src/parser.ts`
- `packages/agents/openhands/src/context.ts`
- `packages/agents/openhands/src/tools.ts`
- `packages/agents/openhands/src/index.ts`

当前已不再是旧的 `runtime/src/agents/openhands/` 布局。

## 5. 已迁移能力

### 5.1 PromptBuilder

实现文件：

- `packages/agents/openhands/src/prompt.ts`

当前已对齐的点：

- 保留 OpenHands CodeAct compatibility prompt 的最小表达
- 明确 shared linear runtime loop 约束
- 明确提示 delegation / browser / MCP / concurrent controller 不可用
- 明确提示 `execute_bash` 为持久 shell cwd 兼容层
- 明确提示 `execute_ipython_cell` 为持久 cell 回放兼容层
- 明确要求 `security_risk`
- 明确要求 `str_replace_editor` 使用 absolute path，并支持 `undo_edit`
- 输出契约固定为单个 JSON tool call

### 5.2 ActionParser

实现文件：

- `packages/agents/openhands/src/parser.ts`

当前已支持：

- `{"tool":{"name":"...","arguments":{...}}}`
- 顶层 `{"name":"...","arguments":{...}}`
- `tool_calls[0].function.{name,arguments}` 风格 envelope
- `finish.message -> finish.result` 归一化

### 5.3 ContextStrategy

实现文件：

- `packages/agents/openhands/src/context.ts`

当前行为：

- 超预算时按 assistant/tool 成对裁剪最旧历史
- 插入 condensed 提示，显式声明历史损失
- 避免重复叠加 condensed 前缀
- 返回新对象，符合 shared runtime 的 `ContextStrategy` 契约

### 5.4 ToolSpec 映射

实现文件：

- `packages/agents/openhands/src/tools.ts`

当前最小工具集：

- `execute_bash`
- `execute_ipython_cell`
- `str_replace_editor`
- `think`
- `request_condensation`

其中：

- `execute_bash`
  - 支持 `command / is_input / timeout / security_risk`
  - 已补最小持久 shell cwd 语义
  - `is_input=true` 当前仍是 compatibility loss，会返回显式提示
- `execute_ipython_cell`
  - 支持 `code / timeout / security_risk`
  - 用“成功 cell 回放”近似持久 Python 状态
- `str_replace_editor`
  - 支持 `view / create / str_replace / insert / undo_edit`
  - 要求 absolute path
  - `create` 不覆盖已有文件
  - `str_replace` 要求唯一精确匹配
  - `view` 支持目录浏览与带行号文件视图
- `think`
  - 保留为无副作用 trace 工具
- `request_condensation`
  - 保留 OpenHands 名称，但实际 condensation 仍由 shared runtime context strategy 承担

### 5.5 研究友好的模块拆分

为了方便后续模块化研究与消融实验，当前 tool 层已经支持更细粒度工厂：

- `createOpenHandsBashTool()`
- `createOpenHandsIPythonTool()`
- `createOpenHandsEditorTool()`
- `createOpenHandsThinkTool()`
- `createOpenHandsCondensationTool()`
- `createOpenHandsTools()`

这意味着后续可以单独替换 OpenHands 的某个工具映射，而不是只能整包替换整个 preset。

## 6. 相对原 OpenHands 的损失点

### 6.1 控制器层损失

未迁移：

- `AgentController` 状态机
- pending actions 队列
- stuck detection / loop recovery
- parent / delegate controller
- replay manager
- status callback

### 6.2 memory / condensation 损失

未迁移：

- `ConversationMemory` 对 assistant tool call 与 tool response 的配对
- condensation action 与 memory view 的双路径逻辑
- `forgotten_event_ids`
- recall / microagent knowledge
- provider-specific message formatting

### 6.3 sandbox / tool 语义损失

未迁移或仅做 shim：

- browser tool
- MCP tools
- security analyzer / confirmation mode
- remote runtime / docker / kubernetes / local sandbox 抽象
- 真实交互式持久 Jupyter 内核
- `execute_bash` 的长进程 stdin 续写控制

## 7. 当前仍是 stub / TODO 的部分

当前仍然只是 stub 或简化兼容层的部分包括：

- `request_condensation` 的真实 condensation 行为
- `execute_ipython_cell` 更接近原始 Jupyter 的持久解释器语义
- `str_replace_editor` 的完整 OpenHands ACI 覆盖
- OpenHands memory pairing / event serialization 语义
- browser / MCP / task-tracker / security analyzer 对齐

## 8. 本轮校正后新增对齐点

在本轮校正中，修正了几处原先“能跑但不够忠实”的偏移：

- `execute_bash` 从一次性 shell 改为最小持久 cwd shell 兼容层
- `execute_ipython_cell` 从一次性 `python3 -c` 改为成功 cell 回放
- `str_replace_editor` 补上 `undo_edit`、absolute path、唯一替换、目录 view、create 防覆盖
- parser 补上 function-calling 风格 envelope 支持
- prompt 补上 `security_risk`、editor discipline、condensation usage 说明
- tool 工厂拆分为可独立导出的研究单元
- tool preset run 之间的状态已隔离，避免不同实验 run 串状态

## 9. 已做验证

本轮更新后实际执行过的验证：

- `node --import tsx --test tests/openhands.test.ts`
- 定点脚本验证 `execute_bash` 的 cwd 持久性
- 定点脚本验证 `str_replace_editor` 的 `create / view / undo_edit`

当前结果：

- OpenHands 源码级测试通过
- OpenHands 定点 shell/editor 行为验证通过

需要说明：

- 仓库级全量 `npm run build` 目前仍可能被其他 agent 目录中的既有问题阻塞，这不属于 OpenHands adapter 本轮回归

## 10. 后续建议

如果继续推进 OpenHands 迁移，建议优先做：

1. 补基于 fixture 的 prompt/parser 对照测试
2. 继续扩展 `str_replace_editor`，向 OpenHands ACI 语义靠近
3. 设计 tool-call pairing compatibility layer
4. 明确 browser / MCP 是“不迁移”还是“shim 接入”
5. 围绕单工具工厂补更细粒度的 ablation fixture

## 11. 总结

当前 OpenHands 迁移状态可以描述为：

**“最小可运行骨架已完成，且已经进入适合模块化研究的阶段；但仍不是对原始 OpenHands controller/runtime 算法的完整高保真复刻。”**
