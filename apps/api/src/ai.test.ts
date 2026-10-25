import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chunkText,
  cosine,
  openAiProvider,
  ServiceError,
  validateClaims,
  type Passage,
} from "./ai.js";
const source: Passage = {
  id: "chunk-a",
  documentId: "doc-a",
  title: "Refunds",
  version: 1,
  content: "Refunds are available within 30 days.",
  score: 1,
};
test("chunking preserves complete Unicode text with bounded overlap", () => {
  const text = "😀".repeat(3000);
  const chunks = chunkText(text);
  assert.equal(chunks.length, 3);
  assert.equal(Array.from(chunks[0]).length, 1200);
  assert.equal(chunks[0].includes("\ufffd"), false);
  assert.equal(chunks[2].length, 1800);
  assert.deepEqual(chunkText("   "), []);
});
test("cosine rejects mismatched dimensions and handles zero vectors", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([0, 0], [0, 0]), 0);
  assert.equal(cosine([1], [1, 0]), 0);
});
test("grounding accepts only retrieved IDs and exact source quotations", () => {
  const supported = {
    abstain: false,
    reason: "",
    claims: [
      {
        text: "You may request a refund within 30 days.",
        chunkId: "chunk-a",
        quote: "within 30 days",
      },
    ],
  };
  assert.equal(validateClaims(supported, [source]).status, "DRAFT");
  assert.throws(
    () =>
      validateClaims(
        {
          ...supported,
          claims: [{ ...supported.claims[0], chunkId: "other-tenant" }],
        },
        [source],
      ),
    ServiceError,
  );
  assert.throws(
    () =>
      validateClaims(
        {
          ...supported,
          claims: [{ ...supported.claims[0], quote: "within 90 days" }],
        },
        [source],
      ),
    ServiceError,
  );
  assert.throws(
    () => validateClaims({ ...supported, claims: [] }, [source]),
    ServiceError,
  );
  assert.equal(
    validateClaims(
      { abstain: true, reason: "Conflicting evidence", claims: [] },
      [source],
    ).status,
    "ABSTAINED",
  );
});
test("embedding provider contract validates ordering and dimensions", async () => {
  const fetcher = (async (url: unknown, options: any) => {
    assert.equal(url, "https://api.openai.com/v1/embeddings");
    const body = JSON.parse(options.body);
    assert.equal(body.encoding_format, "float");
    return Response.json({
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
      usage: { prompt_tokens: 4 },
    });
  }) as typeof fetch;
  const p = openAiProvider(
    "test-only",
    "test-model",
    "test-embedding",
    fetcher,
  );
  const result = await p.embed(["a", "b"]);
  assert.deepEqual(result.vectors, [
    [1, 0],
    [0, 1],
  ]);
  assert.equal(result.usage.inputTokens, 4);
  const bad = openAiProvider(
    "test-only",
    "test-model",
    "test-embedding",
    (async () =>
      Response.json({
        data: [{ index: 0, embedding: [0, 0] }],
        usage: { prompt_tokens: 1 },
      })) as typeof fetch,
  );
  await assert.rejects(() => bad.embed(["a"]), ServiceError);
});
test("Responses request disables storage and validates structured output", async () => {
  const fetcher = (async (_url: unknown, options: any) => {
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.type, "json_schema");
    assert.ok(body.instructions.includes("untrusted"));
    return Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                abstain: true,
                reason: "Not supported",
                claims: [],
              }),
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 4 },
    });
  }) as typeof fetch;
  const result = await openAiProvider(
    "test-only",
    "test-model",
    "test-embedding",
    fetcher,
  ).answer("Question", [source]);
  assert.equal(result.answer.abstain, true);
  assert.equal(result.usage.outputTokens, 4);
});
test("provider errors and incomplete output fail without leaking response details", async () => {
  const failed = openAiProvider(
    "secret",
    "test",
    "test",
    (async () =>
      new Response("sensitive provider data", { status: 429 })) as typeof fetch,
  );
  await assert.rejects(
    () => failed.answer("q", []),
    (e: unknown) =>
      e instanceof ServiceError &&
      e.code === "PROVIDER_HTTP_429" &&
      !e.message.includes("sensitive"),
  );
  const incomplete = openAiProvider("secret", "test", "test", (async () =>
    Response.json({ status: "incomplete" })) as typeof fetch);
  await assert.rejects(() => incomplete.answer("q", []), ServiceError);
});

test("Groq uses chat completions with strict schema and actual token usage", async () => {
  const { groqProvider } = await import("./ai.js");
  const fetcher = (async (url: unknown, options: any) => {
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer groq-test-only");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "openai/gpt-oss-20b");
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.ok(body.messages[0].content.includes("untrusted"));
    assert.equal(body.stream, false);
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              abstain: false,
              reason: "",
              claims: [
                {
                  text: "Refunds within 30 days.",
                  chunkId: source.id,
                  quote: "within 30 days",
                },
              ],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 24, completion_tokens: 12 },
    });
  }) as typeof fetch;
  const provider = groqProvider("groq-test-only", undefined, fetcher);
  assert.equal(provider.embeddingModel, null);
  const response = await provider.answer("Refunds?", [source]);
  assert.equal(validateClaims(response.answer, [source]).status, "DRAFT");
  assert.deepEqual(response.usage, { inputTokens: 24, outputTokens: 12 });
  await assert.rejects(
    () => provider.embed(["a"]),
    (e: unknown) =>
      e instanceof ServiceError && e.code === "EMBEDDINGS_NOT_CONFIGURED",
  );
});
test("Groq rejects truncated, malformed and schema-invalid output", async () => {
  const { groqProvider } = await import("./ai.js");
  for (const [finish, content] of [
    ["length", "{}"],
    ["stop", "not json"],
    ["stop", "{}"],
  ]) {
    const provider = groqProvider("test-only", "test-model", (async () =>
      Response.json({
        choices: [{ finish_reason: finish, message: { content } }],
        usage: { prompt_tokens: 10, completion_tokens: 2 },
      })) as typeof fetch);
    await assert.rejects(
      () => provider.answer("Question", [source]),
      (e: unknown) =>
        e instanceof ServiceError && e.code === "INVALID_PROVIDER_OUTPUT",
    );
  }
});
test("Groq fails safely on rate limits and transport errors", async () => {
  const { groqProvider } = await import("./ai.js");
  const limited = groqProvider(
    "secret",
    "test-model",
    (async () =>
      new Response("private diagnostic", { status: 429 })) as typeof fetch,
  );
  await assert.rejects(
    () => limited.answer("q", []),
    (e: unknown) =>
      e instanceof ServiceError &&
      e.code === "PROVIDER_HTTP_429" &&
      !e.message.includes("private"),
  );
  const offline = groqProvider("secret", "test-model", (async () => {
    throw Error("secret network details");
  }) as typeof fetch);
  await assert.rejects(
    () => offline.answer("q", []),
    (e: unknown) =>
      e instanceof ServiceError &&
      e.code === "PROVIDER_UNAVAILABLE" &&
      !e.message.includes("secret"),
  );
});
