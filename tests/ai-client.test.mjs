import assert from "node:assert/strict";
import test from "node:test";
import { callJson, getAIModel, getAIProvider, isAIConfigured } from "../src/ai-client.js";

const envKeys = [
  "AI_PROVIDER", "AULA_AI_PROVIDER", "AI_MODEL", "AI_MAX_TOKENS", "AI_REQUEST_TOKEN_BUDGET", "AI_MAX_RETRIES",
  "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "OPENAI_CONTENT_MODEL", "OPENAI_MAX_TOKENS", "OPENAI_REQUEST_TOKEN_BUDGET", "OPENAI_MAX_RETRIES",
  "ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "ANTHROPIC_MAX_TOKENS", "ANTHROPIC_REQUEST_TOKEN_BUDGET", "ANTHROPIC_MAX_RETRIES", "ANTHROPIC_VERSION", "ANTHROPIC_STRUCTURED_OUTPUTS"
];

function snapshotEnv() {
  return Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of envKeys) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json", ...(init.headers || {}) }, ...init });
}

test("cliente OpenAI mantém Chat Completions e response_format JSON", async () => {
  const previousFetch = global.fetch;
  const snapshot = snapshotEnv();
  let request;
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "openai-test-key";
  process.env.OPENAI_BASE_URL = "https://openai.test/v1";
  process.env.OPENAI_CONTENT_MODEL = "gpt-test";
  process.env.OPENAI_MAX_RETRIES = "1";
  global.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return jsonResponse({ choices: [{ message: { content: JSON.stringify({ ok: true, provider: "openai" }) }, finish_reason: "stop" }] });
  };
  try {
    assert.equal(getAIProvider(), "openai");
    assert.equal(getAIModel(), "gpt-test");
    assert.equal(isAIConfigured(), true);
    const result = await callJson([{ role: "system", content: "Responda JSON." }, { role: "user", content: "Teste" }], { maxTokens: 1000 });
    assert.deepEqual(result, { ok: true, provider: "openai" });
    assert.equal(request.url, "https://openai.test/v1/chat/completions");
    assert.equal(request.options.headers.Authorization, "Bearer openai-test-key");
    assert.deepEqual(request.body.response_format, { type: "json_object" });
    assert.equal(request.body.model, "gpt-test");
  } finally {
    global.fetch = previousFetch;
    restoreEnv(snapshot);
  }
});

test("cliente Anthropic converte system, endpoint e resposta Messages em JSON da aula", async () => {
  const previousFetch = global.fetch;
  const snapshot = snapshotEnv();
  let request;
  process.env.AI_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
  process.env.ANTHROPIC_MODEL = "claude-test";
  process.env.ANTHROPIC_MAX_RETRIES = "1";
  global.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return jsonResponse({ content: [{ type: "text", text: JSON.stringify({ ok: true, provider: "anthropic" }) }], stop_reason: "end_turn" });
  };
  try {
    assert.equal(getAIProvider(), "anthropic");
    assert.equal(getAIModel(), "claude-test");
    const result = await callJson([{ role: "system", content: "Você retorna JSON." }, { role: "user", content: "Gere uma aula." }], { maxTokens: 1000 });
    assert.deepEqual(result, { ok: true, provider: "anthropic" });
    assert.equal(request.url, "https://api.anthropic.com/v1/messages");
    assert.equal(request.options.headers["x-api-key"], "anthropic-test-key");
    assert.equal(request.options.headers["anthropic-version"], "2023-06-01");
    assert.equal(request.body.system, "Você retorna JSON.");
    assert.equal(request.body.model, "claude-test");
    assert.deepEqual(request.body.messages, [{ role: "user", content: "Gere uma aula." }]);
  } finally {
    global.fetch = previousFetch;
    restoreEnv(snapshot);
  }
});

test("cliente não repete TPM quando retry-after vem como 6m0s", async () => {
  const previousFetch = global.fetch;
  const snapshot = snapshotEnv();
  let calls = 0;
  process.env.AI_PROVIDER = "anthropic";
  process.env.ANTHROPIC_API_KEY = "anthropic-test-key";
  process.env.ANTHROPIC_MAX_RETRIES = "3";
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { type: "rate_limit_error", message: "output tokens per minute exceeded" } }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "6m0s" }
    });
  };
  try {
    await assert.rejects(
      callJson([{ role: "user", content: "teste" }], { maxTokens: 1000 }),
      (error) => error.code === "AI_TPM_LIMIT" && error.retryable === false && error.retryAfterMs === 360000
    );
    assert.equal(calls, 1);
  } finally {
    global.fetch = previousFetch;
    restoreEnv(snapshot);
  }
});

test("cliente distingue excesso real de contexto de TPM", async () => {
  const previousFetch = global.fetch;
  const snapshot = snapshotEnv();
  process.env.AI_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "openai-test-key";
  process.env.OPENAI_MAX_RETRIES = "3";
  global.fetch = async () => new Response(JSON.stringify({ error: { message: "Request too large: maximum context length exceeded" } }), {
    status: 400,
    headers: { "content-type": "application/json" }
  });
  try {
    await assert.rejects(callJson([{ role: "user", content: "contexto" }], { maxTokens: 1000 }), (error) => error.code === "AI_REQUEST_TOO_LARGE" && error.retryable === false);
  } finally {
    global.fetch = previousFetch;
    restoreEnv(snapshot);
  }
});
