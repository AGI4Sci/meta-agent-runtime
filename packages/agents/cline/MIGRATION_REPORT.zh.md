# Cline 迁移报告

## 1. 本次迁移目标

本次工作目标是将参考仓库 `cline` 的最小可运行单元迁移到 `meta-agent-runtime` 的共享框架中，并严格遵守以下约束：

- `runtime/` 保持 agent-agnostic，不向核心 loop 写入 cline-specific 分支逻辑。
- agent-specific 代码集中放在 `packages/agents/cline/`。
- runtime 内部 prompt、tool description、实验接口保持英文单轨。
- 文档层保持中英文分离。
- 只做必要的 registry/schema 接入，不影响其他 agent 的迁移工作。

本次迁移采用“最小骨架优先”的策略，不追求一次性覆盖 cline 全量能力，而是优先抽取并接入以下四类高优先级模块：

- `PromptBuilder`
- `ActionParser`
- `ContextStrategy`
- `ToolSpec` 映射

## 2. 迁移前阅读与分析范围

### 2.1 目标仓库文档

本次实现前先阅读了以下文档，以确定平台边界和迁移约束：

- `agent_runtime_design.md`
- `docs/migration.zh.md`
- `README.md`

从这些文档中确认了几个关键前提：

- runtime 的核心 loop、数据结构、终止逻辑、args 验证与工具调用边界已固定。
- agent-specific 行为应通过 prompt/parser/context/tools/registry 的组合方式接入。
- 不应直接改 `runtime/src/core/*` 来做 cline 兼容。

### 2.2 参考源仓库 `cline`

本次重点阅读和抽样分析了以下模块：

- `src/core/prompts/system-prompt/*`
- `src/core/prompts/system-prompt/registry/PromptBuilder.ts`
- `src/core/prompts/system-prompt/registry/ClineToolSet.ts`
- `src/core/prompts/system-prompt/tools/*`
- `src/core/assistant-message/parse-assistant-message.ts`
- `src/core/context/context-management/*`
- `src/shared/tools.ts`

重点识别了以下行为特征：

- prompt 侧：
  cline generic prompt 使用英文工具说明，通过模板与组件系统拼装；工具调用格式是 XML-style tags。

- tool calling 侧：
  cline 默认工具名如 `execute_command`、`read_file`、`write_to_file`、`replace_in_file`、`attempt_completion` 等，参数也通过 XML tag 表达。

- 消息历史侧：
  cline 原始实现里的历史是 message/block 级别，包含 assistant text、tool_use、tool_result 等更复杂结构；共享 runtime 当前只有线性 `ContextEntry`，因此需要在 adapter 内做降级兼容。

- 编辑/执行工具边界：
  `execute_command`、`read_file`、`write_to_file`、`replace_in_file` 是最小可运行闭环的核心；`replace_in_file` 采用 SEARCH/REPLACE block 语义，不等同于 reference runtime 自带的 `file_edit`。

## 3. 本次实际改动

## 3.1 新增 adapter 目录

新增目录：

- `packages/agents/cline/src/`

新增文件：

- `packages/agents/cline/src/index.ts`
- `packages/agents/cline/src/promptBuilder.ts`
- `packages/agents/cline/src/actionParser.ts`
- `packages/agents/cline/src/contextStrategy.ts`
- `packages/agents/cline/src/toolPreset.ts`

这些文件共同构成 cline 的最小共享 runtime 适配层。

## 3.2 PromptBuilder 迁移

文件：

- `packages/agents/cline/src/promptBuilder.ts`

实现内容：

- 构建最小英文系统 prompt。
- 保留 cline 风格的 XML tool use 说明。
- 以 `ToolSpec.argsSchema` 动态生成工具说明、参数列表和 usage block。
- 将 runtime 的 `finish` 工具用 cline 风格重写为 `<attempt_completion>...</attempt_completion>` 使用示例。
- 将共享 runtime 的线性上下文渲染为简化历史：
  - `[assistant]`
  - `[tool_result]`
  - `[error]`

设计取舍：

- 没有迁移 cline 原仓库的 variant system、component registry、template engine、skills、MCP、browser、rules 注入等复杂机制。
- 仅保留“最小可运行 prompt 约束”，确保共享 runtime 中可以稳定诱导模型输出 cline 风格 XML 工具调用。

## 3.3 ActionParser 迁移

文件：

- `packages/agents/cline/src/actionParser.ts`

实现内容：

- 支持以下 XML tool block 的解析：
  - `execute_command`
  - `read_file`
  - `write_to_file`
  - `replace_in_file`
  - `search_files`
  - `list_files`
  - `attempt_completion`
- 解析通用 `<param>value</param>` 结构，转为 runtime `Action.args`。
- 对 `requires_approval` 做布尔值转换。
- 对 `timeout` 做数字转换。
- 将 `attempt_completion` 映射为 runtime 的 `finish` action，使其不需要改动 runtime 终止逻辑。

设计取舍：

- 当前解析器面向“单个完整 XML tool block”场景。
- 没有迁移 cline 原仓库中更复杂的 mixed text + tool block + partial streaming parser。
- 这是一个有意的最小兼容实现，优先保证稳定性和实验可控性。

## 3.4 ContextStrategy 迁移

文件：

- `packages/agents/cline/src/contextStrategy.ts`

实现内容：

- 实现了一个 pair-aware 的上下文裁剪策略。
- 裁剪时优先保留最近的 assistant/tool 成对记录。
- 避免只保留 tool result 而丢失对应 assistant action，减少上下文断裂。
- 使用轻量级字符估算 token 的方法，与现有 runtime 策略保持一致级别的近似性。

设计取舍：

- 未迁移 cline 原仓库的 conversation compaction、orphaned tool result cleanup、native tool result pairing 等完整上下文管理逻辑。
- 当前版本更接近“针对 cline XML action/observation 对的滑窗保留策略”。

## 3.5 ToolSpec 映射

文件：

- `packages/agents/cline/src/toolPreset.ts`

实现内容：

- 新增最小 cline 工具集：
  - `execute_command`
  - `read_file`
  - `write_to_file`
  - `replace_in_file`
  - `search_files`
  - `list_files`
- `execute_command`：
  使用 `/bin/zsh -lc` 执行命令，兼容 cline 命名与最小参数集。

- `read_file`：
  映射为 UTF-8 文本读取。

- `write_to_file`：
  写文件前自动创建父目录，兼容 cline 的 overwrite/create 语义。

- `replace_in_file`：
  新增 SEARCH/REPLACE block 兼容层，按块逐段替换；如果 SEARCH 不匹配则报错。

- `search_files`：
  基于 `rg -n` 做最小兼容。

- `list_files`：
  基于 `rg --files` 做最小兼容。

设计取舍：

- 没有把 `runtime/src/tools/*` 原有工具直接硬改成 cline 命名，而是在 adapter 内保留 cline 自身工具名与行为语义。
- 这是为了避免影响其他 agent，同时为后续做 apples-to-apples 对比留出空间。

## 3.6 runtime 最小注册接入

修改文件：

- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/tsconfig.json`

具体内容：

- 在 `PROMPT_BUILDERS` 中新增 `cline`
- 在 `ACTION_PARSERS` 中新增 `cline`
- 在 `CONTEXT_STRATEGIES` 中新增 `cline`
- 在 `TOOL_PRESETS` 中新增 `cline_minimal`
- 在 server schema 中允许：
  - `prompt_builder: "cline"`
  - `action_parser: "cline"`
  - `context_strategy.name: "cline"`
  - `tools: "cline_minimal"`
- 调整 `runtime/tsconfig.json` 以便 runtime 编译时包含 `packages/agents/cline/src/**/*.ts`

设计取舍：

- 没有修改 `runtime/src/core/runtime.ts`
- 没有修改 `runtime/src/core/interfaces.ts`
- 没有修改其他 agent 目录

这符合迁移说明中“通过 registry 接入平台，不改核心 runtime”的要求。

## 3.7 新增测试

新增文件：

- `runtime/tests/clineAdapter.test.ts`

覆盖内容：

- parser 能解析 `execute_command`
- parser 能将 `attempt_completion` 映射到 `finish`
- prompt builder 能输出 XML tool formatting 与历史
- context strategy 能保留 assistant/tool 成对记录

## 4. 已迁移能力清单

本次已经完成的能力：

- cline 风格最小英文 prompt builder
- cline XML action parser
- cline pair-aware context strategy
- cline 最小 tool preset
- runtime registry/schema 接入
- 最小测试覆盖
- build/test 验证

从平台模块视角看，本次已经完成：

- `PromptBuilder`
- `ActionParser`
- `ContextStrategy`
- `ToolSpec` preset mapping

## 5. 当前未迁移能力与 TODO

以下能力本次未迁移，属于后续工作：

- 完整 prompt variant 体系
  - generic / next-gen / native-gpt-5 / gemini 等家族化 prompt

- native tool calling
  - provider-specific native tool registration
  - tool result 与 tool_use block 的原生映射

- 完整 assistant message parsing
  - mixed text + tool blocks
  - partial / streaming tool blocks
  - 多个 tool use block 混合消息

- 完整 context compaction
  - orphaned tool_result 清理
  - truncation range 维护
  - richer message/block-level reconstruction

- 高级工具
  - MCP
  - browser
  - web fetch/search
  - use_skill
  - use_subagents
  - ask_followup_question
  - plan_mode / act_mode
  - focus_chain / todo
  - generate_explanation

- 更严格的工具语义对齐
  - `list_files` 当前是最小兼容，不等价于 cline 原实现
  - `search_files` 当前只支持最小 `regex/path` 形式
  - `replace_in_file` 当前只实现基础 SEARCH/REPLACE block 语义

建议后续优先级：

1. 补 richer parser，支持 mixed text/tool_use 输出。
2. 补更贴近 cline 的 prompt sections 与通用 rules。
3. 逐步扩展 tool preset，优先补 `attempt_completion` 之外的关键控制工具。
4. 视实验需要决定是否引入 native tool calling compatibility layer。

## 6. 本次实现中的关键设计判断

### 6.1 为什么先做最小骨架而不是全量迁移

原因有三点：

- 共享 runtime 的实验目标要求高可控性，先跑通最小闭环更适合后续做模块级消融。
- cline 原仓库能力面很广，直接全量平移会把 runtime 引向 agent-specific 分支。
- 当前项目明确要求多 agent 并行迁移，最小骨架最不容易阻塞其他迁移线。

### 6.2 为什么 `attempt_completion` 映射为 `finish`

共享 runtime 把 `finish` 作为结构性终止工具。为了不修改 runtime 核心终止逻辑，adapter 直接把 cline 语义终止动作 `attempt_completion` 转译为 `finish`，这是边界最清晰、改动最小的做法。

### 6.3 为什么 `replace_in_file` 要单独做兼容层

reference runtime 自带的 `file_edit` 是简单 substring replace，不等价于 cline 的 SEARCH/REPLACE block 机制。如果直接复用会导致 prompt 与 tool semantics 失配，因此需要在 adapter 内新增兼容实现。

## 7. 验证记录

本次已执行的验证：

- `npx tsc -p tsconfig.json --noEmit`
  - 结果：通过

- `npx tsx --test tests/*.test.ts`
  - 结果：通过
  - 通过测试数：9

- `npm run build`
  - 结果：通过

说明：

- 早期 `build` 失败并非代码错误，而是 sandbox 下写 `dist/` 权限受限；在授权后已完成最终 build 验证。
- 早期测试中出现过一次 TypeScript 索引类型问题，已通过显式 `Record<string, unknown>` 断言修复。

## 8. 变更范围控制

本次仅修改或新增了以下范围：

- `packages/agents/cline/`
- `runtime/src/server/registry.ts`
- `runtime/src/server/schema.ts`
- `runtime/tsconfig.json`
- `runtime/tests/clineAdapter.test.ts`

未改动内容：

- `runtime/src/core/*`
- 其他 agent 目录
- 非必要的共享工具实现

因此本次迁移满足“不破坏其他 agent 迁移工作”的约束。

## 9. 当前状态结论

当前 cline 迁移状态可以定义为：

- 阶段：`minimal runnable skeleton`
- 结果：`已完成并通过验证`
- 可用性：`可作为共享 runtime 中的一个独立 adapter 选项运行`
- 完整度：`仅覆盖最小主路径，不等同于完整 cline`

一句话总结：

本次已经成功把 cline 的最小 prompt/parser/context/tools 骨架抽取并迁移到 `meta-agent-runtime`，并以最小侵入方式接入共享框架，为后续逐步补齐高级能力打下了稳定基础。
