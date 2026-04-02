# Agent Runtime 设计文档 / Design Specification

> 本文档是 **reference runtime** 的完整设计规范，供 Codex 生成骨架代码，并作为迁移其他 code agent 的统一模板。  
> This document defines the complete specification for the **reference runtime**, serving both as the implementation blueprint for Codex and as the unified template for migrating other code agents.
>
> **实现语言**：TypeScript（核心 runtime + HTTP server），Python（评估脚本 + 实验分析 client）。两者通过本地 HTTP 通信，共享 JSON Schema 定义的数据格式。  
> **Implementation languages**: TypeScript for the core runtime and HTTP server, Python for evaluation scripts and experiment-analysis clients. The two layers communicate over local HTTP and share JSON-Schema-defined data contracts.

## 0. 文档与协作语言 / Documentation and Collaboration Language

- 本项目默认工作语言为中文，英文作为对照与对外协作语言。
- Chinese is the default working language; English is maintained as a parallel language for external collaboration.
- 设计文档、README、迁移说明、实验报告建议采用“中文优先，英文对照”的写法。
- Design docs, README files, migration notes, and experiment reports should follow a "Chinese first, English mirrored" style whenever practical.
- 若中英文表述存在歧义，团队内部讨论以中文版本为准，再同步修订英文版本。
- If the Chinese and English versions diverge, internal discussion should resolve the Chinese version first, then update the English mirror accordingly.
- 代码标识、接口名、目录名保持英文，避免跨语言协作时的实现歧义。
- Code identifiers, interface names, and directory names remain in English to reduce implementation ambiguity across languages.

---

## 1. 研究背景与目标 / Research Background and Goals

### 1.1 研究动机 / Motivation

现有开源 code agent（smolagents、SWE-agent、OpenHands、LangGraph 等）将 prompt 模板、context 管理、action 解析、工具调用等逻辑混合在一起，无法单独替换某一个成分来做受控实验。本项目的目标是构建一个**消融实验平台**：固定其他所有变量，每次只替换一个模块，精确测量该模块对结果的影响。

### 1.2 研究目标 / Goals

在以下约束下最大化 task success rate：

- **效果目标**：task success rate（在 SWE-bench Verified 上评估）
- **效率目标**：token 消耗总量 + 端到端时间开销
- **约束方式**：约束式——在 token/时间 budget X 内最大化 success rate
- **任务域**：coding agent（SWE-bench Verified）

### 1.3 主要研究变量 / Primary Research Variables

| 模块 | 对 success rate 的影响 | 对 token/时间的影响 | 研究优先级 |
|------|----------------------|-------------------|-----------|
| `PromptBuilder` | 高 | 高 | 主要变量 |
| `ContextStrategy` | 中 | 高 | 主要变量 |
| `LLMClient` | 高 | 高 | 次要变量 |
| `ActionParser` | 中 | 低 | 固定基准 |
| `ToolSpec.interpreter` | 低 | 低 | 固定基准 |

---

## 2. 边界定义 / Boundary Definition

### 2.1 核心决策清单 / Core Design Decisions

以下是经过完整讨论后确立的所有设计决策：

| 决策项 | 结论 |
|--------|------|
| executor 拓扑 | 拓扑 A：executor 在 runtime 内部 |
| 执行权范围 | 调用权 + 结果解释权，不含环境生命周期 |
| 结果解释方式 | 工具侧提供纯函数 interpreter |
| 终止判断 | 方向 C：结构性条件 runtime 判断，语义性终止通过 `finish` action 表达 |
| finish 的地位 | 普通 tool，runtime 在 termination_check 中硬编码识别 `action.name == "finish"` |
| context 管理 | 可插拔，作为 runtime 初始化参数 |
| action 解析 | 可插拔，作为 runtime 初始化参数 |
| 错误处理 | 错误转化为 Observation，不中断 loop，不做重试，决策权交给 LLM |
| args 验证 | runtime 在调用 tool 前做 schema 验证，失败转化为错误 Observation |
| 工具副作用声明 | runtime 不感知，不进入 ToolSpec 契约 |
| prompt 模板 | 可插拔，作为 runtime 初始化参数 |
| LLM | 外部依赖注入，runtime 定义最小接口 |

### 2.2 边界内 vs 边界外 / In Scope vs Out of Scope

**边界内（runtime 职责）**：
- 决策：`LLM(context) → action`
- 调用：`action → tool_spec.call(args)`
- 结果解释：`tool_spec.interpreter(raw) → Observation`
- args 验证：`validate(args, tool_spec.args_schema)`
- 错误兜底：任何异常 → 错误 `Observation`，loop 继续
- context 维护：`context.append(action, observation)`
- context 裁剪：`context_strategy.trim(context)`
- 终止判断：结构性条件 + `action.name == "finish"` 识别

**边界外（runtime 不负责）**：
- 工具的物理执行环境（沙箱、进程、网络）
- 工具的实现本身
- 环境生命周期管理
- 副作用控制（只读 vs 写操作的安全策略）
- 各插拔模块的具体实现
- LLM 的具体模型和厂商选择

---

## 3. 数据结构规范 / Data Model Specification

### 3.1 `Observation`

runtime 内部唯一的信息载体，由 `interpreter` 生成，进入 `context`。

```python
@dataclass
class Observation:
    content: str          # 主体内容，供 LLM 阅读
    error: str | None     # 错误信息，None 表示成功
    metadata: dict        # 可选元数据，不进入 LLM context（供观测用）

    @property
    def is_error(self) -> bool:
        return self.error is not None
```

**设计约束**：
- `content` 是唯一进入 LLM prompt 的字段
- `metadata` 仅用于外部观测（token 计数、时间戳等），不影响控制流
- `error` 非空时，`content` 可以为空字符串，但不应为 None

### 3.2 `Action`

LLM 决策的结构化表达，由 `ActionParser` 从 raw text 解析而来。

```python
@dataclass
class Action:
    name: str             # tool 名称，对应 ToolSpec.name
    args: dict            # tool 调用参数，对应 ToolSpec.args_schema
    raw_text: str         # LLM 原始输出，保留用于调试和观测
```

**设计约束**：
- `name` 必须能在注册的 `ToolSpec` 列表中找到，或为内置的 `"finish"`
- `args` 在调用 tool 前会经过 schema 验证
- `raw_text` 不参与任何控制流逻辑

### 3.3 `Context`

loop 的完整状态，由 runtime 维护，由 `ContextStrategy` 裁剪。

```python
@dataclass
class ContextEntry:
    role: Literal["user", "assistant", "tool"]
    content: str
    metadata: dict        # 步骤编号、时间戳、token 数等，不进入 LLM prompt

@dataclass
class Context:
    task: str                      # 原始任务描述，始终保留，不参与裁剪
    entries: list[ContextEntry]    # 可裁剪的对话历史
    step: int                      # 当前步骤编号
    token_count: int               # 当前 context 的 token 估算值
```

**设计约束**：
- `task` 字段由 `PromptBuilder` 特殊处理，始终出现在 prompt 中，不被裁剪
- `entries` 是 `ContextStrategy.trim()` 的操作对象
- `token_count` 由 runtime 在每次 append 后更新，`ContextStrategy` 可以读取但不负责维护

### 3.4 `StepRecord`

每一步的完整快照，用于观测和复现实验。runtime 在每步结束后生成，不参与控制流。

```python
@dataclass
class StepRecord:
    step: int
    prompt: str           # 本步发送给 LLM 的完整 prompt
    raw_text: str         # LLM 原始输出
    action: Action        # 解析后的 action
    observation: Observation  # 本步的 observation
    token_in: int         # 本步 prompt token 数
    token_out: int        # 本步 completion token 数
    elapsed_ms: int       # 本步耗时（毫秒）
```

### 3.5 `RunResult`

`run()` 的返回值。

```python
@dataclass
class RunResult:
    success: bool
    result: str                    # finish action 携带的结果，或最后一步的 observation content
    steps: list[StepRecord]        # 完整步骤记录
    total_token_in: int
    total_token_out: int
    total_elapsed_ms: int
    termination_reason: Literal["finish", "max_steps", "max_tokens", "error"]
```

---

## 4. 五个插拔接口规范 / Five Pluggable Interfaces

### 4.1 `LLMClient`

```python
from typing import Protocol

class LLMClient(Protocol):
    def complete(self, prompt: str) -> str:
        """
        发送 prompt，返回 LLM 的原始文本输出。

        约束：
        - 必须是同步调用（异步版本见 AsyncLLMClient）
        - 不做任何格式处理，返回原始字符串
        - 网络错误、超时等异常直接抛出，由 runtime 统一处理
        - token 计数不在此接口负责
        """
        ...

    def count_tokens(self, text: str) -> int:
        """
        估算文本的 token 数，用于 context 管理。

        约束：
        - 允许使用近似算法（如 len(text) // 4）
        - 不需要精确，但必须单调（更长的文本返回更大的数）
        """
        ...
```

**参考实现命名**：
- `AnthropicLLMClient` — 调用 Anthropic API
- `OpenAILLMClient` — 调用 OpenAI API
- `LocalLLMClient` — 调用本地模型（通过 ollama 等）

### 4.2 `PromptBuilder`

```python
class PromptBuilder(Protocol):
    def build(self, task: str, tools: list[ToolSpec], context: Context) -> str:
        """
        将 task、tools、context 组装成发送给 LLM 的完整 prompt。

        约束：
        - 必须包含 task（不得省略）
        - 必须包含所有 tool 的 name、description、args_schema（供 LLM 决策）
        - 必须包含 context.entries 中的历史（可以格式化处理）
        - 不得修改 context 本身（纯函数）
        - 返回值是字符串，不是消息列表
        """
        ...
```

**参考实现命名**：
- `ReActPromptBuilder` — ReAct 风格（Thought / Action / Observation 循环）
- `CoTPromptBuilder` — Chain-of-Thought 风格
- `MinimalPromptBuilder` — 最简风格，无额外指令，用作基准

**迁移说明**：
- smolagents 的 prompt 模板 → `SmolagentsPromptBuilder`
- SWE-agent 的 ACI prompt → `SWEAgentPromptBuilder`

### 4.3 `ActionParser`

```python
class ActionParser(Protocol):
    def parse(self, raw_text: str) -> Action:
        """
        从 LLM 原始输出中解析出结构化 Action。

        约束：
        - 解析失败时抛出 ParseError（不返回 None）
        - 不做任何 LLM 调用
        - 必须是纯函数（相同输入相同输出）
        - raw_text 原样保存到 Action.raw_text
        """
        ...
```

**ParseError 定义**：
```python
class ParseError(Exception):
    def __init__(self, message: str, raw_text: str):
        self.raw_text = raw_text
        super().__init__(message)
```

**runtime 对 ParseError 的处理**：ParseError 被捕获，转化为错误 Observation，loop 继续（LLM 会看到解析失败的信息，可以调整输出格式）。

**参考实现命名**：
- `JSONActionParser` — 期待 LLM 输出 JSON 格式的 action
- `XMLActionParser` — 期待 `<tool_call>` XML 标签
- `FunctionCallActionParser` — 依赖 LLM 的 function calling 能力（结构化输出）
- `ReActActionParser` — 从 `Action: tool_name(args)` 格式解析

### 4.4 `ContextStrategy`

```python
class ContextStrategy(Protocol):
    def trim(self, context: Context) -> Context:
        """
        对 context 进行裁剪，返回新的 Context（不修改原始对象）。

        约束：
        - context.task 必须原样保留，不得裁剪
        - 返回的 Context 必须是新对象（不可原地修改）
        - 允许读取 context.token_count 来决定裁剪程度
        - 不做任何 LLM 调用
        """
        ...
```

**参考实现命名**：
- `NoopContextStrategy` — 不做任何裁剪，用作基准
- `SlidingWindowStrategy(max_tokens: int)` — 保留最近 N token 的历史
- `SummarizationStrategy(max_tokens: int, llm: LLMClient)` — 对早期历史做摘要（注意：此实现内部调用 LLM，属于高级策略）
- `SelectiveRetentionStrategy` — 保留 error observation 和关键步骤，裁剪冗余成功步骤

### 4.5 `ToolSpec`

`ToolSpec` 不是接口，而是一个数据类，是工具侧和 runtime 之间的完整契约。

```python
@dataclass
class ToolSpec:
    name: str
    description: str              # 供 LLM 决策，出现在 prompt 中
    args_schema: dict             # JSON Schema 格式，用于 args 验证和 LLM 生成 args
    call: Callable[[dict], Any]   # 实际执行函数，接收 args dict，返回任意 raw 值
    interpreter: Callable[[Any], Observation]  # 纯函数，raw → Observation
```

**interpreter 约束**：
- 必须是纯函数：相同输入，相同输出
- 不得访问 context 或任何 runtime 内部状态
- 不得调用 LLM
- 必须返回 `Observation`，不得抛出异常（内部 try-catch，错误转为 `Observation(error=...)`)
- 执行失败的 raw（如 None）必须能处理，返回错误 Observation

**内置 ToolSpec**：runtime 自动注册 `finish`，不需要调用方传入：
```python
FINISH_TOOL = ToolSpec(
    name="finish",
    description="Call this when the task is complete. Pass the final result as 'result'.",
    args_schema={
        "type": "object",
        "properties": {"result": {"type": "string"}},
        "required": ["result"]
    },
    call=lambda args: args["result"],
    interpreter=lambda raw: Observation(content=raw, error=None, metadata={"is_finish": True})
)
```

---

## 5. Runtime 主体规范 / Runtime Core Specification

### 5.1 初始化契约 / Initialization Contract

```python
@dataclass
class RuntimeConfig:
    max_steps: int = 50
    max_tokens: int = 100_000     # context token 上限，触发终止
    budget_token: int | None = None     # 实验用 token budget（总消耗上限）
    budget_time_ms: int | None = None   # 实验用时间 budget

class AgentRuntime:
    def __init__(
        self,
        llm: LLMClient,
        tools: list[ToolSpec],
        prompt_builder: PromptBuilder,
        action_parser: ActionParser,
        context_strategy: ContextStrategy,
        config: RuntimeConfig = RuntimeConfig(),
        observers: list[Observer] = [],   # 观测钩子，见第 6 节
    ):
        ...
```

### 5.2 公开接口 / Public Interface

```python
class AgentRuntime:
    def run(self, task: str) -> RunResult:
        """
        唯一的公开入口。

        行为规范：
        - 初始化 Context(task=task, entries=[], step=0, token_count=0)
        - 自动注册 FINISH_TOOL，合并到传入的 tools 列表
        - 执行 decision loop 直到终止
        - 返回 RunResult，不抛出异常（所有异常在内部转化为 termination_reason="error"）
        """
        ...
```

### 5.3 Decision Loop 伪代码 / Decision Loop Pseudocode

```
function run(task):
    context = Context(task=task)
    records = []

    while True:
        # 1. 构建 prompt
        prompt = prompt_builder.build(task, tools, context)

        # 2. 调用 LLM
        t0 = now()
        try:
            raw_text = llm.complete(prompt)
        except Exception as e:
            return RunResult(success=False, termination_reason="error", ...)

        # 3. 解析 action
        try:
            action = action_parser.parse(raw_text)
        except ParseError as e:
            obs = Observation(content="", error=f"Parse failed: {e}", metadata={})
            context = update_and_trim(context, raw_text, obs, context_strategy)
            records.append(StepRecord(...))
            context.step += 1
            continue  # loop 继续，不终止

        # 4. 终止检查（在执行 tool 之前）
        done, reason = termination_check(context, action, config)
        if done:
            result = action.args.get("result", "") if action.name == "finish" else ""
            return RunResult(success=(reason == "finish"), result=result,
                             termination_reason=reason, steps=records, ...)

        # 5. 找到对应的 ToolSpec
        tool_spec = find_tool(action.name, tools)
        if tool_spec is None:
            obs = Observation(content="", error=f"Unknown tool: {action.name}", metadata={})
        else:
            # 6. 验证 args
            validation_error = validate_args(action.args, tool_spec.args_schema)
            if validation_error:
                obs = Observation(content="", error=f"Invalid args: {validation_error}", metadata={})
            else:
                # 7. 调用 tool
                try:
                    raw = tool_spec.call(action.args)
                except Exception as e:
                    raw = None
                    obs = Observation(content="", error=f"Tool error: {e}", metadata={})
                else:
                    # 8. 解释结果
                    obs = tool_spec.interpreter(raw)

        # 9. 更新 context
        elapsed = now() - t0
        token_in = llm.count_tokens(prompt)
        token_out = llm.count_tokens(raw_text)
        context = update_and_trim(context, raw_text, obs, context_strategy)
        context.step += 1

        # 10. 记录 StepRecord
        records.append(StepRecord(
            step=context.step,
            prompt=prompt,
            raw_text=raw_text,
            action=action,
            observation=obs,
            token_in=token_in,
            token_out=token_out,
            elapsed_ms=elapsed,
        ))

        # 11. 通知观测器
        for observer in observers:
            observer.on_step(records[-1])
```

### 5.4 `termination_check` 规范 / `termination_check` Specification

```python
def termination_check(
    context: Context,
    action: Action,
    config: RuntimeConfig,
) -> tuple[bool, Literal["finish", "max_steps", "max_tokens", "budget_token", "budget_time"]]:
    """
    终止检查，严格按以下优先级顺序判断：

    1. action.name == "finish"      → ("finish", True)       语义终止，优先级最高
    2. context.step >= max_steps    → ("max_steps", True)     结构性上限
    3. context.token_count >= max_tokens → ("max_tokens", True)  context 长度上限
    4. 累计 token 超出 budget       → ("budget_token", True)  实验 budget 约束
    5. 累计时间超出 budget          → ("budget_time", True)   实验 budget 约束

    均不满足 → (False, None)
    """
```

---

## 6. 观测系统规范 / Observability Specification

观测系统是实验平台的核心基础设施，不参与控制流，只做数据收集。
The observability layer is core infrastructure for the research platform. It does not affect control flow and exists only for data collection.

### 6.1 `Observer` 接口 / `Observer` Interface

```python
class Observer(Protocol):
    def on_step(self, record: StepRecord) -> None:
        """每步结束后调用，不得修改 record，不得抛出异常。"""
        ...

    def on_run_end(self, result: RunResult) -> None:
        """run() 结束后调用。"""
        ...
```

### 6.2 内置 Observer 参考实现 / Built-in Observer References

```
TokenBudgetObserver      — 追踪累计 token 消耗，触发 budget 终止
TimeBudgetObserver       — 追踪累计时间，触发 budget 终止
StepLoggerObserver       — 将每步记录写入结构化日志（JSONL 格式）
ReplayBufferObserver     — 将完整 run 序列化，用于复现实验
```

---

## 7. 迁移指南 / Migration Guide

### 7.1 迁移一个开源 agent 的步骤 / Steps to Migrate an Open-Source Agent

将现有 code agent 迁移到本框架，按以下顺序进行：

**Step 1：提取 PromptBuilder**
- 找到原项目中构建 system prompt 和 user prompt 的代码
- 将其封装为实现 `PromptBuilder` 接口的类
- 确认：`build()` 是纯函数，不修改任何外部状态

**Step 2：提取 ActionParser**
- 找到原项目中解析 LLM 输出的代码（正则、JSON 解析、XML 解析等）
- 将其封装为实现 `ActionParser` 接口的类
- 确认：解析失败抛出 `ParseError`，不返回 None

**Step 3：提取 ContextStrategy**
- 找到原项目中截断或管理 context 的代码
- 如果原项目没有显式的 context 管理（直接截断到 max_tokens），使用 `SlidingWindowStrategy`
- 将其封装为实现 `ContextStrategy` 接口的类

**Step 4：提取 ToolSpec**
- 找到原项目中的工具定义（bash、file read/write、search 等）
- 将每个工具拆分为 `call` 函数和 `interpreter` 纯函数
- 注意：`interpreter` 不得访问任何外部状态，只能访问 `raw` 参数

**Step 5：验证行为等价性**
- 用相同的 task 和相同的 LLM，对比原项目和迁移后的 runtime 的 step 序列
- 重点检查：prompt 格式是否一致、action 解析是否覆盖所有格式、context 裁剪时机是否相同

### 7.2 主要开源 agent 的迁移参考 / Migration References for Major Agents

#### smolagents (`MultiStepAgent`)

| smolagents 组件 | 对应接口 | 备注 |
|----------------|---------|------|
| `system_prompt` 模板 | `PromptBuilder` | 见 `agents.py` 的 `_build_agent_prompt()` |
| `extract_action()` | `ActionParser` | JSON 格式，见 `utils.py` |
| context 截断（无显式策略） | `SlidingWindowStrategy` | smolagents 直接截断到 window |
| `tool.forward()` | `ToolSpec.call` | 返回值直接是字符串 |
| 字符串格式化 | `ToolSpec.interpreter` | raw 是字符串，包装为 Observation |

#### SWE-agent

| SWE-agent 组件 | 对应接口 | 备注 |
|---------------|---------|------|
| ACI system prompt | `PromptBuilder` | 见 `agent/agent.py` 的 `_get_obs()` 和 system prompt 构建 |
| bash 输出解析 | `ActionParser` | `command_parser.py` |
| history 管理 | `ContextStrategy` | `HistoryProcessor` 类 |
| `bash()` / `edit()` / `search()` | `ToolSpec.call` | 见 `tools/` 目录 |
| 输出格式化（截断长输出） | `ToolSpec.interpreter` | 原项目在工具层做截断，迁移到 interpreter |

#### OpenHands (`CodeActAgent`)

| OpenHands 组件 | 对应接口 | 备注 |
|---------------|---------|------|
| CodeAct prompt | `PromptBuilder` | `agenthub/codeact_agent/` |
| action 解析 | `ActionParser` | `core/actions/` 的 action 类型系统，需要适配 |
| condensation | `ContextStrategy` | `core/memory/` 的 condenser |
| sandbox 调用 | `ToolSpec.call` | 注意：sandbox 本身在 runtime 边界外，call 只是发送指令 |
| sandbox 返回解析 | `ToolSpec.interpreter` | `core/observations/` |

**注意**：OpenHands 是拓扑 B 设计（controller/runtime 分离），迁移时需要将其 controller 逻辑展平为本框架的线性 loop，可能损失部分并发能力。

### 7.3 迁移时的常见问题 / Common Migration Questions

**问题 1：原项目的 tool 返回值直接进入 prompt，没有 interpreter 层**

处理方式：用恒等函数作为 interpreter：
```python
interpreter=lambda raw: Observation(content=str(raw), error=None, metadata={})
```

**问题 2：原项目在 loop 内部做 LLM 调用（如摘要、reflection）**

处理方式：
- 如果是摘要 → 封装为 `SummarizationStrategy`，移入 `ContextStrategy`
- 如果是 reflection → 封装为特殊的 `PromptBuilder`，在 build 时加入反思指令
- 如果是 multi-agent 调用 → 超出本框架边界，暂不迁移

**问题 3：原项目有复杂的终止逻辑（多种终止信号）**

处理方式：将所有终止信号统一为 `finish` action，在 `PromptBuilder` 的 prompt 中说明各种情况下应调用 `finish`。

---

## 8. 目录结构 / Directory Layout

```
agent_runtime/
├── runtime/                          # TypeScript 核心（npm package）
│   ├── src/
│   │   ├── core/
│   │   │   ├── types.ts              # Observation, Action, Context, StepRecord, RunResult
│   │   │   ├── interfaces.ts         # LLMClient, PromptBuilder, ActionParser, ContextStrategy, Observer（interface 定义）
│   │   │   ├── toolSpec.ts           # ToolSpec interface + FINISH_TOOL
│   │   │   ├── runtime.ts            # AgentRuntime 主体 + terminationCheck + validation
│   │   │   └── errors.ts             # ParseError 及其他自定义异常
│   │   │
│   │   ├── llm/
│   │   │   ├── anthropicClient.ts    # AnthropicLLMClient
│   │   │   ├── openaiClient.ts       # OpenAILLMClient
│   │   │   └── localClient.ts        # LocalLLMClient（ollama）
│   │   │
│   │   ├── prompt/
│   │   │   ├── react.ts              # ReActPromptBuilder
│   │   │   ├── cot.ts                # CoTPromptBuilder
│   │   │   ├── minimal.ts            # MinimalPromptBuilder（基准）
│   │   │   ├── smolagents.ts         # SmolagentsPromptBuilder（迁移）
│   │   │   └── sweAgent.ts           # SWEAgentPromptBuilder（迁移）
│   │   │
│   │   ├── parser/
│   │   │   ├── jsonParser.ts         # JSONActionParser
│   │   │   ├── xmlParser.ts          # XMLActionParser
│   │   │   ├── functionCall.ts       # FunctionCallActionParser
│   │   │   └── reactParser.ts        # ReActActionParser
│   │   │
│   │   ├── context/
│   │   │   ├── noop.ts               # NoopContextStrategy（基准）
│   │   │   ├── slidingWindow.ts      # SlidingWindowStrategy
│   │   │   ├── summarization.ts      # SummarizationStrategy
│   │   │   └── selective.ts          # SelectiveRetentionStrategy
│   │   │
│   │   ├── tools/
│   │   │   ├── bash.ts               # bash tool（SWE-bench 所需）
│   │   │   ├── fileRead.ts           # file read tool
│   │   │   ├── fileWrite.ts          # file write tool
│   │   │   ├── fileEdit.ts           # file edit tool（str_replace 风格）
│   │   │   └── search.ts             # code search tool
│   │   │
│   │   ├── observers/
│   │   │   ├── tokenBudget.ts        # TokenBudgetObserver
│   │   │   ├── timeBudget.ts         # TimeBudgetObserver
│   │   │   ├── stepLogger.ts         # StepLoggerObserver（JSONL）
│   │   │   └── replayBuffer.ts       # ReplayBufferObserver
│   │   │
│   │   └── server/                   # HTTP server 层（见第 10 节）
│   │       ├── app.ts                # Fastify app 初始化
│   │       ├── routes.ts             # /run、/health 路由
│   │       ├── registry.ts           # 模块注册表（名称 → 实现类映射）
│   │       └── schema.ts             # RunRequest / RunResult JSON Schema（zod 定义）
│   │
│   ├── tests/
│   │   ├── runtime.test.ts           # loop 控制流测试
│   │   ├── termination.test.ts       # 终止条件测试
│   │   ├── parsers.test.ts           # 各 parser 的单元测试
│   │   └── fixtures/                 # 固定的 LLM 输出样本，用于确定性测试
│   │
│   ├── package.json
│   └── tsconfig.json
│
└── eval/                             # Python 评估层（pip package）
    ├── agent_runtime_client/
    │   ├── __init__.py
    │   ├── client.py                 # AgentRuntimeClient（见第 11 节）
    │   └── types.py                  # Python dataclass，镜像 TypeScript 类型
    │
    ├── experiments/
    │   ├── ablation.py               # 消融实验运行器
    │   ├── swebench_runner.py        # SWE-bench Verified 评估脚本
    │   └── configs/                  # 实验配置文件（YAML）
    │
    ├── analysis/
    │   ├── metrics.py                # success rate、token 消耗计算
    │   └── plots.py                  # 实验结果可视化
    │
    └── tests/
        └── test_client.py            # Python client 测试
```

---

## 9. 关键设计约束汇总 / Key Design Constraints

以下约束是 Codex 实现时必须严格遵守的不变量：

1. **`run()` 不抛异常**：所有内部错误转化为 `RunResult(success=False, termination_reason="error")`
2. **`interpreter` 不抛异常**：内部 try-catch，错误转为 `Observation(error=...)`
3. **`ContextStrategy.trim()` 不修改原 context**：必须返回新对象
4. **`PromptBuilder.build()` 是纯函数**：不修改任何外部状态
5. **`context.task` 不可被裁剪**：`ContextStrategy` 必须保留 `task` 字段
6. **`finish` tool 由 runtime 自动注册**：调用方的 `tools` 列表不得包含名为 `"finish"` 的 tool
7. **`termination_check` 在 tool 调用之前执行**：`finish` action 不触发实际的 tool call
8. **`StepRecord` 不参与控制流**：仅用于观测，不得影响 loop 的任何决策
9. **`Observer.on_step()` 不抛异常**：observer 的异常不得中断 loop
10. **`metadata` 字段不进入 LLM prompt**：`Observation.metadata` 和 `ContextEntry.metadata` 仅供观测层读取

---

## 10. HTTP Server 规范（TypeScript 侧） / HTTP Server Specification (TypeScript)

### 10.1 技术选型 / Technology Choices

- **框架**：Fastify（轻量、类型友好、schema 验证内置）
- **Schema 验证**：zod（TypeScript 原生，编译期和运行期双重验证）
- **端口**：默认 `3282`，可通过环境变量 `RUNTIME_PORT` 覆盖

### 10.2 启动方式 / Startup Modes

```bash
# 开发模式
cd runtime && npx ts-node src/server/app.ts

# 生产模式
cd runtime && npm run build && node dist/server/app.js

# 环境变量
RUNTIME_PORT=3282          # 监听端口
RUNTIME_LOG_LEVEL=info     # 日志级别（debug / info / warn / error）
RUNTIME_TOOLS_PRESET=swe   # 预设工具集（swe / minimal / custom）
```

### 10.3 路由规范 / Route Specification

#### `POST /run`

执行一次完整的 agent run。

**Request body（`RunRequest`）**：

```typescript
// src/server/schema.ts
import { z } from "zod";

export const RunRequestSchema = z.object({
  task: z.string().min(1),

  llm: z.object({
    provider: z.enum(["anthropic", "openai", "local"]),
    model: z.string(),
    api_key: z.string().optional(),   // 优先读取环境变量，此字段作为 override
    base_url: z.string().optional(),  // local provider 使用
  }),

  prompt_builder: z.enum([
    "react", "cot", "minimal", "smolagents", "swe_agent"
  ]).default("react"),

  action_parser: z.enum([
    "json", "xml", "function_call", "react"
  ]).default("json"),

  context_strategy: z.object({
    name: z.enum(["noop", "sliding_window", "summarization", "selective"]),
    max_tokens: z.number().optional(),   // sliding_window、summarization 使用
  }).default({ name: "sliding_window", max_tokens: 8000 }),

  tools: z.enum(["swe", "minimal", "custom"]).default("swe"),
  // tools="custom" 时，工具集由 server 启动时的 RUNTIME_TOOLS_PRESET 决定
  // 本期不支持通过 HTTP 动态传入工具实现

  config: z.object({
    max_steps: z.number().default(50),
    max_tokens: z.number().default(100000),
    budget_token: z.number().optional(),
    budget_time_ms: z.number().optional(),
  }).default({}),
});

export type RunRequest = z.infer<typeof RunRequestSchema>;
```

**Response body（`RunResponse`）**：

```typescript
export const RunResponseSchema = z.object({
  success: z.boolean(),
  result: z.string(),
  termination_reason: z.enum(["finish", "max_steps", "max_tokens",
                               "budget_token", "budget_time", "error"]),
  steps: z.array(z.object({
    step: z.number(),
    action_name: z.string(),
    action_args: z.record(z.unknown()),
    observation_content: z.string(),
    observation_error: z.string().nullable(),
    token_in: z.number(),
    token_out: z.number(),
    elapsed_ms: z.number(),
  })),
  total_token_in: z.number(),
  total_token_out: z.number(),
  total_elapsed_ms: z.number(),
});

export type RunResponse = z.infer<typeof RunResponseSchema>;
```

**注意**：`StepRecord.prompt` 和 `StepRecord.raw_text` 不包含在 HTTP response 中（体积过大）。需要完整 step 数据时，通过 `StepLoggerObserver` 写入本地 JSONL 文件，Python 侧读取文件。

#### `GET /health`

```json
{ "status": "ok", "version": "0.1.0" }
```

#### `GET /registry`

返回当前 server 注册的所有可用模块名称，供 Python client 验证配置合法性：

```json
{
  "prompt_builders": ["react", "cot", "minimal", "smolagents", "swe_agent"],
  "action_parsers": ["json", "xml", "function_call", "react"],
  "context_strategies": ["noop", "sliding_window", "summarization", "selective"],
  "tools": ["swe", "minimal"]
}
```

### 10.4 模块注册表 / Module Registry

```typescript
// src/server/registry.ts

import { ReActPromptBuilder } from "../prompt/react";
import { CoTPromptBuilder } from "../prompt/cot";
// ... 其他 import

export const PROMPT_BUILDERS: Record<string, () => PromptBuilder> = {
  react:      () => new ReActPromptBuilder(),
  cot:        () => new CoTPromptBuilder(),
  minimal:    () => new MinimalPromptBuilder(),
  smolagents: () => new SmolagentsPromptBuilder(),
  swe_agent:  () => new SWEAgentPromptBuilder(),
};

export const ACTION_PARSERS: Record<string, () => ActionParser> = {
  json:          () => new JSONActionParser(),
  xml:           () => new XMLActionParser(),
  function_call: () => new FunctionCallActionParser(),
  react:         () => new ReActActionParser(),
};

export const CONTEXT_STRATEGIES: Record<
  string,
  (params: { max_tokens?: number; llm?: LLMClient }) => ContextStrategy
> = {
  noop:          () => new NoopContextStrategy(),
  sliding_window: ({ max_tokens = 8000 }) => new SlidingWindowStrategy(max_tokens),
  summarization:  ({ max_tokens = 8000, llm }) => new SummarizationStrategy(max_tokens, llm!),
  selective:      () => new SelectiveRetentionStrategy(),
};

export const TOOL_PRESETS: Record<string, ToolSpec[]> = {
  swe:     [bashTool, fileReadTool, fileWriteTool, fileEditTool, searchTool],
  minimal: [bashTool],
};
```

### 10.5 并发处理 / Concurrency Model

每个 `POST /run` 请求创建独立的 `AgentRuntime` 实例，无共享状态。Fastify 默认支持并发请求，无需额外处理。

SWE-bench 评估时建议控制并发数（Python 侧限制），避免 LLM API 限速。

---

## 11. Python Client 规范 / Python Client Specification

### 11.1 安装 / Installation

```bash
cd eval && pip install -e .
```

### 11.2 `AgentRuntimeClient`

```python
# eval/agent_runtime_client/client.py

import httpx
from dataclasses import dataclass
from .types import RunRequest, RunResponse, LLMConfig, ContextStrategyConfig, RuntimeConfig

class AgentRuntimeClient:
    def __init__(
        self,
        base_url: str = "http://localhost:3282",
        timeout: float = 600.0,   # 单次 run 最长等待时间（秒）
    ):
        self._client = httpx.Client(base_url=base_url, timeout=timeout)
        self._verify_server()

    def _verify_server(self) -> None:
        """初始化时检查 server 是否可达，不可达则抛出 ConnectionError。"""
        resp = self._client.get("/health")
        resp.raise_for_status()

    def run(self, request: RunRequest) -> RunResponse:
        """
        执行一次 agent run，阻塞直到完成。

        参数：
            request: RunRequest dataclass，包含 task、llm、模块配置等

        返回：
            RunResponse dataclass

        异常：
            httpx.TimeoutException — server 超时
            httpx.HTTPStatusError — server 返回非 2xx
            ValueError — response 格式不符合预期
        """
        resp = self._client.post("/run", json=request.to_dict())
        resp.raise_for_status()
        return RunResponse.from_dict(resp.json())

    def registry(self) -> dict:
        """返回 server 当前注册的所有可用模块名称。"""
        return self._client.get("/registry").json()

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
```

### 11.3 数据类型（镜像 TypeScript schema） / Data Types (Mirroring the TypeScript Schema)

```python
# eval/agent_runtime_client/types.py

from dataclasses import dataclass, field, asdict
from typing import Literal, Optional

@dataclass
class LLMConfig:
    provider: Literal["anthropic", "openai", "local"]
    model: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None

@dataclass
class ContextStrategyConfig:
    name: Literal["noop", "sliding_window", "summarization", "selective"] = "sliding_window"
    max_tokens: Optional[int] = 8000

@dataclass
class RuntimeConfig:
    max_steps: int = 50
    max_tokens: int = 100_000
    budget_token: Optional[int] = None
    budget_time_ms: Optional[int] = None

@dataclass
class RunRequest:
    task: str
    llm: LLMConfig
    prompt_builder: Literal["react", "cot", "minimal", "smolagents", "swe_agent"] = "react"
    action_parser: Literal["json", "xml", "function_call", "react"] = "json"
    context_strategy: ContextStrategyConfig = field(default_factory=ContextStrategyConfig)
    tools: Literal["swe", "minimal"] = "swe"
    config: RuntimeConfig = field(default_factory=RuntimeConfig)

    def to_dict(self) -> dict:
        return asdict(self)

@dataclass
class StepSummary:
    step: int
    action_name: str
    action_args: dict
    observation_content: str
    observation_error: Optional[str]
    token_in: int
    token_out: int
    elapsed_ms: int

@dataclass
class RunResponse:
    success: bool
    result: str
    termination_reason: Literal["finish", "max_steps", "max_tokens",
                                 "budget_token", "budget_time", "error"]
    steps: list[StepSummary]
    total_token_in: int
    total_token_out: int
    total_elapsed_ms: int

    @classmethod
    def from_dict(cls, data: dict) -> "RunResponse":
        steps = [StepSummary(**s) for s in data.pop("steps", [])]
        return cls(steps=steps, **data)
```

### 11.4 典型使用模式 / Typical Usage Patterns

#### 单次调用

```python
from agent_runtime_client import AgentRuntimeClient, RunRequest, LLMConfig

with AgentRuntimeClient() as client:
    result = client.run(RunRequest(
        task="Fix the failing test in tests/test_foo.py",
        llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
        prompt_builder="react",
        context_strategy=ContextStrategyConfig(name="sliding_window", max_tokens=8000),
    ))
    print(result.success, result.termination_reason)
    print(f"tokens: {result.total_token_in} in / {result.total_token_out} out")
```

#### 消融实验

```python
# eval/experiments/ablation.py

import itertools
import json
from pathlib import Path
from agent_runtime_client import AgentRuntimeClient, RunRequest, LLMConfig, ContextStrategyConfig

TASKS = [...]   # SWE-bench task 列表

PROMPT_BUILDERS = ["react", "cot", "minimal"]
CONTEXT_STRATEGIES = [
    ContextStrategyConfig(name="noop"),
    ContextStrategyConfig(name="sliding_window", max_tokens=4000),
    ContextStrategyConfig(name="sliding_window", max_tokens=8000),
    ContextStrategyConfig(name="selective"),
]

def run_ablation(output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)

    with AgentRuntimeClient() as client:
        for pb, cs in itertools.product(PROMPT_BUILDERS, CONTEXT_STRATEGIES):
            experiment_id = f"{pb}__{cs.name}_{cs.max_tokens}"
            results = []

            for task in TASKS:
                resp = client.run(RunRequest(
                    task=task["problem_statement"],
                    llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
                    prompt_builder=pb,
                    context_strategy=cs,
                    config=RuntimeConfig(budget_token=50_000),  # 统一 budget 约束
                ))
                results.append({
                    "task_id": task["instance_id"],
                    "success": resp.success,
                    "termination_reason": resp.termination_reason,
                    "total_token_in": resp.total_token_in,
                    "total_token_out": resp.total_token_out,
                    "total_elapsed_ms": resp.total_elapsed_ms,
                })

            # 写入 JSONL
            out_file = output_dir / f"{experiment_id}.jsonl"
            with open(out_file, "w") as f:
                for r in results:
                    f.write(json.dumps(r) + "\n")

            # 打印当前实验 summary
            success_rate = sum(r["success"] for r in results) / len(results)
            avg_tokens = sum(r["total_token_in"] + r["total_token_out"] for r in results) / len(results)
            print(f"{experiment_id}: success={success_rate:.2%}, avg_tokens={avg_tokens:.0f}")
```

#### SWE-bench 评估脚本

```python
# eval/experiments/swebench_runner.py
# 假设 SWE-bench 的 task 格式已经解析好

from datasets import load_dataset
from agent_runtime_client import AgentRuntimeClient, RunRequest, LLMConfig

def run_swebench(
    split: str = "verified",
    prompt_builder: str = "react",
    max_tasks: int | None = None,
    budget_token: int = 100_000,
):
    dataset = load_dataset("princeton-nlp/SWE-bench_Verified", split=split)
    if max_tasks:
        dataset = dataset.select(range(max_tasks))

    with AgentRuntimeClient(timeout=900.0) as client:
        for task in dataset:
            result = client.run(RunRequest(
                task=task["problem_statement"],
                llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
                prompt_builder=prompt_builder,
                config=RuntimeConfig(budget_token=budget_token),
            ))
            # 输出 patch 供 SWE-bench 评估器使用
            yield task["instance_id"], result
```

### 11.5 日志文件读取 / Reading Log Files

当需要完整的 step 数据（prompt 原文、LLM raw output）时，读取 TypeScript 侧写入的 JSONL：

```python
# eval/analysis/metrics.py

import json
from pathlib import Path

def load_step_logs(log_dir: Path, experiment_id: str) -> list[dict]:
    """读取 TypeScript StepLoggerObserver 写入的 JSONL 文件。"""
    log_file = log_dir / f"{experiment_id}_steps.jsonl"
    with open(log_file) as f:
        return [json.loads(line) for line in f]

def compute_metrics(results_jsonl: Path) -> dict:
    results = [json.loads(l) for l in open(results_jsonl)]
    total = len(results)
    succeeded = sum(1 for r in results if r["success"])
    return {
        "success_rate": succeeded / total,
        "avg_token_in": sum(r["total_token_in"] for r in results) / total,
        "avg_token_out": sum(r["total_token_out"] for r in results) / total,
        "avg_elapsed_ms": sum(r["total_elapsed_ms"] for r in results) / total,
        "termination_breakdown": {
            reason: sum(1 for r in results if r["termination_reason"] == reason) / total
            for reason in ["finish", "max_steps", "max_tokens", "budget_token", "budget_time", "error"]
        },
    }
```
