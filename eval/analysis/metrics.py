import json
from pathlib import Path


def load_step_logs(log_dir: Path, experiment_id: str) -> list[dict]:
    log_file = log_dir / f"{experiment_id}_steps.jsonl"
    with log_file.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle]


def compute_metrics(results_jsonl: Path) -> dict:
    with results_jsonl.open(encoding="utf-8") as handle:
        results = [json.loads(line) for line in handle]

    total = len(results)
    succeeded = sum(1 for item in results if item["success"])
    return {
        "success_rate": succeeded / total if total else 0.0,
        "avg_token_in": sum(item["total_token_in"] for item in results) / total if total else 0.0,
        "avg_token_out": sum(item["total_token_out"] for item in results) / total if total else 0.0,
        "avg_elapsed_ms": sum(item["total_elapsed_ms"] for item in results) / total if total else 0.0,
    }

