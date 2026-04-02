import json
import tempfile
import unittest
from pathlib import Path

from cli import load_instance_ids_file
from config import BenchmarkConfig
from evaluate import collect_report
from predictions import load_predictions, predictions_to_json, save_prediction
from runner import load_dataset_instances, load_local_dataset, normalize_patch


class BenchmarkPipelineTests(unittest.TestCase):
    def test_load_local_dataset_supports_jsonl(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "subset.jsonl"
            path.write_text(
                '\n'.join(
                    [
                        json.dumps(
                            {
                                "instance_id": "sympy__sympy-20590",
                                "repo": "sympy/sympy",
                                "base_commit": "abc123",
                                "problem_statement": "Fix the parser.",
                            }
                        ),
                        json.dumps(
                            {
                                "instance_id": "astropy__astropy-14539",
                                "repo": "astropy/astropy",
                                "base_commit": "def456",
                                "problem_statement": "Fix the regression.",
                            }
                        ),
                    ]
                )
            )
            rows = load_local_dataset(path)
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]["instance_id"], "sympy__sympy-20590")

    def test_load_dataset_instances_prefers_local_dataset_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "subset.json"
            path.write_text(
                json.dumps(
                    [
                        {
                            "instance_id": "sympy__sympy-20590",
                            "repo": "sympy/sympy",
                            "base_commit": "abc123",
                            "problem_statement": "Fix the parser.",
                        },
                        {
                            "instance_id": "astropy__astropy-14539",
                            "repo": "astropy/astropy",
                            "base_commit": "def456",
                            "problem_statement": "Fix the regression.",
                        },
                    ]
                )
            )
            config = BenchmarkConfig(
                dataset_path=path,
                instance_ids=["astropy__astropy-14539"],
                max_instances=1,
            )
            rows = load_dataset_instances(config)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["instance_id"], "astropy__astropy-14539")

    def test_load_instance_ids_file_supports_text_and_comments(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "subset.txt"
            path.write_text("# comment\nsympy__sympy-20590\n\nastropy__astropy-14539\n")
            self.assertEqual(
                load_instance_ids_file(path),
                ["sympy__sympy-20590", "astropy__astropy-14539"],
            )

    def test_normalize_patch_extracts_diff_from_fenced_finish_result(self) -> None:
        raw = """Done.

```diff
diff --git a/demo.py b/demo.py
--- a/demo.py
+++ b/demo.py
@@ -1 +1 @@
-old
+new
```
"""
        patch = normalize_patch(raw)
        self.assertTrue(patch.startswith("diff --git a/demo.py b/demo.py"))
        self.assertIn("@@ -1 +1 @@", patch)

    def test_predictions_round_trip_writes_jsonl_and_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            save_prediction(output_dir, "instance-1", "anthropic/demo", "diff --git a/x b/x")
            save_prediction(output_dir, "instance-2", "anthropic/demo", "")

            loaded = load_predictions(output_dir)
            self.assertEqual(set(loaded.keys()), {"instance-1", "instance-2"})

            json_path = predictions_to_json(output_dir)
            payload = json.loads(json_path.read_text())
            self.assertEqual(len(payload), 2)
            self.assertEqual(payload[0]["instance_id"], "instance-1")

    def test_collect_report_aggregates_harness_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output_dir = Path(tmp)
            report_root = output_dir / "logs" / "run_evaluation" / "run123" / "anthropic__demo"
            resolved_dir = report_root / "resolved-1"
            unresolved_dir = report_root / "unresolved-1"
            resolved_dir.mkdir(parents=True)
            unresolved_dir.mkdir(parents=True)

            (resolved_dir / "report.json").write_text(
                json.dumps({"resolved-1": {"resolved": True, "patch_exists": True}})
            )
            (unresolved_dir / "report.json").write_text(
                json.dumps({"unresolved-1": {"resolved": False, "patch_exists": False}})
            )

            config = BenchmarkConfig(output_dir=output_dir, run_id="run123", provider="anthropic", model="demo")
            report = collect_report(config)

            self.assertEqual(report["total_evaluated"], 2)
            self.assertEqual(report["resolved"], 1)
            self.assertEqual(report["unresolved"], 1)
            self.assertEqual(report["empty_patch"], 1)


if __name__ == "__main__":
    unittest.main()
