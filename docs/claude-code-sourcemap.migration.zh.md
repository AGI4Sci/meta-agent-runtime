# claude-code-sourcemap 迁移报告

## 1. 文档目的

本文档记录 `claude-code-sourcemap` 从参考源仓库迁移到 `meta-agent-runtime` 共享框架的当前状态、实现范围、已完成能力、未完成能力、验证结果与后续建议。

本报告当前反映的是“最小可运行骨架 + 一轮忠实度与研究边界校正”之后的状态，而不是第一次落地时的初版接线结果。

## 2. 迁移背景

### 2.1 目标仓库

- 当前目标仓库：`meta-agent-runtime`
- 当前工作分支：以实际本地工作分支为准

### 2.2 参考源仓库

- 参考源仓库：`claude-code-sourcemap`

### 2.3 本次迁移目标

依据设计文档与迁移说明，本次迁移的目标是：

- 抽取 `claude-code-sourcemap` 的最小运行单元
- 在共享 runtime 中保持 agent-specific 逻辑隔离
- 优先迁移以下可插拔模块：
  - `PromptBuilder`
  - `ActionParser`
  - `ContextStrategy`
  - `ToolSpec` 映射
- 仅做必要的 runtime registry 接入
- 不修改其他 agent 目录
- 不破坏现有 runtime 主循环的 agent-agnostic 边界

## 3. 迁移前阅读与分析范围

本次实现前，已阅读以下目标仓库文档：

- `agent_runtime_design.md`
- `docs/migration.zh.md`
- `README.md`

已阅读以下 runtime 相关代码：

- `runtime/src/core/interfaces.ts`
- `runtime/src/core/runtime.ts`
- `runtime/src/core/toolSpec.ts`
- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/src/tools/*`
- `runtime/tests/*`

已阅读以下参考源仓库核心区域，用于识别最小运行单元边界：

- `restored-src/src/QueryEngine.ts`
- `restored-src/src/query.ts`
- `restored-src/src/utils/queryContext.ts`
- `restored-src/src/utils/api.ts`
- `restored-src/src/context.ts`
- `restored-src/src/constants/prompts.ts`
- `restored-src/src/constants/tools.ts`
- `restored-src/src/utils/messages/systemInit.ts`
- `restored-src/src/utils/messages.ts`
- `restored-src/src/tools/BashTool/BashTool.tsx`
- `restored-src/src/tools/FileReadTool/FileReadTool.ts`
- `restored-src/src/tools/FileWriteTool/FileWriteTool.ts`
- `restored-src/src/tools/FileEditTool/FileEditTool.ts`

## 4. 对源仓库最小运行单元的识别结论

通过阅读参考源仓库，可以将其“最小运行单元”概括为：

1. system prompt parts 的组装
2. 工具 schema 列表的注入
3. assistant 输出中的 tool/function call 解析
4. tool 执行结果回填到上下文
5. 持续迭代直至 `finish` / 停止条件

但源仓库的完整实现远不止以上内容，还包含：

- Anthropic `tool_use/tool_result` 消息块协议
- 流式响应拼装与恢复逻辑
- 权限系统与 prompt-time approval
- `CLAUDE.md`、git 状态、memory prompt 等动态上下文注入
- hooks、MCP、subagent、plan mode、structured SDK stream
- 更复杂的工具 schema 缓存与 provider/beta 行为

因此本次迁移采用“兼容层”策略：

- 不复刻源仓库完整消息流
- 在共享 runtime 现有 loop 之上模拟 Claude Code 风格 prompt 与 tool call 约定
- 优先让模块边界先落地并可运行

## 5. 本次实际改动

## 5.1 新增 agent adapter 目录

新增目录：

- `packages/agents/claude-code-sourcemap/src/`

新增文件：

- `packages/agents/claude-code-sourcemap/src/constants.ts`
- `packages/agents/claude-code-sourcemap/src/adapter.ts`
- `packages/agents/claude-code-sourcemap/src/promptBuilder.ts`
- `packages/agents/claude-code-sourcemap/src/actionParser.ts`
- `packages/agents/claude-code-sourcemap/src/contextStrategy.ts`
- `packages/agents/claude-code-sourcemap/src/toolPreset.ts`
- `packages/agents/claude-code-sourcemap/src/index.ts`

## 5.2 runtime 最小接线

修改文件：

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/tsconfig.json`
- `runtime/package.json`

## 5.3 测试

新增文件：

- `runtime/tests/claudeCodeSourcemap.test.ts`

## 6. 已迁移能力

## 6.1 PromptBuilder

实现文件：

- `packages/agents/claude-code-sourcemap/src/promptBuilder.ts`

本次实现内容：

- 输出英文 prompt，符合 runtime 内部英文单轨约束
- 在 prompt 中显式包含：
  - task
  - tools / functions 列表
  - response contract
  - conversation history
- 使用 Claude Code 风格的 `<functions>` 展示工具定义
- 定义了 `<function_calls><invoke name="...">...</invoke></function_calls>` 的输出协议
- 明确要求通过 `finish` 收束任务
- 将 response contract 示例、tool 名称、默认上下文窗口等 adapter 约定沉淀到 `constants.ts`

设计取舍：

- 未复刻参考仓库的完整 system prompt sections
- 未接入 `CLAUDE.md`、git status、memory、hooks、output style 等动态部分
- 只保留最小必要约束，使其在共享 runtime 中可独立运行

## 6.2 ActionParser

实现文件：

- `packages/agents/claude-code-sourcemap/src/actionParser.ts`

本次实现内容：

- 主解析格式：
  - `<function_calls><invoke name="...">{...}</invoke></function_calls>`
- 兼容回退格式：
  - `<tool_call name="...">{...}</tool_call>`
  - `{"name":"...","args":{...}}`
- 新增兼容源项目风格 JSON payload：
  - `{"type":"tool_use","name":"...","input":{...}}`
  - `{"tool":"...","arguments":{...}}`
- 对非法 JSON 参数给出解析错误

设计取舍：

- 尚未实现 Anthropic 原生 message block 流与多块拼装
- 未实现流式 partial input 聚合
- 未实现多工具块同轮输出处理
- 当前实现聚焦“单次单工具调用”

## 6.3 ContextStrategy

实现文件：

- `packages/agents/claude-code-sourcemap/src/contextStrategy.ts`

本次实现内容：

- 默认保留最近 `12` 条上下文 entry
- 保持上下文时间顺序，不做 error 优先级重排
- 裁剪时尽量避免从 `assistant -> tool` 对中间截断
- 在不修改 runtime 主循环的前提下，实现最小可替换 context 策略

设计取舍：

- 未迁移源仓库中的完整上下文工程：
  - system/user context 分层缓存
  - 自动 compact / summarization / snip
  - thinking block 保护
  - message trajectory 约束

## 6.4 ToolSpec 映射

实现文件：

- `packages/agents/claude-code-sourcemap/src/toolPreset.ts`

本次实现内容：

提供一组 adapter-local 工具包装，使工具命名、参数与返回语义更接近参考源仓库：

- `Bash`
- `Read`
- `Write`
- `Edit`
- `Grep`

适配内容包括：

- 保留 source-like tool name
- description 改写为更贴近源仓库 prompt 的英文语义
- args schema 改写为 source-like 字段名
- 通过 adapter 内部 wrapper 直接执行最小所需文件与 shell 行为

当前已恢复的关键语义：

- `Read`
  - 支持 `file_path + offset + limit`
  - 返回带行号内容
- `Edit`
  - 支持 `replace_all`
  - 当 `old_string` 多次出现且未显式要求全量替换时，拒绝模糊单次替换
- `Grep`
  - 支持 `glob / type / output_mode / multiline`
- `Bash`
  - 保留最小 shell 执行能力，并提示优先使用专用读写搜索工具

设计取舍：

- 目前仍是最小兼容层，不是完整工具生态复刻
- `Read/Write/Edit/Bash` 还没有移植源仓库的权限、mtime、read-before-write、安全校验链路
- `Glob`、notebook、MCP、subagent 等工具尚未迁移

## 6.5 Adapter definition 与研究边界收口

实现文件：

- `packages/agents/claude-code-sourcemap/src/constants.ts`
- `packages/agents/claude-code-sourcemap/src/adapter.ts`
- `packages/agents/claude-code-sourcemap/src/index.ts`

本次实现内容：

- 新增稳定导出的 adapter 常量：
  - adapter 名称
  - 默认 context window
  - function-call 示例
  - finish 示例
  - tool 名称集合
- 新增 `createClaudeCodeSourcemapAdapter(...)`
  - 一次性组装 prompt builder
  - action parser
  - context strategy
  - tool preset
- 暴露 `maxContextEntries` 与 `tools` 两个常见研究旋钮，方便做 ablation 与替换实验

设计意义：

- 研究脚本不需要再散着 import 多个工厂函数
- adapter 的默认基线配置被显式收口，便于后续做 apples-to-apples 对照
- 不需要修改 runtime core，就能在 adapter 层做受控实验
## 6.6 Registry 接入

实现文件：

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`

本次实现内容：

新增以下 registry key：

- prompt builder: `claude_code_sourcemap`
- action parser: `claude_code_sourcemap`
- context strategy: `claude_code_sourcemap`
- tools preset: `claude_code_sourcemap`

请求 schema 已同步支持这些枚举值，保证 HTTP runtime 可以直接选择这套组合。

## 7. 编译与工程接入调整

为了使 `packages/agents/claude-code-sourcemap/` 下的 adapter 能被 runtime 编译，本次修改了：

- `runtime/tsconfig.json`

调整内容：

- `rootDir` 从 `.` 改为 `..`
- 将 `../packages/agents/claude-code-sourcemap/src/**/*.ts` 加入 `include`

由于编译输出路径随 `rootDir` 变化，因此同步修改了：

- `runtime/package.json`

调整内容：

- `start` 改为 `node dist/runtime/src/server/app.js`
- `test` 改为 `node --test dist/runtime/tests/*.test.js`

此修改是为了支持 agent adapter 与 runtime 一起被 TypeScript 编译，不涉及 runtime loop 行为变更。

## 8. 测试与验证

## 8.1 新增测试

文件：

- `runtime/tests/claudeCodeSourcemap.test.ts`

覆盖点：

- parser 能解析 `<function_calls>` 包裹的调用格式
- parser 能兼容 `tool_use` 风格 JSON payload
- prompt 能正确渲染 `<functions>` 与 XML contract
- tool preset 暴露 source-like 的工具名与参数
- adapter 级入口支持显式 context window 与自定义 tools 注入

## 8.2 执行过的验证命令

在 `runtime/` 目录执行：

- `node --import tsx --test tests/claudeCodeSourcemap.test.ts`

## 8.3 验证结果

- `claude-code-sourcemap` adapter 定向测试通过
- 测试总数：5
- 通过：5
- 失败：0

补充说明：

- 当前仓库的全量 `npm run build` 仍可能被其他 adapter 的既有问题阻塞
- 最近一次检查中，阻塞点来自 `packages/agents/openhands/src/index.ts` 的重复导出
- 因此应区分：
  - `claude-code-sourcemap` 自身 adapter 测试通过
  - 仓库全量 TypeScript build 是否被无关问题阻塞

## 9. 未迁移能力 / 明确 TODO

以下能力本次未迁移，后续如需提升保真度，应优先按模块逐步补齐：

## 9.1 system prompt 动态上下文

未迁移：

- `CLAUDE.md`
- git status snapshot
- current date / user context 的源仓库式注入
- output style / language / hooks / memory / MCP instructions

建议后续方向：

- 在 adapter 侧实现一个“Claude Code compatible prompt context provider”
- 仍避免把 agent-specific 逻辑写回 `runtime/src/core/*`

## 9.2 消息协议与 tool use 语义

未迁移：

- Anthropic `tool_use/tool_result` content blocks
- streaming partial tool input accumulation
- tool_result pairing
- interruption / orphaned tool result recovery

建议后续方向：

- 先在 adapter 内引入中间层 message model
- 再评估是否需要对 runtime action/observation 接口做最小扩展

## 9.3 权限与安全模型

未迁移：

- prompt-based approval
- deny/reject feedback loops
- read-before-write/mtime protection
- 更完整的 bash sandbox / destructive action guard

建议后续方向：

- 保持共享 runtime 简单
- 将权限与前置校验尽量封装在 adapter tool wrapper 中

## 9.4 工具生态

未迁移：

- `Glob`
- 更完整 `Grep`
- notebook / image / web fetch / MCP tools
- subagent / agent tool
- task / plan mode / cron / workflow

建议后续方向：

- 优先补 `Glob + Grep + Read/Edit/Write` 的高保真组合
- 其余复杂工具按实验需求再逐步纳入

## 9.5 Context compaction 与长程会话

未迁移：

- auto compact
- snip / microcompact
- summarization trajectory constraints
- thinking block preservation

建议后续方向：

- 先观察共享 runtime 的现有 `sliding_window / summarization` 是否足够
- 若实验需要，再在 adapter 层引入 Claude Code 风格裁剪策略

## 10. 本次迁移的边界判断

本次迁移刻意没有做以下事情：

- 没有修改 `runtime/src/core/*`
- 没有修改其他 agent adapter 目录
- 没有引入 source 仓库中的大体量消息系统或权限系统
- 没有尝试一次性复刻源仓库全部行为

这符合迁移文档中的原则：

- agent-specific 逻辑放在 `packages/agents/<agent-name>/`
- runtime 保持 agent-agnostic
- 先做最小兼容行为，再逐步提升保真度

## 11. 当前结论

截至本次迁移结束，`claude-code-sourcemap` 已经在 `meta-agent-runtime` 中拥有一套可编译、可测试、可注册的最小运行骨架。

这套骨架已经覆盖：

- Claude Code 风格英文 prompt 构建
- source-like function call 解析
- 保时序且避免截断 assistant/tool 对的上下文裁剪策略
- 更接近源仓库参数与行为的 adapter-local 工具包装
- adapter definition 与常量层，便于模块化研究
- runtime registry / schema 接入

当前状态可定义为：

- `MVP adapter: completed`
- `research-ready adapter boundary: completed`
- `high-fidelity compatibility: not yet completed`

## 12. 建议的下一步

建议按以下顺序继续推进：

1. 补 `Glob` 与更高保真 `Grep`
2. 给 `Read/Write/Edit/Bash` 增加更接近源仓库的校验与错误语义
3. 增补 prompt context provider，逐步纳入 `CLAUDE.md` / git / date / memory
4. 评估是否需要 adapter 内部 message abstraction，以支持 `tool_use/tool_result` 级兼容
5. 在共享 runtime 上做与源仓库的 apples-to-apples 任务对照

## 13. 本次变更文件清单

新增：

- `packages/agents/claude-code-sourcemap/src/constants.ts`
- `packages/agents/claude-code-sourcemap/src/adapter.ts`
- `packages/agents/claude-code-sourcemap/src/promptBuilder.ts`
- `packages/agents/claude-code-sourcemap/src/actionParser.ts`
- `packages/agents/claude-code-sourcemap/src/contextStrategy.ts`
- `packages/agents/claude-code-sourcemap/src/toolPreset.ts`
- `packages/agents/claude-code-sourcemap/src/index.ts`
- `runtime/tests/claudeCodeSourcemap.test.ts`
- `docs/claude-code-sourcemap.migration.zh.md`

修改：

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/tsconfig.json`
- `runtime/package.json`
