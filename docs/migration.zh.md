# 迁移说明

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

## 当前迁移报告导航

- `claude-code-sourcemap`: `docs/claude-code-sourcemap.migration.zh.md` / `docs/claude-code-sourcemap.migration.en.md`
- `goose`: `docs/goose_migration_report.zh.md` / `docs/goose_migration_report.en.md`
- `ii-agent`: `docs/ii-agent-migration-report.zh.md` / `docs/ii-agent-migration-report.en.md`
- `pi-mono`: `docs/pi-mono-migration.zh.md` / `docs/pi-mono-migration.en.md`
- `opencode`: `docs/opencode-migration.zh.md` / `docs/opencode-migration.en.md`
- `cline`: `packages/agents/cline/MIGRATION_REPORT.zh.md` / `packages/agents/cline/MIGRATION_REPORT.en.md`
- `openhands`: `docs/openhands_migration_status.zh.md` / `docs/openhands_migration_status.en.md`
