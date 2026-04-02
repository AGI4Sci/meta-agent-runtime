from agent_runtime_client.types import LLMConfig, RunRequest


def test_request_to_dict():
    request = RunRequest(task="x", llm=LLMConfig(provider="local", model="demo"))
    payload = request.to_dict()
    assert payload["task"] == "x"

