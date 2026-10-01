import { KNOWN_BLOCK_TYPES, normalizeLesson, normalizeWeeklyOutput, practiceScheduledForWeek, resourcePlanForWeek } from "./aula-schema.js";
import { measureLessonQuality, qualityPromptGuidance, qualityTargets } from "./content-quality.js";
import { buildTeacherGuide } from "./teacher-guide.js";
import { ACADEMIC_SYSTEM_PROMPT, buildAcademicPlanPrompt, buildAcademicReviewPrompt, normalizeAcademicPlan, normalizeAcademicReview, normalizeAcademicProfile } from "./academic.js";
import { buildCourseProgression, progressionForWeek } from "./curriculum.js";

const providerBase = () => (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

function extractJsonValue(content) {
  const source = String(content || "").replace(/^\uFEFF/, "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const starts = [source.indexOf("{"), source.indexOf("[")].filter((index) => index >= 0);
  if (!starts.length) return source;
  const start = Math.min(...starts);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === "{" || char === "[") depth += 1;
    if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

function removeTrailingCommas(value) {
  let output = "";
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quoted) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; output += char; continue; }
    if (char === ",") {
      let next = index + 1;
      while (/\s/.test(value[next] || "")) next += 1;
      if (value[next] === "}" || value[next] === "]") continue;
    }
    output += char;
  }
  return output;
}

function parseJson(content) {
  if (content && typeof content === "object") return content;
  const candidate = extractJsonValue(content);
  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    try {
      return JSON.parse(removeTrailingCommas(candidate));
    } catch {
      throw firstError;
    }
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response, attempt) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(30000, Math.max(1000, retryAfter * 1000));
  const reset = response.headers.get("x-ratelimit-reset-tokens") || response.headers.get("x-ratelimit-reset-project-tokens") || "";
  const seconds = Number.parseFloat(reset);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(30000, Math.max(1000, seconds * 1000));
  return Math.min(30000, 1000 * (2 ** attempt) + Math.round(Math.random() * 500));
}

async function callJson(messages, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY não está configurada. Cadastre a chave como segredo na Vercel.");
    error.code = "AI_KEY_MISSING";
    throw error;
  }
  const maxAttempts = Math.max(1, Number(process.env.OPENAI_MAX_RETRIES || 3));
  let formatRetry = false;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const retryingFormat = formatRetry;
    const requestMessages = formatRetry
      ? [...messages, { role: "user", content: options.formatRetryInstruction || "A resposta anterior veio em formato JSON inválido ou foi truncada. Gere novamente uma versão compacta e completa do mesmo objeto, sem markdown, comentários ou texto fora do JSON; use aspas duplas em todas as propriedades e não deixe vírgula antes de } ou ]." }]
      : messages;
    const response = await fetch(`${providerBase()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: options.model || process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: options.temperature ?? 0.45,
        max_tokens: Math.max(256, Number(retryingFormat ? (options.retryMaxTokens || options.maxTokens || process.env.OPENAI_MAX_TOKENS || 16000) : (options.maxTokens || process.env.OPENAI_MAX_TOKENS || 16000))),
        response_format: { type: "json_object" },
        messages: requestMessages
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) throw new Error("A API de IA retornou uma resposta vazia.");
      try {
        const parsed = parseJson(content);
        formatRetry = false;
        return parsed;
      } catch (error) {
        if (attempt < maxAttempts - 1) {
          formatRetry = true;
          await wait(250);
          continue;
        }
        const parseError = new Error(`A IA retornou uma resposta em JSON inválido após ${maxAttempts} tentativa(s). Tente refazer a semana novamente; a aula atual foi preservada. Detalhe técnico: ${error.message}`);
        parseError.code = "AI_INVALID_JSON";
        parseError.retryable = true;
        throw parseError;
      }
    }
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    const retryable = response.status === 429 || response.status === 503;
    if (retryable && attempt < maxAttempts - 1) {
      await wait(retryDelay(response, attempt));
      continue;
    }
    const error = new Error(`A API de IA recusou a solicitação: ${detail}`);
    error.code = /tokens per min|request too large|rate limit/i.test(detail) ? "AI_TPM_LIMIT" : "AI_PROVIDER_ERROR";
    error.retryable = retryable;
    throw error;
  }
  throw new Error("A API de IA não respondeu após as tentativas configuradas.");
}

export function buildBriefingPrompt(input, missingFields = []) {
  return `Atue como designer instrucional e assistente de planejamento de curso. Complete somente os campos que estão vazios no briefing abaixo. Responda somente JSON válido com estas propriedades: audience (string), objectives (array de strings), content (string), webPractices (array de objetos), materials (array de objetos), references (array de strings), videoSearchSuggestions (array de strings), imageSearchSuggestions (array de strings), notes (array de strings).

Campos que precisam de preenchimento: ${missingFields.length ? missingFields.join(", ") : "nenhum; apenas revise e sugira melhorias"}.

Regras:
- não altere nem repita informações que já foram fornecidas;
- escreva em português do Brasil, com linguagem humana, clara e pedagogicamente útil;
- produza objetivos observáveis, progressivos e adequados ao público e ao nível;
- organize o conteúdo em uma sequência didática coerente com o número de semanas e a carga horária;
- examine também cada item de webPractices pelo índice informado em "Campos que precisam de preenchimento". Preserve id, título, agenda e qualquer valor já fornecido; complete somente as propriedades vazias daquela webprática, sem substituir uma sessão existente por outra;
- considere títulos automáticos como "Webprática 1", "Webprática 2" e semelhantes como placeholders, não como títulos fornecidos, quando o campo title estiver listado para preenchimento;
- respeite o academicProfile recebido, especialmente profundidade, quantidade de seções, referências e exigência de contrapontos;
- se webpráticas estiverem ativadas, gere no mínimo uma e, quando pedagogicamente justificável, várias práticas distintas. Cada objeto deve conter title, type, modality, weekNumber/date quando disponível, startTime/endTime quando disponíveis, platform/tool, context, problem, objective, preparation, teacherPreparation, studentPreparation, materials, instructions, steps, product, criteria, rubric, assessment, continuation, fallbackPlan, prompts, artifacts, resources, roteiro com blocos cronometrados e durationMinutes;
- trate cada webprática como aula síncrona ou laboratório independente, com roteiro operacional próprio; nunca a transforme em leitura, seção, atividade ou bloco do texto-base semanal;
- alinhe cada webprática a objetivos e conteúdos específicos, distribuindo-as em semanas e datas coerentes do calendário;
- quando uma webprática já existir parcialmente, devolva o mesmo item/id e preencha os campos solicitados, especialmente título, semana/data, ferramenta, objetivo, contexto, preparação, materiais, produto e plano B. Não crie uma segunda prática para substituir a primeira;
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
    title: text(practice?.title || practice?.sessionTitle),
    type: text(practice?.type) || "Laboratório prático",
    modality: text(practice?.modality || practice?.format) || "Aula síncrona / laboratório prático",
    weekNumber: Math.max(0, safeNumber(practice?.weekNumber || practice?.week, 0)),
    date: text(practice?.date || practice?.sessionDate),
    dayOfWeek: text(practice?.dayOfWeek || practice?.day),
    startTime: text(practice?.startTime || practice?.start),
    endTime: text(practice?.endTime || practice?.end),
    platform: text(practice?.platform || practice?.environment),
    tool: text(practice?.tool || practice?.tools),
    sessionTitle: text(practice?.sessionTitle || practice?.sessionName),
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
  const resourceTargets = research.resourceTargets || { videosPerWeek: 2, articlesPerWeek: 3, requiredReadingsPerWeek: 1, requiredReadingLevel: "essential" };
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
- escolha até ${resourceTargets.videosPerWeek} vídeo(s), até 3 imagens/diagramas, ${resourceTargets.articlesPerWeek} artigo(s) e ${Math.max(resourceTargets.articlesPerWeek, resourceTargets.requiredReadingsPerWeek)} leitura(s) por semana, respeitando as metas desta semana; o nível de leitura obrigatória é ${resourceTargets.requiredReadingLevel};
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

export function buildWeekGenerationPrompt(input, weekIndex = 0, academicPlan = null, progression = null, previousWeeks = []) {
  const weekNumber = weekIndex + 1;
  const progressionMap = progression || buildCourseProgression(input);
  const weekFocus = progressionForWeek(input, weekIndex, progressionMap);
  const previous = weekFocus.bridgeFromPrevious || (weekNumber > 1 ? `A semana anterior foi a ${weekNumber - 1}; retome um conceito dela e mostre como esta semana avança.` : "Esta é a abertura do curso; construa a base conceitual e anuncie o percurso.");
  const profile = normalizeAcademicProfile(input.academicProfile, input);
  const textBudget = qualityTargets(input);
  const scheduledPractices = (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, weekIndex));
  const resourcePlan = resourcePlanForWeek(input, weekIndex);
  const previousSummaries = (previousWeeks || []).slice(-3).map((lesson, index) => ({
    weekNumber: lesson?.lessonPlan?.weekNumber || index + 1,
    theme: lesson?.lessonPlan?.theme || lesson?.meta?.title,
    objectives: (lesson?.lessonPlan?.learningObjectives || []).slice(0, 4),
    sectionTitles: (lesson?.lessonPlan?.contentSections || []).map((section) => section.title).filter(Boolean).slice(0, 8)
  }));
  return `Gere UMA semana de material didático: uma unidade didática semanal completa em JSON para o curso abaixo. Esta é a semana ${weekNumber} de ${input.weeks}. ${previous}

${qualityPromptGuidance(input)}

O texto é o produto principal. Não entregue resumo, tópicos telegráficos, frases soltas, uma lista de links ou apenas instruções para o professor. Escreva para o estudante ler e aprender. O padrão de referência é uma aula em DOCX com abertura, objetivos, explicação conceitual, exemplos, casos, contrapontos críticos, síntese, glossário, referências e avaliação. Varie o arco didático conforme o tema. Webpráticas são aulas síncronas/laboratórios separados: nunca descreva, anuncie, instrua ou transforme a webprática em conteúdo-base desta semana.

PADRÃO EDITORIAL DOS EXEMPLOS DE REFERÊNCIA:
- escreva uma unidade com narrativa contínua, não uma coleção de tópicos; cada seção deve responder a uma pergunta e preparar a próxima;
- produza pelo menos ${textBudget.requiredSectionCount} seções principais na sequência indicada; cada corpo de seção deve ter aproximadamente ${textBudget.sectionTargetWords} palavras, nunca menos que ${textBudget.sectionMinimumWords} nem mais que ${textBudget.sectionMaximumWords}, além de subseções quando o conceito exigir;
- comece pela importância do problema e pelo contexto do estudante; depois defina conceitos, compare perspectivas, apresente um caso verificável, aplique critérios e discuta limites, riscos ou controvérsias;
- insira vídeos, imagens, artigos e documentos no ponto exato em que ajudam a entender a seção, com pergunta-guia e finalidade; não crie uma galeria de links no final;
- termine com síntese conceitual de pelo menos 100 palavras, conexão explícita com a próxima semana de pelo menos 60 palavras, glossário e avaliação alinhada; não finalize depois de apenas três seções;
- antes de responder, confira internamente se cada objetivo específico aparece em pelo menos uma seção, atividade e questão de avaliação.

MAPA LONGITUDINAL OBRIGATÓRIO — não ignore este bloco e não substitua seus objetivos por toda a lista geral do curso:
- Tema e título desta semana: ${weekFocus.theme}
- Pergunta central: ${weekFocus.centralQuestion}
- Objetivos específicos desta semana: ${JSON.stringify(weekFocus.objectives)}
- Conceitos novos que precisam ser definidos: ${JSON.stringify(weekFocus.newConcepts)}
- Sequência editorial sugerida: ${JSON.stringify(weekFocus.sectionSequence)}
- Arco didático preferencial: ${weekFocus.arc}
- Ponte recebida: ${weekFocus.bridgeFromPrevious}
- Ponte para a próxima semana: ${weekFocus.bridgeToNext}
- Marco/evidência da etapa: ${weekFocus.projectMilestone}
- Elementos obrigatórios: ${JSON.stringify(weekFocus.mustInclude)}
- O que não repetir nem antecipar: ${weekFocus.doNotRepeat}

REQUISITOS DE RECURSOS DESTA SEMANA — cumpra estas quantidades sem inventar links:
- vídeos: ${resourcePlan.videosPerWeek}; artigos acadêmicos: ${resourcePlan.articlesPerWeek}; leituras obrigatórias totais: ${resourcePlan.requiredReadingsPerWeek}; nível de leitura obrigatória: ${resourcePlan.requiredReadingLevel};
- artigos podem contar como parte das leituras obrigatórias, sem duplicar artificialmente a lista. Se não houver URL verificável, use searchQuery e verificationStatus "suggested-no-url" para que a pesquisa/curadoria localize candidatos depois;
- distribua os recursos nas seções em que serão usados. Se uma meta for 0, não force esse tipo de recurso na semana.

Semanas já geradas (use somente para continuidade; não copie seus títulos, objetivos ou seções):
${JSON.stringify(previousSummaries, null, 2)}

Retorne somente este objeto de alto nível: { meta, lessonPlan, teacherGuide }. Não gere blocks: o servidor transformará o lessonPlan em blocos editáveis do Aula Studio depois da validação. O lessonPlan é a prioridade: cumpra primeiro o orçamento textual do aluno e mantenha teacherGuide conciso, sem repetir o conteúdo da aula.

lessonPlan obrigatório:
- weekNumber, theme (título específico e informativo, nunca "Conteúdo da semana"), welcome (80–160 palavras, contextualizada e ligada ao percurso), didacticArc com sequence, phasePlan e omissionReasons. A phasePlan pode omitir etapas, mas deve justificar a omissão;
- learningObjectives com 4–8 objetivos observáveis, específicos desta semana, usando verbos como explicar, comparar, analisar, aplicar, avaliar ou criar;
- prerequisites e contentDensity;
- contentSections com pelo menos ${textBudget.requiredSectionCount} seções principais. Cada seção deve ter number, title, didacticRole, body com aproximadamente ${textBudget.sectionTargetWords} palavras (mínimo ${textBudget.sectionMinimumWords}, máximo ${textBudget.sectionMaximumWords}), subsections, caseStudy quando pertinente, reflection quando pertinente, keyTerms e resources. A progressão deve ir do problema/pergunta para conceitos, exemplos ou evidências, aplicação e crítica. Não repita a mesma introdução em seções diferentes;
- resources com videos, readingsRequired, readingsExtra, images, podcasts e datasets. Cada recurso deve conter title, source, author quando conhecido, href somente se foi fornecido no briefing ou retornado por um provedor, required, sectionNumber ou moment, objective, guidingQuestion, pedagogicalUse, durationMinutes, altText/caption/credit para imagens, searchQuery quando o link não estiver disponível, verificationStatus e requiresVerification;
- webPractices: retorne sempre [] dentro de lessonPlan. Se houver prática programada para esta semana, desenvolva o projeto completo exclusivamente em teacherGuide.webPracticeProjects, com problem, context, studentRole, challenge, deliverable, prerequisites, materials, data, steps (cada uma com minutes, instructions e evidence), criteria, rubric com níveis, examples, revision, fallbackPlan, accessibility, prompts, artifacts e versões simplified/advanced;
- diagnostic com pergunta/problema inicial, evidência esperada e feedback; formativeChecks com perguntas durante o texto, momento, evidência, feedback e ação de intervenção;
- activities para fóruns, discussões, produção, estudo de caso ou encontro síncrono, com type, title, instructions, durationMinutes, evidence, evidenceType, feedback, criteria e required;
- alignmentMatrix: uma linha por objetivo, ligando contentSections, activities, evidence e assessmentQuestions. Não deixe objetivo sem atividade, evidência e avaliação;
- differentiation com trilhas support/essential, standard e extension, cada uma com instruções e recursos;
- accessibility com alternativas para baixa conexão, linguagem clara, uso em celular, diagramas e mídias;
- selfAssessment com perguntas de autoavaliação, escala e feedback;
- spiralReview com previousConceptsReviewed, newConcepts, preparationForNextWeek, cumulativeEvidence e projectMilestone;
- synthesis com pelo menos 100 palavras, nextWeekConnection com pelo menos 60 palavras, glossary com 5–10 termos, references como objetos estruturados e assessment;
- claimEvidence: mapa de evidências com id, claim, sectionNumber, sourceIds, sourceType, supportLevel, verificationStatus e note. Afirmações sem fonte devem usar supportLevel "insufficient" e verificationStatus "needs-human-review";
- assessment com normalmente 6 questões: 4 múltipla escolha com 4 alternativas e 2 verdadeiro/falso, alinhadas a objetivos e texto, com resposta e explicação;
- timePlan com targetMinutes 0, items vazio e calculationMethod "derived-after-content".

Regras de escrita:
- escreva em ${input.language}, com linguagem humana, clara, específica, variada e pedagogicamente provocadora;
- produza pelo menos ${textBudget.targetWords} palavras úteis no conjunto do texto do aluno. Essa é uma meta mínima operacional, não uma estimativa: conte e amplie antes de devolver o JSON. A aula do aluno tem prioridade absoluta sobre o guia do professor;
- inclua pelo menos ${profile.minimumReferences} referências, sendo ${profile.primarySourcesRequired} acadêmica(s) ou oficial(is), sem inventar dados bibliográficos; use a política: ${profile.sourcePolicy};
- ${profile.requireCounterarguments ? "inclua pelo menos um contraponto, controvérsia ou limite" : "inclua contraponto apenas quando pertinente"}; ${profile.requireConceptComparison ? "compare conceitos próximos ou abordagens alternativas quando pertinente" : "não force comparação se ela não for pertinente"}; ${profile.requireCaseStudy ? "inclua estudo de caso ou exemplo contextualizado" : "use exemplo contextualizado quando ajudar"};
- conecte o tema à realidade do público (${input.audience}) e do nível (${input.level}); use os exemplos, recortes regionais e instituições fornecidos no briefing;
- inclua pelo menos um exemplo concreto, uma situação-problema ou estudo de caso e um contraponto/limite quando forem pertinentes;
- integre vídeos, imagens, artigos e leituras na seção em que serão usados, explicando o que o estudante deve observar ou responder; não crie uma galeria final de links;
- não force diagnóstico, vídeo, leitura, webprática ou quiz quando não houver função pedagógica; webprática nunca deve aparecer no corpo do texto-base, nas contentSections, no welcome, na síntese ou nas atividades da aula semanal;
- nunca invente URLs, DOI, durações, autores, números ou referências verificadas. Para recurso ainda não conferido, use searchQuery e verificationStatus "suggested-no-url";
- não escreva markdown fora das strings do JSON e não inclua comentários.

teacherGuide deve trazer purpose, didacticArc, alignmentMatrix, diagnostic, formativeChecks, mediationQuestions, commonMisconceptions, interventions, differentiation, accessibility, assessmentNotes, selfAssessment, spiralReview, resourceNotes, qualityReview e workloadAdvice em formato conciso, sem copiar a aula. Se houver webprática programada, inclua em webPracticeProjects a preparação do professor e do aluno, agenda, roteiro com minutos, falas/prompts, produto, critérios, rubrica, plano B, acessibilidade e artefatos. Esse projeto será exportado em DOCX separado e é a única exceção que pode ser detalhada fora do texto do aluno.

Perfil acadêmico desta trilha:
${JSON.stringify(profile, null, 2)}

Mapa completo do curso para garantir progressão e não repetição:
${JSON.stringify(progressionMap, null, 2)}

Planejamento acadêmico prévio desta semana:
${JSON.stringify(academicPlan || { status: "não disponível; construa um plano interno antes de escrever" }, null, 2)}

Briefing estruturado da aula-base:
${JSON.stringify({ ...input, webPractices: [], weekToGenerate: weekNumber }, null, 2)}

Sessões práticas independentes agendadas para esta semana (não inserir no texto-base; desenvolver somente em teacherGuide.webPracticeProjects e no DOCX separado):
${JSON.stringify(scheduledPractices, null, 2)}

Retorne JSON completo, sem omitir propriedades obrigatórias.`;
}

export function buildGenerationPrompt(input) {
  return `Gere ${input.weeks} semanas, uma por objeto, seguindo o contrato de buildWeekGenerationPrompt e o academicProfile recebido. O processo esperado é planejamento acadêmico, redação completa, revisão crítica e reescrita condicional. Varie o arco didático conforme o conteúdo; lessonPlan.webPractices deve ser sempre []; não inclua webprática no texto-base ou em semanas não programadas; desenvolva sessões agendadas somente em teacherGuide.webPracticeProjects; misture recursos no ponto de uso; mantenha teacherGuide separado e produza blocks exclusivamente para o aluno no Aula Studio. A carga horária será calculada depois do conteúdo.\n\n${JSON.stringify(input, null, 2)}`;
}

async function repairWeekWithAI(input, index, raw, quality, academicPlan = {}, academicReview = {}) {
  const weekNumber = index + 1;
  const scheduledPractices = (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, index));
  const prompt = `A semana ${weekNumber} abaixo foi rejeitada por insuficiência textual. Reescreva a unidade inteira, não faça um resumo e não remova conteúdo que já esteja bom.

${qualityPromptGuidance(input)}

Problemas estruturais detectados: ${quality.issues.join("; ") || "conteúdo abaixo do padrão"}.
Problemas acadêmicos detectados: ${(academicReview.issues || []).map((issue) => issue.description).join("; ") || "nenhum relatório disponível"}.

Entregue somente { lessonPlan, teacherGuide }. lessonPlan precisa ter título específico, welcome, 4–8 objetivos observáveis, contentSections conforme o academicProfile, exemplos/caso/contraponto, synthesis, nextWeekConnection, glossary, references estruturadas, claimEvidence, assessment com 6 questões e timePlan. lessonPlan.webPractices deve ser sempre []; não mencione a sessão prática no texto-base. Se houver prática agendada, mantenha o projeto completo somente em teacherGuide.webPracticeProjects. Não gere blocks. Não invente URLs ou referências verificadas; use searchQuery para recursos sem link. Preserve o mapa de evidências e marque toda pendência como needs-human-review.

Semana a revisar:
${JSON.stringify(raw?.lessonPlan || raw, null, 2)}

Briefing do curso:
${JSON.stringify({ ...input, webPractices: [], scheduledWebPractices: scheduledPractices, weekToGenerate: weekNumber }, null, 2)}

Planejamento acadêmico:
${JSON.stringify(academicPlan, null, 2)}

Retorne JSON completo agora.`;
  return callJson([
    { role: "system", content: `${ACADEMIC_SYSTEM_PROMPT}\n\nVocê está na etapa de reparo textual. Preserve o que estiver correto, mas cumpra o piso de palavras e as quotas por seção; não faça um acréscimo marginal nem devolva uma versão resumida.` },
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

async function planWeekWithAI(input, index, progression = null) {
  const weekFocus = progressionForWeek(input, index, progression || buildCourseProgression(input));
  try {
    const rawPlan = await callJson([
      { role: "system", content: `${ACADEMIC_SYSTEM_PROMPT}\n\nVocê está na etapa de planejamento acadêmico. Planeje antes de redigir e retorne somente o JSON do plano.` },
      { role: "user", content: buildAcademicPlanPrompt(input, index, weekFocus) }
    ], { temperature: 0.25 });
    return normalizeAcademicPlan(rawPlan, input, index);
  } catch {
    return normalizeAcademicPlan({ weekNumber: index + 1, theme: weekFocus.theme, centralQuestion: weekFocus.centralQuestion, objectives: weekFocus.objectives, centralConcepts: weekFocus.newConcepts, sectionSequence: weekFocus.sectionSequence.map((title, sectionIndex) => ({ number: String(sectionIndex + 1), title })) }, input, index);
  }
}

function enforceWeekFocus(raw, weekFocus, weekNumber) {
  if (!raw?.lessonPlan || typeof raw.lessonPlan !== "object") return raw;
  raw.lessonPlan.theme = weekFocus.theme;
  raw.lessonPlan.weekNumber = weekNumber;
  raw.lessonPlan.learningObjectives = weekFocus.objectives;
  raw.lessonPlan.didacticArc = { ...(raw.lessonPlan.didacticArc || {}), id: weekFocus.arc };
  raw.lessonPlan.spiralReview = {
    ...(raw.lessonPlan.spiralReview || {}),
    previousConceptsReviewed: weekNumber > 1 ? (raw.lessonPlan.spiralReview?.previousConceptsReviewed || [weekFocus.bridgeFromPrevious]) : [],
    newConcepts: weekFocus.newConcepts,
    preparationForNextWeek: [weekFocus.bridgeToNext],
    projectMilestone: weekFocus.projectMilestone
  };
  return raw;
}

export async function generateOneWeek(input, index, options = {}) {
  const weekNumber = index + 1;
  const useAcademicPipeline = process.env.AULA_ACADEMIC_PIPELINE !== "false";
  // A Vercel Hobby encerra funções longas. O modo de uma etapa mantém o prompt
  // acadêmico completo, mas evita as chamadas extras de planejamento/revisão na
  // mesma requisição. O pipeline completo continua disponível com false.
  const singlePass = options.singlePass ?? process.env.AULA_SINGLE_PASS !== "false";
  const progression = options.progression || buildCourseProgression(input);
  const weekFocus = progressionForWeek(input, index, progression);
  const academicPlan = !singlePass && useAcademicPipeline
    ? await planWeekWithAI(input, index, progression)
    : normalizeAcademicPlan({
        weekNumber: index + 1,
        theme: weekFocus.theme,
        centralQuestion: weekFocus.centralQuestion,
        objectives: weekFocus.objectives,
        centralConcepts: weekFocus.newConcepts,
        sectionSequence: weekFocus.sectionSequence.map((title, sectionIndex) => ({ number: String(sectionIndex + 1), title, purpose: "Desenvolver a progressão específica da semana." })),
        controversies: [weekFocus.doNotRepeat]
      }, input, index);
  let raw = await callJson([
    { role: "system", content: ACADEMIC_SYSTEM_PROMPT },
    { role: "user", content: buildWeekGenerationPrompt(input, index, academicPlan, progression, options.previousWeeks) }
  ], { temperature: 0.42 });
  let academicReview = { status: "not-run", issues: [], strengths: [], unsupportedClaims: [], rewriteRequired: false };
  if (!singlePass && useAcademicPipeline && process.env.AULA_ACADEMIC_REVIEW !== "false") {
    try { academicReview = await reviewWeekWithAI(input, index, academicPlan, raw); } catch { academicReview = { status: "needs-human-review", issues: [{ severity: "high", type: "review-unavailable", description: "A revisão acadêmica automática não pôde ser concluída.", suggestedRepair: "Faça a conferência humana antes da exportação." }], strengths: [], unsupportedClaims: [], rewriteRequired: true }; }
  }
  enforceWeekFocus(raw, weekFocus, weekNumber);
  const initialLesson = normalizeLesson(raw, input, index);
  const initialQuality = measureLessonQuality(initialLesson, input, { peerLessons: options.previousWeeks || [] });
  const repairableIssues = initialQuality.issues.some((issue) => /conteúdo curto|poucas seções|seções ainda|boas-vindas|síntese|avaliação|objetivos insuficientes|título principal|tópico de conteúdo|bloco hero|bloco visível|matriz/i.test(issue));
  if (!singlePass && process.env.AULA_AUTO_REPAIR !== "false" && (repairableIssues || academicReview.rewriteRequired)) {
    try {
      const repaired = await repairWeekWithAI(input, index, raw, initialQuality, academicPlan, academicReview);
      const repairedLesson = normalizeLesson(repaired, input, index);
      const repairedQuality = measureLessonQuality(repairedLesson, input, { peerLessons: options.previousWeeks || [] });
      const requiredGain = Math.max(250, Math.round(qualityTargets(input).targetWords * 0.10));
      const substantialRepair = repairedQuality.wordCount - initialQuality.wordCount >= requiredGain;
      const reachesMinimum = repairedQuality.wordCount >= repairedQuality.minimumWords;
      if (reachesMinimum || (substantialRepair && repairedQuality.score >= initialQuality.score)) {
        raw = mergeRepairedResponse(raw, repaired);
        if (useAcademicPipeline && process.env.AULA_ACADEMIC_REVIEW !== "false") {
          try { academicReview = await reviewWeekWithAI(input, index, academicPlan, raw); } catch { /* preserva o relatório anterior */ }
        }
      }
    } catch {
      // A versão inicial será devolvida com pendência explícita para revisão humana.
    }
  }
  if (singlePass && process.env.AULA_AUTO_REPAIR !== "false" && (repairableIssues || initialQuality.status === "insufficient")) {
    try {
      const repaired = await regenerateWeekWithAI(
        input,
        index,
        initialLesson,
        `A análise automática encontrou estes problemas: ${initialQuality.issues.join("; ")}. Não devolva a semana ainda incompleta. Amplie substancialmente o texto até cumprir o piso de ${initialQuality.minimumWords} palavras e a meta de ${initialQuality.targetWords}, sem repetir outras semanas. Preserve o foco "${weekFocus.theme}", desenvolva as seções da sequência ${weekFocus.sectionSequence.join("; ")}, inclua um caso ou aplicação verificável, contraponto, síntese, conexão com a próxima semana e avaliação alinhada.`,
        { maxTokens: regenerationTokenBudget(input), retryMaxTokens: regenerationTokenBudget(input), progression }
      );
      enforceWeekFocus(repaired, weekFocus, weekNumber);
      const repairedLesson = normalizeLesson(repaired, input, index);
      const repairedQuality = measureLessonQuality(repairedLesson, input, { peerLessons: options.previousWeeks || [] });
      const requiredGain = Math.max(250, Math.round(qualityTargets(input).targetWords * 0.10));
      const substantialRepair = repairedQuality.wordCount - initialQuality.wordCount >= requiredGain;
      const reachesMinimum = repairedQuality.wordCount >= repairedQuality.minimumWords;
      if (reachesMinimum || (substantialRepair && repairedQuality.score >= initialQuality.score)) raw = mergeRepairedResponse(raw, repaired);
    } catch {
      // Preserva a primeira versão com a pendência de qualidade visível ao professor.
    }
  }
  enforceWeekFocus(raw, weekFocus, weekNumber);
  return {
    ...(raw?.lessonPlan || raw?.blocks ? raw : raw?.week || raw),
    academicPlan,
    teacherGuide: { ...(raw?.teacherGuide || {}), academicPlan, academicReview, claimEvidence: raw?.lessonPlan?.claimEvidence || academicPlan.claimsRequiringEvidence || [] }
  };
}

const clip = (value, limit) => String(value ?? "").slice(0, limit);

function compactRegenerationSection(section = {}) {
  return {
    number: section.number,
    title: section.title,
    body: clip(section.body, 2800),
    subsections: (section.subsections || []).map((sub) => ({ number: sub.number, title: sub.title, body: clip(sub.body, 900) })).slice(0, 4),
    caseStudy: section.caseStudy ? { context: clip(section.caseStudy.context, 1100), data: clip(section.caseStudy.data, 800), question: clip(section.caseStudy.question, 400), response: clip(section.caseStudy.response, 400) } : null,
    reflection: section.reflection ? { question: clip(section.reflection.question, 400), body: clip(section.reflection.body, 600) } : null,
    keyTerms: (section.keyTerms || []).slice(0, 6),
    counterpoint: clip(section.counterpoint, 800),
    didacticRole: section.didacticRole,
    resources: (section.resources || []).map((resource) => ({ title: resource.title, kind: resource.kind, href: resource.href, required: resource.required, objective: resource.objective, pedagogicalUse: resource.pedagogicalUse })).slice(0, 6)
  };
}

function regenerationTokenBudget(input, options = {}) {
  const target = qualityTargets(input).targetWords;
  const configured = Number(options.maxTokens || process.env.OPENAI_REGEN_MAX_TOKENS || 10000);
  // O reparo devolve apenas lessonPlan. Para 3.000 palavras, 8–10 mil
  // tokens permitem texto substancial e JSON completo sem carregar o guia.
  return Math.min(14000, Math.max(8000, configured, Math.ceil(target * 2.2)));
}

function mergeRepairedResponse(original, repaired) {
  const base = original && typeof original === "object" ? original : {};
  const next = repaired && typeof repaired === "object" ? repaired : {};
  return {
    ...base,
    ...next,
    teacherGuide: next.teacherGuide || base.teacherGuide || {}
  };
}

export async function regenerateWeekWithAI(input, index, currentWeek, instruction, options = {}) {
  const weekNumber = index + 1;
  const singlePass = process.env.AULA_SINGLE_PASS !== "false";
  const progression = options.progression || buildCourseProgression(input);
  const weekFocus = progressionForWeek(input, index, progression);
  const currentPlan = currentWeek?.lessonPlan || currentWeek || {};
  const academicPlan = singlePass
    ? normalizeAcademicPlan({ weekNumber, theme: currentPlan.theme || `${input.title} — Semana ${weekNumber}`, objectives: input.objectives }, input, index)
    : await planWeekWithAI(input, index);
  const compactInput = {
    title: input.title,
    audience: input.audience,
    level: input.level,
    language: input.language,
    hoursPerWeek: input.hoursPerWeek,
    objectives: (input.objectives || []).slice(0, 12),
    content: String(input.content || "").slice(0, 7000),
    academicProfile: normalizeAcademicProfile(input.academicProfile, input),
    references: (input.references || []).slice(0, 12),
    materials: (input.materials || []).slice(0, 12).map((item) => ({ title: item.title, type: item.type, link: item.link, moment: item.moment, objective: item.objective, alignment: item.alignment, use: item.use, pages: item.pages, durationMinutes: item.durationMinutes })),
    resourcePlan: resourcePlanForWeek(input, index),
    webPractices: [],
    weekToGenerate: weekNumber
  };
  const compactWeek = {
    theme: currentPlan.theme,
    welcome: currentPlan.welcome,
    learningObjectives: currentPlan.learningObjectives || currentPlan.objectives,
    contentSections: (currentPlan.contentSections || []).map(compactRegenerationSection).slice(0, 8),
    activities: (currentPlan.activities || []).map((activity) => ({ id: activity.id, title: activity.title, type: activity.type, instructions: clip(activity.instructions, 1200), evidence: clip(activity.evidence, 600), durationMinutes: activity.durationMinutes })).slice(0, 8),
    formativeChecks: (currentPlan.formativeChecks || []).map((check) => ({ id: check.id, moment: check.moment, prompt: clip(check.prompt || check.question, 800), feedback: clip(check.feedback, 800) })).slice(0, 6),
    synthesis: clip(currentPlan.synthesis, 3000),
    nextWeekConnection: clip(currentPlan.nextWeekConnection, 1600),
    glossary: (currentPlan.glossary || []).slice(0, 12).map((item) => ({ term: item.term, definition: clip(item.definition, 500) })),
    references: (currentPlan.references || []).slice(0, 8).map((item) => typeof item === "string" ? item : ({ citation: clip(item.citation || item.title, 700), href: item.href, verificationStatus: item.verificationStatus })),
    claimEvidence: (currentPlan.claimEvidence || []).slice(0, 12).map((item) => ({ id: item.id, claim: clip(item.claim, 700), sourceIds: item.sourceIds, verificationStatus: item.verificationStatus, note: clip(item.note, 400) })),
    assessment: { title: currentPlan.assessment?.title, format: currentPlan.assessment?.format, questions: (currentPlan.assessment?.questions || []).map((question) => ({ id: question.id, q: clip(question.q, 1000), options: (question.options || []).slice(0, 6).map((option) => clip(option, 350)), answer: question.answer, explanation: clip(question.explanation, 900) })).slice(0, 8) },
    timePlan: { targetMinutes: currentPlan.timePlan?.targetMinutes },
    didacticArc: { id: currentPlan.didacticArc?.id, label: currentPlan.didacticArc?.label, sequence: currentPlan.didacticArc?.sequence }
  };
  const textBudget = qualityTargets(input);
  const prompt = `Refaça somente a semana ${weekNumber} do curso abaixo. O professor pediu esta alteração:

"${String(instruction || "").trim()}"

Preserve os fatos, referências e recursos válidos, mas cumpra a solicitação de forma visível. A semana deve continuar sendo uma unidade didática completa, não um resumo. ${qualityPromptGuidance(input)}
Esta é uma correção de insuficiência textual. Não faça um acréscimo marginal de 20, 30 ou 50 palavras. Reescreva e amplie as seções abaixo do orçamento até atingir o piso de ${textBudget.minimumWords} palavras. Cada seção deve conter explicação conceitual, exemplo ou aplicação, consequência/limite e transição para a próxima. Se o texto atual estiver curto, substitua o corpo curto por um corpo desenvolvido; não apenas acrescente uma frase ao final.
Faça uma revisão acadêmica explícita: corrija afirmações sem suporte, diferencie fato e interpretação, acrescente contraponto quando exigido, preserve o mapa de evidências e não invente fontes. ${normalizeAcademicProfile(input.academicProfile, input).sourcePolicy}

Retorne somente { "lessonPlan": { ... } }. Não gere blocks nem teacherGuide; o servidor preservará/reconstruirá o guia do professor. O lessonPlan deve manter título específico, welcome, objetivos observáveis, pelo menos ${textBudget.requiredSectionCount} seções conforme o orçamento, exemplos/caso/contraponto quando pertinente, síntese, próxima semana, glossário, referências estruturadas, claimEvidence, avaliação e timePlan. lessonPlan.webPractices deve ser sempre []; não inclua qualquer descrição ou instrução da sessão prática no texto-base. Não invente URLs ou fontes verificadas. A prioridade desta resposta é o texto substancial do aluno; não reduza o corpo para economizar tokens.

Briefing essencial do curso:
${JSON.stringify(compactInput, null, 2)}

Foco longitudinal obrigatório desta semana:
${JSON.stringify(weekFocus, null, 2)}

Planejamento acadêmico atualizado:
${JSON.stringify(academicPlan, null, 2)}

Semana atual, em formato compacto:
${JSON.stringify(compactWeek, null, 2)}

Retorne JSON completo agora.`;
  const regenerationMaxTokens = regenerationTokenBudget(input, options);
  let raw = await callJson([
    { role: "system", content: ACADEMIC_SYSTEM_PROMPT },
    { role: "user", content: prompt }
  ], {
    temperature: 0.35,
    maxTokens: regenerationMaxTokens,
    retryMaxTokens: regenerationMaxTokens,
    formatRetryInstruction: `A resposta anterior foi truncada ou continha JSON inválido. Refaça agora somente { "lessonPlan": { ... } }, sem teacherGuide e sem blocks. Preserve a meta mínima de ${textBudget.minimumWords} palavras, ${textBudget.requiredSectionCount} seções com aproximadamente ${textBudget.sectionTargetWords} palavras cada, síntese e avaliação. Responda somente JSON válido, sem markdown, comentários, texto extra ou vírgulas finais.`
  });
  let academicReview = { status: "not-run", issues: [], strengths: [], unsupportedClaims: [], rewriteRequired: false };
  if (!singlePass && process.env.AULA_ACADEMIC_REVIEW !== "false") {
    try { academicReview = await reviewWeekWithAI(input, index, academicPlan, raw); } catch { academicReview = { status: "needs-human-review", issues: [{ severity: "high", type: "review-unavailable", description: "A revisão acadêmica automática não pôde ser concluída.", suggestedRepair: "Faça a conferência humana antes da exportação." }], strengths: [], unsupportedClaims: [], rewriteRequired: true }; }
  }
  if (!singlePass && process.env.AULA_AUTO_REPAIR !== "false" && academicReview.rewriteRequired) {
    try {
      raw = await repairWeekWithAI(input, index, raw, { issues: ["a revisão acadêmica solicitou reescrita"] }, academicPlan, academicReview);
      if (process.env.AULA_ACADEMIC_REVIEW !== "false") academicReview = await reviewWeekWithAI(input, index, academicPlan, raw);
    } catch { /* a semana segue para revisão humana */ }
  }
  return { ...raw, academicPlan, ...(raw?.teacherGuide ? { teacherGuide: { ...raw.teacherGuide, academicPlan, academicReview, claimEvidence: raw?.lessonPlan?.claimEvidence || academicPlan.claimsRequiringEvidence || [] } } : {}) };
}

export async function generateWithAI(input) {
  const weeks = [];
  const progression = buildCourseProgression(input);
  const batchSize = Math.min(3, Math.max(1, Number(process.env.AULA_AI_BATCH_SIZE) || 1));
  for (let start = 0; start < input.weeks; start += batchSize) {
    const batch = await Promise.all(Array.from({ length: Math.min(batchSize, input.weeks - start) }, (_, offset) => generateOneWeek(input, start + offset, { progression, previousWeeks: weeks })));
    weeks.push(...batch);
  }
  const normalizedWeeks = normalizeWeeklyOutput({ weeks }, input);
  const teacherGuides = normalizedWeeks.map((lesson, index) => {
    const scopedInput = { ...input, webPractices: (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, index)) };
    return buildTeacherGuide(scopedInput, lesson, { ...(weeks[index]?.teacherGuide || {}), webPracticeProjects: weeks[index]?.teacherGuide?.webPracticeProjects || weeks[index]?.teacherGuide?.webPractices || [] }, index);
  });
  return { weeks: normalizedWeeks, teacherGuides };
}
