import assert from "node:assert/strict";
import test from "node:test";
import { generateOneWeek, regenerateWeekWithAI } from "../src/ai.js";
import { normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { summarizeWeekBridge } from "../src/bridge.js";
import { inlineHtml, parseWeekMarkdown, planToMarkdown } from "../src/writer-markdown.js";
import { REFERENCE_WEEK_ONE, REFERENCE_EXCERPTS } from "../src/reference-weeks.js";
import { parseOutline, splitSectionRanges } from "../src/claude-writer.js";
import { WRITER_SYSTEM_PROMPT, writerSystemPrompt, writerModelsMode } from "../src/writer-voice.js";

const input = normalizeCourseInput({
  title: "Tecnologias para Gestão Educacional", weeks: 3, hoursPerWeek: 10, audience: "Servidores da educação profissional", level: "pós-graduação",
  objectives: ["Compreender sistemas de informação na gestão educacional"],
  videoLinks: ["https://www.youtube.com/watch?v=abc123xyz00"]
});

const filler = (n) => Array.from({ length: n }, (_, i) => `Frase ${i + 1} sobre a gestão mediada por sistemas e seus efeitos no dia a dia do campus.`).join(" ");

const MARKDOWN = `# Semana 2 — Sistemas de gestão educacional

## Boas-vindas

Na Semana 1 vimos o **DIKW**. Agora vamos abrir o capô do sistema que vocês usam todos os dias: o **SIGAA**, no caso do IFSC. ${filler(8)}

## Objetivos de aprendizagem

Ao final desta semana, você será capaz de:

- Definir SIGE e situar o SIGAA como exemplo
- Comparar SIGAA e SUAP a partir de um caso real

## 1. SIGE: sistemas com propósito de gestão

Um **SIGE (Sistema de Informação para Gestão Educacional)** é um conjunto de pessoas, processos, dados e tecnologia. ${filler(6)}

> 🔎 **Veja mais aqui** [vídeo | url: https://www.youtube.com/watch?v=abc123xyz00 | busca: "apresentação do SUAP"]: Assista aos dois primeiros minutos e observe quais módulos aparecem primeiro, e por que isso importa para o seu campus.

### 1.1 Um caso real de decisão

O **Ifal** decidiu migrar de sistema. ${filler(4)} Isso mostra que **não existe sistema neutro**.

> 🔎 **Veja mais aqui** [artigo | url: https://inventado.example/falso | busca: "Ifal implantação do Suap"]: Leia a notícia completa e compare o cronograma com o do seu campus, anotando o que mais pesou na decisão.

> 💭 **Para refletir (não vale nota)**: no seu campus, quanto tempo leva para resolver um problema que depende de outra equipe?

> ⚠️ **Atenção**: não confunda o IFSC com o IFC <script>alert(1)</script>.

## 2. Quem mantém o seu sistema?

Aqui está um ponto que raramente aparece nos manuais. ${filler(6)}

> 💡 **Em uma frase**: toda customização é uma dívida que alguém vai pagar na próxima versão.

## Síntese conceitual

Fechamos a semana com a ideia de que sistemas carregam pressupostos. ${filler(5)}

## O que vem por aí

Na Semana 3, vamos sair da infraestrutura e entrar nos dados que os sistemas produzem.

## Glossário rápido desta semana

- **SIGE**: Sistema de Informação para Gestão Educacional.
- **ERP**: planejamento de recursos empresariais.
- **SUAP**: Sistema Unificado de Administração Pública.

## Referências desta semana

- Portal do SUAP. Disponível em: <https://portal.suap.ifrn.edu.br/>.

## Pontos a conferir

- [1.1] Valor da economia citada no caso do Ifal
`;

const DERIVATIVES = {
  assessment: {
    title: "Atividade avaliativa — Semana 2",
    format: "6 questões objetivas, 5 alternativas",
    questions: [
      { type: "multiple-choice", objective: "Definir SIGE", q: "O que é um SIGE?", options: ["Um sistema de informação para gestão educacional", "Um navegador", "Um banco de dados isolado", "Uma norma", "Uma planilha de notas"], answer: 0, explanation: "Veja a seção 1.", feedbackByOption: ["Correto: a seção 1 define o SIGE assim.", "Não: releia a seção 1.", "Não: releia a seção 1.", "Não: releia a seção 1.1.", "Não: releia a seção 1."] },
      { type: "multiple-choice", objective: "Comparar", q: "Qual afirmação sobre neutralidade de sistemas é sustentada pelo texto?", options: ["Todo sistema é neutro.", "Sistemas carregam pressupostos de quem os desenhou.", "Só sistemas legados têm viés.", "Neutralidade depende do fornecedor.", "Sistemas livres são sempre neutros."], answer: 1, explanation: "Seção 1.1.", feedbackByOption: ["Releia a seção 1.1.", "Correto: é a lição do caso da seção 1.1.", "Releia a seção 1.1.", "Releia a seção 2.", "Releia a seção 2."] }
    ]
  },
  activities: [{ type: "fórum", title: "Fórum da semana", instructions: "Discuta.", durationMinutes: 40, evidence: "Post", required: true }],
  teacherGuide: { mediationMessages: { whatsapp: [{ relatedId: "stop-1", relatedType: "abertura", timing: "início", text: "Oi, gente! A semana começou." }], moodle: [{ relatedId: "stop-1", relatedType: "abertura", timing: "início", text: "Aviso: a semana começou." }] } }
};

function withFetch(handler, run) {
  const previous = { fetch: global.fetch, key: process.env.OPENAI_API_KEY, provider: process.env.AI_PROVIDER, anthropic: process.env.ANTHROPIC_API_KEY, writer: process.env.AULA_WRITER };
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.AI_PROVIDER;
  delete process.env.AULA_WRITER;
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url: String(url), headers: options.headers, body });
    const content = await handler(body, calls.length);
    return new Response(JSON.stringify(content), { status: 200, headers: { "content-type": "application/json" } });
  };
  const restore = () => {
    global.fetch = previous.fetch;
    for (const [name, value] of [["OPENAI_API_KEY", previous.key], ["AI_PROVIDER", previous.provider], ["ANTHROPIC_API_KEY", previous.anthropic], ["AULA_WRITER", previous.writer]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  };
  return Promise.resolve(run(calls)).finally(restore);
}

// Os testes abaixo cobrem a redação em uma chamada; o modo em partes paralelas tem testes próprios mais adiante.
process.env.AULA_WRITER_PARALLEL = "false";

const reply = (content, finish = "stop") => ({ choices: [{ finish_reason: finish, message: { content } }] });
const isDerivatives = (body) => body.messages.some((message) => message.role === "system" && /Recebe uma semana de material didático/.test(message.content));

test("inlineHtml escapa HTML e só reintroduz negrito, itálico e links http(s)", () => {
  assert.equal(inlineHtml("**a** e *b* <script>x</script>"), "<strong>a</strong> e <em>b</em> &lt;script&gt;x&lt;/script&gt;");
  assert.match(inlineHtml("[site](https://exemplo.org/a)"), /<a href="https:\/\/exemplo\.org\/a"/);
  assert.doesNotMatch(inlineHtml("[x](javascript:alert(1))"), /<a /);
});

test("analisador converte o Markdown em lessonPlan: estrutura, callouts, recursos e pontos a conferir", () => {
  const { lessonPlan: plan, stats } = parseWeekMarkdown(MARKDOWN, { weekNumber: 2, requiredReadings: 1, allowedUrls: new Set(["https://www.youtube.com/watch?v=abc123xyz00"]) });
  assert.equal(plan.theme, "Sistemas de gestão educacional");
  assert.match(plan.welcome, /<strong>DIKW<\/strong>/);
  assert.equal(plan.learningObjectives.length, 2);
  assert.equal(plan.contentSections.length, 2);
  const first = plan.contentSections[0];
  assert.equal(first.number, "1");
  assert.equal(first.subsections[0].number, "1.1");
  assert.ok(first.keyTerms.includes("SIGE"));
  // recurso ancorado na seção e outro na subseção
  assert.deepEqual(first.resources.map((resource) => resource.sectionNumber), ["1", "1.1"]);
  assert.equal(plan.resources.videos[0].href, "https://www.youtube.com/watch?v=abc123xyz00", "URL fornecida no briefing é mantida");
  assert.equal(plan.resources.readingsRequired[0].href, "", "URL inventada pelo modelo é descartada");
  assert.equal(plan.resources.readingsRequired[0].searchQuery, "Ifal implantação do Suap");
  assert.equal(plan.resources.readingsRequired[0].verificationStatus, "suggested-no-url");
  // callouts
  assert.deepEqual(first.callouts.map((callout) => callout.kind), ["reflexao", "atencao"]);
  assert.equal(first.callouts[0].anchor, "1.1");
  assert.equal(plan.contentSections[1].callouts[0].kind, "destaque");
  assert.match(first.reflection.question, /seu campus/);
  assert.equal(plan.glossary.length, 3);
  assert.equal(plan.references[0].citation, "Portal do SUAP. Disponível em: https://portal.suap.ifrn.edu.br/.");
  assert.equal(plan.claimEvidence[0].verificationStatus, "needs-human-review");
  assert.equal(plan.claimEvidence[0].sectionNumber, "1.1");
  assert.equal(plan.writer, "prose");
  assert.equal(stats.sections, 2);
  assert.match(plan.nextWeekConnection, /^<p>Na Semana 3/);
});

test("ida e volta: planToMarkdown devolve um texto que o analisador lê com a mesma estrutura", () => {
  const first = parseWeekMarkdown(MARKDOWN, { weekNumber: 2, requiredReadings: 1, allowedUrls: new Set(["https://www.youtube.com/watch?v=abc123xyz00"]) }).lessonPlan;
  const again = parseWeekMarkdown(planToMarkdown(first), { weekNumber: 2, requiredReadings: 1, allowedUrls: new Set(["https://www.youtube.com/watch?v=abc123xyz00"]) }).lessonPlan;
  assert.equal(again.contentSections.length, first.contentSections.length);
  assert.deepEqual(again.contentSections.map((section) => section.subsections.length), first.contentSections.map((section) => section.subsections.length));
  assert.deepEqual(again.contentSections.map((section) => section.callouts.length), first.contentSections.map((section) => section.callouts.length));
  assert.equal(again.glossary.length, first.glossary.length);
  assert.equal(again.resources.videos[0].href, first.resources.videos[0].href);
  assert.equal(again.learningObjectives.length, first.learningObjectives.length);
});

test("guia de voz traz o formato, o rigor e o exemplo aprovado", () => {
  assert.match(WRITER_SYSTEM_PROMPT, /Pontos a conferir/);
  assert.match(WRITER_SYSTEM_PROMPT, /NUNCA escreva uma URL/);
  assert.match(WRITER_SYSTEM_PROMPT, /EXEMPLO DE VOZ/);
  assert.match(WRITER_SYSTEM_PROMPT, /não existe sistema neutro/);
});

test("modo de prosa: duas chamadas (texto e derivados), blocos no formato de referência e ponte no prompt", async () => {
  await withFetch((body) => isDerivatives(body) ? reply(JSON.stringify(DERIVATIVES)) : reply(MARKDOWN), async (calls) => {
    const bridge = summarizeWeekBridge({ lessonPlan: { weekNumber: 1, theme: "Fundamentos", nextWeekConnection: "Gancho único QWERTY-77 para a semana seguinte, sobre sistemas.", glossary: [{ term: "DIKW" }] } }, 0);
    const raw = await generateOneWeek(input, 1, { deferRepair: true, singlePass: true, bridges: [bridge] });
    assert.equal(calls.length, 4, "uma chamada de redação e três de derivados (avaliação; atividades; mediação)");
    const derivativeCalls = calls.slice(1).map((call) => call.body.messages[1].content);
    assert.equal(derivativeCalls.filter((text) => /REGRAS DA AVALIAÇÃO/.test(text) && !/REGRAS DO MATERIAL DE MEDIAÇÃO/.test(text)).length, 1, "uma chamada só para a avaliação");
    assert.equal(derivativeCalls.filter((text) => /REGRAS DO MATERIAL DE MEDIAÇÃO/.test(text) && !/REGRAS DA AVALIAÇÃO/.test(text)).length, 1, "outra para o material de mediação");
    assert.equal(derivativeCalls.filter((text) => /REGRAS DAS ATIVIDADES/.test(text)).length, 1, "e outra para as atividades");
    const writerCall = calls[0].body;
    assert.match(writerCall.messages[0].content, /EXEMPLO DE VOZ/, "guia de voz vai no system");
    assert.doesNotMatch(JSON.stringify(writerCall.response_format || ""), /json_object/, "redação em texto livre, sem modo JSON");
    assert.match(writerCall.messages[1].content, /QWERTY-77/, "contrato de ponte chega ao prompt de redação");
    assert.match(writerCall.messages[1].content, /CONTRATO DE PONTE/);
    assert.match(calls[1].body.messages[1].content, /Um <strong>SIGE|Um SIGE \(Sistema/, "os derivados leem o texto escrito");

    const week = normalizeLesson(raw, input, 1);
    assert.equal(week.lessonPlan.writer, "prose");
    const topic = week.blocks.find((block) => block.type === "topic");
    const types = topic.props.children.map((child) => child.type);
    assert.ok(types.includes("accordion"), "glossário como acordeão");
    assert.ok(types.includes("reflexao") && types.includes("atencao") && types.includes("destaque"));
    const calloutTitles = topic.props.children.filter((child) => child.type === "destaque").map((child) => child.props.title);
    assert.ok(calloutTitles.includes("Em uma frase"));
    // callout de recurso só com link verificado: o vídeo (URL do briefing) vira player; o artigo sem URL não aparece como link
    assert.ok(!topic.props.children.some((child) => child.type === "destaque" && /inventado\.example/.test(child.props.body)));
    // o texto do artigo/ídeo vem depois do parágrafo da seção, e a reflexão fica logo após a subseção 1.1
    const order = topic.props.children.map((child) => child.type === "titulo" ? child.props.text : child.type);
    assert.ok(order.indexOf("1.1 Um caso real de decisão") < order.indexOf("reflexao"), "reflexão ancorada na subseção");
    assert.ok(order.indexOf("reflexao") < order.indexOf("2 Quem mantém o seu sistema?"));
    const quiz = week.blocks.find((block) => block.type === "quiz");
    assert.ok(quiz, "avaliação veio dos derivados");
    assert.equal(quiz.props.questions[0].feedbackByOption.length, 5);
    assert.equal(raw.teacherGuide.mediationMessages.whatsapp[0].text, "Oi, gente! A semana começou.");
    assert.equal(week.lessonPlan.claimEvidence[0].verificationStatus, "needs-human-review");
    assert.equal(raw.generationMeta.writer, "prose");
    assert.equal(raw.generationMeta.repairPending, true, "texto curto demais para o piso: fica marcado para refação");
    assert.equal(week.lessonPlan.learningObjectives.length > 0, true);
  });
});

test("modo de prosa na Anthropic usa cache de prompt no system e temperatura de redação", async () => {
  const previousProvider = process.env.AI_PROVIDER;
  const previousAnthropic = process.env.ANTHROPIC_API_KEY;
  const anthropicReply = (text) => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });
  await withFetch((body) => JSON.stringify(body.system || "").includes("Recebe uma semana") ? anthropicReply(JSON.stringify(DERIVATIVES)) : anthropicReply(MARKDOWN), async (calls) => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "k";
    try {
      await generateOneWeek(input, 1, { deferRepair: true, singlePass: true });
      assert.equal(calls.length, 4);
      assert.equal(calls[0].body.system[0].cache_control.type, "ephemeral");
      assert.ok(calls.every((call) => !("temperature" in call.body)), "Anthropic recusa temperature em modelos recentes");
      assert.match(calls[0].body.system[0].text, /EXEMPLO DE VOZ/);
      assert.ok(calls[0].body.max_tokens >= 6000);
    } finally {
      if (previousProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = previousProvider;
      if (previousAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previousAnthropic;
    }
  });
});

test("redação cortada pelo limite de saída pede a continuação e junta os trechos", async () => {
  const cut = MARKDOWN.indexOf("## Síntese conceitual");
  let writerCalls = 0;
  await withFetch((body) => {
    if (isDerivatives(body)) return reply(JSON.stringify(DERIVATIVES));
    writerCalls += 1;
    return writerCalls === 1 ? reply(MARKDOWN.slice(0, cut), "length") : reply(MARKDOWN.slice(cut));
  }, async (calls) => {
    const raw = await generateOneWeek(input, 1, { deferRepair: true, singlePass: true });
    assert.equal(writerCalls, 2);
    const continuation = calls[1].body.messages;
    assert.equal(continuation.at(-2).role, "assistant");
    assert.match(continuation.at(-1).content, /Continue exatamente de onde parou/);
    assert.ok(raw.lessonPlan.synthesis.length > 0, "a síntese veio na continuação");
    assert.equal(raw.generationMeta.writerStats.hasSynthesis, true);
  });
});

test("se os derivados falham, a semana ainda volta com o texto e fica marcada para refação", async () => {
  await withFetch((body) => isDerivatives(body) ? reply("isto não é json") : reply(MARKDOWN), async () => {
    const raw = await generateOneWeek(input, 1, { deferRepair: true, singlePass: true });
    assert.ok(raw.lessonPlan.contentSections.length >= 2);
    assert.equal(raw.generationMeta.repairPending, true);
    assert.match(raw.generationMeta.repairReason.join(" "), /avaliação e o Material de Mediação/);
  });
});

test("refação em prosa envia o texto atual e o pedido, preserva o resto e refaz os derivados", async () => {
  const { lessonPlan } = parseWeekMarkdown(MARKDOWN, { weekNumber: 2, requiredReadings: 1 });
  const current = normalizeLesson({ lessonPlan: { ...lessonPlan, ...DERIVATIVES } }, input, 1);
  await withFetch((body) => isDerivatives(body) ? reply(JSON.stringify(DERIVATIVES)) : reply(MARKDOWN.replace("Ifal", "IFG")), async (calls) => {
    const raw = await regenerateWeekWithAI(input, 1, current, "Troque o caso do Ifal pelo do IFG.");
    assert.equal(calls.length, 4);
    const prompt = calls[0].body.messages[1].content;
    assert.match(prompt, /TEXTO ATUAL DA SEMANA/);
    assert.match(prompt, /Troque o caso do Ifal pelo do IFG\./);
    assert.match(prompt, /praticamente idêntico/);
    assert.match(prompt, /Veja mais aqui/, "os callouts atuais voltam no texto enviado");
    assert.match(raw.lessonPlan.contentSections[0].subsections[0].body, /IFG/);
    assert.equal(raw.generationMeta.repairPending, false);
  });
});

test("AULA_WRITER=json mantém o modo anterior (uma única chamada JSON)", async () => {
  await withFetch((body) => reply(JSON.stringify({ lessonPlan: { theme: "X", welcome: "Oi", contentSections: [] }, teacherGuide: {} })), async (calls) => {
    process.env.AULA_WRITER = "json";
    await generateOneWeek(input, 0, { deferRepair: true, singlePass: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.response_format.type, "json_object");
  });
});

test("com deferDerivatives a redação sai sozinha e os derivados vêm de /api/derivatives (mesmo tratamento da semana)", async () => {
  const { default: derivativesHandler } = await import("../src/derivatives-handler.js");
  await withFetch((body) => isDerivatives(body) ? reply(JSON.stringify(DERIVATIVES)) : reply(MARKDOWN), async (calls) => {
    const raw = await generateOneWeek(input, 1, { deferRepair: true, singlePass: true, deferDerivatives: true });
    assert.equal(calls.length, 1, "só a redação");
    assert.equal(raw.generationMeta.derivativesPending, true);
    const week = normalizeLesson(raw, input, 1);
    assert.equal(week.generationMeta.derivativesPending, true, "o marcador sobrevive à normalização");

    const result = await new Promise((resolve, reject) => {
      const response = { headers: {}, statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(payload) { resolve({ status: this.statusCode, body: payload }); } };
      Promise.resolve(derivativesHandler({ method: "POST", headers: {}, body: { action: "derivatives", input, weekIndex: 1, week, teacherGuide: raw.teacherGuide } }, response)).catch(reject);
    });
    assert.equal(calls.length, 4, "redação + três chamadas de derivados");
    assert.equal(result.status, 200);
    assert.equal(result.body.generation.derivativesPending, false);
    assert.equal(result.body.week.generationMeta.derivativesPending, false);
    assert.equal(result.body.week.lessonPlan.assessment.questions[0].feedbackByOption.length, 5);
    assert.ok(result.body.week.blocks.some((block) => block.type === "quiz"));
    assert.equal(result.body.teacherGuide.mediationMessages.moodle[0].text, "Aviso: a semana começou.");
    assert.ok(result.body.week.lessonPlan.contentSections.length >= 2, "o texto escrito é preservado");
    assert.ok(result.body.week.lessonPlan.claimEvidence.length >= 1);
  });
});

test("api/regenerate-week despacha a ação derivatives (Vercel: /api/derivatives é encaminhado para lá)", async () => {
  const fs = await import("node:fs");
  const config = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(config.routes.some((route) => route.src === "/api/derivatives" && route.dest === "/api/regenerate-week"));
  const { default: regenerate } = await import("../api/regenerate-week.js");
  const result = await new Promise((resolve, reject) => {
    const response = { headers: {}, statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(payload) { resolve({ status: this.statusCode, body: payload }); } };
    Promise.resolve(regenerate({ method: "POST", headers: {}, body: { action: "derivatives", input, weekIndex: 0, week: {} } }, response)).catch(reject);
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, "DERIVATIVES_WEEK_MISSING");
});

test("se a redação demora demais, os derivados são adiados para a requisição seguinte", async () => {
  process.env.AULA_WRITER_DERIVATIVES_AFTER_MS = "-1";
  try {
    await withFetch((body) => isDerivatives(body) ? reply(JSON.stringify(DERIVATIVES)) : reply(MARKDOWN), async (calls) => {
      const current = normalizeLesson({ lessonPlan: parseWeekMarkdown(MARKDOWN, { weekNumber: 2 }).lessonPlan }, input, 1);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const raw = await regenerateWeekWithAI(input, 1, current, "Mais exemplos.");
      assert.equal(calls.length, 1);
      assert.equal(raw.generationMeta.derivativesPending, true);
    });
  } finally {
    delete process.env.AULA_WRITER_DERIVATIVES_AFTER_MS;
  }
});

test("parser: tabelas viram <table>, listas numeradas viram <ol> e voltam ao Markdown na refação", () => {
  const md = `# Semana 1 — Tema

## Boas-vindas

Olá.

## 1. Seção

Três movimentos acontecem juntos:

1. **Digitalização** — papel vira digital;
2. **Integração** — sistemas conversam;

| Dimensão | Impacto |
|---|---|
| **Pedagógica** | AVA e analytics |
| **Financeira** | Bolsas e orçamento |

Fecha o parágrafo.
`;
  const { lessonPlan } = parseWeekMarkdown(md, { weekNumber: 1 });
  const body = lessonPlan.contentSections[0].body;
  assert.match(body, /<ol><li><strong>Digitalização<\/strong>/);
  assert.match(body, /<table><thead><tr><th>Dimensão<\/th><th>Impacto<\/th><\/tr><\/thead><tbody><tr><td><strong>Pedagógica<\/strong>/);
  const back = planToMarkdown(lessonPlan);
  assert.match(back, /1\. \*\*Digitalização\*\*/);
  assert.match(back, /\| Dimensão \| Impacto \|\n\| --- \| --- \|\n\| \*\*Pedagógica\*\* \| AVA e analytics \|/);
});

test("modelos de referência: compacto na Anthropic, mínimo na OpenAI, e a semana modelo entra inteira", () => {
  const compact = writerSystemPrompt("compact");
  assert.match(compact, /<semana-modelo>/);
  assert.match(compact, /Busca Ativa Escolar/, "semana 1 aprovada vai no prompt");
  assert.match(compact, /<trecho semana="6"/);
  assert.doesNotMatch(REFERENCE_WEEK_ONE + JSON.stringify(REFERENCE_EXCERPTS), /https?:\/\//, "os modelos não carregam URLs para o modelo copiar");
  assert.doesNotMatch(writerSystemPrompt("minimal"), /<semana-modelo>/);
  assert.equal(writerModelsMode("anthropic"), "compact");
  assert.equal(writerModelsMode("openai"), "minimal");
});

test("tabelas em prosa viram blocos tabela no material final", () => {
  const md = `# Semana 1 — Tema

## Boas-vindas

Olá.

## 1. Seção

Antes da tabela.

| Dimensão | Impacto |
|---|---|
| **Pedagógica** | AVA e analytics |
| **Financeira** | Bolsas |

Depois da tabela.
`;
  const input = normalizeCourseInput({ title: "Curso", weeks: 1, hoursPerWeek: 4, year: 2026, author: "A" });
  const { lessonPlan } = parseWeekMarkdown(md, { weekNumber: 1 });
  const lesson = normalizeLesson({ lessonPlan }, input, 0);
  const topic = lesson.blocks.find((b) => b.type === "topic");
  const tabela = topic.props.children.find((c) => c.type === "tabela");
  assert.ok(tabela, "bloco tabela existe");
  assert.deepEqual(tabela.props.headers, ["Dimensão", "Impacto"]);
  assert.deepEqual(tabela.props.rows[0], ["Pedagógica", "AVA e analytics"]);
  assert.ok(!topic.props.children.some((c) => c.type === "prose" && /<table/.test(c.props.body)), "sem <table> solto em prosa");
});

test("api/regenerate-week escreve o texto e deixa a avaliação para /api/derivatives (uma chamada só)", async () => {
  await withFetch((body) => isDerivatives(body) ? reply(JSON.stringify(DERIVATIVES)) : reply(MARKDOWN), async (calls) => {
    const { default: regenerate } = await import("../api/regenerate-week.js");
    const current = normalizeLesson({ lessonPlan: parseWeekMarkdown(MARKDOWN, { weekNumber: 2 }).lessonPlan }, input, 1);
    const result = await new Promise((resolve, reject) => {
      const response = { setHeader() {}, statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { resolve({ status: this.statusCode, body: payload }); } };
      Promise.resolve(regenerate({ method: "POST", headers: {}, body: { input, weekIndex: 1, instruction: "Mais exemplos.", weeks: [current, current] } }, response)).catch(reject);
    });
    assert.equal(result.status, 200, result.body?.error);
    assert.equal(calls.length, 1, "só a redação; avaliação e mediação saem em /api/derivatives");
    assert.equal(result.body.week.generationMeta.derivativesPending, true);
  });
});

const OUTLINE = `# Semana 2 — Dados e decisão
1. Problema | cobre: a pergunta | caso ou dado concreto: Caso A | callouts: 🔎
2. Conceito | cobre: o conceito | caso ou dado concreto: Caso B | callouts: 💭
3. Caso | cobre: o caso | caso ou dado concreto: Caso C | callouts: 💡
4. Lição | cobre: a lição | caso ou dado concreto: Caso D | callouts: ⚠️
5. Limite | cobre: o limite | caso ou dado concreto: Caso E | callouts: 💭
6. Contraponto | cobre: o custo | caso ou dado concreto: Caso F | callouts: 🔎
7. Aplicação | cobre: o uso | caso ou dado concreto: Caso G | callouts: 💡`;
const OUTLINE_SHORT = OUTLINE.split("\n").slice(0, 5).join("\n");

test("roteiro: parseOutline conta seções numeradas e splitSectionRanges divide em 2 ou 3 partes", () => {
  const { title, sections } = parseOutline(OUTLINE);
  assert.match(title, /^# Semana 2/);
  assert.equal(sections.length, 7);
  assert.deepEqual(splitSectionRanges(6), [[1, 2], [3, 4], [5, 6]]);
  assert.deepEqual(splitSectionRanges(8), [[1, 3], [4, 6], [7, 8]]);
  assert.deepEqual(splitSectionRanges(4), [[1, 2], [3, 4]]);
  assert.deepEqual(splitSectionRanges(3), []);
  assert.equal(parseOutline("sem lista nenhuma").sections.length, 0);
});

test("redação em partes: um roteiro curto e três partes escritas ao mesmo tempo, unidas em ordem", async () => {
  process.env.AULA_WRITER_PARALLEL = "true";
  try {
    await withFetch((body) => {
      const user = body.messages.filter((message) => message.role === "user").map((message) => message.content).join("\n");
      if (isDerivatives(body)) return reply(JSON.stringify(DERIVATIVES));
      if (/ANTES DE ESCREVER/.test(user)) return reply(OUTLINE);
      const part = Number((user.match(/PARTE (\d) de 3/) || [])[1]);
      if (part === 1) return reply("# Semana 2 — Dados e decisão\n\n## Boas-vindas\n\nOlá.\n\n## Objetivos de aprendizagem\n- Explicar X.\n\n## 1. Problema\n\nTexto 1.\n\n## 2. Conceito\n\nTexto 2.\n\n## 3. Caso\n\nTexto 3.");
      if (part === 2) return reply("## 4. Lição\n\nTexto 4.\n\n## 5. Limite\n\nTexto 5.");
      return reply("## 6. Contraponto\n\nTexto 6.\n\n## 7. Aplicação\n\nTexto 7.\n\n## Síntese conceitual\n\nFecha.\n\n## O que vem por aí\n\nSemana 3.\n\n## Glossário rápido desta semana\n- **Termo**: definição.\n\n## Referências desta semana\n- Ref.\n\n## Pontos a conferir\n- [seção 1] Algo.");
    }, async (calls) => {
      const raw = await generateOneWeek(input, 1, { deferDerivatives: true });
      assert.equal(calls.length, 4, "roteiro + 3 partes");
      const sections = raw.lessonPlan.contentSections.map((section) => section.title);
      assert.deepEqual(sections, ["Problema", "Conceito", "Caso", "Lição", "Limite", "Contraponto", "Aplicação"]);
      assert.equal(raw.lessonPlan.contentSections.length, 7);
      assert.ok(raw.lessonPlan.synthesis);
    });
  } finally {
    process.env.AULA_WRITER_PARALLEL = "false";
  }
});

test("redação em partes: roteiro inaproveitável volta para uma chamada só", async () => {
  process.env.AULA_WRITER_PARALLEL = "true";
  try {
    await withFetch((body) => isDerivatives(body) ? reply(JSON.stringify(DERIVATIVES)) : reply(MARKDOWN), async (calls) => {
      const raw = await generateOneWeek(input, 1, { deferDerivatives: true });
      assert.equal(calls.length, 3, "roteiro inútil, nova tentativa do roteiro e redação inteira");
      assert.ok(raw.lessonPlan.contentSections.length >= 2);
    });
  } finally {
    process.env.AULA_WRITER_PARALLEL = "false";
  }
});

test("redação em partes: roteiro curto demais é pedido de novo uma vez", async () => {
  process.env.AULA_WRITER_PARALLEL = "true";
  try {
    let outlineCalls = 0;
    await withFetch((body) => {
      const user = body.messages.filter((message) => message.role === "user").map((message) => message.content).join("\n");
      if (isDerivatives(body)) return reply(JSON.stringify(DERIVATIVES));
      if (/ANTES DE ESCREVER/.test(user)) { outlineCalls += 1; return reply(outlineCalls === 1 ? OUTLINE_SHORT : OUTLINE); }
      const part = Number((user.match(/PARTE (\d) de 3/) || [])[1]);
      if (part === 1) return reply("# Semana 2 — Dados e decisão\n\n## Boas-vindas\n\nOlá.\n\n## Objetivos de aprendizagem\n- Explicar X.\n\n## 1. Problema\n\nT1.\n\n## 2. Conceito\n\nT2.\n\n## 3. Caso\n\nT3.");
      if (part === 2) return reply("## 4. Lição\n\nT4.\n\n## 5. Limite\n\nT5.");
      // Fechamento sem referências nem pontos a conferir: a rede de segurança pede só o que falta.
      if (part === 3) return reply("## 6. Contraponto\n\nT6.\n\n## 7. Aplicação\n\nT7.\n\n## Síntese conceitual\n\nFecha.\n\n## O que vem por aí\n\nSemana 3.\n\n## Glossário rápido desta semana\n- **Termo**: definição.");
      return reply("## Referências desta semana\n- Ref A.\n\n## Pontos a conferir\n- [seção 1] Algo.");
    }, async (calls) => {
      const raw = await generateOneWeek(input, 1, { deferDerivatives: true });
      assert.equal(outlineCalls, 2);
      assert.equal(raw.lessonPlan.contentSections.length, 7);
      assert.ok(raw.lessonPlan.references.length >= 1, "referências vieram do complemento de fechamento");
      assert.equal(calls.length, 6, "2 roteiros + 3 partes + 1 complemento");
    });
  } finally {
    process.env.AULA_WRITER_PARALLEL = "false";
  }
});
