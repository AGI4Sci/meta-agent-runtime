from __future__ import annotations

import argparse
import datetime
import json
import sys
from pathlib import Path

from config import BenchmarkConfig, DEFAULT_INSTANCE_IDS_FILE
from runner import run_benchmark
from evaluate import collect_report, invoke_harness, print_summary


def load_instance_ids_file(path: Path) -> list[str]:
    text = path.read_text().strip()
    if not text:
        return []
    if path.suffix.lower() == ".json":
        data = json.loads(text)
        if not isinstance(data, list) or not all(isinstance(item, str) for item in data):
            raise ValueError("--instance-ids-file JSON must contain a list of strings")
        return list(data)
    return [line.strip() for line in text.splitlines() if line.strip() and not line.strip().startswith("#")]


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m benchmark",
        description="Run SWE-bench Verified evaluation against the meta-agent-runtime.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )

    # Dataset
    g = p.add_argument_group("dataset")
    g.add_argument(
        "--dataset-name",
        default="SWE-bench/SWE-bench_Verified",
        help="HuggingFace dataset name",
    )
    g.add_argument(
        "--dataset-path",
        type=Path,
        default=None,
        help="Path to a local dataset file in JSON or JSONL format",
    )
    g.add_argument("--split", default="test", help="Dataset split")
    g.add_argument(
        "--instance-ids",
        nargs="+",
        default=[],
        metavar="ID",
        help="Evaluate only these instance IDs (default: all)",
    )
    g.add_argument(
        "--instance-ids-file",
        type=Path,
        default=None,
        help=(
            "Path to a newline-delimited or JSON list file of instance IDs. "
            f"Useful for a repo-managed subset such as {DEFAULT_INSTANCE_IDS_FILE.name}."
        ),
    )
    g.add_argument(
        "--max-instances",
        type=int,
        default=None,
        help="Cap the number of instances (useful for smoke tests)",
    )
    g.add_argument(
        "--workspace-cache-dir",
        type=Path,
        default=DEFAULT_INSTANCE_IDS_FILE.resolve().parent.parent / "workspace_cache",
        help="Directory used to materialize repository workspaces for benchmark instances",
    )

    # Runtime
    g = p.add_argument_group("runtime")
    g.add_argument(
        "--runtime-url",
        default="http://localhost:3282",
        help="meta-agent-runtime server URL",
    )
    g.add_argument(
        "--prompt-builder",
        default="swe_agent",
        help="Runtime prompt builder name. Must be supported by /registry.",
    )
    g.add_argument(
        "--action-parser",
        default="json",
        help="Runtime action parser name. Must be supported by /registry.",
    )
    g.add_argument(
        "--tools",
        default="swe",
        help=(
            'Tool preset exposed by /run. Use any registered preset name from /registry, '
            'or use "custom" together with --runtime-tools-preset.'
        ),
    )
    g.add_argument(
        "--context-strategy",
        default="sliding_window",
        help="Runtime context strategy name. Must be supported by /registry.",
    )
    g.add_argument("--context-max-tokens", type=int, default=8000)
    g.add_argument(
        "--runtime-tools-preset",
        default=None,
        help='When --tools=custom, export RUNTIME_TOOLS_PRESET=<value> for the runtime server before running this benchmark.',
    )

    # LLM
    g = p.add_argument_group("llm")
    g.add_argument(
        "--provider",
        default="anthropic",
        choices=["anthropic", "openai", "local"],
    )
    g.add_argument("--model", default="claude-sonnet-4-6")
    g.add_argument("--api-key", default=None, help="LLM API key (default: from env)")
    g.add_argument(
        "--base-url",
        default=None,
        help="Base URL for provider=openai/local backends when the runtime supports it.",
    )

    # Budget
    g = p.add_argument_group("budget")
    g.add_argument("--max-steps", type=int, default=50)
    g.add_argument(
        "--budget-token",
        type=int,
        default=150_000,
        help="Token budget per instance (0 = no limit)",
    )
    g.add_argument(
        "--budget-time-ms",
        type=int,
        default=None,
        help="Wall-clock budget per instance in milliseconds",
    )

    # Output
    g = p.add_argument_group("output")
    g.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./benchmark_runs"),
        help="Base directory for run outputs",
    )
    g.add_argument(
        "--run-id",
        default="",
        help="Run identifier (default: auto timestamp)",
    )
    g.add_argument(
        "--no-resume",
        action="store_true",
        help="Ignore existing predictions and restart from scratch",
    )

    # Evaluation
    g = p.add_argument_group("evaluation")
    g.add_argument(
        "--skip-evaluation",
        action="store_true",
        help="Collect predictions only; do not invoke the SWE-bench harness",
    )
    g.add_argument(
        "--harness-workers",
        type=int,
        default=4,
        help="Parallel workers for harness Docker evaluation",
    )
    g.add_argument(
        "--harness-timeout",
        type=int,
        default=1800,
        help="Seconds per instance in the harness Docker container",
    )

    return p


def main(argv=None) -> None:
    args = build_parser().parse_args(argv)
    instance_ids = list(args.instance_ids)
    if args.instance_ids_file is not None:
        instance_ids.extend(load_instance_ids_file(args.instance_ids_file))
    instance_ids = list(dict.fromkeys(instance_ids))

    run_id = args.run_id or datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = args.output_dir / run_id

    budget_token = args.budget_token if args.budget_token > 0 else None

    config = BenchmarkConfig(
        output_dir=output_dir,
        run_id=run_id,
        dataset_name=args.dataset_name,
        dataset_path=args.dataset_path,
        split=args.split,
        instance_ids=instance_ids,
        instance_ids_file=args.instance_ids_file,
        max_instances=args.max_instances,
        workspace_cache_dir=args.workspace_cache_dir,
        runtime_url=args.runtime_url,
        prompt_builder=args.prompt_builder,
        action_parser=args.action_parser,
        tools=args.tools,
        context_strategy=args.context_strategy,
        context_max_tokens=args.context_max_tokens,
        runtime_tools_preset=args.runtime_tools_preset,
        provider=args.provider,
        model=args.model,
        api_key=args.api_key,
        base_url=args.base_url,
        max_steps=args.max_steps,
        budget_token=budget_token,
        budget_time_ms=args.budget_time_ms,
        skip_evaluation=args.skip_evaluation,
        harness_max_workers=args.harness_workers,
        harness_timeout=args.harness_timeout,
        resume=not args.no_resume,
    )

    print(f"Run ID    : {run_id}")
    print(f"Output dir: {output_dir}")
    print(f"Model     : {config.provider}/{config.model}")
    if config.dataset_path is not None:
        print(f"Dataset path: {config.dataset_path}")
    if config.instance_ids_file is not None:
        print(f"Instance IDs file: {config.instance_ids_file}")
    print()

    # Phase 1: run the agent on all instances
    run_benchmark(config)

    # Phase 2: evaluate with the SWE-bench harness (unless skipped)
    if not config.skip_evaluation:
        invoke_harness(config)
        report = collect_report(config)
        print_summary(report)

        report_path = output_dir / "summary.json"
        report_path.write_text(json.dumps(report, indent=2))
        print(f"\nFull report written to: {report_path}")
    else:
        pred_path = output_dir / "predictions.jsonl"
        print(f"\nPredictions written to: {pred_path}")
        print("Re-run without --skip-evaluation to invoke the harness.")


if __name__ == "__main__":
    main()
