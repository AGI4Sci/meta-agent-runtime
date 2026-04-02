# Meta Agent Runtime

Reference runtime for controlled code-agent ablation studies.

## Layout

- `runtime/`: TypeScript reference runtime and HTTP server
- `eval/`: Python client and experiment helpers
- `packages/agents/`: per-agent migration adapters for parallel porting
- `docs/`: migration and platform notes

## Design goals

- Stable core loop with explicit module boundaries
- Parallel, modular migration path for different code agents
- Registry-driven composition for prompt/context/parser/tool variants
- Experiment-friendly observability and replay hooks

## Quick start

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

