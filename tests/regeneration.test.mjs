import assert from "node:assert/strict";
import test from "node:test";
import { regenerateWeekWithAI } from "../src/ai.js";

test("regeneração single-pass usa contexto compacto e orçamento próprio", async () => {
  const previousFetch = global.fetch;
  const previous = {
    key: process.env.OPENAI_API_KEY,
    singlePass: process.env.AULA_SINGLE_PASS,
    review: process.env.AULA_ACADEMIC_REVIEW,
    repair: process.env.AULA_AUTO_REPAIR,
    regenTokens: process.env.OPENAI_REGEN_MAX_TOKENS
  };
  let calls = 0;
  let requestBody;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AULA_SINGLE_PASS = "true";
  process.env.AULA_ACADEMIC_REVIEW = "true";
  process.env.AULA_AUTO_REPAIR = "true";
  process.env.OPENAI_REGEN_MAX_TOKENS = "10000";
  global.fetch = async (_url, options) => {
    calls += 1;
    requestBody = JSON.parse(options.body);
    const content = JSON.stringify({
      lessonPlan: {
        theme: "Semana revisada",
        welcome: "Abertura revisada.",
        learningObjectives: ["Analisar o conceito central"],
        contentSections: [{ number: "1", title: "Fundamentos", body: "Conteúdo revisado." }],
        synthesis: "Síntese revisada.",
        assessment: { questions: [] }
      },
      teacherGuide: {}
    });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  try {
    const input = {
      title: "Curso de teste",
      audience: "Estudantes",
      level: "graduação",
      weeks: 4,
      hoursPerWeek: 4,
      objectives: ["Compreender e aplicar"],
      content: "Conteúdo-base ".repeat(1000),
      references: ["Referência"],
      materials: [],
      webPractices: [],
      academicProfile: { targetWords: 2800 }
    };
    const currentWeek = { lessonPlan: { theme: "Semana atual", contentSections: [{ title: "Seção", body: "Texto ".repeat(5000) }] } };
    const result = await regenerateWeekWithAI(input, 0, currentWeek, "Amplie o exemplo aplicado.");
    assert.equal(calls, 1);
    assert.equal(requestBody.max_tokens, 10000);
    const promptChars = requestBody.messages.reduce((sum, message) => sum + String(message.content).length, 0);
    assert.ok(promptChars < 100000, `contexto compacto esperado; recebeu ${promptChars} caracteres`);
    assert.equal(result.lessonPlan.theme, "Semana revisada");
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      const envKey = { key: "OPENAI_API_KEY", singlePass: "AULA_SINGLE_PASS", review: "AULA_ACADEMIC_REVIEW", repair: "AULA_AUTO_REPAIR", regenTokens: "OPENAI_REGEN_MAX_TOKENS" }[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  }
});

test("regeneração corrige JSON inválido e repete a chamada", async () => {
  const previousFetch = global.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousRetries = process.env.OPENAI_MAX_RETRIES;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MAX_RETRIES = "2";
  let calls = 0;
  global.fetch = async (_url, options) => {
    calls += 1;
    if (calls === 1) {
      const malformed = '{"lessonPlan":{"theme":"Semana corrigida"},"teacherGuide":{oops:1}}';
      return new Response(JSON.stringify({ choices: [{ message: { content: malformed } }] }), { status: 200 });
    }
    const content = JSON.stringify({ lessonPlan: { theme: "Semana corrigida" }, teacherGuide: {} });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  try {
    const result = await regenerateWeekWithAI({ title: "Curso", weeks: 1, objectives: ["Aplicar"], content: "Conteúdo", webPractices: [] }, 0, { lessonPlan: { theme: "Semana atual" } }, "Corrija o exemplo.");
    assert.equal(calls, 2);
    assert.equal(result.lessonPlan.theme, "Semana corrigida");
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousRetries === undefined) delete process.env.OPENAI_MAX_RETRIES; else process.env.OPENAI_MAX_RETRIES = previousRetries;
  }
});
