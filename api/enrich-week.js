import { accessRequired, hasValidAccess } from "../src/access.js";
import { normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { enrichLessonsWithResources } from "../src/research.js";
import { buildTeacherGuides } from "../src/teacher-guide.js";

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const index = Math.max(0, Math.min(input.weeks - 1, Number.parseInt(request.body?.weekIndex, 10) || 0));
    const normalized = normalizeLesson(request.body?.week || {}, input, index);
    const researched = process.env.AULA_RESOURCE_RESEARCH === "false"
      ? normalized
      : (await enrichLessonsWithResources(input, [normalized]))[0];
    const teacherGuide = buildTeacherGuides(input, [researched], [request.body?.teacherGuide || {}])[0];
    return response.status(200).json({ ok: true, provider: "resource-enrichment", weekIndex: index, week: researched, teacherGuide, generation: researched.generationMeta || { phase: "complete", repairPending: false } });
  } catch (error) {
    console.error("enrich-week failed", error);
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_PROVIDER_ERROR" ? 502 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível pesquisar os recursos desta semana.", code: error.code || "RESOURCE_ENRICHMENT_ERROR", retryable: Boolean(error.retryable) });
  }
}
