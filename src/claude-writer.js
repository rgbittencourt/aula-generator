// Modo de escrita em prosa ("como o Claude escreve").
//
// Em vez de pedir à IA um JSON de ~40 campos (o que a faz escrever "para preencher
// campos"), a semana é gerada em duas etapas:
//
//   1. REDAÇÃO   — um texto corrido em Markdown, no tom e na estrutura da aula de
//                  referência (writer-voice.js). Esta é a chamada longa e cara.
//   2. DERIVADOS — uma chamada curta, em JSON, que lê o texto já escrito e produz o
//                  que precisa ser consistente com ele: avaliação com feedback por
//                  alternativa, atividades, verificações formativas e o Material de
//                  Mediação (WhatsApp/Moodle).
//
// O analisador (writer-markdown.js) converte o Markdown em lessonPlan, sem IA, e o
// restante do sistema (blocos do ClassAtelier, qualidade, ponte entre semanas,
// pesquisa de recursos) segue igual. AULA_WRITER=json volta ao modo antigo.

import { writerMethodologyBlock, derivativesMethodologyBlock, webPracticeMethodologyBlock, METHODOLOGY_GUIDE_SPEC, methodologyGuideRules } from "./methodology.js";
import { callJson, callText, getAIModel } from "./ai-client.js";
import { normalizeAcademicPlan } from "./academic.js";
import { buildCourseProgression, progressionForWeek } from "./curriculum.js";
import { measureLessonQuality, qualityTargets } from "./content-quality.js";
import { applyCompositionInstruction } from "./composition.js";
import { normalizeLesson, practiceScheduledForWeek, resourcePlanForWeek } from "./aula-schema.js";
import { closingRequirement, formatBridgeContext } from "./bridge.js";
import { writerSystemPrompt } from "./writer-voice.js";
import { parseWeekMarkdown, planToMarkdown, plain } from "./writer-markdown.js";
import { applyFactCheck } from "./fact-check.js";
import { compactBriefingPractice, compactWeekInput, enforceWeekFocus } from "./ai.js";
import { QUIZ_OPTION_COUNT, assessmentIssues } from "./pedagogy.js";

export function writerMode() {
  const configured = String(process.env.AULA_WRITER || "").trim().toLowerCase();
  return configured === "json" || configured === "legacy" ? "json" : "prose";
}

const urlsIn = (value) => new Set((JSON.stringify(value ?? {}).match(/https?:\/\/[^\s"'\\<>)]+/g) || []).map((url) => url.replace(/[.,;]+$/, "")));
const listText = (items) => (items || []).map((item) => `- ${item}`).join("\n");

function writerTokenBudget(targets) {
  const configured = Number(process.env.AULA_WRITER_MAX_TOKENS || 0);
  // Português gasta ~1,6–1,9 token por palavra; callouts e títulos somam ~15%.
  const estimated = Math.ceil(targets.targetWords * 2.3) + 1500;
  return Math.min(16000, Math.max(6000, configured || estimated));
}

function previousWeeksBlock(previousWeeks = []) {
  const summaries = (previousWeeks || []).slice(-3).map((lesson, position) => ({
    semana: lesson?.lessonPlan?.weekNumber || position + 1,
    tema: lesson?.lessonPlan?.theme || lesson?.meta?.title,
    objetivos: (lesson?.lessonPlan?.learningObjectives || []).slice(0, 4),
    secoes: (lesson?.lessonPlan?.contentSections || []).map((section) => section.title).filter(Boolean).slice(0, 8)
  }));
  return summaries.length ? `SEMANAS JÁ ESCRITAS (para retomar pelo nome e não repetir; não copie títulos nem trechos):\n${JSON.stringify(summaries, null, 2)}` : "";
}

export function buildWriterPrompt(input, index, { progression = null, previousWeeks = [], bridges = [], current = null, instruction = "" } = {}) {
  const weekNumber = index + 1;
  const focus = progressionForWeek(input, index, progression || buildCourseProgression(input));
  const targets = qualityTargets(input);
  const resourcePlan = resourcePlanForWeek(input, index);
  const compactInput = compactWeekInput(input, index, resourcePlan);
  const provided = [...urlsIn({ videoLinks: input.videoLinks, imageLinks: input.imageLinks, materials: input.materials, references: input.references })];
  const bridge = formatBridgeContext(bridges, weekNumber);
  const intro = `Esta é a semana ${weekNumber} de ${input.weeks}. ${weekNumber > 1
    ? (focus.bridgeFromPrevious || `Retome um conceito da semana ${weekNumber - 1} pelo nome e mostre como esta semana avança.`)
    : "É a abertura do curso: construa a base conceitual e anuncie o percurso."}`;
  const revision = current ? `

TEXTO ATUAL DA SEMANA (é o que o professor está revendo):
<<<
${String(planToMarkdown(current)).slice(0, 48000)}
>>>

PEDIDO DO PROFESSOR PARA ESTA REVISÃO:
"${String(instruction || "").trim()}"

Como revisar: reescreva o documento inteiro já com o pedido incorporado. O que o professor não mencionou deve permanecer praticamente idêntico (mesmas frases, mesma ordem, mesmos casos e callouts), porque ele já leu e aprovou esses trechos. Não encolha o texto, não resuma e mantenha a voz. Se o pedido mudar um fato ou um caso, ajuste também o que dependia dele (síntese, glossário, referências, "Pontos a conferir").` : "";
  const methodology = writerMethodologyBlock(input, index);
  return `Escreva a unidade da semana ${weekNumber} do curso "${input.title}". ${intro}

PÚBLICO E NÍVEL: ${input.audience || "estudantes de pós-graduação"} (${input.level || "pós-graduação"}), em ${input.language || "português do Brasil"}.

MAPA DESTA SEMANA (obrigatório):
- Título da semana: escreva um título específico e curto (até 9 palavras, como o de um capítulo), tirado do assunto e dos objetivos abaixo; NÃO copie esta linha, que é só o rótulo interno do plano: ${focus.theme}
- Pergunta central: ${focus.centralQuestion}
- Objetivos (use estes, com estas palavras, na seção "Objetivos de aprendizagem"):
${listText(focus.objectives)}
- Conceitos novos a definir: ${JSON.stringify(focus.newConcepts)}
- Sequência sugerida das seções: ${JSON.stringify(focus.sectionSequence)}
- Ponte recebida: ${focus.bridgeFromPrevious || "(abertura do curso)"}
- Ponte para a próxima semana: ${focus.bridgeToNext || "(encerramento do curso)"}
- Marco da etapa: ${focus.projectMilestone || "(não definido)"}
- Elementos obrigatórios: ${JSON.stringify(focus.mustInclude)}
- Não repetir nem antecipar: ${focus.doNotRepeat}

TAMANHO: pelo menos ${targets.requiredSectionCount} seções numeradas, cada uma com cerca de ${targets.sectionTargetWords} palavras (mínimo ${targets.sectionMinimumWords}); no total, ao menos ${targets.targetWords} palavras de texto para o estudante. Textos curtos serão recusados: desenvolva cada ideia com conceito, caso concreto, lição e limite antes de passar à seguinte.

RECURSOS: ${resourcePlan.videosPerWeek} vídeo(s) e ${resourcePlan.articlesPerWeek} artigo(s) nesta semana (${resourcePlan.requiredReadingsPerWeek} de leitura obrigatória, nível ${resourcePlan.requiredReadingLevel}). Cada um é um callout 🔎 colocado no parágrafo exato em que ajuda, com "busca" específica. ${provided.length ? `Links fornecidos pelo professor (únicos que podem aparecer em "url:"): ${provided.join(" ")}` : "O professor não forneceu links: use somente \"busca\"."}
${bridge ? `\n${bridge}\n` : ""}
${closingRequirement()} Esse texto vai na seção "O que vem por aí", em um único parágrafo.
${methodology ? `\n${methodology}\n` : ""}${previousWeeksBlock(previousWeeks)}
${revision}

BRIEFING DO CURSO:
${JSON.stringify(compactInput, null, 2)}

Escreva agora o documento completo em Markdown, no formato indicado, sem comentários antes ou depois.`;
}

async function writeMarkdown(messages, options) {
  let { text, truncated } = await callText(messages, { ...options, cacheSystem: true });
  if (truncated) {
    // A saída acabou no meio do texto: pede a continuação a partir do ponto exato.
    const continuation = await callText([
      ...messages,
      { role: "assistant", content: text },
      { role: "user", content: options.continuation || "Sua resposta foi cortada pelo limite de saída. Continue exatamente de onde parou, sem repetir nada do que já escreveu, e termine o documento com todas as seções que faltam (Síntese conceitual, O que vem por aí, Glossário rápido desta semana, Referências desta semana e Pontos a conferir)." }
    ], { ...options, cacheSystem: true });
    text = `${text.trimEnd()}\n\n${continuation.text.trimStart()}`;
    truncated = continuation.truncated;
  }
  return { text, truncated };
}

// ---------------------------------------------------------------------------
// Redação em partes paralelas
//
// Uma semana de ~4.000 palavras são ~10 mil tokens de saída: em uma única chamada isso
// leva mais de 300 s e estoura o limite da função na Vercel. Por isso: (1) uma chamada
// curta produz o roteiro (seções, caso/dado de cada uma); (2) 2–3 chamadas escrevem, ao
// mesmo tempo, cada qual um bloco de seções; (3) o texto é unido na ordem. O guia de
// voz e a semana modelo ficam em cache de prompt, então as chamadas paralelas o reaproveitam.
// ---------------------------------------------------------------------------
const writerParallelEnabled = () => String(process.env.AULA_WRITER_PARALLEL || "true").toLowerCase() !== "false";

export function parseOutline(text) {
  const lines = String(text || "").split(/\r?\n/);
  const sections = [];
  let title = "";
  for (const raw of lines) {
    const line = raw.trim();
    if (!title && /^#\s+\S/.test(line)) { title = line; continue; }
    const match = line.match(/^(?:##\s*)?(\d{1,2})\.\s+\S/);
    if (match && Number(match[1]) === sections.length + 1) sections.push(line.replace(/^##\s*/, ""));
  }
  return { title, sections };
}

export function splitSectionRanges(count) {
  if (count < 4) return [];
  const parts = count >= 6 ? 3 : 2;
  const base = Math.floor(count / parts);
  const extra = count % parts;
  const ranges = [];
  let start = 1;
  for (let k = 0; k < parts; k += 1) {
    const size = base + (k < extra ? 1 : 0);
    ranges.push([start, start + size - 1]);
    start += size;
  }
  return ranges;
}

function partInstruction({ part, total, range, outline, weekNumber, targets, closing }) {
  const [from, to] = range;
  const scope = [
    part === 1 ? `começa com a linha de título do roteiro ("# Semana ${weekNumber} — …"), depois "## Boas-vindas", "## Objetivos de aprendizagem" e então as seções ${from} a ${to}` : `contém somente as seções ${from} a ${to}`,
    closing ? `e termina com "## Síntese conceitual" (retoma o fio da semana, mínimo 120 palavras), "## O que vem por aí", "## Glossário rápido desta semana" (de 6 a 10 termos), "## Referências desta semana" (no mínimo ${targets.minimumReferences || 6} referências completas, no padrão ABNT NBR 6023, em ordem alfabética, com o título em **negrito**, das quais ao menos ${Math.max(2, targets.primarySourcesRequired || 2)} acadêmicas ou oficiais que você conhece com segurança: livros, artigos, normas, documentação) e "## Pontos a conferir"` : ""
  ].filter(Boolean).join(" ");
  return `ROTEIRO DA SEMANA (já definido; siga os números, os títulos e os casos de cada seção):
${outline}

SUA TAREFA AGORA: a semana será escrita em ${total} partes simultâneas, unidas depois na ordem. Você escreve somente a PARTE ${part} de ${total}: ela ${scope}.
- Use os cabeçalhos "## n. Título" exatamente como estão no roteiro; subseções "### n.1 …" quando o conceito pedir.
- Não escreva nada das outras partes e não repita o caso ou o dado que o roteiro atribui a outra seção. Nada de introdução ou conclusão própria da parte: comece direto no Markdown e, ${closing ? "ao chegar à síntese, retome os casos do roteiro, o contraponto e os conceitos novos" : "na última seção desta parte, deixe uma tensão que a seção seguinte do roteiro resolve"}.
- Cada seção com cerca de ${targets.sectionTargetWords} palavras (mínimo ${targets.sectionMinimumWords}); inclua em cada seção desta parte TODOS os callouts 🔎 (vídeo, artigo) e as figuras 🖼️ (no formato do guia: > 🖼️ **Figura** [diagrama | descrição: "…"]: legenda) que o roteiro lhe atribui, no parágrafo exato em que ajudam, mais os 💭, 💡 e ⚠️ conforme o roteiro. Sem esses 🔎 a semana fica sem recursos.
- Esta instrução vale mais do que qualquer outra que peça o documento inteiro.`;
}

async function writeWeekMarkdown(input, index, { progression, previousWeeks, bridges, current, instruction, temperature, targets }) {
  const system = { role: "system", content: writerSystemPrompt() };
  const base = buildWriterPrompt(input, index, { progression, previousWeeks, bridges, current, instruction });
  const single = () => writeMarkdown([system, { role: "user", content: base }], { temperature, maxTokens: writerTokenBudget(targets), ignoreRequestBudget: true });
  if (!writerParallelEnabled()) return single();

  const weekNumber = index + 1;
  const resources = resourcePlanForWeek(input, index);
  const outlineAsk = `${base}

ANTES DE ESCREVER, faça o ROTEIRO da semana. Responda somente com ele, neste formato, sem texto antes ou depois:
# Semana ${weekNumber} — Título da semana
1. Título da seção | cobre: o que a seção explica | caso ou dado concreto: instituição, ano, número, norma ou autor reais (marque "conferir" se não tiver certeza) | callouts: 🔎/💭/💡/⚠️/🖼️ que entram
2. …
Uma linha por seção numerada, no mínimo ${targets.requiredSectionCount} seções, na ordem didática (problema, conceito, caso, lição, limite; contraponto crítico perto do fim). Casos e dados não podem se repetir entre seções. Distribua pelas seções, na coluna callouts, EXATAMENTE ${resources.videosPerWeek} callout(s) 🔎 de vídeo e ${resources.articlesPerWeek} de artigo, cada um na seção em que realmente ajuda, e diga o que o recurso mostra. Marque também 1 ou 2 seções com 🖼️ (figura: diagrama que explica melhor que o texto) e escreva ao lado, em "figura:", o que o desenho mostra. Subseções e demais partes (boas-vindas, síntese, glossário) não entram no roteiro.`;
  const askOutline = (text) => callText([system, { role: "user", content: text }], { temperature, maxTokens: 3000, ignoreRequestBudget: true, cacheSystem: true });
  let outline = String((await askOutline(outlineAsk)).text || "").trim();
  let { sections } = parseOutline(outline);
  if (sections.length < targets.requiredSectionCount) {
    // Um roteiro curto vira uma semana curta: pede de novo, uma vez, com a exigência explícita.
    const retry = String((await askOutline(`${outlineAsk}\n\nATENÇÃO: o roteiro anterior tinha só ${sections.length} seção(ões) e foi recusado. Entregue um roteiro com pelo menos ${targets.requiredSectionCount} seções numeradas, uma por linha.`)).text || "").trim();
    const again = parseOutline(retry);
    if (again.sections.length > sections.length) { outline = retry; sections = again.sections; }
  }
  const ranges = splitSectionRanges(sections.length);
  if (!ranges.length) return single();

  const jobs = ranges.map((range, position) => {
    const part = position + 1;
    const closing = part === ranges.length;
    const count = range[1] - range[0] + 1;
    const words = count * targets.sectionTargetWords + (part === 1 ? 350 : 0) + (closing ? 1100 : 0);
    const maxTokens = Math.min(14000, Math.max(4000, Math.ceil(words * 2.6) + 1800));
    const user = `${base}\n\n${partInstruction({ part, total: ranges.length, range, outline, weekNumber, targets, closing })}`;
    return writeMarkdown([system, { role: "user", content: user }], { temperature, maxTokens, ignoreRequestBudget: true, continuation: "Sua resposta foi cortada pelo limite de saída. Continue exatamente de onde parou, sem repetir nada, e termine somente o que cabe a esta parte." });
  });
  const settled = await Promise.allSettled(jobs);
  const failed = settled.find((item) => item.status === "rejected");
  if (failed) throw failed.reason;
  let text = settled.map((item) => item.value.text.trim()).join("\n\n");
  let truncated = settled.some((item) => item.value.truncated);
  // Rede de segurança: se o fechamento veio cortado ou incompleto, pede só o que falta.
  const missing = ["Síntese conceitual", "O que vem por aí", "Glossário rápido desta semana", "Referências desta semana", "Pontos a conferir"].filter((heading) => !new RegExp(`^##\\s*${heading}`, "im").test(text));
  if (missing.length) {
    const closing = await callText([system, { role: "user", content: `${base}\n\nROTEIRO DA SEMANA:\n${outline}\n\nTEXTO JÁ ESCRITO (não reescreva nada dele):\n<<<\n${text.slice(-30000)}\n>>>\n\nSUA TAREFA: escreva SOMENTE as seções que faltam, nesta ordem e com estes cabeçalhos: ${missing.map((heading) => `"## ${heading}"`).join(", ")}. Referências: no mínimo ${targets.minimumReferences || 6}, completas e que você conhece com segurança. Comece direto no Markdown.` }], { temperature, maxTokens: 6000, ignoreRequestBudget: true, cacheSystem: true });
    text = `${text}\n\n${closing.text.trim()}`;
    truncated = Boolean(closing.truncated);
  }
  return { text, truncated };
}

const DERIVATIVES_SYSTEM = `Você é designer instrucional de um curso de pós-graduação a distância. Recebe uma semana de material didático já escrita e produz, em JSON válido, as peças que dependem dela: avaliação, atividades, verificações formativas e mensagens de mediação. Tudo precisa ser respondível e verificável a partir do texto recebido; nunca cobre algo que o texto não ensinou. Escreva em português do Brasil, no mesmo tom do texto.`;

export function derivativesPrompt(input, index, plan, scheduledPractices, part = "all") {
  const weekNumber = index + 1;
  const sections = (plan.contentSections || []).map((section) => `### ${section.number}. ${section.title}\n${plain(String(section.body || "").replace(/<[^>]+>/g, " "))}\n${(section.subsections || []).map((sub) => `#### ${sub.number} ${sub.title}\n${plain(String(sub.body || "").replace(/<[^>]+>/g, " "))}`).join("\n")}`).join("\n\n");
  const text = `${plain(String(plan.welcome || "").replace(/<[^>]+>/g, " "))}\n\n${sections}\n\nSÍNTESE: ${plain(String(plan.synthesis || "").replace(/<[^>]+>/g, " "))}`.slice(0, 40000);
  const wants = {
    assessment: ["all", "assessment"].includes(part),
    activities: ["all", "guide", "activities"].includes(part),
    mediation: ["all", "guide", "mediation"].includes(part),
    explain: ["all", "guide", "explain"].includes(part),
    webpractice: ["all", "guide", "webpractice"].includes(part) && scheduledPractices.length > 0,
    // O guia da metodologia sai numa chamada própria, depois das atividades (precisa delas).
    methodology: part === "methodology"
  };
  // Com webprática, o projeto completo sai numa chamada própria (é a parte mais longa do guia).
  const separateWebpractice = part === "mediation" || part === "webpractice";
  const assessmentSpec = `  "assessment": {
    "title": "Atividade avaliativa — Semana ${weekNumber}",
    "format": "6 questões objetivas de múltipla escolha, com 5 alternativas e feedback em todas elas",
    "questions": [
      { "type": "multiple-choice", "objective": "objetivo observável coberto", "q": "enunciado", "options": ["A","B","C","D","E"], "answer": 0, "explanation": "por que a correta está certa, citando o texto", "feedbackByOption": ["feedback da alternativa A","...B","...C","...D","...E"] }
    ]
  }`;
  const activitiesSpec = `  "diagnostic": { "prompt": "pergunta de entrada ligada ao dia a dia do estudante", "expectedEvidence": "...", "feedback": "..." },
  "formativeChecks": [ { "moment": "Depois da seção N", "prompt": "pergunta", "expectedEvidence": "...", "feedback": "...", "action": "o que fazer se errar" } ],
  "activities": [ { "type": "fórum", "title": "...", "instructions": "...", "durationMinutes": 40, "evidence": "...", "evidenceType": "...", "feedback": "...", "criteria": ["..."], "required": true } ],
  "selfAssessment": { "title": "Autoavaliação", "prompts": ["..."], "scale": ["..."], "feedback": "..." }`;
  const mediationSpec = `  "teacherGuide": {
    "resourceNotes": ["orientação ao professor sobre os recursos desta semana"],
    "mediationStops": [ { "id": "stop-1", "title": "Abertura", "timing": "início da semana", "purpose": "..." } ],
    "mediationMessages": {
      "whatsapp": [ { "relatedId": "stop-1", "relatedType": "abertura", "timing": "...", "purpose": "...", "studentNeed": "...", "teacherIntent": "...", "tone": "próximo, com humor leve", "text": "mensagem curta, humana" } ],
      "moodle": [ { "relatedId": "stop-1", "relatedType": "abertura", "timing": "...", "purpose": "...", "studentNeed": "...", "teacherIntent": "...", "tone": "claro e organizado", "text": "aviso de curso organizado" } ]
    }${scheduledPractices.length && !separateWebpractice ? ',\n    "webPracticeProjects": [ { "title": "...", "problem": "...", "context": "...", "studentRole": "...", "challenge": "...", "deliverable": "...", "steps": [ { "minutes": 10, "instructions": "...", "evidence": "..." } ], "criteria": ["..."], "fallbackPlan": "..." } ]' : ""}
  }`;
  const explainSpec = `  "teacherGuide": {
    "weekSummary": "resumo para o professor em 2 ou 3 parágrafos curtos separados por linha em branco: a ideia central da semana, o caminho do texto seção a seção (uma frase por seção) e o caso ou exemplo âncora",
    "keyIdeas": ["de 5 a 7 ideias que o estudante precisa levar, uma frase cada, com a seção entre colchetes, por exemplo: [seção 2] ..."],
    "studentFAQ": [ { "question": "pergunta provável do estudante, na voz dele", "answer": "resposta do professor em 2 a 4 frases, só com o que o texto sustenta", "sectionRef": "2" } ],
    "commonMisconceptions": [ { "misconception": "o equívoco, como o estudante o diria", "whyItHappens": "por que ele acontece", "howToAddress": "como o professor corrige, em 1 ou 2 frases" } ],
    "mediationQuestions": ["pergunta aberta para o fórum ou o WhatsApp, que peça o contexto do estudante"],
    "interventions": [ { "signal": "o que o professor observa (ex.: três dias sem acesso; resposta que só copia o texto)", "action": "o que fazer", "message": "mensagem curta, pronta para enviar" } ],
    "sensitivePoints": ["afirmação do texto que exige cuidado (número, data, caso) e como falar dela com segurança"],
    "assessmentNotes": ["como ler o desempenho nas questões: qual combinação de erros indica qual lacuna"]
  }`;
  const webpracticeSpec = `  "teacherGuide": {
    "webPracticeProjects": [ { "title": "...", "problem": "...", "context": "...", "studentRole": "...", "challenge": "...", "deliverable": "...", "steps": [ { "minutes": 10, "instructions": "...", "evidence": "..." } ], "criteria": ["..."], "fallbackPlan": "..." } ]
  }`;
  const specs = [wants.methodology && METHODOLOGY_GUIDE_SPEC, wants.assessment && assessmentSpec, wants.activities && activitiesSpec, wants.mediation && mediationSpec, wants.explain && explainSpec, part === "webpractice" && wants.webpractice && webpracticeSpec].filter(Boolean);
  const rules = [
    wants.assessment && `REGRAS DA AVALIAÇÃO
- Exatamente 6 questões, todas de múltipla escolha com EXATAMENTE 5 alternativas e uma única correta, cobrindo todos os objetivos. Não use verdadeiro/falso. "answer" é o índice (começando em 0, de 0 a 4) da alternativa correta; varie a posição da correta entre as questões.
- Enunciados diretos, sem "todas as anteriores" e sem pegadinha de redação. As alternativas erradas devem ser plausíveis: erros reais de leitura do conceito, não absurdos.
- "feedbackByOption" tem EXATAMENTE 5 entradas, na mesma ordem das alternativas, todas preenchidas: a da correta explica por que está certa (citando o texto); cada uma das 4 erradas explica o equívoco de leitura em uma ou duas frases e aponta a seção que o corrige (por exemplo, "releia a seção 3"). Nenhum feedback pode ser vazio ou genérico ("errado").
- Nada de números, nomes ou datas que o texto não tenha dito.`,
    wants.activities && `REGRAS DAS ATIVIDADES
- Diagnóstico de entrada curto; de 2 a 4 verificações formativas ao longo das seções; de 2 a 3 atividades (por exemplo, fórum e um produto curto) com critérios observáveis; autoavaliação com escala. Tudo respondível a partir do texto, sem inventar dados.`,
    wants.explain && `REGRAS DAS EXPLICAÇÕES PARA O PROFESSOR
- O leitor é o professor-mediador que vai acompanhar a turma sem ter escrito o texto: ele precisa entender a semana para responder dúvidas com segurança.
- Use SOMENTE o que o texto diz: nada de número, nome, data ou caso que não esteja nele. Quando a pergunta do estudante for provável mas o texto não a responder, diga na resposta o que o texto sustenta e o que o professor deve conferir antes de afirmar.
- "studentFAQ": de 6 a 8 perguntas reais de quem estuda (dúvida de conceito, de aplicação ao seu campus, de prazo ou de avaliação), na voz do estudante, cada uma com a seção de referência. "commonMisconceptions": de 3 a 5, pegando as confusões que o próprio texto antecipa. "interventions": de 4 a 6 sinais concretos e observáveis, com ação e mensagem de WhatsApp curta e acolhedora. "sensitivePoints": cuide dos números e casos do texto, dizendo como falar deles. "mediationQuestions": de 5 a 6 perguntas abertas.
- Tom de colega para colega, direto e prático. Sem jargão pedagógico vazio.`,
    wants.mediation && `REGRAS DO MATERIAL DE MEDIAÇÃO
- Uma parada para a abertura, uma ao final de cada bloco de duas ou três seções do texto (de 3 a 5 no total) e uma para o fechamento. Para cada parada, uma mensagem de WhatsApp e uma de Moodle, de teor equivalente, mas não cópia: o WhatsApp é mais próximo e pode ter humor leve; o Moodle, mais organizado. Mensagens curtas.
- As mensagens explicam por que vale a pena fazer a etapa, reconhecem a dificuldade e convidam a uma ação concreta. Não invente data, link nem obrigação que não esteja no briefing.
${scheduledPractices.length && !separateWebpractice ? `- Há webprática agendada para esta semana: desenvolva o projeto completo apenas em teacherGuide.webPracticeProjects (nunca no texto do aluno). Briefing da prática: ${JSON.stringify(scheduledPractices.map((practice, practiceIndex) => compactBriefingPractice(practice, practiceIndex)))}` : ""}`,
    part === "webpractice" && wants.webpractice && `REGRAS DA WEBPRÁTICA
- Desenvolva o projeto completo de cada webprática agendada para esta semana, só em teacherGuide.webPracticeProjects (nunca no texto do aluno), ligado ao que o texto ensinou. Briefing da prática: ${JSON.stringify(scheduledPractices.map((practice, practiceIndex) => compactBriefingPractice(practice, practiceIndex)))}`
  ].filter(Boolean);
  const methodology = wants.methodology ? methodologyGuideRules(input, index, plan) : derivativesMethodologyBlock(input, index, wants);
  if (methodology) rules.push(methodology);
  // As webpráticas saem junto com a mediação ou numa chamada própria; a metodologia vai com elas.
  const practiceMethodology = scheduledPractices.length && ((wants.mediation && !separateWebpractice) || (part === "webpractice" && wants.webpractice)) ? webPracticeMethodologyBlock(input, index, scheduledPractices) : "";
  if (practiceMethodology) rules.push(practiceMethodology);
  return `Texto da semana ${weekNumber} ("${plan.theme}") do curso "${input.title}":

${text}

Objetivos da semana:
${listText(plan.learningObjectives)}

Devolva somente este objeto JSON:
{
${specs.join(",\n")}
}

${rules.join("\n\n")}${rules.length ? "\n\n" : ""}Responda somente JSON válido.`;
}

// A avaliação (6 questões × 5 alternativas × 5 feedbacks) e o material de mediação
// somam mais saída do que cabe em uma só resposta. São duas chamadas em paralelo,
// cada uma com o seu limite de saída; se uma falha, a outra não se perde na repetição
// (o erro é da etapa inteira e a repetição refaz as duas).
async function buildDerivatives(input, index, plan, only = null) {
  const scheduled = (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, index));
  const names = { methodology: "teacherGuide.methodologyGuide", assessment: "assessment", activities: "diagnostic, formativeChecks, activities, selfAssessment", mediation: "teacherGuide", explain: "teacherGuide (weekSummary, keyIdeas, studentFAQ, ...)", webpractice: "teacherGuide.webPracticeProjects" };
  const call = (part, maxTokens, extra = "") => callJson([
    { role: "system", content: DERIVATIVES_SYSTEM },
    { role: "user", content: `${derivativesPrompt(input, index, plan, scheduled, part)}${extra}` }
  ], {
    temperature: 0.35,
    maxTokens,
    retryMaxTokens: maxTokens,
    label: `derivatives:${part}`,
    cacheSystem: true,
    formatRetryInstruction: `A resposta anterior foi truncada ou inválida. Devolva novamente somente o objeto JSON pedido (${names[part]}), sempre com JSON válido e completo.`
  });
  try {
    // allSettled: não deixa uma chamada solta rodando (e gastando tokens) depois que a outra falhou.
    // `only` limita a regeneração a partes (ex.: ["assessment"]) quando o professor quer
    // consertar um item específico sem refazer o que já conferiu.
    const wanted = (part) => !Array.isArray(only) || only.includes(part);
    const plannedParts = [["assessment", 12000], ["activities", 9000], ["mediation", 12000], ["explain", 12000], ...(scheduled.length ? [["webpractice", 12000]] : []), ...(Array.isArray(only) && only.includes("methodology") ? [["methodology", 12000]] : [])].filter(([part]) => wanted(part));
    // As questões precisam ter 5 alternativas e feedback em todas; se vier fora do padrão, a IA
    // refaz as questões uma vez, com a lista exata do que faltou.
    const callChecked = async (part, tokens) => {
      const first = await call(part, tokens);
      if (part !== "assessment") return first;
      const problems = assessmentIssues(first?.assessment?.questions);
      if (!problems.length && (first?.assessment?.questions || []).length) return first;
      const second = await call(part, tokens, `\n\nATENÇÃO: a versão anterior das questões saiu fora do padrão (${(problems.length ? problems : ["nenhuma questão devolvida"]).slice(0, 8).join("; ")}). Refaça TODAS as questões: cada uma com EXATAMENTE ${QUIZ_OPTION_COUNT} alternativas, uma única correta e "feedbackByOption" com ${QUIZ_OPTION_COUNT} feedbacks preenchidos (a correta e as ${QUIZ_OPTION_COUNT - 1} incorretas).`);
      const secondProblems = assessmentIssues(second?.assessment?.questions);
      return secondProblems.length <= problems.length ? second : first;
    };
    const results = await Promise.allSettled(plannedParts.map(([part, tokens]) => callChecked(part, tokens)));
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
    const byPart = Object.fromEntries(plannedParts.map(([part], position) => [part, results[position].value]));
    const { assessment, activities, mediation, explain, webpractice, methodology } = byPart;
    const object = (value) => (value && typeof value === "object" ? value : {});
    const teacherGuide = { ...object(object(mediation).teacherGuide), ...object(object(explain).teacherGuide), ...(object(object(methodology).teacherGuide).methodologyGuide ? { methodologyGuide: methodology.teacherGuide.methodologyGuide } : {}), ...(object(object(webpractice).teacherGuide).webPracticeProjects ? { webPracticeProjects: webpractice.teacherGuide.webPracticeProjects } : {}) };
    const data = { ...object(activities), ...(Object.keys(teacherGuide).length ? { teacherGuide } : {}), ...(object(assessment).assessment ? { assessment: assessment.assessment } : {}) };
    return { data, error: "" };
  } catch (error) {
    return { data: {}, error: error?.message || "Falha ao gerar a avaliação e o Material de Mediação." };
  }
}

function mergeDerivatives(plan, derivatives) {
  const pick = (key) => derivatives[key] && (Array.isArray(derivatives[key]) ? derivatives[key].length : Object.keys(derivatives[key]).length) ? { [key]: derivatives[key] } : {};
  return { ...plan, ...pick("assessment"), ...pick("diagnostic"), ...pick("formativeChecks"), ...pick("activities"), ...pick("selfAssessment"), ...pick("activeMethodology") };
}

async function composeWeek(input, index, markdown, options = {}) {
  // Se a redação já consumiu boa parte do tempo da requisição, os derivados saem
  // numa requisição própria (/api/derivatives) em vez de estourar o limite da hospedagem.
  const limitMs = Number(process.env.AULA_WRITER_DERIVATIVES_AFTER_MS || 170000);
  const deferDerivatives = Boolean(options.deferDerivatives) || (options.startedAt > 0 && Date.now() - options.startedAt > limitMs);
  const weekNumber = index + 1;
  const progression = options.progression || buildCourseProgression(input);
  const weekFocus = progressionForWeek(input, index, progression);
  const resourcePlan = resourcePlanForWeek(input, index);
  const { lessonPlan: parsed, stats } = parseWeekMarkdown(markdown, { allowedUrls: urlsIn({ videoLinks: input.videoLinks, imageLinks: input.imageLinks, materials: input.materials, references: input.references }), requiredReadings: resourcePlan.requiredReadingsPerWeek, weekNumber });
  const factCheck = applyFactCheck(parsed, { input, previousWeeks: options.previousWeeks });
  const { data: derivatives, error: derivativesError } = deferDerivatives ? { data: {}, error: "" } : await buildDerivatives(input, index, { ...parsed, theme: parsed.theme || weekFocus.theme });
  const raw = { lessonPlan: mergeDerivatives(parsed, derivatives), teacherGuide: derivatives.teacherGuide && typeof derivatives.teacherGuide === "object" ? derivatives.teacherGuide : {} };
  enforceWeekFocus(raw, weekFocus, weekNumber);
  return { raw, stats: { ...stats, factCheck }, derivativesError, weekFocus, derivativesPending: deferDerivatives };
}

function academicStub(input, index, weekFocus) {
  return normalizeAcademicPlan({
    weekNumber: index + 1,
    theme: weekFocus.theme,
    centralQuestion: weekFocus.centralQuestion,
    objectives: weekFocus.objectives,
    centralConcepts: weekFocus.newConcepts,
    sectionSequence: weekFocus.sectionSequence.map((title, sectionIndex) => ({ number: String(sectionIndex + 1), title, purpose: "Desenvolver a progressão específica da semana." })),
    controversies: [weekFocus.doNotRepeat]
  }, input, index);
}

function finish(input, index, composed, { truncated, mode, previousWeeks, deferRepair }) {
  const { raw, stats, derivativesError, weekFocus, derivativesPending } = composed;
  const academicPlan = academicStub(input, index, weekFocus);
  const lesson = normalizeLesson(raw, input, index);
  const quality = measureLessonQuality(lesson, input, { peerLessons: previousWeeks || [] });
  const reasons = [];
  if (truncated) reasons.push("a redação foi cortada pelo limite de saída");
  if (derivativesError) reasons.push("a avaliação e o Material de Mediação não puderam ser gerados; refaça a semana");
  if (quality.status === "insufficient" || quality.wordCount < quality.minimumWords) reasons.push(...(quality.issues || []).slice(0, 5));
  const generationMeta = {
    phase: reasons.length ? "draft" : "complete",
    mode,
    writer: "prose",
    model: getAIModel(),
    repairPending: Boolean(deferRepair && reasons.length),
    // A avaliação e o Material de Mediação saem numa segunda requisição (/api/derivatives),
    // para que cada requisição tenha o seu próprio limite de tempo na hospedagem.
    derivativesPending: Boolean(derivativesPending),
    repairAttempts: 0,
    repairReason: reasons.slice(0, 8),
    nextAction: reasons.length ? "Refazer esta semana pela prévia (ela já foi salva)." : undefined,
    initialQuality: { status: quality.status, score: quality.score, wordCount: quality.wordCount, minimumWords: quality.minimumWords },
    finalQuality: { status: quality.status, score: quality.score, wordCount: quality.wordCount, minimumWords: quality.minimumWords },
    writerStats: stats
  };
  return {
    ...raw,
    academicPlan,
    teacherGuide: { ...(raw.teacherGuide || {}), academicPlan, academicReview: { status: "not-run", issues: [], strengths: [], unsupportedClaims: [], rewriteRequired: false }, claimEvidence: raw.lessonPlan?.claimEvidence || [] },
    generationMeta
  };
}

export async function generateWeekProse(input, index, options = {}) {
  const startedAt = Date.now();
  const progression = options.progression || buildCourseProgression(input);
  const targets = qualityTargets(input);
  const draft = await writeWeekMarkdown(input, index, { progression, previousWeeks: options.previousWeeks, bridges: options.bridges, temperature: 0.6, targets });
  const composed = await composeWeek(input, index, draft.text, { progression, deferDerivatives: options.deferDerivatives, startedAt, previousWeeks: options.previousWeeks });
  return finish(input, index, composed, { truncated: draft.truncated, mode: "prose-writer", previousWeeks: options.previousWeeks, deferRepair: options.deferRepair });
}

export async function regenerateWeekProse(input, index, currentWeek, instruction, options = {}) {
  const startedAt = Date.now();
  input = applyCompositionInstruction(input, index, instruction);
  const progression = options.progression || buildCourseProgression(input);
  const targets = qualityTargets(input);
  const current = currentWeek?.lessonPlan || currentWeek || {};
  const draft = await writeWeekMarkdown(input, index, { progression, previousWeeks: options.previousWeeks, bridges: options.bridges, current, instruction, temperature: 0.5, targets });
  const composed = await composeWeek(input, index, draft.text, { progression, deferDerivatives: options.deferDerivatives, startedAt, previousWeeks: options.previousWeeks });
  return finish(input, index, composed, { truncated: draft.truncated, mode: "prose-regenerate", previousWeeks: options.previousWeeks, deferRepair: false });
}

// Segunda etapa do modo de prosa: avaliação, atividades e Material de Mediação a
// partir do texto que o professor já tem. Recebe a semana normalizada (lessonPlan)
// e devolve a semana reconstruída, o guia do professor e o novo estado de geração.
export const DERIVATIVE_PARTS = ["assessment", "activities", "mediation", "explain", "webpractice", "methodology"];

export async function completeWeekDerivatives(input, index, week, teacherGuide = {}, options = {}) {
  const plan = week?.lessonPlan || {};
  if (!Array.isArray(plan.contentSections) || !plan.contentSections.length) {
    const error = new Error("Envie a semana já escrita para gerar a avaliação e o Material de Mediação.");
    error.code = "DERIVATIVES_WEEK_MISSING";
    throw error;
  }
  const only = Array.isArray(options.parts) && options.parts.length ? options.parts.filter((part) => DERIVATIVE_PARTS.includes(part)) : null;
  const { data, error } = await buildDerivatives(input, index, plan, only);
  if (error) {
    const failure = new Error(`Não foi possível gerar a avaliação e o Material de Mediação desta semana. O texto foi preservado; tente novamente. (${error})`);
    failure.code = "DERIVATIVES_FAILED";
    failure.retryable = true;
    throw failure;
  }
  const guide = { ...(teacherGuide && typeof teacherGuide === "object" ? teacherGuide : {}), ...(data.teacherGuide && typeof data.teacherGuide === "object" ? data.teacherGuide : {}) };
  const lesson = normalizeLesson({ lessonPlan: mergeDerivatives(plan, data), teacherGuide: guide }, input, index);
  const quality = measureLessonQuality(lesson, input, {});
  const previous = week?.generationMeta || {};
  const reasons = (previous.repairReason || []).filter((reason) => !/avaliação e o Material de Mediação/.test(reason));
  const generation = {
    ...previous,
    derivativesPending: false,
    repairReason: reasons,
    phase: reasons.length || previous.repairPending ? previous.phase || "draft" : "complete",
    finalQuality: { status: quality.status, score: quality.score, wordCount: quality.wordCount, minimumWords: quality.minimumWords }
  };
  lesson.generationMeta = { ...(lesson.generationMeta || {}), ...generation };
  return { week: lesson, teacherGuide: guide, generation };
}
