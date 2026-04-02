# 迁移说明

## 当前状态总览

当前仓库已经形成“共享 runtime + 多 agent adapter 并行迁移”的基本结构：

- `runtime/` 负责共享 loop、HTTP server、registry 与观测接口
- `eval/` 负责 Python client 与实验辅助脚本
- `packages/agents/<agent-name>/` 负责各 source agent 的 prompt / parser / context / tool compatibility

目前已接入或正在维护的 adapter 包括：

- `claude-code-sourcemap`
- `goose`
- `ii-agent`
- `pi-mono`
- `opencode`
- `cline`
- `openhands`

其中，`pi-mono` 已完成一轮“最小可运行骨架”迁移，并在最近一轮补做了忠实性纠偏，重点恢复了：

- 更接近源仓库 `system-prompt.ts` 的工具感知 prompt 规则
- 更接近源仓库 `readOnlyTools` 的 `read/grep/find/ls` 只读工具面
- 对 source-style tool envelope 更宽的 parser 兼容
- 更稳健的 turn-oriented context trimming

当前迁移策略仍然坚持“先最小可运行、再做忠实性纠偏、最后再讨论更重的 session/streaming 机制”，避免把 source agent 的整套运行时直接混入共享 core。

## 并行迁移模型

每个 source agent 应迁移到 `packages/agents/<agent-name>/` 下的独立适配目录。
每个适配目录可以独立提供：

- prompt builders
- action parsers
- context strategies
- tool presets
- compatibility tests/fixtures

`runtime/` 中的 reference runtime 必须保持 agent-agnostic。这样可以让多条迁移线解耦，并在共享 loop 上做可比实验。

## 建议流程

1. 先在适配目录内部实现 prompt/parser/context 的兼容行为。
2. 再把导出的工厂函数注册到 runtime registry。
3. 添加确定性 fixture，对比原 agent 输出格式与迁移后 parser/prompt 的行为。
4. 通过共享 HTTP runtime 跑相同任务，做 apples-to-apples 对比。

## 约定

- agent-specific 代码不应直接修改 `runtime/src/core/*`。
- 新能力优先通过接口和 registry 进入平台。
- 共性工具只在至少两个适配器都需要时再提取为共享模块。

## 当前平台状态

- `agent_runtime_design.md` 已按 `agent_runtime_design_raw.md` 恢复主体设计规范，后续实现对齐以 raw 版语义为准。
- runtime core 已完成一轮契约对齐，重点覆盖：
  - `AgentRuntime.run()`
  - `termination_check` 优先级
  - `ParseError` 处理方式
  - `FINISH_TOOL` 内置契约
  - `Observer` 钩子兼容
- HTTP server 对外 contract 正在收敛到 raw 版基线：
  - `GET /health` 已稳定
  - `POST /run` request/response shape 已建立 raw 基线与兼容层分离思路
  - `GET /registry` 仍有“公开 contract 与已注册 adapter 可见性”的实现收口项，后续应继续按 raw 版基线整理
- Python client / eval 已完成一轮对齐：
  - `AgentRuntimeClient`
  - `RunRequest` / `RunResponse` / `RuntimeConfig`
  - `ablation.py`
  - `swebench_runner.py`
  - `eval/tests/test_client.py`

## 当前迁移状态摘要

- `claude-code-sourcemap`：最小骨架已接入，仍以兼容层为主。
- `goose`：最小骨架已接入，但仓库内仍存在其他迁移线带来的既有 TypeScript 问题，影响全量 build/test 结果的可读性。
- `ii-agent`：已从最小骨架推进到研究友好的兼容 adapter，最近重点修正了源风格工具面、plain-text completion 语义以及 todo 状态保留协议。
- `pi-mono`：已完成最小骨架，并进一步增强为更适合做模块对照实验的适配器。
- `opencode`：已完成最小骨架；最近一轮又补了对原项目更忠实的 prompt / parser / tool / context 修正，并增加了更适合模块化研究的工具子集导出。
- `cline`：报告仍位于 agent 目录内，尚未统一收口到 `docs/`。
- `openhands`：最小骨架已接入，仍保留较多高阶能力缺口。

## 状态定义与矩阵

为避免“已迁移”被误读，这里统一使用以下状态词：

- `最小骨架`：已经具备 prompt / parser / context / tool preset 的最小可运行适配层
- `研究就绪`：接口边界已相对稳定，适合做 controlled ablation / contract comparison
- `部分对齐`：已经接入，但关键行为与源项目仍有明显差异
- `完整 parity 未完成`：高级 orchestration / runtime semantics 尚未覆盖

当前项目状态矩阵如下：

| agent | prompt | parser | context | tools | 当前状态 | 备注 |
|------|--------|--------|---------|-------|---------|------|
| `claude-code-sourcemap` | 已接入 | 已接入 | 已接入 | 已接入 | 研究就绪 | 已补一轮忠实度校正与 adapter 边界收口 |
| `goose` | 已接入 | 已接入 | 已接入 | 已接入 | 最小骨架 | 已有 adapter 级测试 |
| `ii-agent` | 已接入 | 已接入 | 已接入 | 已接入 | 最小骨架 | 更深 orchestration 仍未迁移 |
| `pi-mono` | 已接入 | 已接入 | 已接入 | 已接入 | 最小骨架 | 已区分最小 coding / readonly preset |
| `opencode` | 已接入 | 已接入 | 已接入 | 已接入 | 最小骨架 | 当前仍以 compatibility layer 为主 |
| `cline` | 已接入 | 已接入 | 已接入 | 已接入 | 研究就绪 | 已完成一轮忠实度校正 |
| `openhands` | 已接入 | 已接入 | 已接入 | 已接入 | 部分对齐 | browser / delegation 等复杂语义仍未迁移 |

## 近期建议

1. 先把 server contract 的剩余收口项解决，再继续扩展 eval 入口，避免实验输入输出 contract 反复变化。
2. 对每个 adapter 都补“定向源码校验”或最小 fixture 测试，减少被其他迁移线 build 错误污染结论的情况。
3. 对研究价值更高的 adapter，优先补“可组合导出”，例如：
   - 命名 prompt builder 常量
   - 可裁剪 tool preset
   - parser compatibility fixtures
4. 将 `cline` 的迁移报告也统一纳入 `docs/` 导航，避免状态分散。

## 当前迁移报告导航

`ii-agent` 当前补充说明：

- 已对齐的重点：
  - 更接近源项目的工具名与参数形状
  - plain-text completion 到 runtime `finish` 的兼容
  - todo 状态在 tool / context / prompt 之间的显式保留
- 尚未迁移的重点：
  - controller / event / interruption
  - provider-native tool calling
  - 完整 `LLMCompact` 压缩语义

- `claude-code-sourcemap`: `docs/claude-code-sourcemap.migration.zh.md` / `docs/claude-code-sourcemap.migration.en.md`
- `goose`: `docs/goose_migration_report.zh.md` / `docs/goose_migration_report.en.md`
- `ii-agent`: `docs/ii-agent-migration-report.zh.md` / `docs/ii-agent-migration-report.en.md`
- `pi-mono`: `docs/pi-mono-migration.zh.md` / `docs/pi-mono-migration.en.md`
- `opencode`: `docs/opencode-migration.zh.md` / `docs/opencode-migration.en.md`
- `cline`: `packages/agents/cline/MIGRATION_REPORT.zh.md` / `packages/agents/cline/MIGRATION_REPORT.en.md`
- `openhands`: `docs/openhands_migration_status.zh.md` / `docs/openhands_migration_status.en.md`

补充说明：

- `openhands` 当前已经从“最小可运行骨架”推进到“适合模块化研究”的阶段。
- 其 adapter 主实现现已收敛在 `packages/agents/openhands/`，并已拆分出可独立替换的 tool factories，便于后续做更细粒度 ablation。

## 近期关注点

- 设计文档已重新对齐 `agent_runtime_design_raw.md`
- runtime core、HTTP server、Python client / eval contract 已完成一轮回对齐
- 各 agent adapter 仍处于不同成熟度阶段，不应把某个 source agent 的 session / UI / streaming 机制直接视为共享 runtime 的默认规范
- `pi-mono` 当前更适合作为“最小 prompt / parser / context / tool 研究对象”，而不是 `AgentSession` 全量复刻对象

## 验证口径

当前需要明确区分两类验证：

- `adapter 局部验证通过`：adapter 单测、定向 `tsx --test`、Python 定向测试或最小语法检查通过
- `仓库全量验证通过`：`npm run build`、`npm test`、`python3 -m compileall eval` 等跨模块验证通过

记录迁移状态时，不应把“某个 adapter 局部验证通过但被其他迁移线阻塞全仓验证”误写成该 adapter 自身失败。
