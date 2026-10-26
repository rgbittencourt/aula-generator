// Estes testes exercitam o modo JSON; o modo de prosa tem testes próprios (writer.test.mjs).
process.env.AULA_WRITER = "json";
import assert from "node:assert/strict";
import test from "node:test";
import { adjustWeekEdgesWithAI, buildWeekGenerationPrompt, generateOneWeek } from "../src/ai.js";
import { normalizeCourseInput, normalizeLesson, buildFallbackLesson } from "../src/aula-schema.js";
import { applyEdgePatch, compareBridges, formatBridgeContext, sanitizeBridges, summarizeWeekBridge } from "../src/bridge.js";

const input = normalizeCourseInput({ title: "Tecnologias para Gestão Educacional", weeks: 3, hoursPerWeek: 4, audience: "Servidores da educação profissional", level: "pós-graduação", objectives: ["Compreender sistemas de informação na gestão educacional"] });

function lesson(overrides = {}) {
  const base = buildFallbackLesson(input, 0);
  const plan = {
    ...base.lessonPlan,
    theme: "Fundamentos da gestão mediada por sistemas",
    welcome: "A gestão educacional já é mediada por sistemas. Esta semana mostramos como. Vamos começar pelo caso do diário de classe.",
    glossary: [{ term: "Sistema de informação", definition: "x" }, { term: "Gestão mediada", definition: "y" }, { term: "Dado educacional", definition: "z" }],
    contentSections: [
      { number: "1", title: "O problema", body: "Texto.", subsections: [], caseStudy: { title: "Diário de classe", context: "Uma escola técnica migrou o diário para o SIGAA." }, keyTerms: ["Diário digital"], reflection: { question: "Quem decide o que o sistema registra?", body: "" } }
    ],
    synthesis: "Fechamos a semana com a ideia central. O que acontece quando o sistema decide por nós?",
    nextWeekConnection: "O conceito de gestão mediada passa adiante. Fica a pergunta: quem governa os dados? Na próxima semana veremos o governo digital.",
    ...overrides
  };
  return { ...base, lessonPlan: plan };
}

test("resumo de ponte deriva conceitos, exemplo-âncora, pergunta aberta e ganchos sem chamar IA", () => {
  const summary = summarizeWeekBridge(lesson(), 0);
  assert.equal(summary.weekNumber, 1);
  assert.ok(summary.concepts.includes("Sistema de informação"));
  assert.ok(summary.concepts.includes("Diário digital"));
  assert.match(summary.anchorExample, /Diário de classe/);
  assert.match(summary.openQuestion, /Quem decide/);
  assert.match(summary.hookOut, /governo digital/);
  assert.ok(summary.hookIn.length > 0 && summary.hookIn.length <= 481);
  assert.ok(summary.fingerprint);
});

test("comparação: revisão de redação não toca outras semanas", () => {
  const before = summarizeWeekBridge(lesson(), 0);
  const after = summarizeWeekBridge(lesson({ welcome: "A gestão educacional já é mediada por sistemas. Esta semana mostramos como. Vamos começar pelo caso do diário de classe, agora com outra frase." }), 0);
  const result = compareBridges(before, after);
  assert.equal(result.level, "none");
  assert.equal(result.needsNextOpening, false);
});

test("comparação: gancho de fechamento novo pede ajuste da abertura da próxima semana", () => {
  const before = summarizeWeekBridge(lesson(), 0);
  const after = summarizeWeekBridge(lesson({ nextWeekConnection: "Passa adiante a noção de interoperabilidade entre plataformas. Fica a dúvida sobre custos de integração. Na próxima semana discutimos arquitetura corporativa e contratos com fornecedores." }), 0);
  const result = compareBridges(before, after);
  assert.equal(result.level, "edges");
  assert.equal(result.needsNextOpening, true);
  assert.equal(result.needsPreviousClosing, false);
});

test("comparação: abertura nova pede ajuste do fechamento da semana anterior", () => {
  const before = summarizeWeekBridge(lesson(), 0);
  const after = summarizeWeekBridge(lesson({ welcome: "Orçamentos públicos determinam quais licenças escolares existem. Hoje examinamos contratos, fornecedores e prestação de contas. Começamos pelo pregão eletrônico." }), 0);
  const result = compareBridges(before, after);
  assert.equal(result.needsPreviousClosing, true);
  assert.notEqual(result.level, "none");
});

test("comparação: conceitos centrais trocados marcam a próxima semana como desatualizada", () => {
  const before = summarizeWeekBridge(lesson(), 0);
  const swapped = lesson({
    glossary: [{ term: "Aprendizagem de máquina", definition: "x" }, { term: "Viés algorítmico", definition: "y" }, { term: "Modelo preditivo", definition: "z" }],
    contentSections: [{ number: "1", title: "Outro foco", body: "Texto.", subsections: [], caseStudy: { title: "Predição de evasão", context: "Modelo para evasão." }, keyTerms: ["Evasão"], reflection: { question: "O modelo é justo?", body: "" } }]
  });
  const result = compareBridges(before, summarizeWeekBridge(swapped, 0));
  assert.equal(result.level, "stale");
});

test("contrato de ponte entra no prompt da semana seguinte e fica fora quando não há semana anterior", () => {
  const bridge = summarizeWeekBridge(lesson(), 0);
  const prompt = buildWeekGenerationPrompt(input, 1, null, null, [], [bridge]);
  assert.match(prompt, /CONTRATO DE PONTE/);
  assert.match(prompt, /gestão mediada/i);
  assert.match(prompt, /governo digital/);
  assert.match(prompt, /nextWeekConnection/);
  const first = buildWeekGenerationPrompt(input, 0, null, null, [], []);
  assert.doesNotMatch(first, /CONTRATO DE PONTE/);
  assert.equal(formatBridgeContext([bridge], 1), "", "a própria semana 1 não recebe contrato de si mesma");
});

test("sanitizeBridges limita tamanho e descarta lixo vindo do cliente", () => {
  const huge = "x".repeat(5000);
  const clean = sanitizeBridges([null, "texto", { weekNumber: 0 }, { weekNumber: 2, theme: huge, concepts: new Array(40).fill(huge), hookOut: huge }]);
  assert.equal(clean.length, 1);
  assert.ok(clean[0].theme.length <= 200);
  assert.equal(clean[0].concepts.length, 12);
  assert.ok(clean[0].hookOut.length <= 800);
});

test("o gancho para a próxima semana aparece na síntese visível ao estudante", () => {
  const normalized = normalizeLesson(lesson(), input, 0);
  const sintese = normalized.blocks.find((block) => block.type === "sintese");
  assert.ok(sintese, "a semana tem bloco de síntese");
  assert.match(sintese.props.body, /Na próxima semana:/);
  assert.match(sintese.props.body, /governo digital/);
});

test("applyEdgePatch troca só abertura e fechamento e preserva o corpo e os recursos", () => {
  const normalized = normalizeLesson(lesson(), input, 0);
  const bodyBefore = JSON.stringify(normalized.blocks.find((block) => block.type === "topic").props.children.filter((child) => !String(child.id).startsWith("c-welcome-")));
  const patched = applyEdgePatch(normalized, { welcome: "Retomamos a interoperabilidade para abrir esta semana.", nextWeekConnection: "Novo gancho para a próxima semana sobre contratos." });
  assert.equal(patched.lessonPlan.welcome, "Retomamos a interoperabilidade para abrir esta semana.");
  const topic = patched.blocks.find((block) => block.type === "topic");
  const welcome = topic.props.children.find((child) => String(child.id).startsWith("c-welcome-"));
  assert.match(welcome.props.body, /interoperabilidade/);
  assert.equal(JSON.stringify(topic.props.children.filter((child) => !String(child.id).startsWith("c-welcome-"))), bodyBefore);
  assert.match(patched.blocks.find((block) => block.type === "sintese").props.body, /Novo gancho/);
  assert.equal(applyEdgePatch(normalized, {}), normalized, "sem patch devolve a mesma semana");
});

test("ajuste de pontas faz uma chamada curta e devolve só os trechos pedidos", async () => {
  const previousFetch = global.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousProvider = process.env.AI_PROVIDER;
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.AI_PROVIDER;
  let calls = 0;
  let prompt = "";
  global.fetch = async (_url, options) => {
    calls += 1;
    prompt = JSON.parse(options.body).messages.map((message) => message.content).join("\n");
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ welcome: "Nova abertura que cumpre o gancho.", nextWeekConnection: "ignorado" }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const week = normalizeLesson(lesson(), input, 1);
    const previousBridge = summarizeWeekBridge(lesson({ nextWeekConnection: "Gancho prometido: interoperabilidade entre plataformas." }), 0);
    const patch = await adjustWeekEdgesWithAI(input, 1, week, { opening: { previousBridge } });
    assert.equal(calls, 1);
    assert.deepEqual(Object.keys(patch), ["welcome"], "só devolve o que foi pedido, mesmo que a IA envie mais");
    assert.match(prompt, /SEMANA ANTERIOR/);
    assert.match(prompt, /interoperabilidade entre plataformas/);
    assert.doesNotMatch(prompt, /PRÓXIMA SEMANA \(aprovada\)/);
    assert.deepEqual(await adjustWeekEdgesWithAI(input, 1, week, {}), {}, "sem alvo não chama a IA");
    assert.equal(calls, 1);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousProvider !== undefined) process.env.AI_PROVIDER = previousProvider;
  }
});

test("generateOneWeek repassa os resumos de ponte ao prompt", async () => {
  const previousFetch = global.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  let userPrompt = "";
  global.fetch = async (_url, options) => {
    userPrompt = JSON.parse(options.body).messages.find((message) => message.role === "user").content;
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ lessonPlan: lesson().lessonPlan, teacherGuide: {} }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const bridge = summarizeWeekBridge(lesson({ nextWeekConnection: "Gancho único XYZ-123 para a semana seguinte." }), 0);
    await generateOneWeek(input, 1, { singlePass: true, deferRepair: true, bridges: [bridge] });
    assert.match(userPrompt, /XYZ-123/);
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
});
