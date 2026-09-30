import { KNOWN_BLOCK_TYPES, normalizeWeeklyOutput } from "./aula-schema.js";
import { buildTeacherGuide } from "./teacher-guide.js";

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
  return `Atue como designer instrucional e assistente de planejamento de curso. Complete somente os campos que estão vazios no briefing abaixo. Responda somente JSON válido com estas propriedades: audience (string), objectives (array de strings), content (string), webPractices (array de objetos), materials (array de objetos), references (array de strings), videoSearchSuggestions (array de strings), imageSearchSuggestions (array de strings), notes (array de strings).

Campos que precisam de preenchimento: ${missingFields.length ? missingFields.join(", ") : "nenhum; apenas revise e sugira melhorias"}.

Regras:
- não altere nem repita informações que já foram fornecidas;
- escreva em português do Brasil, com linguagem humana, clara e pedagogicamente útil;
- produza objetivos observáveis, progressivos e adequados ao público e ao nível;
- organize o conteúdo em uma sequência didática coerente com o número de semanas e a carga horária;
- se webpráticas estiverem ativadas, gere no mínimo uma e, quando pedagogicamente justificável, várias práticas distintas. Cada objeto deve conter title, type, moments, objective, preparation, materials, instructions, steps, product, criteria, assessment, continuation, fallbackPlan, resources e durationMinutes;
- alinhe cada webprática a objetivos e conteúdos específicos, distribuindo-as em momentos coerentes do calendário;
- gere materiais de apoio como objetos com type, title, link, moment, required, objective, alignment, use, pages, durationMinutes e notes. Eles devem servir aos objetivos e conteúdos, indicar por que serão usados, em que momento entram e como o estudante trabalhará com eles;
- para referências e artigos, sugira obras, autores, documentos ou fontes que o professor deve conferir; não invente URLs, DOI, páginas ou dados bibliográficos específicos;
- para vídeos e imagens, gere termos de busca e intenção pedagógica; use links somente quando já tiverem sido fornecidos pelo usuário;
- não preencha nome de autor ou instituição, pois esses dados devem vir do usuário;
- não escreva markdown fora das strings do JSON.

Briefing atual:
${JSON.stringify(input, null, 2)}

Retorne JSON válido agora.`;
}

function text(value) { return typeof value === "string" ? value.trim() : ""; }
function stringList(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function safeNumber(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

function normalizeBriefingPractice(practice, index) {
  return {
    id: text(practice?.id) || `webpractice-${index + 1}`,
    title: text(practice?.title) || `Webprática ${index + 1}`,
    type: text(practice?.type) || "Pesquisa orientada",
    modality: text(practice?.modality || practice?.format),
    moments: stringList(practice?.moments || practice?.moment),
    objective: text(practice?.objective),
    preparation: text(practice?.preparation),
    materials: stringList(practice?.materials),
    instructions: text(practice?.instructions),
    steps: Array.isArray(practice?.steps) ? practice.steps : stringList(practice?.steps),
    product: text(practice?.product),
    assessment: text(practice?.assessment),
    criteria: stringList(practice?.criteria || practice?.rubric),
    continuation: text(practice?.continuation),
    fallbackPlan: text(practice?.fallbackPlan || practice?.planB),
    resources: Array.isArray(practice?.resources) ? practice.resources : [],
    durationMinutes: Math.max(5, safeNumber(practice?.durationMinutes, 45))
  };
}

function normalizeBriefingMaterial(material, index) {
  return {
    id: text(material?.id) || `material-${index + 1}`,
    type: text(material?.type) || "Texto-base",
    title: text(material?.title),
    link: text(material?.link || material?.href),
    source: text(material?.source || material?.publisher || material?.institution),
    author: text(material?.author),
    required: Boolean(material?.required ?? material?.mandatory),
    moment: text(material?.moment),
    objective: text(material?.objective),
    alignment: text(material?.alignment || material?.contentAlignment),
    use: text(material?.use || material?.howToUse),
    pages: text(material?.pages),
    durationMinutes: Math.max(0, safeNumber(material?.durationMinutes, 0)),
    verificationStatus: text(material?.verificationStatus) || (material?.link ? "provided-needs-review" : "suggested-no-url"),
    notes: text(material?.notes)
  };
}

export async function assistBriefing(input, missingFields = []) {
  const raw = await callJson([
    { role: "system", content: "Você é um designer instrucional cuidadoso. Não invente URLs, fontes verificadas ou dados factuais não fornecidos." },
    { role: "user", content: buildBriefingPrompt(input, missingFields) }
  ]);
  return {
    audience: text(raw.audience), objectives: stringList(raw.objectives), content: text(raw.content),
    webPractices: Array.isArray(raw.webPractices) ? raw.webPractices.map(normalizeBriefingPractice) : [],
    materials: Array.isArray(raw.materials) ? raw.materials.map(normalizeBriefingMaterial) : [],
    references: stringList(raw.references), videoSearchSuggestions: stringList(raw.videoSearchSuggestions), imageSearchSuggestions: stringList(raw.imageSearchSuggestions), notes: stringList(raw.notes)
  };
}

export async function selectResourcesWithAI(input, research) {
  const candidates = {
    videos: (research.videos || []).map((result) => ({ request: result.request, status: result.status, candidates: (result.candidates || []).slice(0, 5) })),
    images: (research.images || []).map((result) => ({ request: result.request, status: result.status, candidates: (result.candidates || []).slice(0, 5) })),
    readings: (research.readings || []).map((result) => ({ request: result.request, status: result.status, candidates: (result.candidates || []).slice(0, 5) }))
  };
  const prompt = `Você é o curador final de recursos educacionais. A semana já foi escrita por um designer instrucional. Agora escolha, entre os candidatos reais abaixo, os recursos que melhor aprofundam os objetivos e os conceitos da semana.

Responda somente JSON válido com estas propriedades: videos, images, readings. Cada propriedade deve ser um array de objetos com candidateId, keep, reason, use, guidingQuestion, required, moment e query.

Regras obrigatórias:
- só escolha candidateId que exista nos candidatos recebidos;
- nunca invente URL, título, autor, duração, licença ou DOI;
- prefira material em ${input.language || "pt-BR"}, fonte institucional/acadêmica e recurso acessível;
- escolha no máximo 2 vídeos, 3 imagens/diagramas e 3 leituras por semana;
- elimine duplicatas e descarte recursos que não tenham relação clara com o conteúdo;
- explique em reason por que o recurso foi escolhido e em use como ele será usado pedagogicamente;
- marque required true somente quando o recurso for necessário para atingir um objetivo;
- se nenhum candidato servir, retorne keep false para aquele pedido.

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

const BLOCK_TYPES = [...KNOWN_BLOCK_TYPES].join(", ");

export function buildWeekGenerationPrompt(input, weekIndex = 0) {
  const weekNumber = weekIndex + 1;
  return `Gere UMA semana de material didático em JSON para o curso abaixo. Esta é a semana ${weekNumber} de ${input.weeks}. O resultado precisa ter nível de detalhamento próximo a uma unidade didática completa em DOCX: abertura, texto-base desenvolvido, seções numeradas, subseções quando úteis, estudo de caso quando fizer sentido, reflexões, recursos no ponto de uso, síntese, glossário, referências, avaliação e conexão com a próxima semana. Não entregue um resumo superficial nem apenas uma lista de links.

Retorne um objeto com exatamente estas propriedades de alto nível: meta, lessonPlan, blocks e teacherGuide. O teacherGuide é material exclusivo do professor e nunca deve ser repetido dentro de lessonPlan ou blocks.

lessonPlan deve conter:
- weekNumber, theme, welcome;
- didacticArc: escolha o arco adequado entre descoberta-conceitual, estudo-de-caso, oficina-aplicada, analise-de-dados, debate-orientado e revisao-e-sintese. Retorne id, label, rationale e sequence. Não use o mesmo arco automaticamente quando outro for mais apropriado;
- learningObjectives: 3 a 8 objetivos observáveis, coerentes com o curso e com esta semana;
- prerequisites e contentDensity;
- contentSections: 4 a 10 seções, conforme a complexidade real da semana. Cada seção deve ter number, title, didacticRole, body, subsections, caseStudy (quando fizer sentido), reflection (quando fizer sentido), keyTerms e resources. O body deve explicar conceitos, exemplos e implicações, com texto substancial. Evite repetir a mesma introdução em todas as seções;
- resources com arrays videos, readingsRequired, readingsExtra, images, podcasts e datasets. Cada recurso deve conter title, source, author quando conhecido, href somente se foi fornecido no briefing, required, sectionNumber ou moment, objective, guidingQuestion, pedagogicalUse, durationMinutes, altText/caption/credit para imagens, searchQuery quando o link não estiver disponível, verificationStatus e requiresVerification;
- webPractices: preserve somente as práticas fornecidas e programadas para esta semana. Se nenhuma prática estiver programada ou for necessária, retorne []. Nunca invente webprática apenas para preencher a estrutura. Na aula do aluno, deixe apenas uma orientação curta;
- teacherGuide: material exclusivo do professor com purpose, didacticArc, objectives, alignmentMatrix, diagnostic, formativeChecks, mediationQuestions, commonMisconceptions, interventions, differentiation (support, standard, extension), accessibility, assessmentNotes, selfAssessment, spiralReview, resourceNotes, qualityReview e workloadAdvice;
- para cada webprática programada no curso, desenvolva o projeto independente com context, prerequisites, teacherPreparation, studentPreparation, materials, steps com minutos, product/delivery, criteria/rubric, prompts, roteiro com blocos e duração, plano B, acessibilidade, continuidade e artifacts/files quando fizer sentido;
- activities: registre fóruns, discussões, comunicações síncronas, projetos e outras atividades com type, title, count, durationMinutes ou unitDurationMinutes, hoursPerCommunication e required;
- synthesis, nextWeekConnection, glossary, references e assessment;
- timePlan com targetMinutes 0, items vazio e calculationMethod "derived-after-content". O servidor calculará os tempos depois de receber o conteúdo; não invente a distribuição de horas aqui.

A avaliação semanal deve normalmente ter 6 questões objetivas: 4 de múltipla escolha com 4 alternativas e 2 de verdadeiro/falso, sempre alinhadas aos objetivos e com gabarito, explicação e versão Moodle GIFT quando possível.

blocks deve transformar o lessonPlan em uma leitura editável no Aula Studio e usar somente estes tipos: ${BLOCK_TYPES}. Respeite a anatomia exata do registro: hero com eyebrow/title/lead; topic com props.children; titulo com text/level; prose com body HTML; destaque/atencao/reflexao com suas props próprias; video com id/title/caption/credit/start; imagem com src/slotId/caption/credit/ratio; materiais com title/items[{type,title,source,href}]; quiz com title/intro/avaliativo/passMark/questions; sintese com eyebrow/title/body; referencias com title/items[{html}]. Os blocos de vídeo, imagem e materiais devem aparecer dentro de topic, imediatamente depois da seção ou conceito que justificou o recurso; não crie uma galeria final obrigatória. Na primeira etapa, use searchQuery para recursos sem URL; depois da redação o servidor pesquisará candidatos reais, a IA os selecionará e os converterá em blocos editáveis. Não coloque formatos inventados nem props de outro bloco. Um quiz deve usar props.questions com q, options, answer e explanation.

Regras de conteúdo e fontes:
- escreva em ${input.language}, com linguagem humana, clara, específica e pedagogicamente provocadora;
- distribua progressivamente os objetivos, sem copiar o mesmo bloco em semanas diferentes;
- respeite o público (${input.audience}) e nível (${input.level});
- use o recorte, os conteúdos e as práticas do briefing;
- apresente vídeos, imagens, artigos e leituras como recursos contextualizados, com a função pedagógica e o momento de uso;
- não force diagnóstico, vídeo, leitura, webprática ou quiz em toda semana; inclua apenas o que tiver função pedagógica;
- se didacticMode for diferente de auto, trate-o como preferência de percurso e mantenha liberdade para adaptar a sequência ao conteúdo;
- nunca invente URLs, DOI, durações, autores, números ou referências verificadas. Para um recurso ainda não conferido, use searchQuery e verificationStatus "suggested-no-url";
- se houver um link real no briefing, preserve-o e marque verificationStatus "provided-needs-review";
- não escreva markdown fora das strings do JSON e não inclua comentários.

Briefing estruturado:
${JSON.stringify({ ...input, weekToGenerate: weekNumber }, null, 2)}

Retorne somente JSON válido para esta semana.`;
}

export function buildGenerationPrompt(input) {
  return `Gere ${input.weeks} semanas, uma por objeto, seguindo o contrato de buildWeekGenerationPrompt. Varie o arco didático conforme o conteúdo; não inclua webprática em semanas não programadas; misture recursos no ponto de uso; mantenha teacherGuide separado e produza blocks exclusivamente para o aluno no Aula Studio. A carga horária será calculada depois do conteúdo.\n\n${JSON.stringify(input, null, 2)}`;
}

async function generateOneWeek(input, index) {
  const raw = await callJson([
    { role: "system", content: "Você é um designer instrucional rigoroso. Gere somente JSON válido, desenvolva uma semana completa e nunca invente fontes ou links." },
    { role: "user", content: buildWeekGenerationPrompt(input, index) }
  ]);
  return raw?.lessonPlan || raw?.blocks ? raw : raw?.week || raw;
}

export async function generateWithAI(input) {
  const weeks = [];
  const batchSize = Math.min(3, Math.max(1, Number(process.env.AULA_AI_BATCH_SIZE) || 3));
  for (let start = 0; start < input.weeks; start += batchSize) {
    const batch = await Promise.all(Array.from({ length: Math.min(batchSize, input.weeks - start) }, (_, offset) => generateOneWeek(input, start + offset)));
    weeks.push(...batch);
  }
  const normalizedWeeks = normalizeWeeklyOutput({ weeks }, input);
  const teacherGuides = normalizedWeeks.map((lesson, index) => buildTeacherGuide(input, lesson, { ...(weeks[index]?.teacherGuide || {}), webPractices: weeks[index]?.teacherGuide?.webPractices || weeks[index]?.lessonPlan?.webPractices || input.webPractices }, index));
  return { weeks: normalizedWeeks, teacherGuides };
}
