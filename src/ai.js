import { KNOWN_BLOCK_TYPES, normalizeLesson, normalizeWeeklyOutput } from "./aula-schema.js";
import { measureLessonQuality, qualityPromptGuidance } from "./content-quality.js";
import { buildTeacherGuide } from "./teacher-guide.js";
import { ACADEMIC_SYSTEM_PROMPT, buildAcademicPlanPrompt, buildAcademicReviewPrompt, normalizeAcademicPlan, normalizeAcademicReview, normalizeAcademicProfile } from "./academic.js";

const providerBase = () => (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

function parseJson(content) {
  if (content && typeof content === "object") return content;
  const text = String(content || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  return JSON.parse(text);
}

async function callJson(messages, options = {}) {
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
      model: options.model || process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: options.temperature ?? 0.45,
      max_tokens: Number(process.env.OPENAI_MAX_TOKENS || 16000),
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
- respeite o academicProfile recebido, especialmente profundidade, quantidade de seções, referências e exigência de contrapontos;
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
    { role: "system", content: `${ACADEMIC_SYSTEM_PROMPT}\n\nNesta etapa, complete somente os campos vazios do briefing. Não invente URLs, fontes verificadas ou dados factuais não fornecidos.` },
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

Responda somente JSON válido com estas propriedades: videos, images, readings. Cada propriedade deve ser um array de objetos com candidateId, keep, reason, use, guidingQuestion, required, moment, query, alignment, quality, currency, accessibility, durationFit, license, language, score, hasCaptions, hasTranscript, accessibilitySummary e lowBandwidthAlternative.

Regras obrigatórias:
- só escolha candidateId que exista nos candidatos recebidos;
- nunca invente URL, título, autor, duração, licença ou DOI;
- prefira material em ${input.language || "pt-BR"}, fonte institucional/acadêmica e recurso acessível;
- avalie explicitamente: alinhamento a um objetivo, confiabilidade/qualidade da fonte, atualidade, acessibilidade, duração em relação à carga, licença/crédito, idioma e momento didático;
- um vídeo sem legenda/transcrição deve trazer uma alternativa textual; uma imagem/diagrama deve trazer altText ou uma alternativa descritiva;
- escolha no máximo 2 vídeos, 3 imagens/diagramas e 3 leituras por semana;
- elimine duplicatas e descarte recursos que não tenham relação clara com o conteúdo;
- explique em reason por que o recurso foi escolhido e em use como ele será usado pedagogicamente;
- marque required true somente quando o recurso for necessário para atingir um objetivo;
- se nenhum candidato servir, retorne keep false para aquele pedido.
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

const BLOCK_TYPES = [...KNOWN_BLOCK_TYPES].join(", ");

export function buildWeekGenerationPrompt(input, weekIndex = 0, academicPlan = null) {
  const weekNumber = weekIndex + 1;
  const previous = weekNumber > 1 ? `A semana anterior foi a ${weekNumber - 1}; retome um conceito dela e mostre como esta semana avança.` : "Esta é a abertura do curso; construa a base conceitual e anuncie o percurso.";
  const profile = normalizeAcademicProfile(input.academicProfile, input);
  return `Gere UMA semana de material didático: uma unidade didática semanal completa em JSON para o curso abaixo. Esta é a semana ${weekNumber} de ${input.weeks}. ${previous}

${qualityPromptGuidance(input)}

O texto é o produto principal. Não entregue resumo, tópicos telegráficos, frases soltas, uma lista de links ou apenas instruções para o professor. Escreva para o estudante ler e aprender. O padrão de referência é uma aula em DOCX com abertura, objetivos, explicação conceitual, exemplos, casos, contrapontos críticos, síntese, glossário, referências e avaliação. Varie o arco didático conforme o tema; webprática só aparece se estiver programada para esta semana.

Retorne somente este objeto de alto nível: { meta, lessonPlan, teacherGuide }. Não gere blocks: o servidor transformará o lessonPlan em blocos editáveis do Aula Studio depois da validação. teacherGuide é exclusivo do professor e nunca deve ser repetido no conteúdo do aluno.

lessonPlan obrigatório:
- weekNumber, theme (título específico e informativo, nunca "Conteúdo da semana"), welcome (80–160 palavras, contextualizada e ligada ao percurso), didacticArc com sequence, phasePlan e omissionReasons. A phasePlan pode omitir etapas, mas deve justificar a omissão;
- learningObjectives com 4–8 objetivos observáveis, específicos desta semana, usando verbos como explicar, comparar, analisar, aplicar, avaliar ou criar;
- prerequisites e contentDensity;
- contentSections com 6–12 seções/subseções quando a complexidade pedir. Cada seção deve ter number, title, didacticRole, body com 180–450 palavras substanciais, subsections, caseStudy quando pertinente, reflection quando pertinente, keyTerms e resources. A progressão deve ir do problema/pergunta para conceitos, exemplos ou evidências, aplicação e crítica. Não repita a mesma introdução em seções diferentes;
- resources com videos, readingsRequired, readingsExtra, images, podcasts e datasets. Cada recurso deve conter title, source, author quando conhecido, href somente se foi fornecido no briefing ou retornado por um provedor, required, sectionNumber ou moment, objective, guidingQuestion, pedagogicalUse, durationMinutes, altText/caption/credit para imagens, searchQuery quando o link não estiver disponível, verificationStatus e requiresVerification;
- webPractices: preserve somente as práticas fornecidas e programadas para esta semana; se não houver prática programada, retorne []. Uma prática deve ser um projeto independente com problem, context, studentRole, challenge, deliverable, prerequisites, materials, data, steps (cada uma com minutes, instructions e evidence), criteria, rubric com níveis, examples, revision, fallbackPlan, accessibility e versões simplified/advanced. Desenvolva o projeto completo no teacherGuide; no JSON do aluno deixe somente a orientação necessária no ponto da atividade;
- diagnostic com pergunta/problema inicial, evidência esperada e feedback; formativeChecks com perguntas durante o texto, momento, evidência, feedback e ação de intervenção;
- activities para fóruns, discussões, produção, estudo de caso ou encontro síncrono, com type, title, instructions, durationMinutes, evidence, evidenceType, feedback, criteria e required;
- alignmentMatrix: uma linha por objetivo, ligando contentSections, activities, evidence e assessmentQuestions. Não deixe objetivo sem atividade, evidência e avaliação;
- differentiation com trilhas support/essential, standard e extension, cada uma com instruções e recursos;
- accessibility com alternativas para baixa conexão, linguagem clara, uso em celular, diagramas e mídias;
- selfAssessment com perguntas de autoavaliação, escala e feedback;
- spiralReview com previousConceptsReviewed, newConcepts, preparationForNextWeek, cumulativeEvidence e projectMilestone;
- synthesis com pelo menos 80 palavras, nextWeekConnection com pelo menos 40 palavras, glossary com 5–10 termos, references como objetos estruturados e assessment;
- claimEvidence: mapa de evidências com id, claim, sectionNumber, sourceIds, sourceType, supportLevel, verificationStatus e note. Afirmações sem fonte devem usar supportLevel "insufficient" e verificationStatus "needs-human-review";
- assessment com normalmente 6 questões: 4 múltipla escolha com 4 alternativas e 2 verdadeiro/falso, alinhadas a objetivos e texto, com resposta e explicação;
- timePlan com targetMinutes 0, items vazio e calculationMethod "derived-after-content".

Regras de escrita:
- escreva em ${input.language}, com linguagem humana, clara, específica, variada e pedagogicamente provocadora;
- produza aproximadamente ${profile.targetWords} palavras e pelo menos ${profile.minimumSections} seções substanciais; cada seção precisa de ideia central, explicação conceitual, exemplo/aplicação e limite ou pergunta crítica quando pertinente;
- inclua pelo menos ${profile.minimumReferences} referências, sendo ${profile.primarySourcesRequired} acadêmica(s) ou oficial(is), sem inventar dados bibliográficos; use a política: ${profile.sourcePolicy};
- ${profile.requireCounterarguments ? "inclua pelo menos um contraponto, controvérsia ou limite" : "inclua contraponto apenas quando pertinente"}; ${profile.requireConceptComparison ? "compare conceitos próximos ou abordagens alternativas quando pertinente" : "não force comparação se ela não for pertinente"}; ${profile.requireCaseStudy ? "inclua estudo de caso ou exemplo contextualizado" : "use exemplo contextualizado quando ajudar"};
- conecte o tema à realidade do público (${input.audience}) e do nível (${input.level}); use os exemplos, recortes regionais e instituições fornecidos no briefing;
- inclua pelo menos um exemplo concreto, uma situação-problema ou estudo de caso e um contraponto/limite quando forem pertinentes;
- integre vídeos, imagens, artigos e leituras na seção em que serão usados, explicando o que o estudante deve observar ou responder; não crie uma galeria final de links;
- não force diagnóstico, vídeo, leitura, webprática ou quiz quando não houver função pedagógica;
- nunca invente URLs, DOI, durações, autores, números ou referências verificadas. Para recurso ainda não conferido, use searchQuery e verificationStatus "suggested-no-url";
- não escreva markdown fora das strings do JSON e não inclua comentários.

teacherGuide deve trazer purpose, didacticArc, alignmentMatrix, diagnostic, formativeChecks, mediationQuestions, commonMisconceptions, interventions, differentiation, accessibility, assessmentNotes, selfAssessment, spiralReview, resourceNotes, qualityReview e workloadAdvice. Se houver webprática programada, inclua preparação, roteiro com minutos, prompts, produto, critérios, plano B e artefatos.

Perfil acadêmico desta trilha:
${JSON.stringify(profile, null, 2)}

Planejamento acadêmico prévio desta semana:
${JSON.stringify(academicPlan || { status: "não disponível; construa um plano interno antes de escrever" }, null, 2)}

Briefing estruturado:
${JSON.stringify({ ...input, weekToGenerate: weekNumber }, null, 2)}

Retorne JSON completo, sem omitir propriedades obrigatórias.`;
}

export function buildGenerationPrompt(input) {
  return `Gere ${input.weeks} semanas, uma por objeto, seguindo o contrato de buildWeekGenerationPrompt e o academicProfile recebido. O processo esperado é planejamento acadêmico, redação completa, revisão crítica e reescrita condicional. Varie o arco didático conforme o conteúdo; não inclua webprática em semanas não programadas; misture recursos no ponto de uso; mantenha teacherGuide separado e produza blocks exclusivamente para o aluno no Aula Studio. A carga horária será calculada depois do conteúdo.\n\n${JSON.stringify(input, null, 2)}`;
}

async function repairWeekWithAI(input, index, raw, quality, academicPlan = {}, academicReview = {}) {
  const weekNumber = index + 1;
  const prompt = `A semana ${weekNumber} abaixo foi rejeitada por insuficiência textual. Reescreva a unidade inteira, não faça um resumo e não remova conteúdo que já esteja bom.

${qualityPromptGuidance(input)}

Problemas estruturais detectados: ${quality.issues.join("; ") || "conteúdo abaixo do padrão"}.
Problemas acadêmicos detectados: ${(academicReview.issues || []).map((issue) => issue.description).join("; ") || "nenhum relatório disponível"}.

Entregue somente { lessonPlan, teacherGuide }. lessonPlan precisa ter título específico, welcome, 4–8 objetivos observáveis, contentSections conforme o academicProfile, exemplos/caso/contraponto, synthesis, nextWeekConnection, glossary, references estruturadas, claimEvidence, assessment com 6 questões e timePlan. Não gere blocks. Não invente URLs ou referências verificadas; use searchQuery para recursos sem link. Preserve o mapa de evidências e marque toda pendência como needs-human-review.

Semana a revisar:
${JSON.stringify(raw?.lessonPlan || raw, null, 2)}

Briefing do curso:
${JSON.stringify({ ...input, weekToGenerate: weekNumber }, null, 2)}

Planejamento acadêmico:
${JSON.stringify(academicPlan, null, 2)}

Retorne JSON completo agora.`;
  return callJson([
    { role: "system", content: `${ACADEMIC_SYSTEM_PROMPT}\n\nVocê está na etapa de reparo. Reescreva somente o que for necessário, sem alongamento artificial, mantendo o que já estiver correto.` },
    { role: "user", content: prompt }
  ], { temperature: 0.35 });
}

async function reviewWeekWithAI(input, index, academicPlan, draft) {
  const rawReview = await callJson([
    { role: "system", content: `${ACADEMIC_SYSTEM_PROMPT}\n\nVocê está na etapa de revisão crítica. Não reescreva a aula nesta chamada; retorne somente o relatório JSON solicitado.` },
    { role: "user", content: buildAcademicReviewPrompt(input, index, academicPlan, draft) }
  ], { temperature: 0.2 });
  return normalizeAcademicReview(rawReview);
}

async function planWeekWithAI(input, index) {
  try {
    const rawPlan = await callJson([
      { role: "system", content: `${ACADEMIC_SYSTEM_PROMPT}\n\nVocê está na etapa de planejamento acadêmico. Planeje antes de redigir e retorne somente o JSON do plano.` },
      { role: "user", content: buildAcademicPlanPrompt(input, index) }
    ], { temperature: 0.25 });
    return normalizeAcademicPlan(rawPlan, input, index);
  } catch {
    return normalizeAcademicPlan({ weekNumber: index + 1, theme: `${input.title} — Semana ${index + 1}`, objectives: input.objectives }, input, index);
  }
}

async function generateOneWeek(input, index) {
  const useAcademicPipeline = process.env.AULA_ACADEMIC_PIPELINE !== "false";
  const academicPlan = useAcademicPipeline ? await planWeekWithAI(input, index) : normalizeAcademicPlan({ weekNumber: index + 1, theme: `${input.title} — Semana ${index + 1}` }, input, index);
  let raw = await callJson([
    { role: "system", content: ACADEMIC_SYSTEM_PROMPT },
    { role: "user", content: buildWeekGenerationPrompt(input, index, academicPlan) }
  ], { temperature: 0.42 });
  let academicReview = { status: "not-run", issues: [], strengths: [], unsupportedClaims: [], rewriteRequired: false };
  if (useAcademicPipeline && process.env.AULA_ACADEMIC_REVIEW !== "false") {
    try { academicReview = await reviewWeekWithAI(input, index, academicPlan, raw); } catch { academicReview = { status: "needs-human-review", issues: [{ severity: "high", type: "review-unavailable", description: "A revisão acadêmica automática não pôde ser concluída.", suggestedRepair: "Faça a conferência humana antes da exportação." }], strengths: [], unsupportedClaims: [], rewriteRequired: true }; }
  }
  const initialLesson = normalizeLesson(raw, input, index);
  const initialQuality = measureLessonQuality(initialLesson, input);
  if (process.env.AULA_AUTO_REPAIR !== "false" && (initialQuality.status !== "complete" || academicReview.rewriteRequired)) {
    try {
      const repaired = await repairWeekWithAI(input, index, raw, initialQuality, academicPlan, academicReview);
      const repairedLesson = normalizeLesson(repaired, input, index);
      const repairedQuality = measureLessonQuality(repairedLesson, input);
      if (repairedQuality.wordCount >= initialQuality.wordCount || repairedQuality.score > initialQuality.score) {
        raw = repaired;
        if (useAcademicPipeline && process.env.AULA_ACADEMIC_REVIEW !== "false") {
          try { academicReview = await reviewWeekWithAI(input, index, academicPlan, raw); } catch { /* preserva o relatório anterior */ }
        }
      }
    } catch {
      // A versão inicial será devolvida com pendência explícita para revisão humana.
    }
  }
  return {
    ...(raw?.lessonPlan || raw?.blocks ? raw : raw?.week || raw),
    academicPlan,
    teacherGuide: { ...(raw?.teacherGuide || {}), academicPlan, academicReview, claimEvidence: raw?.lessonPlan?.claimEvidence || academicPlan.claimsRequiringEvidence || [] }
  };
}

export async function regenerateWeekWithAI(input, index, currentWeek, instruction) {
  const weekNumber = index + 1;
  const academicPlan = await planWeekWithAI(input, index);
  const prompt = `Refaça somente a semana ${weekNumber} do curso abaixo. O professor pediu esta alteração:

"${String(instruction || "").trim()}"

Preserve o que estiver bom, mas cumpra a solicitação de forma visível. A semana deve continuar sendo uma unidade didática completa, não um resumo. ${qualityPromptGuidance(input)}
Faça uma revisão acadêmica explícita: corrija afirmações sem suporte, diferencie fato e interpretação, acrescente contraponto quando exigido, preserve o mapa de evidências e não invente fontes. ${normalizeAcademicProfile(input.academicProfile, input).sourcePolicy}

Retorne apenas { lessonPlan, teacherGuide }. Não gere blocks; o servidor os monta para o Aula Studio. lessonPlan deve manter título específico, welcome, objetivos observáveis, seções conforme o perfil, exemplos/caso/contraponto quando pertinente, síntese, próxima semana, glossário, referências estruturadas, claimEvidence, avaliação e timePlan. Não invente URLs ou fontes verificadas.

Briefing do curso:
${JSON.stringify({ ...input, weekToGenerate: weekNumber }, null, 2)}

Planejamento acadêmico atualizado:
${JSON.stringify(academicPlan, null, 2)}

Semana atual:
${JSON.stringify(currentWeek?.lessonPlan || currentWeek, null, 2)}

Retorne JSON completo agora.`;
  const raw = await callJson([
    { role: "system", content: ACADEMIC_SYSTEM_PROMPT },
    { role: "user", content: prompt }
  ], { temperature: 0.35 });
  let academicReview = { status: "not-run", issues: [], strengths: [], unsupportedClaims: [], rewriteRequired: false };
  if (process.env.AULA_ACADEMIC_REVIEW !== "false") {
    try { academicReview = await reviewWeekWithAI(input, index, academicPlan, raw); } catch { academicReview = { status: "needs-human-review", issues: [{ severity: "high", type: "review-unavailable", description: "A revisão acadêmica automática não pôde ser concluída.", suggestedRepair: "Faça a conferência humana antes da exportação." }], strengths: [], unsupportedClaims: [], rewriteRequired: true }; }
  }
  if (process.env.AULA_AUTO_REPAIR !== "false" && academicReview.rewriteRequired) {
    try {
      raw = await repairWeekWithAI(input, index, raw, { issues: ["a revisão acadêmica solicitou reescrita"] }, academicPlan, academicReview);
      if (process.env.AULA_ACADEMIC_REVIEW !== "false") academicReview = await reviewWeekWithAI(input, index, academicPlan, raw);
    } catch { /* a semana segue para revisão humana */ }
  }
  return { ...raw, academicPlan, teacherGuide: { ...(raw?.teacherGuide || {}), academicPlan, academicReview, claimEvidence: raw?.lessonPlan?.claimEvidence || academicPlan.claimsRequiringEvidence || [] } };
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
