import { accessRequired, hasValidAccess } from "../src/access.js";
import { normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { generateOneWeek } from "../src/ai.js";
import { buildTeacherGuides } from "../src/teacher-guide.js";
import { buildCourseProgression } from "../src/curriculum.js";
import { getAIModel, getAIProvider } from "../src/ai-client.js";
import { sanitizeBridges } from "../src/bridge.js";

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || request.body || {});
    const index = Math.max(0, Math.min(input.weeks - 1, Number.parseInt(request.body?.weekIndex, 10) || 0));
    const raw = await generateOneWeek(input, index, {
      progression: buildCourseProgression(input),
      previousWeeks: request.body?.previousWeeks || [],
      // Resumos de ponte das semanas já aprovadas pelo professor (fluxo semana a semana).
      bridges: sanitizeBridges(request.body?.bridges),
      // Esta rota é chamada uma semana por vez. A primeira versão precisa
      // retornar e ser salva antes de qualquer refação potencialmente longa.
      singlePass: true,
      deferRepair: true,
      // Modo de prosa: a avaliação e a mediação saem em /api/derivatives, logo depois.
      deferDerivatives: true
    });
    const normalized = normalizeLesson(raw, input, index);
    const teacherGuide = buildTeacherGuides(input, [normalized], [raw.teacherGuide || {}])[0];
    return response.status(200).json({
      ok: true,
      provider: "ai-week",
      aiProvider: getAIProvider(),
      model: getAIModel(),
      weekIndex: index,
      completed: index + 1,
      total: input.weeks,
      week: normalized,
      teacherGuide,
      generation: raw.generationMeta || normalized.generationMeta || { phase: "complete", repairPending: false },
      resourcesDeferred: process.env.AULA_RESOURCE_RESEARCH !== "false"
    });
  } catch (error) {
    console.error("generate-week failed", error);
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_PROVIDER_ERROR" ? 502 : error.code === "AI_REQUEST_TOO_LARGE" ? 413 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível gerar esta semana.", code: error.code || "GENERATION_ERROR", retryable: Boolean(error.retryable) });
  }
}
