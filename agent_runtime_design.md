# Agent Runtime 设计文档

> 本文档是 reference runtime 的中文设计规范，供团队内部设计、实现与迁移使用。
>
> 实现语言：TypeScript（核心 runtime + HTTP server），Python（评估脚本 + 实验分析 client）。两者通过本地 HTTP 通信，共享 JSON Schema 定义的数据格式。

## 0. 文档与协作语言

- 本项目默认工作语言为中文。
- 英文版本文档独立维护，见 [agent_runtime_design.en.md](./agent_runtime_design.en.md)。
- 新文档优先拆分为独立中文、英文文件，不在同一页做双语混排。
- 若中英文版本存在冲突，以中文版本为团队内部讨论基准。
- 代码标识、接口名、目录名保持英文。
- runtime 内部的 prompt、tool description、实验接口统一采用英文，减少高频路径的维护风险。

## 1. 研究背景与目标

### 1.1 研究动机

现有开源 code agent（smolagents、SWE-agent、OpenHands、LangGraph 等）将 prompt 模板、context 管理、action 解析、工具调用等逻辑混合在一起，无法单独替换某一个成分来做受控实验。本项目的目标是构建一个消融实验平台：固定其他所有变量，每次只替换一个模块，精确测量该模块对结果的影响。

### 1.2 研究目标

在以下约束下最大化 task success rate：

- 效果目标：task success rate（在 SWE-bench Verified 上评估）
- 效率目标：token 消耗总量 + 端到端时间开销
- 约束方式：在 token/time budget X 内最大化 success rate
- 任务域：coding agent（SWE-bench Verified）

### 1.3 主要研究变量

| 模块 | 对 success rate 的影响 | 对 token/时间的影响 | 研究优先级 |
|------|----------------------|-------------------|-----------|
| `PromptBuilder` | 高 | 高 | 主要变量 |
| `ContextStrategy` | 中 | 高 | 主要变量 |
| `LLMClient` | 高 | 高 | 次要变量 |
| `ActionParser` | 中 | 低 | 固定基准 |
| `ToolSpec.interpreter` | 低 | 低 | 固定基准 |

## 2. 边界定义

### 2.1 核心决策清单

| 决策项 | 结论 |
|--------|------|
| executor 拓扑 | 拓扑 A：executor 在 runtime 内部 |
| 执行权范围 | 调用权 + 结果解释权，不含环境生命周期 |
| 结果解释方式 | 工具侧提供纯函数 interpreter |
| 终止判断 | 结构性条件由 runtime 判断，语义终止通过 `finish` action 表达 |
| finish 的地位 | 普通 tool，runtime 在 `termination_check` 中硬编码识别 |
| context 管理 | 可插拔，作为 runtime 初始化参数 |
| action 解析 | 可插拔，作为 runtime 初始化参数 |
| 错误处理 | 错误转化为 Observation，不中断 loop，不做重试 |
| args 验证 | runtime 在调用 tool 前做 schema 验证 |
| prompt 模板 | 可插拔，作为 runtime 初始化参数 |
| prompt 语言 | runtime 固定英文；中文主要用于文档与协作层 |
| LLM | 外部依赖注入，runtime 定义最小接口 |

### 2.2 边界内 vs 边界外

边界内：

- 决策：`LLM(context) -> action`
- 调用：`action -> tool_spec.call(args)`
- 结果解释：`tool_spec.interpreter(raw) -> Observation`
- args 验证：`validate(args, tool_spec.args_schema)`
- 错误兜底：异常转错误 `Observation`
- context 维护与裁剪
- 终止判断
- 英文 prompt 组装

边界外：

- 工具的物理执行环境
- 工具实现本身
- 环境生命周期管理
- 副作用控制
- 各插拔模块的具体业务逻辑
- LLM 模型和厂商选择

## 3. 数据结构规范

### 3.1 `Observation`

runtime 内部唯一的信息载体，由 `interpreter` 生成，进入 `context`。

```python
@dataclass
class Observation:
    content: str
    error: str | None
    metadata: dict

    @property
    def is_error(self) -> bool:
        return self.error is not None
```

约束：

- `content` 是唯一进入 LLM prompt 的字段
- `metadata` 仅供观测层使用
- `error` 非空时，`content` 可以为空字符串，但不应为 `None`

### 3.2 `Action`

```python
@dataclass
class Action:
    name: str
    args: dict
    raw_text: str
```

约束：

- `name` 必须能映射到已注册工具，或为 `"finish"`
- `args` 在调用工具前做 schema 验证
- `raw_text` 不参与控制流

### 3.3 `Context`

```python
@dataclass
class ContextEntry:
    role: Literal["user", "assistant", "tool"]
    content: str
    metadata: dict

@dataclass
class Context:
    task: str
    entries: list[ContextEntry]
    step: int
    token_count: int
```

约束：

- `task` 始终保留
- `entries` 由 `ContextStrategy.trim()` 管理
- `token_count` 由 runtime 维护

### 3.4 `StepRecord`

```python
@dataclass
class StepRecord:
    step: int
    prompt: str
    raw_text: str
    action: Action
    observation: Observation
    token_in: int
    token_out: int
    elapsed_ms: int
```

### 3.5 `RunResult`

```python
@dataclass
class RunResult:
    success: bool
    result: str
    steps: list[StepRecord]
    total_token_in: int
    total_token_out: int
    total_elapsed_ms: int
    termination_reason: Literal["finish", "max_steps", "max_tokens", "error"]
```

## 4. 五个插拔接口规范

### 4.1 `LLMClient`

```python
class LLMClient(Protocol):
    def complete(self, prompt: str) -> str:
        ...

    def count_tokens(self, text: str) -> int:
        ...
```

### 4.2 `PromptBuilder`

```python
class PromptBuilder(Protocol):
    def build(self, task: str, tools: list[ToolSpec], context: Context) -> str:
        ...
```

约束：

- 必须包含 `task`
- 必须包含 tools 信息
- 必须包含 context 历史
- 必须是纯函数
- runtime 内部统一输出英文 prompt
- tools 的描述文本在 runtime 中统一使用英文

### 4.3 `ActionParser`

```python
class ActionParser(Protocol):
    def parse(self, raw_text: str) -> Action:
        ...
```

### 4.4 `ContextStrategy`

```python
class ContextStrategy(Protocol):
    def trim(self, context: Context) -> Context:
        ...
```

### 4.5 `ToolSpec`

```python
@dataclass
class ToolSpec:
    name: str
    description: str
    args_schema: dict
    call: Callable[[dict], Any]
    interpreter: Callable[[Any], Observation]
```

## 5. Runtime 主体规范

### 5.1 初始化契约

```python
@dataclass
class RuntimeConfig:
    max_steps: int = 50
    max_tokens: int = 100_000
    budget_token: int | None = None
    budget_time_ms: int | None = None

class AgentRuntime:
    def run(self, task: str) -> RunResult:
        ...
```

## 6. 观测系统规范

- 观测系统不参与控制流，只负责数据采集。
- `Observer` 异常不得中断 runtime。

## 7. 迁移指南

- 按 `PromptBuilder -> ActionParser -> ContextStrategy -> ToolSpec` 顺序迁移。
- 各 source agent 应优先迁移到 `packages/agents/<agent-name>/`。
- agent 适配器应尽量避免直接修改 `runtime/src/core/*`。

## 8. 目录结构

```text
meta-agent-runtime/
├── runtime/
├── eval/
├── packages/agents/
├── docs/
├── README.md
├── README.en.md
├── agent_runtime_design.md
└── agent_runtime_design.en.md
```

## 9. 关键设计约束汇总

1. `run()` 不抛异常。
2. `interpreter` 不抛异常。
3. `ContextStrategy.trim()` 不修改原对象。
4. `PromptBuilder.build()` 是纯函数。
5. `task` 不可被裁剪。
6. `finish` 由 runtime 自动注册。
7. `termination_check` 在 tool 调用前执行。
8. `StepRecord` 不参与控制流。
9. `Observer` 不得破坏主 loop。
10. `metadata` 不进入 prompt。
11. runtime prompt 与 tool description 统一使用英文。

## 10. HTTP Server 规范（TypeScript 侧）

- 默认端口 `3282`
- `POST /run` 不暴露 prompt 语言切换，统一使用英文 runtime prompt
- `GET /health`
- `GET /registry`

## 11. Python Client 规范

- Python client 不暴露 prompt 语言切换
- 若用户以中文给出任务，业务层可做翻译或转写，但 runtime 模板保持英文
