import { KNOWN_BLOCK_TYPES, normalizeWeeklyOutput } from "./aula-schema.js";

const providerBase = () => (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

function parseJson(content) {
  if (content && typeof content === "object") return content;
  const text = String(content || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  return JSON.parse(text);
}

async function callJson(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY não está configurada. Cadastre a chave como segredo na Vercel.");
    error.code = "AI_KEY_MISSING";
    throw error;
  }
  const response = await fetch(`${providerBase()}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    const error = new Error(`A API de IA recusou a solicitação: ${detail}`);
    error.code = "AI_PROVIDER_ERROR";
    throw error;
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error("A API de IA retornou uma resposta vazia.");
  return parseJson(content);
}

export function buildBriefingPrompt(input, missingFields = []) {
  return `Atue como designer instrucional e assistente de planejamento de curso. Complete somente os campos que estão vazios no briefing abaixo. Responda somente JSON válido com estas propriedades: audience (string), objectives (array de strings), content (string), webPractices (array de objetos), materials (array de objetos), references (array de strings), videoSearchSuggestions (array de strings), notes (array de strings).

Campos que precisam de preenchimento: ${missingFields.length ? missingFields.join(", ") : "nenhum; apenas revise e sugira melhorias"}.

Regras:
- não altere nem repita informações que já foram fornecidas;
- escreva em português do Brasil, com linguagem humana, clara e pedagogicamente útil;
- produza objetivos observáveis, progressivos e adequados ao público e ao nível;
- organize o conteúdo em uma sequência didática coerente com o número de semanas e a carga horária;
- se webpráticas estiverem ativadas, gere no mínimo uma e, quando pedagogicamente justificável, várias práticas distintas. Cada objeto deve conter title, type, moments, objective, instructions, product, assessment e durationMinutes. Não repita a mesma atividade com nomes diferentes;
- alinhe cada webprática a objetivos e conteúdos específicos, distribuindo-as em momentos coerentes do calendário;
- gere materiais de apoio como objetos com type, title, link, moment, objective, alignment, use e notes. Eles devem servir aos objetivos e conteúdos, indicar por que serão usados, em que momento entram e como o estudante trabalhará com eles;
- para referências, sugira obras, autores, documentos ou fontes que o professor deve conferir; não invente URLs, DOI ou dados bibliográficos específicos;
- para vídeos, gere termos de busca e tipos de material, não links inventados;
- não preencha nome de autor ou instituição, pois esses dados devem vir do usuário;
- não escreva markdown fora das strings do JSON.

Briefing atual:
${JSON.stringify(input, null, 2)}

Retorne JSON válido agora.`;
}

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function stringList(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }

export async function assistBriefing(input, missingFields = []) {
  const raw = await callJson([
    { role: "system", content: "Você é um designer instrucional cuidadoso. Não invente URLs, fontes verificadas ou dados factuais não fornecidos." },
    { role: "user", content: buildBriefingPrompt(input, missingFields) }
  ]);
  return {
    audience: text(raw.audience),
    objectives: stringList(raw.objectives),
    content: text(raw.content),
    webPractices: Array.isArray(raw.webPractices) ? raw.webPractices.map((practice, index) => ({
      id: text(practice?.id, `webpractice-${index + 1}`),
      title: text(practice?.title, `Webprática ${index + 1}`),
      type: text(practice?.type, "Pesquisa orientada"),
      moments: stringList(practice?.moments || practice?.moment),
      objective: text(practice?.objective),
      instructions: text(practice?.instructions),
      product: text(practice?.product),
      assessment: text(practice?.assessment),
      durationMinutes: Number(practice?.durationMinutes) || 45
    })) : [],
    materials: Array.isArray(raw.materials) ? raw.materials.map((material, index) => ({
      id: text(material?.id, `material-${index + 1}`),
      type: text(material?.type, "Texto-base"),
      title: text(material?.title),
      link: text(material?.link || material?.href),
      moment: text(material?.moment),
      objective: text(material?.objective),
      alignment: text(material?.alignment || material?.contentAlignment),
      use: text(material?.use || material?.howToUse),
      notes: text(material?.notes)
    })) : [],
    references: stringList(raw.references),
    videoSearchSuggestions: stringList(raw.videoSearchSuggestions),
    notes: stringList(raw.notes)
  };
}

export function buildGenerationPrompt(input) {
  return `Gere um planejamento pedagógico semanal em JSON para o curso abaixo. A resposta deve conter exatamente uma propriedade "weeks" com ${input.weeks} itens. Cada item deve conter "meta" e "blocks". Os blocos precisam ser compatíveis com o Aula Studio e usar somente estes tipos: ${[...KNOWN_BLOCK_TYPES].join(", ")}.

Regras pedagógicas:
- distribua progressivamente os objetivos e conteúdos ao longo das semanas;
- respeite ${input.hoursPerWeek} horas de estudo por semana;
- escreva em ${input.language};
- produza texto claro, humanizado, específico e sem frases genéricas;
- use webpráticas ${input.webPractice.enabled ? "quando fizer sentido, especialmente nos momentos indicados" : "não inclua"};
- quando houver várias webpráticas em input.webPractices, trate cada uma como atividade distinta e preserve seu objetivo, momento, produto e avaliação;
- use input.materials para inserir materiais de apoio nos momentos adequados, explicando no conteúdo semanal como cada material sustenta o objetivo ou conceito;
- mantenha referências e vídeos como materiais complementares, sem inventar URLs;
- para vídeos do YouTube, use o ID em props.id somente quando um link real foi fornecido;
- use HTML simples dentro de props.body quando necessário, sem scripts;
- um tópico deve colocar seus blocos internos em props.children;
- um quiz deve usar props.questions, cada questão com q, options, answer e explanation.

Briefing estruturado:
${JSON.stringify(input, null, 2)}

Retorne somente JSON válido, sem markdown, comentários ou texto fora do objeto.`;
}

export async function generateWithAI(input) {
  const raw = await callJson([
    { role: "system", content: "Você é um designer instrucional rigoroso. Gere somente JSON válido e nunca invente fontes ou links." },
    { role: "user", content: buildGenerationPrompt(input) }
  ]);
  return normalizeWeeklyOutput(raw, input);
}
