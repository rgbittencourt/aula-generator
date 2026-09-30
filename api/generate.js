import { accessRequired, hasValidAccess } from "../src/access.js";
import { calculateCourseWorkload } from "../src/calculations.js";
import { buildFallbackLesson, normalizeCourseInput, normalizeWeeklyOutput, slugify } from "../src/aula-schema.js";
import { generateWithAI } from "../src/ai.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || request.body || {});
    const workload = calculateCourseWorkload(input);
    const useFallback = Boolean(request.body?.fallback);
    const weeks = useFallback ? Array.from({ length: input.weeks }, (_, index) => buildFallbackLesson(input, index)) : await generateWithAI(input);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ ok: true, provider: useFallback ? "fallback" : "ai", model: useFallback ? null : (process.env.OPENAI_MODEL || "gpt-4o-mini"), input, workload, weeks: normalizeWeeklyOutput({ weeks }, input), filePrefix: slugify(input.title, "curso") });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível gerar o curso." });
  }
}
