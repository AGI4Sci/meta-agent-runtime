# Meta Agent Runtime

面向 code agent 消融实验与运行时研究的参考平台。  
A reference platform for code-agent ablation studies and runtime research.

## 文档语言 / Documentation Language

- 默认工作语言为中文，英文作为对照与对外协作语言。
- Chinese is the primary working language, with English maintained as a parallel language for external collaboration.
- 新增文档、设计更新、迁移说明建议采用“中文优先，英文对照”格式。
- New docs, design updates, and migration notes should follow a "Chinese first, English mirrored" format when practical.

## 项目结构 / Project Layout

- `runtime/`: TypeScript 参考 runtime 与 HTTP server  
  TypeScript reference runtime and HTTP server
- `eval/`: Python client 与实验辅助脚本  
  Python client and experiment helpers
- `packages/agents/`: 按 agent 拆分的迁移适配目录，方便并行迁移  
  Per-agent migration adapters for parallel porting
- `docs/`: 迁移说明、平台约定与补充文档  
  Migration notes, platform conventions, and supporting docs

## 设计目标 / Design Goals

- 稳定的核心 loop，与清晰的模块边界  
  A stable core loop with explicit module boundaries
- 支持不同 code agent 的并行、模块化迁移  
  Parallel and modular migration paths for different code agents
- 通过 registry 驱动 prompt/context/parser/tool 的自由组合  
  Registry-driven composition for prompt, context, parser, and tool variants
- 为实验提供可观测性、回放与分析入口  
  Experiment-friendly observability, replay, and analysis hooks
- 全面支持中英双语协作  
  Full support for bilingual Chinese-English collaboration

## 快速开始 / Quick Start

```bash
cd runtime
npm install
npm run build
npm run dev
```

在另一个终端中 / In another shell:

```bash
cd eval
pip install -e .
python -m agent_runtime_client.demo
```

## 当前状态 / Current Status

- 已完成参考框架骨架，包括核心 runtime、server、Python client 与迁移目录。
- The repository now includes the reference runtime skeleton, server, Python client, and adapter-oriented migration layout.
- LLM provider 仍是可扩展 scaffold，后续可按实验需要接入真实实现。
- LLM providers are still scaffolds and can be wired to real implementations as the research platform evolves.

## 迁移原则 / Migration Principles

- `runtime/` 保持 agent-agnostic，不放具体 agent 的耦合逻辑。
- `runtime/` should stay agent-agnostic and avoid source-agent-specific coupling.
- 每个 source agent 在 `packages/agents/<agent-name>/` 下独立迁移，便于多人并行推进。
- Each source agent should migrate independently under `packages/agents/<agent-name>/` to enable parallel workstreams.
- 共性能力优先通过接口和注册表沉淀，而不是直接改 runtime 主循环。
- Shared capabilities should be introduced through interfaces and registries instead of patching the runtime loop directly.

## 相关文档 / Related Docs

- [设计文档 / Design Spec](./agent_runtime_design.md)
- [迁移说明 / Migration Notes](./docs/migration.md)
