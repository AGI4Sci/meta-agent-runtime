# SWE-bench Benchmark Configuration Guide

## Overview

This document provides detailed instructions for configuring and running SWE-bench Verified benchmarks in the Meta Agent Runtime project to evaluate code agent performance on software engineering tasks.

## Environment Requirements

- **Operating System**: macOS
- **Python**: 3.10+ (recommended: install `python@3.10` via Homebrew)
- **Node.js**: 18+ (for runtime server)
- **Git**: for cloning repositories

## Project Structure

Ensure the repository directory structure is as follows:

```
<repo-root>/
├── runtime/          # TypeScript runtime server
├── eval/             # Python client and experiment tools
├── benchmark/
│   └── swe_bench_verified/  # Benchmark evaluation tool
│       ├── third_party/swebench/  # Co-located official harness source
│       └── datasets/              # Repo-local smoke subsets
├── packages/         # Agent adapters
└── docs/             # Documentation directory
```

## Installation Steps

### 1. Python Environment Setup

```bash
# Install Python 3.10
brew install python@3.10

# Verify installation
python3.10 --version  # Should show 3.10.x
```

### 2. Install Runtime Server Dependencies

```bash
cd runtime

# Install Node.js dependencies
npm install

# Build TypeScript code
npm run build
```

### 3. Install Python Packages

```bash
# Install evaluation client
cd eval
python3.10 -m pip install -e .

# Install Benchmark tool
cd ../benchmark/swe_bench_verified
python3.10 -m pip install -e .
```

## Runtime Configuration

### Start Runtime Server

```bash
# Start the server from the repository root
cd runtime
npm run start
```

**Verify server is running**:
- Visit `http://localhost:3282/health` to check health status
- Default port: 3282
- If the port is already in use, start on another port such as `RUNTIME_PORT=33282 npm run start`
- If you override the port, also pass the matching `--runtime-url http://127.0.0.1:33282` to the benchmark command

### Run Benchmark Tests

For day-to-day regression, prefer the repo-managed small subset instead of running the full Verified split.
The repository currently includes [benchmark/swe_bench_verified/datasets/verified_smoke.txt](../benchmark/swe_bench_verified/datasets/verified_smoke.txt) as a smoke subset.
If you want to stay fully inside repo-local sample data without depending on HuggingFace, use [benchmark/swe_bench_verified/datasets/verified_smoke.jsonl](../benchmark/swe_bench_verified/datasets/verified_smoke.jsonl).

Recommended execution order:

1. First run with `--dataset-path ... --skip-evaluation` to validate the runtime, agent, and LLM integration path
2. Then remove `--skip-evaluation` to enter the official SWE-bench harness evaluation phase

#### Basic Test (Recommended for First Run)

```bash
cd <repo-root>/benchmark/swe_bench_verified

# Run single instance test
python3.10 __main__.py \
  --instance-ids-file ./datasets/verified_smoke.txt \
  --max-instances 1
```

#### Local Dataset Mode

```bash
cd <repo-root>/benchmark/swe_bench_verified

# Validate only the agent-to-prediction path and skip official evaluation
python3.10 __main__.py \
  --dataset-path ./datasets/verified_smoke.jsonl \
  --max-instances 1 \
  --skip-evaluation
```

#### Full Evaluation

```bash
# Run all instances with default config
python3.10 __main__.py

# Custom configuration example
python3.10 __main__.py \
  --runtime-url http://localhost:3282 \
  --prompt-builder swe_agent \
  --action-parser json \
  --context-strategy sliding_window \
  --tools swe \
  --model claude-sonnet-4-6 \
  --max-instances 10 \
  --budget-token 150000
```

## Configuration Parameters

### Command Line Arguments

- `--runtime-url`: Runtime server URL (default: `http://localhost:3282`)
- `--prompt-builder`: Prompt builder type
  - `swe_agent`: SWE-agent specific
  - `react`: ReAct reasoning
  - `minimal`: Minimal prompting
- `--model`: LLM model name (e.g., `claude-sonnet-4-6`)
- `--provider`: LLM provider (`anthropic`, `openai`, `local`)
- `--max-instances`: Maximum number of test instances (for debugging)
- `--instance-ids`: Specify test instance IDs (space-separated)
- `--instance-ids-file`: Load a fixed list of instance IDs from a file
- `--dataset-path`: Load instance data from a local `json/jsonl` file and bypass HuggingFace dataset download
- `--budget-token`: Token budget limit
- `--budget-time-ms`: Time budget (milliseconds)
- `--output-dir`: Output directory (default: `benchmark_runs`)
- `--skip-evaluation`: Run only the agent/prediction phase and skip the official SWE-bench harness

### Execution Phases

The current benchmark flow has two phases:

1. **Run phase**
   - Load instance data
   - Prepare the workspace
   - Call runtime `/run`
   - Write `predictions.jsonl` and `predictions.json`

2. **Evaluation phase**
   - Runs automatically unless `--skip-evaluation` is set
   - Calls the official `swebench.harness.run_evaluation`
   - Requires a working Docker daemon
   - Still requires access to official SWE-bench Verified dataset metadata

Notes:
- Even if the run phase uses `--dataset-path` with repo-local sample data, the evaluation phase still follows the official Verified dataset and harness logic
- In other words, `--dataset-path` removes HuggingFace dependency from the patch-generation phase only; it does not make the official evaluation phase fully offline

### Agent Configuration

The project supports multiple agents, but adapter runs usually require a matching set of
`--prompt-builder`, `--action-parser`, `--context-strategy`, and `--tools`.
Treat the runtime `/registry` response as the source of truth rather than the adapter directory name.

- `swe_agent`: built-in SWE-agent-style prompt builder
- `goose`: use `goose` for `prompt_builder` / `action_parser` / `context_strategy`
- `cline`: use `cline` for `prompt_builder` / `action_parser` / `context_strategy`, and `cline_minimal` for tools
- `ii-agent`: registry key is `ii_agent`
- `opencode`: registry key is `opencode`
- `openhands`: registry key is `openhands`, tool preset is `openhands_minimal`
- `pi-mono`: registry key is `pi_mono`, tool preset is `pi_mono_coding` or `pi_mono_readonly`
- `claude-code-sourcemap`: registry key is `claude_code_sourcemap`

Example:

```bash
python3.10 __main__.py \
  --prompt-builder goose \
  --action-parser goose \
  --context-strategy goose \
  --tools goose \
  --max-instances 1
```

## Output and Result Analysis

### Output Structure

After testing, results are saved in the `benchmark_runs/` directory:

```
benchmark_runs/
├── YYYYMMDD_HHMMSS/
│   ├── predictions.jsonl     # Incrementally appended predictions from the run phase
│   ├── predictions.json      # JSON list copy generated before invoking the harness
│   ├── instance_logs/        # Detailed logs per instance
│   ├── selected_instances.json
│   ├── runtime_registry.json
│   ├── resolved_run_config.json
│   ├── summary.json          # Benchmark-level summary
│   └── logs/
│       └── run_evaluation/   # SWE-bench harness logs
```

### Evaluation Metrics

- **Resolved**: Number of instances the official harness marks as fixed
- **Unresolved**: Number of instances the official harness marks as not fixed
- **Empty patch**: Number of instances where the agent produced no patch
- **Errors**: Number of instances that failed during run or evaluation

### View Results

```bash
# View benchmark summary
cat benchmark_runs/*/summary.json

# View official evaluation report
cat benchmark_runs/*/logs/run_evaluation/*/*/report.json

# View agent execution logs
ls benchmark_runs/*/instance_logs/
```

## Troubleshooting

### Common Issues

1. **Python Version Error**
   ```
   Error: Python 3.9 not in '>=3.10'
   ```
   **Solution**: Use `python3.10` instead of `python3`

2. **Server Startup Failure**
   ```
   Error: Cannot find module
   ```
   **Solution**: Run from the repository root or from `runtime/` using the documented command

3. **Dependency Installation Failure**
   ```
   ERROR: Package requires different Python
   ```
   **Solution**: Upgrade pip or use `python3.10 -m pip`

4. **LLM API Error**
   ```
   AuthenticationError
   ```
   **Solution**: Set environment variables like `export ANTHROPIC_API_KEY=your_key`

5. **Port Conflict**
   ```
   EADDRINUSE
   ```
   **Solution**: Change the runtime port or stop other services; for example use `RUNTIME_PORT=33282 npm run start` and pass the matching `--runtime-url`

6. **Evaluation Phase Failure**
   ```
   docker.errors.DockerException
   ```
   **Solution**: Make sure Docker Desktop is running and both `docker version` and `docker ps` succeed

7. **Harness Metadata Download Failure**
   ```
   hf-mirror.com / HuggingFace related errors
   ```
   **Solution**: Check `HF_ENDPOINT` and related environment variables; the evaluation phase still fetches official Verified dataset metadata

### Debugging Tips

- Use `--max-instances 1` for single instance testing
- Prefer combining it with `--instance-ids-file ./datasets/verified_smoke.txt` for repo-local smoke regression
- If you only want to validate the runtime and agent execution path, use `--dataset-path ./datasets/verified_smoke.jsonl --skip-evaluation`
- To inspect server logs, run `npm run start` in the foreground or redirect output to a log file and `tail -f` that file
- View detailed errors: add `--verbose` flag (if supported)

## Advanced Configuration

### Custom Agent

To add a new agent:

1. Create new directory under `packages/agents/`
2. Implement `actionParser.ts`, `contextStrategy.ts`, `promptBuilder.ts`, `toolPreset.ts`
3. Register in `runtime/src/server/agentRegistry.ts`
4. Restart server

### Environment Variables

```bash
# Anthropic API
export ANTHROPIC_API_KEY=your_key_here

# OpenAI API
export OPENAI_API_KEY=your_key_here

# Local model
export LOCAL_MODEL_PATH=/path/to/model
```

### Performance Optimization

- Use `--max-workers` for parallel execution (SWE-bench harness parameter)
- Adjust `--budget-token` and `--budget-time-ms` to control resource usage
- Use `--cache-level env` to enable environment caching

## References

- [Meta Agent Runtime README](../README.md)
- [SWE-bench Official Documentation](https://github.com/SWE-bench/SWE-bench)
- [Agent Runtime Design Document](../agent_runtime_design.en.md)

## Integration Boundary

- The repository now includes a fixed-subset integration path suitable for day-to-day smoke benchmarking.
- `--dataset-path` allows running directly against repo-local subset data for the agent execution path.
- Running the official full Verified evaluation still requires external dependencies: the HuggingFace dataset, Docker, a running runtime server, and valid model credentials.
- The official `swebench` harness source is now co-located under `benchmark/swe_bench_verified/third_party/swebench/` instead of living at the top level of `benchmark/`.

## Changelog

- 2026-04-02: Initial version, supports SWE-bench Verified evaluation
