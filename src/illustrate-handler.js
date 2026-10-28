import { accessRequired, hasValidAccess } from "./access.js";
import { normalizeCourseInput, normalizeLesson } from "./aula-schema.js";
import { illustrateWeek } from "./illustrate.js";
import { getAIModel, getAIProvider } from "./ai-client.js";

// Etapa de ilustração da semana (diagramas SVG criados por IA). Não é uma função própria
// (limite de 12 no plano Hobby): api/regenerate-week.js a despacha com action "illustrate".
export default async function illustrateHandler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const index = Math.max(0, Math.min(input.weeks - 1, Number.parseInt(request.body?.weekIndex, 10) || 0));
    const week = normalizeLesson(request.body?.week || {}, input, index);
    const result = await illustrateWeek(input, week);
    return response.status(200).json({ ok: true, provider: "ai-illustrate", aiProvider: getAIProvider(), model: getAIModel(), weekIndex: index, week: result.week, drawn: result.drawn, failed: result.failed, total: result.total });
  } catch (error) {
    console.error("illustrate failed", error);
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_PROVIDER_ERROR" ? 502 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível criar as figuras desta semana.", code: error.code || "ILLUSTRATE_ERROR", retryable: Boolean(error.retryable) });
  }
}
