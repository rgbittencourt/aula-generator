import { accessRequired, hasValidAccess } from "../src/access.js";
import { attachWorkloadToLessons, buildGeneralPlan, calculateCourseWorkload } from "../src/calculations.js";
import { buildFallbackLesson, normalizeCourseInput, normalizeWeeklyOutput, slugify } from "../src/aula-schema.js";
import { generateWithAI } from "../src/ai.js";
import { enrichLessonsWithResources } from "../src/research.js";
import { buildTeacherGuides } from "../src/teacher-guide.js";
import { validateCourse } from "../src/validation.js";
import { getAIModel, getAIProvider } from "../src/ai-client.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || request.body || {});
    const useFallback = Boolean(request.body?.fallback);
    const generated = useFallback ? { weeks: Array.from({ length: input.weeks }, (_, index) => buildFallbackLesson(input, index)), teacherGuides: [] } : await generateWithAI(input);
    const normalizedWeeks = normalizeWeeklyOutput({ weeks: generated.weeks }, input);
    const researchedWeeks = useFallback ? normalizedWeeks : await enrichLessonsWithResources(input, normalizedWeeks);
    const workload = calculateCourseWorkload(input, input.formulaConfig, researchedWeeks);
    const enrichedWeeks = attachWorkloadToLessons(researchedWeeks, workload);
    const teacherGuides = buildTeacherGuides(input, enrichedWeeks, generated.teacherGuides);
    const generalPlan = buildGeneralPlan(input, workload, enrichedWeeks, teacherGuides);
    const validation = validateCourse(input, enrichedWeeks, workload, teacherGuides);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ ok: true, provider: useFallback ? "fallback" : "ai", aiProvider: useFallback ? null : getAIProvider(), model: useFallback ? null : getAIModel(), input, workload, generalPlan: { ...generalPlan, validation }, validation, weeks: enrichedWeeks, teacherGuides, filePrefix: slugify(input.title, "curso") });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_REQUEST_TOO_LARGE" ? 413 : error.code === "AI_PROVIDER_ERROR" ? 502 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível gerar o curso.", code: error.code || "GENERATION_ERROR", retryable: Boolean(error.retryable), retryAfterMs: error.retryAfterMs || 0 });
  }
}
