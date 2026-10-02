import assert from "node:assert/strict";
import test from "node:test";
import { RESOURCE_PROVIDERS, searchResources } from "../src/resource-providers.js";

test("registro de provedores mantém tipos estáveis e amplia referências com OpenAlex", async () => {
  assert.equal(typeof RESOURCE_PROVIDERS.video, "function");
  assert.equal(typeof RESOURCE_PROVIDERS.image, "function");
  assert.equal(typeof RESOURCE_PROVIDERS.reading, "function");

  const previousFetch = globalThis.fetch;
  const previousOpenAlex = process.env.AULA_OPENALEX_ENABLED;
  process.env.AULA_OPENALEX_ENABLED = "true";
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("api.crossref.org")) {
      return new Response(JSON.stringify({ message: { items: [{ title: ["Um artigo sobre gestão educacional"], URL: "https://doi.org/10.1000/crossref", DOI: "10.1000/crossref", author: [{ given: "Ana", family: "Silva" }], published: { "date-parts": [[2024]] }, publisher: "Revista Teste" }] } }), { status: 200 });
    }
    if (value.includes("api.openalex.org")) {
      return new Response(JSON.stringify({ results: [{ title: "Dados educacionais e tomada de decisão", doi: "https://doi.org/10.1000/openalex", publication_year: 2023, authorships: [{ author: { display_name: "Bruno Souza" } }], primary_location: { landing_page_url: "https://example.org/openalex", source: { display_name: "Revista Educação" } }, open_access: { is_oa: true, oa_url: "https://example.org/openalex" } }] }), { status: 200 });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const [result] = await searchResources("reading", [{ requestId: "reading-1", query: "dados educacionais" }], { language: "pt-BR" });
    assert.equal(result.provider, "crossref+openalex");
    assert.equal(result.providers.crossref, "ok");
    assert.equal(result.providers.openalex, "ok");
    assert.deepEqual(result.candidates.map((candidate) => candidate.provider), ["crossref", "openalex"]);
    assert.equal(result.candidates[1].openAccess, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousOpenAlex === undefined) delete process.env.AULA_OPENALEX_ENABLED;
    else process.env.AULA_OPENALEX_ENABLED = previousOpenAlex;
  }
});
