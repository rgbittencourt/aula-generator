import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import JSZip from "jszip";
import { normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { produceCourse, produceWeek, settingForWeek, PRODUCTION_SETTINGS } from "../src/production.js";
import { createProductionWorkbook, hasProduction, productionMarkdown, productionSheets, productionVideos, formatDuration } from "../src/production-xlsx.js";
import { createWeeksZip } from "../src/zip.js";

const input = normalizeCourseInput({ title: "Tecnologias para Gestão Educacional", weeks: 3, hoursPerWeek: 4, year: 2026, author: "Rogério" });
const week = normalizeLesson({ lessonPlan: { theme: "Sistemas acadêmicos", welcome: "Bem-vindos.", learningObjectives: ["Comparar sistemas"], contentSections: [{ number: "1", title: "SUAP e SIGAA", body: "<p>O SUAP nasceu no IFRN.</p>" }], synthesis: "Fechamento.", nextWeekConnection: "Próxima: dados." } }, input, 1);

const segment = (time, speech) => ({ time, scene: "Cena & enquadramento <aberto>", speech, onScreen: "Texto" });
const VIDEOS = { moodleVideo: { title: "Abertura", durationMinutes: 3.5, setting: "praia", description: "Desc", linkToPreviousWeek: "Semana passada", linkToNextWeek: "Semana que vem", segments: [segment("0:00", "Olá, pessoal!"), segment("0:30", "Vamos lá.")], postProduction: "Legenda" }, whatsappVideo: { title: "Zap", durationSeconds: 30, segments: [segment("0:00", "Fala rápida")], message: "Msg" } };
const SLIDES = { title: "Sistemas", description: "Apresentação", slides: [{ number: 9, title: "Abertura", bullets: ["a", "b"], visual: "Linha do tempo", narration: "Bem-vindos à semana dois.", seconds: 30, sectionRef: "1" }, { title: "SUAP", bullets: ["c"], visual: "Mapa", narration: "O SUAP nasceu no IFRN, no Rio Grande do Norte.", sectionRef: "1" }], ttsNotes: [{ term: "SUAP", say: "suape", pause: "" }] };
const COURSE = { videos: [{ key: "closing", title: "Fim", segments: [segment("0:00", "Tchau")] }, { key: "opening", title: "Abertura UC", platform: "Moodle", segments: [segment("0:00", "Oi")] }, { key: "whatsapp", title: "UC no zap", platform: "WhatsApp", segments: [segment("0:00", "TGE é a melhor")], message: "Zap" }] };

function fakeAsk(calls = []) {
  return async (messages, options) => {
    calls.push({ messages, options });
    const label = options.label;
    if (label === "production:videos") return VIDEOS;
    if (label === "production:slides") return SLIDES;
    if (label === "production:course") return COURSE;
    throw new Error("rótulo inesperado " + label);
  };
}

test("cenários rotacionam entre as semanas", () => {
  assert.equal(settingForWeek(0), PRODUCTION_SETTINGS[0]);
  assert.notEqual(settingForWeek(0), settingForWeek(1));
  assert.equal(settingForWeek(PRODUCTION_SETTINGS.length), settingForWeek(0));
});

test("produceWeek: duas chamadas em paralelo, normaliza roteiros, slides e narração", async () => {
  const calls = [];
  const result = await produceWeek(input, 1, week, { previousTheme: "Semana 1", nextTheme: "Dados" }, fakeAsk(calls));
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.options.cacheSystem && call.messages[0].role === "system"));
  assert.match(calls[0].messages[1].content, /Semana anterior: Semana 1/);
  assert.match(calls[0].messages[1].content, /O SUAP nasceu no IFRN/);
  assert.equal(result.weekNumber, 2);
  assert.deepEqual(result.missing, []);
  assert.equal(result.moodleVideo.speech, "Olá, pessoal!\n\nVamos lá.");
  assert.equal(result.moodleVideo.durationSeconds, 210);
  assert.equal(result.whatsappVideo.durationSeconds, 30);
  assert.deepEqual(result.slides.slides.map((slide) => slide.number), [1, 2]);
  assert.equal(result.slides.narrationText, "Bem-vindos à semana dois.\n\nO SUAP nasceu no IFRN, no Rio Grande do Norte.");
  assert.ok(result.slides.estimatedMinutes > 0);
});

test("produceWeek: se uma chamada falha, devolve o que deu certo e marca o que faltou", async () => {
  const ask = async (messages, options) => { if (options.label === "production:slides") throw new Error("estouro"); return VIDEOS; };
  const result = await produceWeek(input, 0, week, {}, ask);
  assert.ok(result.moodleVideo.segments.length);
  assert.deepEqual(result.missing, ["slides e narração"]);
  assert.match(result.errors[0], /estouro/);
  await assert.rejects(produceWeek(input, 0, week, {}, async () => { throw new Error("tudo falhou"); }), /tudo falhou/);
});

test("produceWeek: exige a semana já escrita", async () => {
  await assert.rejects(produceWeek(input, 0, { lessonPlan: {} }, {}, fakeAsk()), (error) => error.code === "PRODUCTION_WEEK_MISSING");
});

test("produceCourse: apresentação, WhatsApp e encerramento, em ordem", async () => {
  const result = await produceCourse(input, [week], fakeAsk());
  assert.deepEqual(result.videos.map((video) => video.key), ["opening", "whatsapp", "closing"]);
  assert.equal(result.videos[1].platform, "WhatsApp");
  await assert.rejects(produceCourse(input, [], async () => ({ videos: [] })), (error) => error.code === "PRODUCTION_FAILED");
});

test("planilha: vídeos, abas, validações e IDs", async () => {
  const course = await produceCourse(input, [week], fakeAsk());
  const production = { course, weeks: { 1: await produceWeek(input, 1, week, {}, fakeAsk()) } };
  assert.ok(hasProduction(production));
  assert.ok(!hasProduction({ course: null, weeks: {} }));
  assert.deepEqual(productionVideos(production).map((video) => video.id), ["UC-ABERTURA", "UC-WHATS", "UC-ENCERRAMENTO", "S02-MOODLE", "S02-WHATS", "S02-SLIDES"]);
  const names = productionSheets(production, { title: "TGE" }).map((sheet) => sheet.name);
  assert.deepEqual(names, ["Leia-me", "Produção", "Roteiros", "Slides", "Narração"]);
  const buffer = await createProductionWorkbook(JSZip, production, { title: "TGE & <cia>" }, "nodebuffer");
  const zip = await JSZip.loadAsync(buffer);
  const sheet2 = await zip.file("xl/worksheets/sheet2.xml").async("string");
  assert.match(sheet2, /S02-MOODLE/);
  assert.match(sheet2, /<dataValidation type="list"[^>]*sqref="F2:F/);
  assert.match(sheet2, /Olá, pessoal!/);
  const sheet1 = await zip.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(sheet1, /TGE &amp; &lt;cia&gt;/);
  const slidesSheet = await zip.file("xl/worksheets/sheet4.xml").async("string");
  assert.match(slidesSheet, /• a/);
  assert.equal(formatDuration(210), "3:30");
  const md = productionMarkdown(production, { title: "TGE" });
  assert.match(md, /## Unidade curricular/);
  assert.match(md, /## Semana 2/);
  assert.match(md, /#### Slide 2 — SUAP/);
});

test("ZIP inclui a planilha e os roteiros quando há produção", async () => {
  const production = { course: null, weeks: { 1: await produceWeek(input, 1, week, {}, fakeAsk()) } };
  const buffer = await createWeeksZip(input, [week], null, [{}], { production });
  const zip = await JSZip.loadAsync(buffer);
  assert.ok(zip.file("producao/planilha-de-producao.xlsx"));
  assert.match(await zip.file("producao/roteiros-de-video.md").async("string"), /Semana 2/);
  const without = await JSZip.loadAsync(await createWeeksZip(input, [week], null, [{}], {}));
  assert.equal(without.file("producao/planilha-de-producao.xlsx"), null);
});

test("public/production-xlsx.js é cópia de src/production-xlsx.js", () => {
  assert.equal(fs.readFileSync(new URL("../public/production-xlsx.js", import.meta.url), "utf8"), fs.readFileSync(new URL("../src/production-xlsx.js", import.meta.url), "utf8"));
});

test("handler: dispatch por api/regenerate-week, erros claros sem chave e sem semana", async () => {
  const { default: handler } = await import("../api/regenerate-week.js");
  const run = async (body) => {
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(payload) { this.payload = payload; return this; } };
    await handler({ method: "POST", headers: {}, body }, response);
    return response;
  };
  const previous = { provider: process.env.AI_PROVIDER, anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY, access: process.env.AULA_ACCESS_CODE };
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.AULA_ACCESS_CODE;
  try {
    const noWeek = await run({ action: "production", scope: "week", input, weekIndex: 0, week: { lessonPlan: {} } });
    assert.equal(noWeek.code, 400);
    assert.equal(noWeek.payload.code, "PRODUCTION_WEEK_MISSING");
    const noKey = await run({ action: "production", scope: "course", input, weeks: [week] });
    assert.equal(noKey.code, 503);
    assert.equal(noKey.payload.code, "AI_KEY_MISSING");
  } finally {
    for (const [key, value] of [["AI_PROVIDER", previous.provider], ["ANTHROPIC_API_KEY", previous.anthropic], ["OPENAI_API_KEY", previous.openai], ["AULA_ACCESS_CODE", previous.access]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
