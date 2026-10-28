import { accessRequired, hasValidAccess } from "./access.js";
import { normalizeCourseInput } from "./aula-schema.js";
import { completeWeekDerivatives } from "./claude-writer.js";
import { buildTeacherGuides } from "./teacher-guide.js";
import { getAIModel, getAIProvider } from "./ai-client.js";

// Segunda etapa da geração em prosa: avaliação, atividades e Material de Mediação.
// Não é uma função serverless própria (limite de 12 no plano Hobby da Vercel):
// api/regenerate-week.js a despacha quando recebe action "derivatives".
export default async function derivativesHandler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const index = Math.max(0, Math.min(input.weeks - 1, Number.parseInt(request.body?.weekIndex, 10) || 0));
    const result = await completeWeekDerivatives(input, index, request.body?.week, request.body?.teacherGuide, { parts: Array.isArray(request.body?.parts) ? request.body.parts : null });
    const teacherGuide = buildTeacherGuides(input, [result.week], [result.teacherGuide])[0];
    return response.status(200).json({ ok: true, provider: "ai-derivatives", aiProvider: getAIProvider(), model: getAIModel(), weekIndex: index, week: result.week, teacherGuide, generation: result.generation });
  } catch (error) {
    console.error("derivatives failed", error);
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_PROVIDER_ERROR" ? 502 : error.code === "AI_REQUEST_TOO_LARGE" ? 413 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível gerar a avaliação e o Material de Mediação.", code: error.code || "DERIVATIVES_ERROR", retryable: Boolean(error.retryable), retryAfterMs: error.retryAfterMs || 0 });
  }
}
