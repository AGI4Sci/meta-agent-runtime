import httpx

from .types import RunRequest, RunResponse


class AgentRuntimeClient:
    def __init__(self, base_url: str = "http://localhost:3282", timeout: float = 600.0):
        self._client = httpx.Client(base_url=base_url, timeout=timeout)
        self._verify_server()

    def _verify_server(self) -> None:
        response = self._client.get("/health")
        response.raise_for_status()

    def run(self, request: RunRequest) -> RunResponse:
        response = self._client.post("/run", json=request.to_dict())
        response.raise_for_status()
        return RunResponse.from_dict(response.json())

    def registry(self) -> dict:
        response = self._client.get("/registry")
        response.raise_for_status()
        return response.json()

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

