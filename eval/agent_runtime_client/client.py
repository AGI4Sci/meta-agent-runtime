from __future__ import annotations

import httpx

from .types import RegistryResponse, RunRequest, RunResponse, validate_registry_payload


class AgentRuntimeClient:
    def __init__(
        self,
        base_url: str = "http://localhost:3282",
        timeout: float = 600.0,
    ):
        self._client = httpx.Client(base_url=base_url, timeout=timeout, trust_env=False)
        self._verify_server()

    def _verify_server(self) -> None:
        try:
            resp = self._client.get("/health")
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise ConnectionError(f"Failed to connect to agent runtime server at {self._client.base_url!s}") from exc

    def run(self, request: RunRequest) -> RunResponse:
        resp = self._client.post("/run", json=request.to_dict())
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, dict):
            raise ValueError("Run response must be a JSON object")
        return RunResponse.from_dict(data)

    def registry(self) -> RegistryResponse:
        resp = self._client.get("/registry")
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, dict):
            raise ValueError("Registry response must be a JSON object")
        return validate_registry_payload(data)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "AgentRuntimeClient":
        return self

    def __exit__(self, *args) -> None:
        self.close()
