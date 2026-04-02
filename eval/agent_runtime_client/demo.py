from .client import AgentRuntimeClient
from .types import LLMConfig, RunRequest


def main() -> None:
    with AgentRuntimeClient() as client:
        result = client.run(
            RunRequest(
                task="Echo a completion result.",
                llm=LLMConfig(provider="local", model="demo"),
                tools="minimal",
            )
        )
        print(result.success, result.termination_reason)


if __name__ == "__main__":
    main()
