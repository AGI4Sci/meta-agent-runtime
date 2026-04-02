import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/server/app";
import { resolveToolPreset } from "../src/server/routes";
import {
  BASE_ACTION_PARSERS,
  BASE_CONTEXT_STRATEGIES,
  BASE_PROMPT_BUILDERS,
  BASE_TOOL_PRESETS,
  HealthResponseSchema,
  PUBLIC_ACTION_PARSERS,
  PUBLIC_CONTEXT_STRATEGIES,
  PUBLIC_PROMPT_BUILDERS,
  PUBLIC_TOOL_PRESETS,
  RegistryResponseSchema,
  RunRequestCompatSchema,
  RunRequestSchema,
} from "../src/server/schema";

test("run request schema preserves raw-design base contract", () => {
  const parsed = RunRequestSchema.parse({
    task: "demo",
    llm: {
      provider: "local",
      model: "mock",
    },
  });

  assert.equal(parsed.prompt_builder, "react");
  assert.equal(parsed.action_parser, "json");
  assert.equal(parsed.context_strategy.name, "sliding_window");
  assert.equal(parsed.tools, "swe");
  assert.deepEqual([...BASE_PROMPT_BUILDERS], [...PUBLIC_PROMPT_BUILDERS]);
  assert.deepEqual([...BASE_ACTION_PARSERS], [...PUBLIC_ACTION_PARSERS]);
  assert.deepEqual([...BASE_CONTEXT_STRATEGIES], [...PUBLIC_CONTEXT_STRATEGIES]);
  assert.deepEqual([...BASE_TOOL_PRESETS], [...PUBLIC_TOOL_PRESETS]);
});

test("run request schema rejects agent-specific values outside the raw contract", () => {
  assert.throws(() =>
    RunRequestSchema.parse({
      task: "demo",
      llm: {
        provider: "local",
        model: "mock",
      },
      prompt_builder: "ii_agent",
    }),
  );

  assert.throws(() =>
    RunRequestSchema.parse({
      task: "demo",
      llm: {
        provider: "local",
        model: "mock",
      },
      action_parser: "ii_agent",
    }),
  );

  assert.throws(() =>
    RunRequestSchema.parse({
      task: "demo",
      llm: {
        provider: "local",
        model: "mock",
      },
      context_strategy: {
        name: "ii_agent",
      },
    }),
  );

  assert.throws(() =>
    RunRequestSchema.parse({
      task: "demo",
      llm: {
        provider: "local",
        model: "mock",
      },
      tools: "ii_agent",
    }),
  );
});

test("compat run request schema accepts registered adapter-specific values", () => {
  const parsed = RunRequestCompatSchema.parse({
    task: "demo",
    llm: {
      provider: "local",
      model: "mock",
    },
    prompt_builder: "ii_agent",
    action_parser: "ii_agent",
    context_strategy: {
      name: "ii_agent",
      max_tokens: 4096,
    },
    tools: "ii_agent",
  });

  assert.equal(parsed.prompt_builder, "ii_agent");
  assert.equal(parsed.action_parser, "ii_agent");
  assert.equal(parsed.context_strategy.name, "ii_agent");
  assert.equal(parsed.tools, "ii_agent");
});

test("registry route exposes original contract keys without internal helper fields", async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/registry",
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), [
      "action_parsers",
      "context_strategies",
      "prompt_builders",
      "tools",
    ]);
    assert.ok(Array.isArray(body.prompt_builders));
    assert.ok(Array.isArray(body.action_parsers));
    assert.ok(Array.isArray(body.context_strategies));
    assert.ok(Array.isArray(body.tools));
    assert.deepEqual(body.prompt_builders, [...(body.prompt_builders as string[])].sort());
    assert.deepEqual(body.action_parsers, [...(body.action_parsers as string[])].sort());
    assert.deepEqual(body.context_strategies, [...(body.context_strategies as string[])].sort());
    assert.deepEqual(body.tools, [...(body.tools as string[])].sort());
    for (const name of PUBLIC_PROMPT_BUILDERS) {
      assert.ok((body.prompt_builders as string[]).includes(name));
    }
    for (const name of PUBLIC_ACTION_PARSERS) {
      assert.ok((body.action_parsers as string[]).includes(name));
    }
    for (const name of PUBLIC_CONTEXT_STRATEGIES) {
      assert.ok((body.context_strategies as string[]).includes(name));
    }
    for (const name of PUBLIC_TOOL_PRESETS) {
      assert.ok((body.tools as string[]).includes(name));
    }
  } finally {
    await app.close();
  }
});

test("run route accepts the raw-design request shape", async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/run",
      payload: {
        task: "demo",
        llm: {
          provider: "local",
          model: "mock",
        },
        config: {
          max_steps: 0,
        },
      },
    });

    assert.equal(response.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("run route accepts registered adapter-specific request values", async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/run",
      payload: {
        task: "demo",
        llm: {
          provider: "local",
          model: "mock",
        },
        prompt_builder: "ii_agent",
        action_parser: "ii_agent",
        context_strategy: {
          name: "ii_agent",
        },
        tools: "ii_agent",
        config: {
          max_steps: 0,
        },
      },
    });

    assert.equal(response.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("run response omits prompt and raw_text fields from step payloads", async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "POST",
      url: "/run",
      payload: {
        task: "demo",
        llm: {
          provider: "local",
          model: "mock",
        },
        config: {
          max_steps: 0,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { steps: Array<Record<string, unknown>> };
    for (const step of body.steps) {
      assert.equal("prompt" in step, false);
      assert.equal("raw_text" in step, false);
    }
  } finally {
    await app.close();
  }
});

test("registry and health responses validate against explicit response schemas", async () => {
  const app = await buildApp();

  try {
    const registryResponse = await app.inject({
      method: "GET",
      url: "/registry",
    });
    assert.equal(registryResponse.statusCode, 200);
    const registryBody = RegistryResponseSchema.parse(registryResponse.json());
    assert.deepEqual(registryBody.prompt_builders, [...registryBody.prompt_builders].sort());
    assert.deepEqual(registryBody.action_parsers, [...registryBody.action_parsers].sort());
    assert.deepEqual(registryBody.context_strategies, [...registryBody.context_strategies].sort());
    assert.deepEqual(registryBody.tools, [...registryBody.tools].sort());
    for (const name of PUBLIC_PROMPT_BUILDERS) {
      assert.ok(registryBody.prompt_builders.includes(name));
    }
    for (const name of PUBLIC_ACTION_PARSERS) {
      assert.ok(registryBody.action_parsers.includes(name));
    }
    for (const name of PUBLIC_CONTEXT_STRATEGIES) {
      assert.ok(registryBody.context_strategies.includes(name));
    }
    for (const name of PUBLIC_TOOL_PRESETS) {
      assert.ok(registryBody.tools.includes(name));
    }

    const healthResponse = await app.inject({
      method: "GET",
      url: "/health",
    });
    assert.equal(healthResponse.statusCode, 200);
    const healthBody = HealthResponseSchema.parse(healthResponse.json());
    assert.equal(healthBody.status, "ok");
    assert.equal(healthBody.version, "0.1.0");
  } finally {
    await app.close();
  }
});

test("health route matches original contract", async () => {
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      status: "ok",
      version: "0.1.0",
    });
  } finally {
    await app.close();
  }
});

test('tools="custom" resolves through RUNTIME_TOOLS_PRESET', () => {
  const previous = process.env.RUNTIME_TOOLS_PRESET;
  process.env.RUNTIME_TOOLS_PRESET = "minimal";

  try {
    assert.equal(resolveToolPreset("custom"), "minimal");
  } finally {
    if (previous === undefined) {
      delete process.env.RUNTIME_TOOLS_PRESET;
    } else {
      process.env.RUNTIME_TOOLS_PRESET = previous;
    }
  }
});

test('tools="custom" requires RUNTIME_TOOLS_PRESET to be configured', () => {
  const previous = process.env.RUNTIME_TOOLS_PRESET;
  delete process.env.RUNTIME_TOOLS_PRESET;

  try {
    assert.throws(
      () => resolveToolPreset("custom"),
      /RUNTIME_TOOLS_PRESET must be set when tools="custom"/,
    );
  } finally {
    if (previous !== undefined) {
      process.env.RUNTIME_TOOLS_PRESET = previous;
    }
  }
});

test('tools="custom" rejects unknown RUNTIME_TOOLS_PRESET values', () => {
  const previous = process.env.RUNTIME_TOOLS_PRESET;
  process.env.RUNTIME_TOOLS_PRESET = "missing_preset";

  try {
    assert.throws(
      () => resolveToolPreset("custom"),
      /RUNTIME_TOOLS_PRESET must reference a registered tool preset/,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.RUNTIME_TOOLS_PRESET;
    } else {
      process.env.RUNTIME_TOOLS_PRESET = previous;
    }
  }
});
