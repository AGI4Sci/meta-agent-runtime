from __future__ import annotations

from pathlib import Path

try:
    from agent_runtime_client import AgentRuntimeClient, ContextStrategyConfig, LLMConfig, RunRequest, RuntimeConfig
    from agent_runtime_client.types import PromptBuilderName
except ModuleNotFoundError:  # pragma: no cover - script entry fallback
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from agent_runtime_client import AgentRuntimeClient, ContextStrategyConfig, LLMConfig, RunRequest, RuntimeConfig
    from agent_runtime_client.types import PromptBuilderName


def load_swebench_dataset(split: str):
    try:
        from datasets import load_dataset
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise ImportError("datasets is required to run SWE-bench experiments") from exc

    return load_dataset("SWE-bench/SWE-bench_Verified", split=split)


def run_swebench(
    split: str = "test",
    prompt_builder: PromptBuilderName = "swe_agent",
    action_parser: str = "json",
    context_strategy: str = "sliding_window",
    tools: str = "swe",
    max_tasks: int | None = None,
    budget_token: int = 100_000,
):
    dataset = load_swebench_dataset(split)
    if max_tasks is not None:
        dataset = dataset.select(range(max_tasks))

    with AgentRuntimeClient(timeout=900.0) as client:
        for task in dataset:
            result = client.run(
                RunRequest(
                    task=task["problem_statement"],
                    llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
                    prompt_builder=prompt_builder,
                    action_parser=action_parser,
                    context_strategy=ContextStrategyConfig(name=context_strategy, max_tokens=8000),
                    tools=tools,
                    config=RuntimeConfig(budget_token=budget_token),
                )
            )
            yield task["instance_id"], result
