from __future__ import annotations

import itertools
import json
from pathlib import Path
from typing import Any, Iterable

try:
    from agent_runtime_client import (
        AgentRuntimeClient,
        ContextStrategyConfig,
        LLMConfig,
        RunRequest,
        RuntimeConfig,
    )
except ModuleNotFoundError:  # pragma: no cover - script entry fallback
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from agent_runtime_client import (
        AgentRuntimeClient,
        ContextStrategyConfig,
        LLMConfig,
        RunRequest,
        RuntimeConfig,
    )

TASKS: list[dict[str, Any]] = []

PROMPT_BUILDERS = ["react", "cot", "minimal"]
CONTEXT_STRATEGIES = [
    ContextStrategyConfig(name="noop"),
    ContextStrategyConfig(name="sliding_window", max_tokens=4000),
    ContextStrategyConfig(name="sliding_window", max_tokens=8000),
    ContextStrategyConfig(name="selective"),
]

def run_ablation(
    output_dir: Path,
    tasks: Iterable[dict[str, Any]] | None = None,
    model: str = "claude-opus-4-5",
    provider: str = "anthropic",
    budget_token: int = 50_000,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    task_list = list(TASKS if tasks is None else tasks)

    with AgentRuntimeClient() as client:
        for prompt_builder, context_strategy in itertools.product(PROMPT_BUILDERS, CONTEXT_STRATEGIES):
            max_tokens = context_strategy.max_tokens if context_strategy.max_tokens is not None else "none"
            experiment_id = f"{prompt_builder}__{context_strategy.name}_{max_tokens}"
            results: list[dict[str, Any]] = []

            for task in task_list:
                resp = client.run(
                    RunRequest(
                        task=task["problem_statement"],
                        llm=LLMConfig(provider=provider, model=model),
                        prompt_builder=prompt_builder,
                        context_strategy=context_strategy,
                        config=RuntimeConfig(budget_token=budget_token),
                    )
                )
                results.append(
                    {
                        "task_id": task["instance_id"],
                        "success": resp.success,
                        "termination_reason": resp.termination_reason,
                        "total_token_in": resp.total_token_in,
                        "total_token_out": resp.total_token_out,
                        "total_elapsed_ms": resp.total_elapsed_ms,
                    }
                )

            out_file = output_dir / f"{experiment_id}.jsonl"
            with out_file.open("w", encoding="utf-8") as handle:
                for result in results:
                    handle.write(json.dumps(result, ensure_ascii=False) + "\n")

            if results:
                success_rate = sum(result["success"] for result in results) / len(results)
                avg_tokens = sum(result["total_token_in"] + result["total_token_out"] for result in results) / len(results)
                print(f"{experiment_id}: success={success_rate:.2%}, avg_tokens={avg_tokens:.0f}")
            else:
                print(f"{experiment_id}: no tasks")
