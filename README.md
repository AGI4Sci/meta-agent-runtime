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
- 支持中英双语 prompt 配置，并按用户需求切换语言

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
- HTTP `POST /run` 已预留 `prompt_language` 字段，用于选择中文或英文 prompt。
- tool `description` 已支持中英双语资源，prompt 会按语言配置渲染工具说明。

## 迁移原则

- `runtime/` 保持 agent-agnostic，不放具体 agent 的耦合逻辑。
- 每个 source agent 在 `packages/agents/<agent-name>/` 下独立迁移，便于多人并行推进。
- 共性能力优先通过接口和注册表沉淀，而不是直接改 runtime 主循环。
