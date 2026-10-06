import assert from "node:assert/strict";
import test from "node:test";
import { assistBriefing, generateOneWeek, regenerateWeekWithAI } from "../src/ai.js";
import { normalizeCourseInput } from "../src/aula-schema.js";

function qualityFixture(wordsPerSection) {
  const body = "Explicação conceitual contextualizada com exemplo, aplicação e limite crítico. ".repeat(wordsPerSection);
  return {
    lessonPlan: {
      theme: "Semana de teste",
      welcome: "Abertura contextualizada para orientar a leitura e situar o problema desta semana. ".repeat(12),
      learningObjectives: ["Explicar o conceito", "Comparar perspectivas", "Analisar um caso", "Aplicar critérios"],
      contentSections: Array.from({ length: 6 }, (_, index) => ({ number: String(index + 1), title: `Seção ${index + 1}`, body, reflection: { question: "Qual consequência aparece neste caso?", body: "Reflita sobre a aplicação no seu contexto." } })),
      synthesis: body,
      nextWeekConnection: body,
      assessment: { questions: Array.from({ length: 4 }, (_, index) => ({ q: `Questão ${index + 1}`, options: ["A", "B", "C", "D"], answer: 0, explanation: "A resposta retoma o conceito trabalhado." })) },
      alignmentMatrix: ["Explicar o conceito", "Comparar perspectivas", "Analisar um caso", "Aplicar critérios"].map((objective, index) => ({ objective, contentSections: [String(index + 1)], activities: [`activity-${index + 1}`], evidence: "Resposta fundamentada", assessmentQuestions: [`question-${index + 1}`] })),
      pedagogicalReview: { status: "ready" },
      references: []
    },
    teacherGuide: {}
  };
}

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
      compositionPlan: { default: { rows: { quiz: { count: 0, policy: "none" } } } },
      academicProfile: { targetWords: 2800 }
    };
    const currentWeek = { lessonPlan: { theme: "Semana atual", contentSections: [{ title: "Seção", body: "Texto ".repeat(5000) }] } };
    const result = await regenerateWeekWithAI(input, 0, currentWeek, "Acrescente 1 quiz formativo e amplie o exemplo aplicado.");
    assert.equal(calls, 1);
    assert.equal(requestBody.max_tokens, 10000);
    const promptChars = requestBody.messages.reduce((sum, message) => sum + String(message.content).length, 0);
    assert.ok(promptChars < 100000, `contexto compacto esperado; recebeu ${promptChars} caracteres`);
    assert.match(requestBody.messages.at(-1).content, /COMPOSIÇÃO OBRIGATÓRIA DA SEMANA/);
    assert.match(requestBody.messages.at(-1).content, /1× Quiz formativo/);
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

test("preenchimento assistido usa orçamento menor e não envia o briefing bruto", async () => {
  const previousFetch = global.fetch;
  const previous = { key: process.env.OPENAI_API_KEY, retries: process.env.OPENAI_MAX_RETRIES, assistTokens: process.env.OPENAI_ASSIST_MAX_TOKENS };
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MAX_RETRIES = "1";
  delete process.env.OPENAI_ASSIST_MAX_TOKENS;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    const content = JSON.stringify({ audience: "Estudantes", objectives: [], content: "", webPractices: [], materials: [], references: [], videoSearchSuggestions: [], imageSearchSuggestions: [], notes: [] });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  };
  try {
    const input = normalizeCourseInput({
      title: "Curso extenso",
      weeks: 12,
      content: "Conteúdo repetido. ".repeat(1800),
      webPracticeEnabled: true,
      webPractices: Array.from({ length: 6 }, (_, index) => ({ id: `p${index + 1}`, title: `Prática ${index + 1}`, context: "Contexto. ".repeat(160), instructions: "Instruções. ".repeat(160) })),
      materials: Array.from({ length: 30 }, (_, index) => ({ title: `Material ${index + 1}`, description: "Descrição. ".repeat(50) }))
    });
    await assistBriefing(input, ["audience", "content", "webPractices[0].objective", "materials"]);
    assert.equal(requestBody.max_tokens, 6000);
    const promptChars = requestBody.messages.reduce((sum, message) => sum + String(message.content).length, 0);
    assert.ok(promptChars < 32000, `prompt compacto esperado; recebeu ${promptChars} caracteres`);
    assert.doesNotMatch(requestBody.messages.at(-1).content, /compositionPlan/);
  } finally {
    global.fetch = previousFetch;
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key;
    if (previous.retries === undefined) delete process.env.OPENAI_MAX_RETRIES; else process.env.OPENAI_MAX_RETRIES = previous.retries;
    if (previous.assistTokens === undefined) delete process.env.OPENAI_ASSIST_MAX_TOKENS; else process.env.OPENAI_ASSIST_MAX_TOKENS = previous.assistTokens;
  }
});

test("geração distribuída devolve a primeira versão sem reparo síncrono", async () => {
  const previousFetch = global.fetch;
  const previous = { key: process.env.OPENAI_API_KEY, retries: process.env.OPENAI_MAX_RETRIES, autoRepair: process.env.AULA_AUTO_REPAIR };
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MAX_RETRIES = "1";
  process.env.AULA_AUTO_REPAIR = "true";
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(qualityFixture(30)) } }] }), { status: 200 });
  };
  try {
    const input = normalizeCourseInput({ title: "Curso distribuído", weeks: 6, hoursPerWeek: 4, objectives: ["Explicar o conceito"], academicProfile: { targetWords: 3000, minimumReferences: 0, primarySourcesRequired: 0, requireCounterarguments: false } });
    const result = await generateOneWeek(input, 3, { singlePass: true, deferRepair: true });
    assert.equal(calls, 1);
    assert.equal(result.generationMeta.repairPending, true);
    assert.equal(result.generationMeta.repairAttempts, 0);
    assert.match(result.generationMeta.nextAction, /Refazer esta semana/);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      const envKey = { key: "OPENAI_API_KEY", retries: "OPENAI_MAX_RETRIES", autoRepair: "AULA_AUTO_REPAIR" }[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  }
});

test("geração repara automaticamente uma semana em needs-review por ficar abaixo da meta", async () => {
  const previousFetch = global.fetch;
  const previous = { key: process.env.OPENAI_API_KEY, singlePass: process.env.AULA_SINGLE_PASS, repair: process.env.AULA_AUTO_REPAIR, retries: process.env.OPENAI_MAX_RETRIES };
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AULA_SINGLE_PASS = "true";
  process.env.AULA_AUTO_REPAIR = "true";
  process.env.OPENAI_MAX_RETRIES = "1";
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const fixture = calls === 1 ? qualityFixture(720) : qualityFixture(1000);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fixture) } }] }), { status: 200 });
  };
  try {
    const input = normalizeCourseInput({ title: "Curso de teste", weeks: 1, hoursPerWeek: 4, objectives: ["Explicar o conceito"], academicProfile: { targetWords: 7000, minimumReferences: 0, primarySourcesRequired: 0, requireCounterarguments: false } });
    const result = await generateOneWeek(input, 0);
    assert.equal(calls, 2, "a semana abaixo da meta deve acionar uma segunda chamada de reparo");
    assert.ok(result.lessonPlan.contentSections[0].body.length > "Explicação conceitual contextualizada com exemplo, aplicação e limite crítico. ".repeat(720).length);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      const envKey = { key: "OPENAI_API_KEY", singlePass: "AULA_SINGLE_PASS", repair: "AULA_AUTO_REPAIR", retries: "OPENAI_MAX_RETRIES" }[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  }
});

test("geração preserva lessonPlan devolvido diretamente sem envelope", async () => {
  const previousFetch = global.fetch;
  const previous = { key: process.env.OPENAI_API_KEY, singlePass: process.env.AULA_SINGLE_PASS, repair: process.env.AULA_AUTO_REPAIR, retries: process.env.OPENAI_MAX_RETRIES };
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AULA_SINGLE_PASS = "true";
  process.env.AULA_AUTO_REPAIR = "true";
  process.env.OPENAI_MAX_RETRIES = "1";
  let calls = 0;
  const directPlan = qualityFixture(500).lessonPlan;
  global.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(directPlan) } }] }), { status: 200 });
  };
  try {
    const input = normalizeCourseInput({ title: "Curso direto", weeks: 1, hoursPerWeek: 4, objectives: ["Explicar"], academicProfile: { targetWords: 2800, minimumReferences: 0, primarySourcesRequired: 0, requireCounterarguments: false } });
    const result = await generateOneWeek(input, 0);
    assert.equal(calls, 1);
    assert.equal(result.lessonPlan.contentSections.length, 6);
    assert.ok(result.lessonPlan.contentSections[0].body.includes("Explicação conceitual contextualizada"));
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      const envKey = { key: "OPENAI_API_KEY", singlePass: "AULA_SINGLE_PASS", repair: "AULA_AUTO_REPAIR", retries: "OPENAI_MAX_RETRIES" }[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  }
});

test("resgata uma resposta inaceitavelmente curta após o primeiro reparo", async () => {
  const previousFetch = global.fetch;
  const previous = { key: process.env.OPENAI_API_KEY, singlePass: process.env.AULA_SINGLE_PASS, repair: process.env.AULA_AUTO_REPAIR, retries: process.env.OPENAI_MAX_RETRIES };
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AULA_SINGLE_PASS = "true";
  process.env.AULA_AUTO_REPAIR = "true";
  process.env.OPENAI_MAX_RETRIES = "1";
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    const content = calls < 3 ? { lessonPlan: { theme: "Semana curta" } } : qualityFixture(500);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status: 200 });
  };
  try {
    const input = normalizeCourseInput({ title: "Curso resgate", weeks: 1, hoursPerWeek: 4, objectives: ["Explicar"], academicProfile: { targetWords: 2800, minimumReferences: 0, primarySourcesRequired: 0, requireCounterarguments: false } });
    const result = await generateOneWeek(input, 0);
    assert.equal(calls, 3);
    assert.equal(result.lessonPlan.contentSections.length, 6);
    assert.ok(result.lessonPlan.contentSections[0].body.includes("Explicação conceitual contextualizada"));
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      const envKey = { key: "OPENAI_API_KEY", singlePass: "AULA_SINGLE_PASS", repair: "AULA_AUTO_REPAIR", retries: "OPENAI_MAX_RETRIES" }[key];
      if (value === undefined) delete process.env[envKey];
      else process.env[envKey] = value;
    }
  }
});

test("reparo marginal não é aceito como melhoria textual", async () => {
  const previousFetch = global.fetch;
  const previous = { key: process.env.OPENAI_API_KEY, singlePass: process.env.AULA_SINGLE_PASS, repair: process.env.AULA_AUTO_REPAIR, retries: process.env.OPENAI_MAX_RETRIES };
  process.env.OPENAI_API_KEY = "test-key";
  process.env.AULA_SINGLE_PASS = "true";
  process.env.AULA_AUTO_REPAIR = "true";
  process.env.OPENAI_MAX_RETRIES = "1";
  let calls = 0;
  const initial = qualityFixture(30);
  const repaired = qualityFixture(32);
  global.fetch = async () => {
    calls += 1;
    const fixture = calls === 1 ? initial : repaired;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fixture) } }] }), { status: 200 });
  };
  try {
    const input = normalizeCourseInput({ title: "Curso de teste", weeks: 1, hoursPerWeek: 2, academicProfile: { targetWords: 3000, minimumReferences: 0, primarySourcesRequired: 0, requireCounterarguments: false } });
    const result = await generateOneWeek(input, 0);
    assert.equal(calls, 2);
    assert.equal(result.lessonPlan.contentSections[0].body, initial.lessonPlan.contentSections[0].body);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of Object.entries(previous)) {
      const envKey = { key: "OPENAI_API_KEY", singlePass: "AULA_SINGLE_PASS", repair: "AULA_AUTO_REPAIR", retries: "OPENAI_MAX_RETRIES" }[key];
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
  const requestBodies = [];
  global.fetch = async (_url, options) => {
    calls += 1;
    requestBodies.push(JSON.parse(options.body));
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
    assert.equal(requestBodies[0].max_tokens, 10000);
    assert.equal(requestBodies[1].max_tokens, 10000);
    assert.match(requestBodies[1].messages.at(-1).content, /somente.*lessonPlan/i);
    assert.equal(result.lessonPlan.theme, "Semana corrigida");
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousRetries === undefined) delete process.env.OPENAI_MAX_RETRIES; else process.env.OPENAI_MAX_RETRIES = previousRetries;
  }
});
