import { KNOWN_BLOCK_TYPES, normalizeWeeklyOutput } from "./aula-schema.js";

const providerBase = () => (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

export function buildGenerationPrompt(input) {
  return `Gere um planejamento pedagógico semanal em JSON para o curso abaixo. A resposta deve conter exatamente uma propriedade "weeks" com ${input.weeks} itens. Cada item deve conter "meta" e "blocks". Os blocos precisam ser compatíveis com o Aula Studio e usar somente estes tipos: ${[...KNOWN_BLOCK_TYPES].join(", ")}.

Regras pedagógicas:
- distribua progressivamente os objetivos e conteúdos ao longo das semanas;
- respeite ${input.hoursPerWeek} horas de estudo por semana;
- escreva em ${input.language};
- produza texto claro, humanizado, específico e sem frases genéricas;
- use webpráticas ${input.webPractice.enabled ? "quando fizer sentido, especialmente nos momentos indicados" : "não inclua"};
- mantenha referências e vídeos como materiais complementares, sem inventar URLs;
- para vídeos do YouTube, use o ID em props.id; para outros links, use materiais ou conteúdo externo;
- use HTML simples dentro de props.body quando necessário, sem scripts;
- um tópico deve colocar seus blocos internos em props.children;
- um quiz deve usar props.questions, cada questão com q, options, answer e explanation.

Briefing estruturado:
${JSON.stringify(input, null, 2)}

Retorne somente JSON válido, sem markdown, comentários ou texto fora do objeto.`;
}

function parseJson(content) {
  if (content && typeof content === "object") return content;
  const text = String(content || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  return JSON.parse(text);
}

export async function generateWithAI(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY não está configurada. Copie .env.example para .env e informe sua chave.");
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
      messages: [
        { role: "system", content: "Você é um designer instrucional rigoroso. Gere somente JSON válido e nunca invente fontes ou links." },
        { role: "user", content: buildGenerationPrompt(input) }
      ]
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
  return normalizeWeeklyOutput(parseJson(content), input);
}
