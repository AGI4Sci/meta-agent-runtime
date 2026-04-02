# 项目状态

## 当前状态

- 当前工作分支：`main`
- 本次多 agent 迁移成果主要是从各个 linked worktree 中回收整合的，不是直接来自分支上的独立提交。
- 仓库当前已经接入可运行的 adapter 边界：
  - `claude-code-sourcemap`
  - `goose`
  - `ii-agent`
  - `pi-mono`
  - `opencode`
  - `cline`
  - `openhands`
- agent-specific 逻辑统一放在 `packages/agents/<agent-name>/` 下。
- runtime 侧注册已经收口到 `runtime/src/server/agentRegistry.ts`。
- runtime prompt 继续保持英文单轨。
- 中文文档与英文文档继续分离维护。
- `agent_runtime_design.md` 已按 `agent_runtime_design_raw.md` 恢复原始设计规范主体。
- runtime core、server contract 与 Python client/eval 的第一轮代码对齐已完成并进入回归验证阶段。

## 已完成验证

- `cd runtime && npm run build`
- `cd runtime && npm test`
- `python3 -m compileall eval`

当前验证结果：

- TypeScript 构建通过
- runtime 测试全部通过
- Python eval 目录编译通过
- runtime 新增对齐回归测试与 server contract 测试通过
- Python `unittest` 入口仍受环境依赖影响，当前机器缺少 `httpx`

## Adapter 接入状态

当前这些 adapter 都属于“最小可运行兼容层接入”，还不是完整 source parity 迁移。

- `claude-code-sourcemap`：已具备 prompt/parser/context/tool preset 的最小兼容骨架
- `goose`：已接入 prompt/parser/context/tools，并带 adapter 测试
- `ii-agent`：已接入 prompt/parser/context/tool alias，尚未迁移更深层 orchestration
- `pi-mono`：已接入最小 coding/readonly preset
- `opencode`：已接入 prompt/parser/context/tool preset
- `cline`：已接入最小 XML 风格兼容路径
- `openhands`：已接入单线程 compatibility layer，未迁移 browser/delegation 等复杂语义

## 已知风险

- 这轮迁移的 provenance 一部分依赖 linked worktree 和迁移报告，因为源分支在集成时没有独立提交可直接 merge。
- 多个 adapter 目前都是刻意保持“最小接入”，在长链路 SWE 任务上的行为不一定接近原始 agent。
- 还没有开始真实 LLM 驱动的评测，所以当前信心主要来自 build/test 层面的兼容性验证。

## 下一步 TODO

- 将当前设计恢复与代码对齐结果提交到 `main`
- 在具备 Python 依赖后补跑 `eval` 单元测试
- 补一个轻量矩阵，记录每个 adapter 支持的 prompt/parser/context/tool preset 名称
- 补 `/registry` 返回内容的断言测试，覆盖 agent 名称和 preset key
- 继续做 D 类边界清理，只处理明确的设计漂移，不做过度重构

## SWE 评测计划

等拿到 LLM API 之后，基于当前接入的 adapter 做受控 SWE 风格评测。

### 评测前准备

- 确认使用哪个 provider 和 model
- 把真实凭证接入 runtime 的 LLM client 层
- 确定第一批 SWE 子集：
  - 一组 smoke 任务，用来验证连通性和 prompt/parser 基本可用
  - 一组更大的对比任务，用来做 adapter 排名
- 冻结统一任务集、预算和 runtime 配置，保证不同 adapter 对比公平

### 评测执行项

- 验证每个 adapter 至少能在真实 provider 下完成一个端到端任务
- 记录每个 adapter 的 success rate、token 消耗、时延和主要失败模式
- 记录 parser failure、非法 tool 调用、unknown tool、context trim 失真等问题
- 对可选 preset 做对比，例如 `pi_mono_coding` 与 `pi_mono_readonly`
- 判断哪些 adapter 需要先补 source parity 再扩大 SWE 评测范围

### 预期产出

- 输出每个 adapter 的评测总结
- 按任务成功率和稳定性给出阶段性排序
- 区分基础设施问题和 adapter 设计问题
- 将结果、结论和新的 TODO 回写到本文件
