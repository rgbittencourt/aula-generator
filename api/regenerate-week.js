import { accessRequired, hasValidAccess } from "../src/access.js";
import { attachWorkloadToLessons, buildGeneralPlan, calculateCourseWorkload } from "../src/calculations.js";
import { normalizeCourseInput, normalizeLesson, normalizeWeeklyOutput } from "../src/aula-schema.js";
import { regenerateWeekWithAI } from "../src/ai.js";
import { applyCompositionInstruction } from "../src/composition.js";
import { buildTeacherGuides } from "../src/teacher-guide.js";
import { validateCourse } from "../src/validation.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const baseInput = normalizeCourseInput(request.body?.input || {});
    const index = Math.max(0, Math.min(baseInput.weeks - 1, Number.parseInt(request.body?.weekIndex, 10) || 0));
    const instruction = String(request.body?.instruction || "").trim().slice(0, 4000);
    if (!instruction) return response.status(400).json({ ok: false, error: "Descreva o que deve mudar nesta semana." });
    const input = applyCompositionInstruction(baseInput, index, instruction);
    const currentWeeks = normalizeWeeklyOutput({ weeks: Array.isArray(request.body?.weeks) ? request.body.weeks : [] }, input);
    const raw = await regenerateWeekWithAI(input, index, currentWeeks[index], instruction);
    const normalized = normalizeLesson(raw, input, index);
    const weeks = currentWeeks.map((week, weekIndex) => weekIndex === index ? normalized : week);
    const workload = calculateCourseWorkload(input, input.formulaConfig, weeks);
    const enrichedWeeks = attachWorkloadToLessons(weeks, workload);
    const providedGuides = Array.isArray(request.body?.teacherGuides) ? [...request.body.teacherGuides] : [];
    providedGuides[index] = raw.teacherGuide || providedGuides[index] || {};
    const teacherGuides = buildTeacherGuides(input, enrichedWeeks, providedGuides);
    const generalPlan = buildGeneralPlan(input, workload, enrichedWeeks, teacherGuides);
    const validation = validateCourse(input, enrichedWeeks, workload, teacherGuides);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ ok: true, provider: "ai-regenerate", model: process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini", weekIndex: index, instruction, input, workload, generalPlan: { ...generalPlan, validation }, validation, week: enrichedWeeks[index], weeks: enrichedWeeks, teacherGuides });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_INVALID_JSON" ? 502 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível refazer a semana." });
  }
}
