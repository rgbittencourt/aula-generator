import { accessRequired, hasValidAccess } from "../src/access.js";
import { attachWorkloadToLessons, buildGeneralPlan, calculateCourseWorkload } from "../src/calculations.js";
import { normalizeCourseInput, normalizeLesson, normalizeWeeklyOutput } from "../src/aula-schema.js";
import { regenerateWeekWithAI } from "../src/ai.js";
import { applyCompositionInstruction } from "../src/composition.js";
import { buildTeacherGuides } from "../src/teacher-guide.js";
import { validateCourse } from "../src/validation.js";
import { getAIModel, getAIProvider } from "../src/ai-client.js";
import bridgeHandler from "../src/bridge-handler.js";
import derivativesHandler from "../src/derivatives-handler.js";
import illustrateHandler from "../src/illustrate-handler.js";
import productionHandler from "../src/production-handler.js";

export default async function handler(request, response) {
  // /api/bridge e /api/derivatives são encaminhados para esta função (limite de 12 funções do plano Hobby).
  if (["summary", "adjust"].includes(request.body?.action)) return bridgeHandler(request, response);
  if (request.body?.action === "derivatives") return derivativesHandler(request, response);
  if (request.body?.action === "illustrate") return illustrateHandler(request, response);
  if (request.body?.action === "production") return productionHandler(request, response);
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const baseInput = normalizeCourseInput(request.body?.input || {});
    const index = Math.max(0, Math.min(baseInput.weeks - 1, Number.parseInt(request.body?.weekIndex, 10) || 0));
    const instruction = String(request.body?.instruction || "").trim().slice(0, 4000);
    if (!instruction) return response.status(400).json({ ok: false, error: "Descreva o que deve mudar nesta semana." });
    const input = applyCompositionInstruction(baseInput, index, instruction);
    // Curso ainda em geração (por exemplo, pausado para aprovação): normalizeWeeklyOutput
    // completaria as semanas que faltam com semanas de reserva, e o cliente perderia a
    // noção de qual é a próxima a gerar. Nesse caso devolvemos somente as semanas enviadas.
    const submittedWeeks = Array.isArray(request.body?.weeks) ? request.body.weeks : [];
    const partial = submittedWeeks.length > 0 && submittedWeeks.length < input.weeks && index < submittedWeeks.length;
    const currentWeeks = partial
      ? submittedWeeks.map((week, weekIndex) => normalizeLesson(week, input, weekIndex))
      : normalizeWeeklyOutput({ weeks: submittedWeeks }, input);
    // A redação e a avaliação saem em requisições separadas (o cliente chama /api/derivatives
    // em seguida), como na geração: escrever o texto + 2 chamadas de derivados numa só
    // requisição estourava o limite de 300 s da hospedagem e a semana ficava como estava.
    const raw = await regenerateWeekWithAI(input, index, currentWeeks[index], instruction, { previousWeeks: currentWeeks.slice(0, index), deferDerivatives: true });
    const normalized = normalizeLesson(raw, input, index);
    const weeks = currentWeeks.map((week, weekIndex) => weekIndex === index ? normalized : week);
    if (partial) {
      const partialGuides = Array.isArray(request.body?.teacherGuides) ? [...request.body.teacherGuides] : [];
      partialGuides[index] = raw.teacherGuide || partialGuides[index] || {};
      const teacherGuides = buildTeacherGuides(input, weeks, partialGuides).slice(0, weeks.length);
      response.setHeader("Cache-Control", "no-store");
      return response.status(200).json({ ok: true, partial: true, provider: "ai-regenerate", aiProvider: getAIProvider(), model: getAIModel(), weekIndex: index, instruction, input, week: normalized, weeks, teacherGuides });
    }
    const workload = calculateCourseWorkload(input, input.formulaConfig, weeks);
    const enrichedWeeks = attachWorkloadToLessons(weeks, workload);
    const providedGuides = Array.isArray(request.body?.teacherGuides) ? [...request.body.teacherGuides] : [];
    providedGuides[index] = raw.teacherGuide || providedGuides[index] || {};
    const teacherGuides = buildTeacherGuides(input, enrichedWeeks, providedGuides);
    const generalPlan = buildGeneralPlan(input, workload, enrichedWeeks, teacherGuides);
    const validation = validateCourse(input, enrichedWeeks, workload, teacherGuides);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ ok: true, provider: "ai-regenerate", aiProvider: getAIProvider(), model: getAIModel(), weekIndex: index, instruction, input, workload, generalPlan: { ...generalPlan, validation }, validation, week: enrichedWeeks[index], weeks: enrichedWeeks, teacherGuides });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_REQUEST_TOO_LARGE" ? 413 : error.code === "AI_INVALID_JSON" ? 502 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível refazer a semana.", code: error.code || "REGENERATION_ERROR", retryable: Boolean(error.retryable), retryAfterMs: error.retryAfterMs || 0 });
  }
}
