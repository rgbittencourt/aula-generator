import { callJson } from "./ai-client.js";

export async function selectResourcesWithAI(input, research) {
  const resourceTargets = research.resourceTargets || { videosPerWeek: 2, articlesPerWeek: 3, requiredReadingsPerWeek: 1, requiredReadingLevel: "essential" };
  const candidates = {
    videos: (research.videos || []).map((result) => ({ request: result.request, status: result.status, candidates: (result.candidates || []).slice(0, 5) })),
    images: (research.images || []).map((result) => ({ request: result.request, status: result.status, candidates: (result.candidates || []).slice(0, 5) })),
    readings: (research.readings || []).map((result) => ({ request: result.request, status: result.status, provider: result.provider, candidates: (result.candidates || []).slice(0, 5) }))
  };
  const prompt = `Você é o curador final de recursos educacionais. A semana já foi escrita por um designer instrucional. Agora escolha, entre os candidatos reais abaixo, os recursos que melhor aprofundam os objetivos e os conceitos da semana.

Responda somente JSON válido com estas propriedades: videos, images, readings. Cada propriedade deve ser um array de objetos com candidateId, keep, reason, use, guidingQuestion, required, moment, sectionNumber, bridgeParagraph, query, alignment, quality, currency, accessibility, durationFit, license, language, score, hasCaptions, hasTranscript, accessibilitySummary e lowBandwidthAlternative.

Regras obrigatórias:
- só escolha candidateId que exista nos candidatos recebidos;
- nunca invente URL, título, autor, duração, licença ou DOI;
- prefira material em ${input.language || "pt-BR"}, fonte institucional/acadêmica e recurso acessível;
- avalie explicitamente: alinhamento a um objetivo, confiabilidade/qualidade da fonte, atualidade, acessibilidade, duração em relação à carga, licença/crédito, idioma e momento didático;
- um vídeo sem legenda/transcrição deve trazer uma alternativa textual; uma imagem/diagrama deve trazer altText ou uma alternativa descritiva;
- escolha até ${resourceTargets.videosPerWeek} vídeo(s), até 3 imagens/diagramas, ${resourceTargets.articlesPerWeek} artigo(s) e ${Math.max(resourceTargets.articlesPerWeek, resourceTargets.requiredReadingsPerWeek)} leitura(s) por semana, respeitando as metas desta semana; o nível de leitura obrigatória é ${resourceTargets.requiredReadingLevel};
- elimine duplicatas e descarte recursos que não tenham relação clara com o conteúdo;
- explique em reason por que o recurso foi escolhido e em use como ele será usado pedagogicamente;
- informe sectionNumber e escreva bridgeParagraph com um parágrafo específico que conecte o recurso ao conceito estudado exatamente naquele ponto; nunca use apenas “assista ao vídeo” ou “leia o artigo”;
- marque required true somente quando o recurso for necessário para atingir um objetivo;
- se nenhum candidato servir, retorne keep false para aquele pedido;
- o professor fará a aprovação final: nunca marque o recurso como aprovado; apenas selecione-o como "selected-by-ai" e deixe a revisão humana pendente.

Curso e briefing:
${JSON.stringify({ title: input.title, audience: input.audience, level: input.level, objectives: input.objectives, content: input.content }, null, 2)}

Candidatos reais localizados pelos provedores:
${JSON.stringify(candidates, null, 2)}

Retorne somente o JSON. Não escreva explicações fora dele.`;
  const raw = await callJson([
    { role: "system", content: "Você seleciona recursos reais. Nunca crie links ou dados bibliográficos." },
    { role: "user", content: prompt }
  ]);
  return {
    videos: Array.isArray(raw?.videos) ? raw.videos : [],
    images: Array.isArray(raw?.images) ? raw.images : [],
    readings: Array.isArray(raw?.readings) ? raw.readings : []
  };
}
