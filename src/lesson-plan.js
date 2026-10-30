// Plano prévio da aula: antes de escrever, a IA mostra COMO pretende aplicar a metodologia
// escolhida. O professor lê, ajusta (edita o texto ou pede mudanças) e aprova; o plano aprovado
// passa a orientar a redação, as atividades, o guia da metodologia e as práticas.

import { accessRequired, hasValidAccess } from "./access.js";
import { normalizeCourseInput, practiceScheduledForWeek } from "./aula-schema.js";
import { callJson } from "./ai-client.js";
import { buildCourseProgression, progressionForWeek } from "./curriculum.js";
import { ACTIVE_METHODS, isNewApproach, methodForWeek } from "./methodology.js";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value.map((item) => (item && typeof item === "object" ? item : text(item))).filter(Boolean) : []);

const SYSTEM = `Você é um designer instrucional experiente que planeja aulas junto com o professor. Antes de escrever qualquer material, você apresenta um PLANO curto e concreto de como a aula vai aplicar a metodologia escolhida, para o professor entender, discutir e aprovar. Escreva em português do Brasil, de colega para colega, sem jargão vazio. Responda somente JSON válido.`;

export function buildLessonPlanPrompt(input, index, { previousPlan = "", instruction = "" } = {}) {
  const focus = progressionForWeek(input, index, buildCourseProgression(input));
  const choice = methodForWeek(input, index);
  const practices = (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, index)).map((practice) => ({ titulo: text(practice.title), modalidade: text(practice.modality), duracaoMin: practice.durationMinutes, objetivo: text(practice.objective) }));
  const sources = (input.materials || []).filter((material) => material.sourceUsage).map((material) => `${text(material.title)} (${material.sourceUsage === "base" ? "base do conteúdo" : material.sourceUsage === "pratica" ? "roteiro de prática" : "apoio"})`);
  const method = choice.method
    ? `Metodologia escolhida pelo professor: ${choice.method.label}. Referência: ${choice.method.text} ${choice.method.activities}`
    : choice.id === "auto"
      ? `O professor pediu que você escolha a metodologia ativa mais adequada entre: ${ACTIVE_METHODS.map((item) => item.label).join("; ")}. Diga qual escolheu e por quê.`
      : "O professor não escolheu metodologia ativa específica: proponha a sequência didática mais adequada aos objetivos.";
  const revision = previousPlan ? `

PLANO ANTERIOR (o professor leu e pode ter editado):
<<<
${String(previousPlan).slice(0, 8000)}
>>>
${instruction ? `PEDIDO DO PROFESSOR: "${String(instruction).slice(0, 2000)}"
Refaça o plano incorporando o pedido. Mantenha o que ele não mencionou.` : "Mantenha as edições do professor e só organize o que estiver incompleto."}` : "";
  return `Aula ${index + 1} de ${input.weeks} do curso "${text(input.title)}" (${text(input.level)}; público: ${text(input.audience)}). Carga de estudo: ${input.hoursPerWeek || "a definir"} h.
Tema previsto: ${text(focus.theme)}
Pergunta central: ${text(focus.centralQuestion)}
Objetivos: ${(focus.objectives || []).join("; ")}
${method}
${isNewApproach(input) ? "Abordagem: planejamento reverso (comece pela evidência de aprendizagem), objetivos observáveis e alinhamento entre objetivos, atividades e avaliação." : ""}
${practices.length ? `Sessões práticas nesta aula: ${JSON.stringify(practices)}` : "Não há sessão prática agendada nesta aula."}
${sources.length ? `Materiais do professor que serão usados como fonte: ${sources.join("; ")}.` : ""}
Conteúdos e orientações do professor: ${text(input.content).slice(0, 3000) || "(não informados)"}${revision}

Devolva este JSON:
{
  "method": "nome da metodologia",
  "why": "por que ela serve a esta aula, em 2 ou 3 frases",
  "evidence": "o que o estudante vai produzir ou demonstrar ao final (a evidência de aprendizagem)",
  "steps": [ { "when": "momento (ex.: antes do encontro, dias 1 a 3)", "what": "o que acontece", "teacher": "o que o professor faz", "student": "o que o estudante faz" } ],
  "textPlan": "o que o texto da aula vai priorizar e como prepara para as atividades (3 a 5 frases)",
  "activities": [ { "title": "atividade", "type": "fórum, quiz, produto, prática…", "purpose": "como aplica a metodologia e qual objetivo atende" } ],
  "evaluation": "como a aprendizagem será avaliada e como o professor saberá se a metodologia funcionou",
  "practice": "como a sessão prática entra no plano (vazio se não houver)",
  "risks": "o que pode dar errado e como prevenir",
  "questions": ["até 3 perguntas curtas para o professor decidir antes de gerar (ex.: prazo do estudo prévio, se a atividade vale nota)"]
}
De 3 a 6 passos em "steps" e de 2 a 4 atividades. Seja concreto: nomes de atividades, ordem e tempos.`;
}

// Plano em texto editável (é esse texto que o professor ajusta e aprova).
export function lessonPlanToText(plan = {}) {
  const steps = list(plan.steps).map((step, position) => `${position + 1}. ${text(step.when)}: ${text(step.what)}${step.teacher ? `\n   Professor: ${text(step.teacher)}` : ""}${step.student ? `\n   Estudante: ${text(step.student)}` : ""}`).join("\n");
  const activities = list(plan.activities).map((activity) => `- ${text(activity.title)}${activity.type ? ` (${text(activity.type)})` : ""}: ${text(activity.purpose)}`).join("\n");
  const questions = list(plan.questions).map((question) => `- ${text(question)}`).join("\n");
  return [
    `METODOLOGIA: ${text(plan.method)}`,
    plan.why && `POR QUE: ${text(plan.why)}`,
    plan.evidence && `EVIDÊNCIA DE APRENDIZAGEM: ${text(plan.evidence)}`,
    steps && `PASSO A PASSO:\n${steps}`,
    plan.textPlan && `O QUE O TEXTO VAI PRIORIZAR: ${text(plan.textPlan)}`,
    activities && `ATIVIDADES:\n${activities}`,
    plan.evaluation && `AVALIAÇÃO: ${text(plan.evaluation)}`,
    text(plan.practice) && `PRÁTICA: ${text(plan.practice)}`,
    plan.risks && `CUIDADOS: ${text(plan.risks)}`,
    questions && `PARA VOCÊ DECIDIR (responda aqui mesmo, se quiser):\n${questions}`
  ].filter(Boolean).join("\n\n");
}

// Bloco do plano aprovado para os prompts de redação e dos derivados.
export function approvedPlanBlock(input = {}) {
  const plan = text(input.approvedLessonPlan);
  if (!plan) return "";
  return `PLANO DA AULA APROVADO PELO PROFESSOR (obrigatório: siga a metodologia, a sequência, as atividades e a avaliação combinadas; as respostas do professor às perguntas do plano valem como decisão)
<<<
${plan.slice(0, 8000)}
>>>`;
}

export default async function lessonPlanHandler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const index = Math.max(0, Math.min(input.weeks - 1, Number.parseInt(request.body?.weekIndex, 10) || 0));
    const plan = await callJson([
      { role: "system", content: SYSTEM },
      { role: "user", content: buildLessonPlanPrompt(input, index, { previousPlan: request.body?.previousPlan, instruction: request.body?.instruction }) }
    ], { temperature: 0.4, maxTokens: 6000, retryMaxTokens: 8000, label: "lesson-plan", formatRetryInstruction: "Devolva novamente somente o objeto JSON do plano, completo e válido." });
    return response.status(200).json({ ok: true, weekIndex: index, plan, text: lessonPlanToText(plan) });
  } catch (error) {
    console.error("lesson plan failed", error);
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível montar o plano da aula.", code: error.code || "PLAN_ERROR", retryable: Boolean(error.retryable) });
  }
}
