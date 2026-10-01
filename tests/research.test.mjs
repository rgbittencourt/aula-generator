import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackLesson, normalizeCourseInput } from "../src/aula-schema.js";
import { enrichLessonsWithResources } from "../src/research.js";

function hasNestedBlock(blocks, type) {
  return (blocks || []).some((block) => block.type === type || hasNestedBlock(block.props?.children, type));
}

test("pesquisa simulada seleciona imagem/leitura e gera blocos Aula Studio", async () => {
  const input = normalizeCourseInput({ title: "Indicadores educacionais", weeks: 1, hoursPerWeek: 2, content: "Indicadores e análise de dados para gestão educacional", objectives: ["Analisar indicadores"] });
  const lesson = buildFallbackLesson(input, 0);
  const previousFetch = globalThis.fetch;
  const previousResearch = process.env.AULA_RESOURCE_RESEARCH;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.AULA_RESOURCE_RESEARCH = "true";
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("commons.wikimedia.org")) return new Response(JSON.stringify({ query: { pages: { "1": { title: "File:Diagrama.png", imageinfo: [{ thumburl: "https://commons.wikimedia.org/thumb/diagrama.png", descriptionurl: "https://commons.wikimedia.org/wiki/File:Diagrama.png", extmetadata: { ImageDescription: { value: "Diagrama de indicadores" }, Artist: { value: "Autor Teste" }, LicenseShortName: { value: "CC BY-SA" } } }] } } } }), { status: 200, headers: { "content-type": "application/json" } });
    if (value.includes("api.crossref.org")) return new Response(JSON.stringify({ message: { items: [{ title: ["Indicadores educacionais"], URL: "https://doi.org/10.1234/teste", DOI: "10.1234/teste", author: [{ given: "Ana", family: "Silva" }], published: { "date-parts": [[2024]] }, publisher: "Revista Teste" }] } }), { status: 200, headers: { "content-type": "application/json" } });
    if (value.includes("/chat/completions")) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ videos: [], images: [{ candidateId: "commons:image-generated-1:1", keep: true, reason: "Diagrama relacionado ao conceito.", use: "Visualizar o fluxo de indicadores.", required: false, moment: "após o texto-base", query: "indicadores educacionais" }], readings: [{ candidateId: "crossref:reading-generated-1:1", keep: true, reason: "Leitura acadêmica sobre o tema.", use: "Aprofundar o conceito.", required: true, moment: "leitura obrigatória", query: "Indicadores educacionais" }] }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const [result] = await enrichLessonsWithResources(input, [lesson]);
    assert.equal(result.lessonPlan.resourceResearch.status, "ai-selected");
    assert.equal(result.lessonPlan.resources.images[0].provider, "wikimedia-commons");
    assert.equal(result.lessonPlan.resources.readingsRequired[0].provider, "crossref");
    assert.ok(hasNestedBlock(result.blocks, "imagem"));
    assert.ok(hasNestedBlock(result.blocks, "materiais"));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousResearch === undefined) delete process.env.AULA_RESOURCE_RESEARCH; else process.env.AULA_RESOURCE_RESEARCH = previousResearch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
});

test("fallback da curadoria insere recurso real quando a IA retorna seleção vazia", async () => {
  const input = normalizeCourseInput({ title: "Teste visual", weeks: 1, content: "Fluxo de indicadores educacionais.", objectives: ["Analisar indicadores"] });
  const lesson = buildFallbackLesson(input, 0);
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("commons.wikimedia.org")) return new Response(JSON.stringify({ query: { pages: { "1": { title: "File:Diagrama.png", imageinfo: [{ thumburl: "https://commons.wikimedia.org/thumb/diagrama.png", descriptionurl: "https://commons.wikimedia.org/wiki/File:Diagrama.png", extmetadata: { ImageDescription: { value: "Diagrama de indicadores" }, LicenseShortName: { value: "CC BY-SA" } } }] } } } }), { status: 200 });
    if (value.includes("api.crossref.org")) return new Response(JSON.stringify({ message: { items: [] } }), { status: 200 });
    if (value.includes("/chat/completions")) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ videos: [], images: [], readings: [] }) } }] }), { status: 200 });
    return new Response("{}", { status: 200 });
  };
  try {
    const [result] = await enrichLessonsWithResources(input, [lesson]);
    const topic = result.blocks.find((block) => block.type === "topic");
    const image = topic?.props?.children?.find((block) => block.type === "imagem");
    assert.equal(result.lessonPlan.resourceResearch.status, "ai-selected-with-provider-fallback");
    assert.equal(image?.props?.src, "https://commons.wikimedia.org/thumb/diagrama.png");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
  }
});
