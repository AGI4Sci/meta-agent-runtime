# SWE-bench Benchmark 配置指南

## 概述

本文档详细介绍如何在 Meta Agent Runtime 项目中配置和运行 SWE-bench Verified 基准测试，用于评估代码代理在软件工程任务上的性能。

## 环境要求

- **操作系统**：macOS
- **Python**：3.10+（推荐使用 Homebrew 安装 `python@3.10`）
- **Node.js**：18+（用于运行时服务器）
- **Git**：用于克隆仓库

## 项目结构

确保仓库目录结构如下：

```
<repo-root>/
├── runtime/          # TypeScript 运行时服务器
├── eval/             # Python 客户端和实验工具
├── benchmark/
│   └── swe_bench_verified/  # Benchmark 评估工具
│       ├── third_party/swebench/  # 内聚后的官方 harness 源码
│       └── datasets/              # 仓库内 smoke 子集
├── packages/         # 代理适配器
└── docs/             # 文档目录
```

## 安装步骤

### 1. Python 环境配置

```bash
# 安装 Python 3.10
brew install python@3.10

# 验证安装
python3.10 --version  # 应显示 3.10.x
```

### 2. 安装运行时服务器依赖

```bash
cd runtime

# 安装 Node.js 依赖
npm install

# 构建 TypeScript 代码
npm run build
```

### 3. 安装 Python 包

```bash
# 安装评估客户端
cd eval
python3.10 -m pip install -e .

# 安装 Benchmark 工具
cd ../benchmark/swe_bench_verified
python3.10 -m pip install -e .
```

## 运行配置

### 启动运行时服务器

```bash
# 在仓库根目录启动服务器
cd runtime
npm run start
```

**验证服务器运行**：
- 访问 `http://localhost:3282/health` 检查健康状态
- 默认端口：3282
- 如果端口冲突，可通过 `RUNTIME_PORT=33282 npm run start` 改用其他端口
- 一旦修改端口，benchmark 命令也需要同步传入 `--runtime-url http://127.0.0.1:33282`

### 运行 Benchmark 测试

日常回归建议优先使用仓库内置的小子集清单，而不是直接跑全量 Verified。
当前仓库内置了 [benchmark/swe_bench_verified/datasets/verified_smoke.txt](../benchmark/swe_bench_verified/datasets/verified_smoke.txt) 作为 smoke 子集。
如果希望完全使用仓库内的本地样本数据而不依赖 HuggingFace，可改用 [benchmark/swe_bench_verified/datasets/verified_smoke.jsonl](../benchmark/swe_bench_verified/datasets/verified_smoke.jsonl)。

推荐按两阶段顺序运行：

1. 先用 `--dataset-path ... --skip-evaluation` 验证 runtime、agent、LLM 接入是否正常
2. 再去掉 `--skip-evaluation`，进入官方 SWE-bench harness 评测

#### 基本测试（推荐首次运行）

```bash
cd <repo-root>/benchmark/swe_bench_verified

# 运行单个实例测试
python3.10 __main__.py \
  --instance-ids-file ./datasets/verified_smoke.txt \
  --max-instances 1
```

#### 本地数据集模式

```bash
cd <repo-root>/benchmark/swe_bench_verified

# 仅验证 agent 生成 patch 的链路，不进入官方评测
python3.10 __main__.py \
  --dataset-path ./datasets/verified_smoke.jsonl \
  --max-instances 1 \
  --skip-evaluation
```

#### 完整评估

```bash
# 使用默认配置运行所有实例
python3.10 __main__.py

# 自定义配置示例
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

## 配置参数说明

### 命令行参数

- `--runtime-url`：运行时服务器地址（默认：`http://localhost:3282`）
- `--prompt-builder`：提示构建器类型
  - `swe_agent`：SWE-agent 专用
  - `react`：ReAct 推理
  - `minimal`：最小化提示
- `--model`：LLM 模型名称（如 `claude-sonnet-4-6`）
- `--provider`：LLM 提供商（`anthropic`、`openai`、`local`）
- `--max-instances`：最大测试实例数（用于调试）
- `--instance-ids`：指定测试实例 ID（空格分隔）
- `--instance-ids-file`：从文件加载实例 ID 列表，适合仓库内置固定子集
- `--dataset-path`：从本地 `json/jsonl` 文件加载实例数据，绕过 HuggingFace 数据集下载
- `--budget-token`：令牌预算限制
- `--budget-time-ms`：时间预算（毫秒）
- `--output-dir`：输出目录（默认：`benchmark_runs`）
- `--skip-evaluation`：只运行 agent 生成预测结果，不调用官方 SWE-bench harness

### 运行阶段说明

当前 benchmark 分为两个阶段：

1. **Run 阶段**
   - 读取实例数据
   - 准备 workspace
   - 调 runtime `/run`
   - 生成 `predictions.jsonl` 和 `predictions.json`

2. **Evaluation 阶段**
   - 在未设置 `--skip-evaluation` 时自动执行
   - 调用官方 `swebench.harness.run_evaluation`
   - 需要 Docker 正常运行
   - 需要官方 SWE-bench Verified 数据集元数据可访问

注意：
- 即使 run 阶段使用 `--dataset-path` 走本地样本，evaluation 阶段仍会按官方 Verified 数据集和 harness 逻辑执行
- 因此 `--dataset-path` 只解决“生成 patch”阶段对 HuggingFace 下载的依赖，不代表官方评测阶段完全离线

### 代理配置

项目支持多个代理，但通常需要成组指定 `--prompt-builder`、`--action-parser`、`--context-strategy`、`--tools`。
请以运行时 `/registry` 返回值为准，不要直接使用文档里的 agent 目录名。

- `swe_agent`：内置 SWE-agent 风格 prompt builder
- `goose`：`prompt_builder/action_parser/context_strategy` 可使用 `goose`
- `cline`：`prompt_builder/action_parser/context_strategy` 使用 `cline`，tool preset 使用 `cline_minimal`
- `ii-agent`：registry key 为 `ii_agent`
- `opencode`：registry key 为 `opencode`
- `openhands`：registry key 为 `openhands`，tool preset 使用 `openhands_minimal`
- `pi-mono`：registry key 为 `pi_mono`，tool preset 使用 `pi_mono_coding` 或 `pi_mono_readonly`
- `claude-code-sourcemap`：registry key 为 `claude_code_sourcemap`

示例：

```bash
python3.10 __main__.py \
  --prompt-builder goose \
  --action-parser goose \
  --context-strategy goose \
  --tools goose \
  --max-instances 1
```

## 输出和结果分析

### 输出结构

测试完成后，结果保存在 `benchmark_runs/` 目录：

```
benchmark_runs/
├── YYYYMMDD_HHMMSS/
│   ├── predictions.jsonl     # 运行阶段逐条追加写入的预测结果
│   ├── predictions.json      # 调用 harness 前生成的 JSON 列表副本
│   ├── instance_logs/        # 每个实例的详细日志
│   ├── selected_instances.json
│   ├── runtime_registry.json
│   ├── resolved_run_config.json
│   ├── summary.json          # benchmark 汇总结果
│   └── logs/
│       └── run_evaluation/   # SWE-bench harness 日志
```

### 评估指标

- **Resolved**：官方 harness 判定为修复成功的实例数
- **Unresolved**：官方 harness 判定为未修复的实例数
- **Empty patch**：agent 没有产出 patch 的实例数
- **Errors**：运行或评测阶段报错的实例数

### 查看结果

```bash
# 查看最终汇总
cat benchmark_runs/*/summary.json

# 查看官方评测报告
cat benchmark_runs/*/logs/run_evaluation/*/*/report.json

# 查看 agent 运行日志
ls benchmark_runs/*/instance_logs/
```

## 故障排除

### 常见问题

1. **Python 版本错误**
   ```
   错误：Python 3.9 not in '>=3.10'
   ```
   **解决**：使用 `python3.10` 而不是 `python3`

2. **服务器启动失败**
   ```
   Error: Cannot find module
   ```
   **解决**：确保从仓库根目录或 `runtime/` 目录按文档命令启动

3. **依赖安装失败**
   ```
   ERROR: Package requires different Python
   ```
   **解决**：升级 pip 或使用 `python3.10 -m pip`

4. **LLM API 错误**
   ```
   AuthenticationError
   ```
   **解决**：设置环境变量，如 `export ANTHROPIC_API_KEY=your_key`

5. **端口冲突**
   ```
   EADDRINUSE
   ```
   **解决**：更改端口或停止其他服务；例如使用 `RUNTIME_PORT=33282 npm run start`，并在 benchmark 中同步传 `--runtime-url`

6. **Evaluation 阶段失败**
   ```
   docker.errors.DockerException
   ```
   **解决**：确认 Docker Desktop 已启动，并且 `docker version`、`docker ps` 能正常返回

7. **Harness 元数据下载失败**
   ```
   hf-mirror.com / HuggingFace 相关错误
   ```
   **解决**：检查 `HF_ENDPOINT` 等环境变量；evaluation 阶段仍会访问官方 Verified 数据集元数据

### 调试技巧

- 使用 `--max-instances 1` 进行单实例测试
- 优先配合 `--instance-ids-file ./datasets/verified_smoke.txt` 做仓库内 smoke 回归
- 若只想验证 runtime 与 agent 流程，可使用 `--dataset-path ./datasets/verified_smoke.jsonl --skip-evaluation`
- 若要查看服务器日志，直接在前台运行 `npm run start`，或将输出重定向到日志文件后再 `tail -f`
- 查看详细错误：添加 `--verbose` 参数（如果支持）

## 高级配置

### 自定义代理

要添加新代理：

1. 在 `packages/agents/` 下创建新目录
2. 实现 `actionParser.ts`、`contextStrategy.ts`、`promptBuilder.ts`、`toolPreset.ts`
3. 在 `runtime/src/server/agentRegistry.ts` 中注册
4. 重启服务器

### 环境变量

```bash
# Anthropic API
export ANTHROPIC_API_KEY=your_key_here

# OpenAI API
export OPENAI_API_KEY=your_key_here

# 本地模型
export LOCAL_MODEL_PATH=/path/to/model
```

### 性能优化

- 使用 `--max-workers` 并行运行（SWE-bench harness 参数）
- 调整 `--budget-token` 和 `--budget-time-ms` 控制资源使用
- 使用 `--cache-level env` 启用环境缓存

## 参考资料

- [Meta Agent Runtime README](../README.md)
- [SWE-bench 官方文档](https://github.com/SWE-bench/SWE-bench)
- [Agent Runtime 设计文档](../agent_runtime_design.md)

## 接入边界说明

- 仓库内已经内置“固定子集接入”能力，适合日常 smoke benchmark。
- `--dataset-path` 允许直接使用仓库内本地子集数据跑通 agent 执行链路。
- 若要跑官方完整 Verified 评测，仍需要外部依赖：HuggingFace 数据集、Docker、运行中的 runtime server 和可用模型凭据。
- 官方 `swebench` harness 源码现在内聚在 `benchmark/swe_bench_verified/third_party/swebench/` 下，不再单独占据 `benchmark/` 顶层目录。

## 更新日志

- 2026-04-02：初始版本，支持 SWE-bench Verified 评估
