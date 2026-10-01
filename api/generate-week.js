import { accessRequired, hasValidAccess } from "../src/access.js";
import { normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { generateOneWeek } from "../src/ai.js";
import { enrichLessonsWithResources } from "../src/research.js";
import { buildTeacherGuides } from "../src/teacher-guide.js";
import { buildCourseProgression } from "../src/curriculum.js";

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || request.body || {});
    const index = Math.max(0, Math.min(input.weeks - 1, Number.parseInt(request.body?.weekIndex, 10) || 0));
    const raw = await generateOneWeek(input, index, { progression: buildCourseProgression(input), previousWeeks: request.body?.previousWeeks || [] });
    const normalized = normalizeLesson(raw, input, index);
    const researched = process.env.AULA_RESOURCE_RESEARCH === "false"
      ? normalized
      : (await enrichLessonsWithResources(input, [normalized]))[0];
    const teacherGuide = buildTeacherGuides(input, [researched], [raw.teacherGuide || {}])[0];
    return response.status(200).json({
      ok: true,
      provider: "ai-week",
      model: process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      weekIndex: index,
      completed: index + 1,
      total: input.weeks,
      week: researched,
      teacherGuide
    });
  } catch (error) {
    console.error("generate-week failed", error);
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_PROVIDER_ERROR" ? 502 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível gerar esta semana.", code: error.code || "GENERATION_ERROR", retryable: Boolean(error.retryable) });
  }
}
