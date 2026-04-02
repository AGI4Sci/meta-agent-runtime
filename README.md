# Meta Agent Runtime

面向 code agent 消融实验与运行时研究的参考平台。

## 文档导航

- 中文 README：当前文件
- English README: [README.en.md](./README.en.md)
- 中文设计文档：[agent_runtime_design.md](./agent_runtime_design.md)
- English design doc: [agent_runtime_design.en.md](./agent_runtime_design.en.md)
- 中文迁移说明：[docs/migration.zh.md](./docs/migration.zh.md)
- English migration notes: [docs/migration.en.md](./docs/migration.en.md)

## 文档与协作语言

- 默认工作语言为中文。
- 英文文档作为对外协作和对照版本维护。
- 新增文档优先拆成独立中文、英文文件，避免双语内容混排在同一页。
- 若中英文表述出现偏差，以中文版本为团队内部讨论基准，再同步修订英文版本。
- 代码标识、接口名、目录名保持英文，减少实现层歧义。

## 项目结构

- `runtime/`: TypeScript 参考 runtime 与 HTTP server
- `eval/`: Python client 与实验辅助脚本
- `packages/agents/`: 按 agent 拆分的迁移适配目录，方便并行迁移
- `docs/`: 迁移说明、平台约定与补充文档

## 设计目标

- 稳定的核心 loop，与清晰的模块边界
- 支持不同 code agent 的并行、模块化迁移
- 通过 registry 驱动 prompt/context/parser/tool 的自由组合
- 为实验提供可观测性、回放与分析入口
- 采用“文档双语、runtime 英文”的分层方案，降低实验路径的维护复杂度

## 快速开始

```bash
cd runtime
npm install
npm run build
npm run dev
```

在另一个终端中：

```bash
cd eval
pip install -e .
python -m agent_runtime_client.demo
```

## 当前状态

- 已完成参考框架骨架，包括核心 runtime、server、Python client 与迁移目录。
- LLM provider 仍是可扩展 scaffold，后续可按实验需要接入真实实现。
- runtime prompt、tool description 与实验接口统一使用英文，保证高频路径稳定。
- 中文主要保留在文档与协作层。
- 当前已接入的迁移适配器包括 `claude-code-sourcemap`、`goose`、`ii-agent`、`pi-mono`、`opencode`、`cline` 与 `openhands`。
- `agent_runtime_design.md` 已按 `agent_runtime_design_raw.md` 恢复核心设计规范。
- runtime core、HTTP server contract 与 Python client/eval 正在向原始设计对齐，相关回归测试已纳入仓库。

## 最新进展

- 补齐了 runtime core 对齐测试与 server contract 测试。
- `/run`、`/health`、`/registry` 的公开 contract 已重新对齐原始设计基线，同时保留内部 adapter 扩展能力。
- Python client、类型定义、ablation 脚本与 SWE runner 骨架已回到更接近原始设计的接口形状。

## 迁移原则

- `runtime/` 保持 agent-agnostic，不放具体 agent 的耦合逻辑。
- 每个 source agent 在 `packages/agents/<agent-name>/` 下独立迁移，便于多人并行推进。
- 共性能力优先通过接口和注册表沉淀，而不是直接改 runtime 主循环。
