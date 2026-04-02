# Meta Agent Runtime

A reference platform for code-agent ablation studies and runtime research.

## Documentation Index

- Chinese README: [README.md](./README.md)
- English README: this file
- Chinese design doc: [agent_runtime_design.md](./agent_runtime_design.md)
- English design doc: [agent_runtime_design.en.md](./agent_runtime_design.en.md)
- Chinese migration notes: [docs/migration.zh.md](./docs/migration.zh.md)
- English migration notes: [docs/migration.en.md](./docs/migration.en.md)
- Chinese SWE-bench config guide: [docs/swe-bench-benchmark-config.zh.md](./docs/swe-bench-benchmark-config.zh.md)
- English SWE-bench config guide: [docs/swe-bench-benchmark-config.en.md](./docs/swe-bench-benchmark-config.en.md)

## Documentation and Collaboration Language

- Chinese is the default working language.
- English documents are maintained for external collaboration and cross-team reference.
- New documentation should preferably be split into separate Chinese and English files instead of mixing both languages in the same page.
- If the Chinese and English versions diverge, the team should resolve the Chinese version first and then sync the English copy.
- Code identifiers, interface names, and directory names should remain in English to reduce implementation ambiguity.

## Project Layout

- `runtime/`: TypeScript reference runtime and HTTP server
- `eval/`: Python client and experiment helpers
- `benchmark/swe_bench_verified/`: SWE-bench Verified benchmark entrypoint, repo-local smoke subsets, and result aggregation
- `benchmark/swe_bench_verified/third_party/swebench/`: co-located official SWE-bench harness source
- `packages/agents/`: per-agent migration adapters for parallel porting
- `docs/`: migration notes, platform conventions, and supporting documents

## Design Goals

- A stable core loop with explicit module boundaries
- Parallel and modular migration paths for different code agents
- Registry-driven composition for prompt, context, parser, and tool variants
- Experiment-friendly observability, replay, and analysis hooks
- A layered model: bilingual documentation, English-only runtime prompts

## Quick Start

```bash
cd runtime
npm install
npm run build
npm run dev
```

In another shell:

```bash
cd eval
pip install -e .
python -m agent_runtime_client.demo
```

## Benchmark Entry Point

The repository now includes a SWE-bench Verified benchmark integration. The recommended workflow is two-phase:

1. Run the agent/prediction phase first to validate runtime, agent, and LLM wiring
2. Remove `--skip-evaluation` to enter the official SWE-bench harness evaluation phase

Minimal smoke run:

```bash
cd benchmark/swe_bench_verified

python3.10 __main__.py \
  --dataset-path ./datasets/verified_smoke.jsonl \
  --max-instances 1 \
  --skip-evaluation
```

See also:
- [Chinese SWE-bench config guide](./docs/swe-bench-benchmark-config.zh.md)
- [English SWE-bench config guide](./docs/swe-bench-benchmark-config.en.md)

## Current Status

- The repository includes the reference runtime skeleton, server, Python client, and adapter-oriented migration layout.
- The runtime now includes an OpenAI-compatible LLM integration path with configurable `base_url`, `api_key`, and `model`.
- Runtime prompts, tool descriptions, and experiment-facing interfaces are standardized in English for stability.
- Chinese is retained primarily in documentation and collaboration workflows.
- Integrated adapter packages now include `claude-code-sourcemap`, `goose`, `ii-agent`, `pi-mono`, `opencode`, `cline`, and `openhands`.
- `agent_runtime_design.md` has been restored against `agent_runtime_design_raw.md` as the authoritative raw design reference.
- The runtime core, HTTP server contract, and Python client/eval layer are being realigned with the original design, with dedicated regression coverage now in the repository.
- SWE-bench Verified is now integrated in-repo:
  - the run phase is orchestrated through `benchmark/swe_bench_verified/`
  - the evaluation phase calls the official `swebench` harness
  - the repository includes `verified_smoke.txt` / `verified_smoke.jsonl` for smoke regression

## Latest Progress

- Added runtime-core alignment tests and server contract tests.
- Realigned the public `/run`, `/health`, and `/registry` contracts to the original design baseline while keeping internal adapter extensibility.
- Brought the Python client, type definitions, ablation script, and SWE runner skeleton closer to the original design contract.
- Added benchmark-focused runtime hardening, including workspace-scoped tools, OpenAI-compatible request handling, context compaction, and repeated-action suppression.
- Added repo-local SWE-bench Verified smoke subsets, official harness invocation, and benchmark result aggregation.

## Migration Principles

- `runtime/` should stay agent-agnostic and avoid source-agent-specific coupling.
- Each source agent should migrate independently under `packages/agents/<agent-name>/` to enable parallel workstreams.
- Shared capabilities should be introduced through interfaces and registries instead of patching the runtime loop directly.
