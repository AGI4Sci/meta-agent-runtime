import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from agent_runtime_client.client import AgentRuntimeClient
from agent_runtime_client.types import (
    ContextStrategyConfig,
    LLMConfig,
    RunRequest,
    RunResponse,
    RuntimeConfig,
    validate_registry_payload,
)
from experiments.ablation import run_ablation
from experiments.swebench_runner import run_swebench


def make_client(handler) -> AgentRuntimeClient:
    client = AgentRuntimeClient.__new__(AgentRuntimeClient)
    client._client = httpx.Client(
        base_url="http://testserver",
        timeout=5.0,
        transport=httpx.MockTransport(handler),
    )
    return client


class AgentRuntimeClientTests(unittest.TestCase):
    def test_request_to_dict(self) -> None:
        request = RunRequest(task="x", llm=LLMConfig(provider="local", model="demo"), tools="custom")
        payload = request.to_dict()
        self.assertEqual(payload["task"], "x")
        self.assertEqual(payload["tools"], "custom")

    def test_request_tools_contract_matches_raw_design(self) -> None:
        request = RunRequest(task="x", llm=LLMConfig(provider="local", model="demo"), tools="minimal")
        self.assertEqual(request.tools, "minimal")

    def test_request_tools_supports_custom_preset(self) -> None:
        request = RunRequest(task="x", llm=LLMConfig(provider="local", model="demo"), tools="custom")
        self.assertEqual(request.tools, "custom")

    def test_request_supports_adapter_specific_registry_values(self) -> None:
        request = RunRequest(
            task="x",
            llm=LLMConfig(provider="local", model="demo"),
            prompt_builder="ii_agent",
            action_parser="ii_agent",
            context_strategy=ContextStrategyConfig(name="ii_agent", max_tokens=4096),
            tools="ii_agent",
        )

        payload = request.to_dict()
        self.assertEqual(payload["prompt_builder"], "ii_agent")
        self.assertEqual(payload["action_parser"], "ii_agent")
        self.assertEqual(payload["context_strategy"]["name"], "ii_agent")
        self.assertEqual(payload["tools"], "ii_agent")

    def test_run_response_from_dict_parses_steps(self) -> None:
        response = RunResponse.from_dict(
            {
                "success": True,
                "result": "done",
                "termination_reason": "finish",
                "steps": [
                    {
                        "step": 1,
                        "action_name": "bash",
                        "action_args": {"cmd": "pwd"},
                        "observation_content": "/tmp",
                        "observation_error": None,
                        "token_in": 12,
                        "token_out": 4,
                        "elapsed_ms": 20,
                    }
                ],
                "total_token_in": 12,
                "total_token_out": 4,
                "total_elapsed_ms": 20,
            }
        )

        self.assertEqual(response.result, "done")
        self.assertEqual(response.steps[0].action_name, "bash")

    def test_run_response_from_dict_defaults_steps_to_empty_list(self) -> None:
        response = RunResponse.from_dict(
            {
                "success": True,
                "result": "done",
                "termination_reason": "finish",
                "total_token_in": 0,
                "total_token_out": 0,
                "total_elapsed_ms": 1,
            }
        )

        self.assertEqual(response.steps, [])

    def test_run_response_from_dict_raises_value_error_for_invalid_payload(self) -> None:
        with self.assertRaisesRegex(ValueError, "steps"):
            RunResponse.from_dict({"success": True, "steps": "nope"})

    def test_validate_registry_payload_accepts_raw_contract_shape(self) -> None:
        registry = validate_registry_payload(
            {
                "prompt_builders": ["react"],
                "action_parsers": ["json"],
                "context_strategies": ["sliding_window"],
                "tools": ["swe"],
            }
        )

        self.assertEqual(registry["prompt_builders"], ["react"])

    def test_client_registry_validates_shape(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/health":
                return httpx.Response(200, json={"status": "ok", "version": "0.1.0"})
            if request.url.path == "/registry":
                return httpx.Response(
                    200,
                    json={
                        "prompt_builders": ["react"],
                        "action_parsers": ["json"],
                        "context_strategies": ["sliding_window"],
                        "tools": ["swe"],
                    },
                )
            raise AssertionError(f"unexpected path: {request.url.path}")

        client = make_client(handler)

        try:
            registry = client.registry()
            self.assertEqual(registry["tools"], ["swe"])
        finally:
            client.close()

    def test_client_run_raises_value_error_for_invalid_response_shape(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/health":
                return httpx.Response(200, json={"status": "ok", "version": "0.1.0"})
            if request.url.path == "/run":
                return httpx.Response(200, json={"success": True, "steps": "bad-shape"})
            raise AssertionError(f"unexpected path: {request.url.path}")

        client = make_client(handler)

        try:
            with self.assertRaisesRegex(ValueError, "steps"):
                client.run(RunRequest(task="x", llm=LLMConfig(provider="local", model="demo")))
        finally:
            client.close()

    def test_client_run_raises_value_error_for_non_object_response(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/health":
                return httpx.Response(200, json={"status": "ok", "version": "0.1.0"})
            if request.url.path == "/run":
                return httpx.Response(200, json=["bad-shape"])
            raise AssertionError(f"unexpected path: {request.url.path}")

        client = make_client(handler)

        try:
            with self.assertRaisesRegex(ValueError, "JSON object"):
                client.run(RunRequest(task="x", llm=LLMConfig(provider="local", model="demo")))
        finally:
            client.close()

    def test_client_registry_raises_value_error_for_non_object_response(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            if request.url.path == "/health":
                return httpx.Response(200, json={"status": "ok", "version": "0.1.0"})
            if request.url.path == "/registry":
                return httpx.Response(200, json=["bad-shape"])
            raise AssertionError(f"unexpected path: {request.url.path}")

        client = make_client(handler)

        try:
            with self.assertRaisesRegex(ValueError, "JSON object"):
                client.registry()
        finally:
            client.close()

    def test_client_verify_server_raises_connection_error(self) -> None:
        request = httpx.Request("GET", "http://testserver/health")

        def handler(_: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("boom", request=request)

        mocked_client = httpx.Client(
            base_url="http://testserver",
            timeout=5.0,
            transport=httpx.MockTransport(handler),
        )

        with patch("agent_runtime_client.client.httpx.Client", return_value=mocked_client):
            with self.assertRaises(ConnectionError):
                AgentRuntimeClient(base_url="http://testserver", timeout=5.0)

    def test_run_ablation_writes_jsonl_results(self) -> None:
        class StubClient:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def run(self, request: RunRequest) -> RunResponse:
                return RunResponse(
                    success=True,
                    result=request.task,
                    termination_reason="finish",
                    steps=[],
                    total_token_in=11,
                    total_token_out=7,
                    total_elapsed_ms=20,
                )

        tasks = [
            {"instance_id": "task-1", "problem_statement": "fix one"},
            {"instance_id": "task-2", "problem_statement": "fix two"},
        ]

        with unittest.mock.patch("experiments.ablation.AgentRuntimeClient", return_value=StubClient()):
            with self.subTest("writes files"):
                tmp_dir = Path(self.id().replace(".", "_"))
                if tmp_dir.exists():
                    for file in tmp_dir.glob("*"):
                        file.unlink()
                else:
                    tmp_dir.mkdir(parents=True)
                try:
                    run_ablation(tmp_dir, tasks=tasks, model="demo-model", provider="local", budget_token=99)
                    outputs = sorted(tmp_dir.glob("*.jsonl"))
                    self.assertEqual(len(outputs), 12)
                    lines = outputs[0].read_text(encoding="utf-8").strip().splitlines()
                    self.assertEqual(len(lines), 2)
                    self.assertIn('"task_id": "task-1"', lines[0])
                finally:
                    for file in tmp_dir.glob("*"):
                        file.unlink()
                    tmp_dir.rmdir()

    def test_run_swebench_yields_instance_id_and_result(self) -> None:
        class FakeDataset:
            def __iter__(self):
                return iter(
                    [
                        {"instance_id": "swe-1", "problem_statement": "repair bug"},
                        {"instance_id": "swe-2", "problem_statement": "repair bug 2"},
                    ]
                )

            def select(self, indices):
                items = list(self)
                return items[: len(list(indices))]

        class StubClient:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def run(self, request: RunRequest) -> RunResponse:
                self.last_request = request
                return RunResponse(
                    success=True,
                    result=request.task,
                    termination_reason="finish",
                    steps=[],
                    total_token_in=1,
                    total_token_out=1,
                    total_elapsed_ms=1,
                )

        with patch("experiments.swebench_runner.load_swebench_dataset", return_value=FakeDataset()):
            with patch("experiments.swebench_runner.AgentRuntimeClient", StubClient):
                results = list(run_swebench(max_tasks=1))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0][0], "swe-1")
        self.assertEqual(results[0][1].termination_reason, "finish")

    def test_run_swebench_uses_benchmark_aligned_defaults(self) -> None:
        class FakeDataset:
            def __iter__(self):
                return iter([{"instance_id": "swe-1", "problem_statement": "repair bug"}])

            def select(self, indices):
                items = list(self)
                return items[: len(list(indices))]

        captured: dict[str, object] = {}

        class StubClient:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return None

            def run(self, request: RunRequest) -> RunResponse:
                captured["request"] = request
                return RunResponse(
                    success=True,
                    result=request.task,
                    termination_reason="finish",
                    steps=[],
                    total_token_in=1,
                    total_token_out=1,
                    total_elapsed_ms=1,
                )

        with patch("experiments.swebench_runner.load_swebench_dataset", return_value=FakeDataset()):
            with patch("experiments.swebench_runner.AgentRuntimeClient", StubClient):
                list(run_swebench(max_tasks=1))

        request = captured["request"]
        self.assertEqual(request.prompt_builder, "swe_agent")
        self.assertEqual(request.action_parser, "json")
        self.assertEqual(request.context_strategy.name, "sliding_window")
        self.assertEqual(request.tools, "swe")


if __name__ == "__main__":
    unittest.main()
