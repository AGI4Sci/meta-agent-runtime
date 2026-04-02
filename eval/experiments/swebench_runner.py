from datasets import load_dataset

from agent_runtime_client import AgentRuntimeClient, LLMConfig, RunRequest, RuntimeConfig


def run_swebench(
    split: str = "verified",
    prompt_builder: str = "react",
    max_tasks: int | None = None,
    budget_token: int = 100_000,
):
    dataset = load_dataset("princeton-nlp/SWE-bench_Verified", split=split)
    if max_tasks:
        dataset = dataset.select(range(max_tasks))

    with AgentRuntimeClient(timeout=900.0) as client:
        for task in dataset:
            result = client.run(
                RunRequest(
                    task=task["problem_statement"],
                    llm=LLMConfig(provider="anthropic", model="claude-opus-4-5"),
                    prompt_builder=prompt_builder,
                    config=RuntimeConfig(budget_token=budget_token),
                )
            )
            yield task["instance_id"], result

