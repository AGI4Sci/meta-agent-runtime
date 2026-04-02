import itertools
import json
from pathlib import Path

from agent_runtime_client import AgentRuntimeClient, ContextStrategyConfig, LLMConfig, RunRequest, RuntimeConfig

TASKS = []
PROMPT_BUILDERS = ["react", "cot", "minimal"]
CONTEXT_STRATEGIES = [
    ContextStrategyConfig(name="noop"),
    ContextStrategyConfig(name="sliding_window", max_tokens=4000),
    ContextStrategyConfig(name="sliding_window", max_tokens=8000),
    ContextStrategyConfig(name="selective"),
]


def run_ablation(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    with AgentRuntimeClient() as client:
        for prompt_builder, context_strategy in itertools.product(PROMPT_BUILDERS, CONTEXT_STRATEGIES):
            experiment_id = f"{prompt_builder}__{context_strategy.name}_{context_strategy.max_tokens}"
            results = []

            for task in TASKS:
                response = client.run(
                    RunRequest(
                        task=task["problem_statement"],
                        llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
                        prompt_builder=prompt_builder,
                        context_strategy=context_strategy,
                        config=RuntimeConfig(budget_token=50_000),
                    )
                )
                results.append(
                    {
                        "task_id": task["instance_id"],
                        "success": response.success,
                        "termination_reason": response.termination_reason,
                        "total_token_in": response.total_token_in,
                        "total_token_out": response.total_token_out,
                        "total_elapsed_ms": response.total_elapsed_ms,
                    }
                )

            out_file = output_dir / f"{experiment_id}.jsonl"
            with out_file.open("w", encoding="utf-8") as handle:
                for item in results:
                    handle.write(json.dumps(item) + "\n")
