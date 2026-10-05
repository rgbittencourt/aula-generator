import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackLesson, normalizeCourseInput } from "../src/aula-schema.js";
import { enrichLessonsWithResources } from "../src/research.js";

function hasNestedBlock(blocks, type) {
  return (blocks || []).some((block) => block.type === type || hasNestedBlock(block.props?.children, type));
}

function hasResourceBridge(blocks) {
  return (blocks || []).some((block) => block.props?.resourceId && block.type === "prose" && /Compare|Leia este artigo|relacionar/i.test(block.props?.body || "") || hasResourceBridge(block.props?.children));
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
    if (value.includes("/chat/completions")) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ videos: [], images: [{ candidateId: "commons:image-generated-1:1", keep: true, reason: "Diagrama relacionado ao conceito.", use: "Visualizar o fluxo de indicadores.", required: false, sectionNumber: 2, bridgeParagraph: "Compare o fluxo do diagrama com a explicação desta seção e identifique onde uma decisão de gestão depende da qualidade do indicador.", moment: "após o texto-base", query: "indicadores educacionais" }], readings: [{ candidateId: "crossref:reading-generated-1:1", keep: true, reason: "Leitura acadêmica sobre o tema.", use: "Aprofundar o conceito.", required: true, sectionNumber: 2, bridgeParagraph: "Leia este artigo depois da definição apresentada e retorne ao caso para verificar qual evidência sustenta a interpretação proposta.", moment: "leitura obrigatória", query: "Indicadores educacionais" }] }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const [result] = await enrichLessonsWithResources(input, [lesson]);
    assert.equal(result.lessonPlan.resourceResearch.status, "ai-selected");
    assert.equal(result.lessonPlan.resources.images[0].provider, "wikimedia-commons");
    assert.equal(result.lessonPlan.resources.readingsRequired[0].provider, "crossref");
    assert.equal(result.lessonPlan.contentSections[1].resources.length, 2);
    assert.match(result.lessonPlan.contentSections[1].resources[0].bridgeParagraph, /diagrama|artigo/i);
    assert.ok(hasNestedBlock(result.blocks, "imagem"));
    assert.ok(hasNestedBlock(result.blocks, "materiais"));
    assert.ok(hasResourceBridge(result.blocks));
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

test("cobertura de recursos ignora keep:false e completa as metas com candidatos reais", async () => {
  const input = normalizeCourseInput({
    title: "Gestão educacional e dados",
    weeks: 1,
    content: "Indicadores, governança e tomada de decisão.",
    objectives: ["Analisar indicadores"],
    resourcePlan: { default: { videosPerWeek: 3, articlesPerWeek: 1, requiredReadingsPerWeek: 1 } }
  });
  const lesson = buildFallbackLesson(input, 0);
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.OPENAI_API_KEY;
  const previousYoutubeKey = process.env.YOUTUBE_API_KEY;
  const previousResearch = process.env.AULA_RESOURCE_RESEARCH;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.YOUTUBE_API_KEY = "test-youtube-key";
  process.env.AULA_RESOURCE_RESEARCH = "true";
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("youtube/v3/search")) {
      return new Response(JSON.stringify({ items: [1, 2, 3].map((index) => ({ id: { videoId: `video-candidate-${index}` }, snippet: { title: `Vídeo real ${index}`, channelTitle: "Canal acadêmico", description: "Descrição contextualizada", publishedAt: "2024-01-01", thumbnails: {} } })) }), { status: 200 });
    }
    if (value.includes("youtube/v3/videos")) {
      const ids = new URL(value).searchParams.get("id")?.split(",") || [];
      return new Response(JSON.stringify({ items: ids.map((id) => ({ id, status: { embeddable: true, privacyStatus: "public" }, snippet: { title: id, channelTitle: "Canal acadêmico", publishedAt: "2024-01-01", thumbnails: {} }, contentDetails: { duration: "PT8M" } })) }), { status: 200 });
    }
    if (value.includes("commons.wikimedia.org")) return new Response(JSON.stringify({ query: { pages: { "1": { title: "File:Fluxo.png", imageinfo: [{ thumburl: "https://commons.wikimedia.org/thumb/fluxo.png", descriptionurl: "https://commons.wikimedia.org/wiki/File:Fluxo.png", extmetadata: { ImageDescription: { value: "Fluxo de dados" }, LicenseShortName: { value: "CC BY-SA" } } }] } } } }), { status: 200 });
    if (value.includes("api.crossref.org")) return new Response(JSON.stringify({ message: { items: [{ title: ["Governança de dados na educação"], URL: "https://doi.org/10.1234/dados", DOI: "10.1234/dados", author: [{ given: "Ana", family: "Silva" }], published: { "date-parts": [[2024]] }, publisher: "Revista Teste" }] } }), { status: 200 });
    if (value.includes("/chat/completions")) return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      videos: [1, 2, 3].map((index) => ({ candidateId: `youtube:video-generated-${index}:1`, keep: false, reason: "Candidato recusado no primeiro passe", use: "Relacionar o vídeo ao conceito", query: "gestão educacional" })),
      images: [],
      readings: []
    }) } }] }), { status: 200 });
    return new Response("{}", { status: 200 });
  };
  try {
    const [result] = await enrichLessonsWithResources(input, [lesson]);
    assert.equal(result.lessonPlan.resources.videos.length, 3);
    assert.ok(result.lessonPlan.resources.videos.every((resource) => resource.href.startsWith("https://www.youtube.com/watch?v=")));
    assert.equal(new Set(result.lessonPlan.resources.videos.map((resource) => resource.href)).size, 3);
    assert.equal(result.lessonPlan.resources.images.length, 1);
    assert.equal(result.lessonPlan.resources.readingsRequired.length, 1);
    assert.equal(result.lessonPlan.resourceResearch.coverage.videos.selected, 3);
    assert.equal(result.lessonPlan.resourceResearch.coverage.videos.materialized, 3);
    const topic = result.blocks.find((block) => block.type === "topic");
    const inlineVideos = topic?.props?.children?.filter((block) => block.type === "prose" && block.props?.inlineVideo?.id) || [];
    assert.equal(new Set(inlineVideos.map((block) => block.props.inlineVideo.id)).size, 3);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousYoutubeKey === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = previousYoutubeKey;
    if (previousResearch === undefined) delete process.env.AULA_RESOURCE_RESEARCH; else process.env.AULA_RESOURCE_RESEARCH = previousResearch;
  }
});
