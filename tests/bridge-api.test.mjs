import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import bridgeHandler from "../src/bridge-handler.js";
import regenerateWeekHandler from "../api/regenerate-week.js";
import { buildFallbackLesson, normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { summarizeWeekBridge } from "../src/bridge.js";

function call(handler, body, method = "POST") {
  return new Promise((resolve, reject) => {
    const response = {
      headers: {}, statusCode: 200,
      setHeader(name, value) { this.headers[name] = value; },
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; }
    };
    Promise.resolve(handler({ method, body, headers: {} }, response)).catch(reject);
  });
}

const input = normalizeCourseInput({ title: "Tecnologias para Gestão Educacional", weeks: 3, hoursPerWeek: 4, audience: "Servidores", level: "pós-graduação", objectives: ["Compreender sistemas"] });

test("o plano Hobby da Vercel aceita no máximo 12 funções: api/ não pode passar disso", () => {
  const functions = fs.readdirSync(new URL("../api/", import.meta.url)).filter((name) => name.endsWith(".js"));
  assert.ok(functions.length <= 12, `api/ tem ${functions.length} funções (${functions.join(", ")})`);
});

test("api/bridge: ação summary devolve o resumo e as comparações, sem IA", async () => {
  const week = buildFallbackLesson(input, 0);
  const previous = summarizeWeekBridge(week, 0);
  const result = await call(bridgeHandler, { action: "summary", weekIndex: 0, week, previousSummary: previous, linkedSummary: previous });
  assert.equal(result.status, 200);
  assert.equal(result.body.summary.weekNumber, 1);
  assert.equal(result.body.comparison.level, "none");
  assert.equal(result.body.linkComparison.level, "none");
});

test("api/bridge: ação omitida vale summary; ação desconhecida e método errado são recusados", async () => {
  const week = buildFallbackLesson(input, 0);
  assert.equal((await call(bridgeHandler, { weekIndex: 0, week })).status, 200);
  assert.equal((await call(bridgeHandler, { action: "nada", week })).status, 400);
  assert.equal((await call(bridgeHandler, {}, "GET")).status, 405);
  assert.equal((await call(bridgeHandler, { action: "summary" })).status, 400, "sem semana");
});

test("api/bridge: ação adjust exige a semana vizinha", async () => {
  const week = buildFallbackLesson(input, 1);
  const result = await call(bridgeHandler, { action: "adjust", input, weekIndex: 1, week });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "ADJUST_TARGET_MISSING");
});

test("refazer uma semana com o curso pausado devolve só as semanas enviadas (não completa com reservas)", async () => {
  const previousFetch = global.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousProvider = process.env.AI_PROVIDER;
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.AI_PROVIDER;
  global.fetch = async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ lessonPlan: { ...buildFallbackLesson(input, 0).lessonPlan, theme: "Semana 1 refeita" } }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const week1 = normalizeLesson(buildFallbackLesson(input, 0), input, 0);
    const result = await call(regenerateWeekHandler, { input, weekIndex: 0, instruction: "Deixe mais prático.", weeks: [week1], teacherGuides: [{}] });
    assert.equal(result.status, 200, JSON.stringify(result.body).slice(0, 300));
    assert.equal(result.body.partial, true);
    assert.equal(result.body.weeks.length, 1, "continua com 1 semana, não 3");
    assert.equal(result.body.teacherGuides.length, 1);
    assert.equal(result.body.workload, undefined, "sem carga calculada sobre semanas de reserva");
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousProvider !== undefined) process.env.AI_PROVIDER = previousProvider;
  }
});

test("na Vercel, /api/bridge é encaminhado a api/regenerate-week.js, que despacha a ação de ponte", async () => {
  const config = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(config.routes.some((route) => route.src === "/api/bridge" && route.dest === "/api/regenerate-week"));
  const week = buildFallbackLesson(input, 0);
  const result = await call(regenerateWeekHandler, { action: "summary", weekIndex: 0, week });
  assert.equal(result.status, 200);
  assert.ok(result.body.summary.fingerprint);
});
