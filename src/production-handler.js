import { accessRequired, hasValidAccess } from "./access.js";
import { normalizeCourseInput } from "./aula-schema.js";
import { produceCourse, produceWeek } from "./production.js";
import { getAIModel, getAIProvider } from "./ai-client.js";

// Roteiros de vídeo, slides e narração. Não é uma função própria (limite de 12 no plano
// Hobby): api/regenerate-week.js a despacha com action "production".
//   scope "week"   -> { weekIndex, week, previousTheme, nextTheme, setting }
//   scope "course" -> { weeks }
export default async function productionHandler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const meta = { ok: true, provider: "ai-production", aiProvider: getAIProvider(), model: getAIModel() };
    if (request.body?.scope === "course") {
      const weeks = Array.isArray(request.body?.weeks) ? request.body.weeks : [];
      if (weeks.length < input.weeks) return response.status(400).json({ ok: false, code: "PRODUCTION_COURSE_INCOMPLETE", error: `Os vídeos da UC só podem ser gerados depois que as ${input.weeks} semanas estiverem escritas e liberadas (há ${weeks.length}).` });
      const production = await produceCourse(input, weeks);
      return response.status(200).json({ ...meta, scope: "course", production });
    }
    const index = Math.max(0, Math.min(input.weeks - 1, Number.parseInt(request.body?.weekIndex, 10) || 0));
    const ctx = {
      previousTheme: String(request.body?.previousTheme || "").slice(0, 300),
      nextTheme: String(request.body?.nextTheme || "").slice(0, 300),
      setting: String(request.body?.setting || "").slice(0, 300)
    };
    const production = await produceWeek(input, index, request.body?.week, ctx);
    return response.status(200).json({ ...meta, scope: "week", weekIndex: index, production });
  } catch (error) {
    console.error("production failed", error);
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_PROVIDER_ERROR" ? 502 : error.code === "AI_REQUEST_TOO_LARGE" ? 413 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível gerar os roteiros e a planilha de produção.", code: error.code || "PRODUCTION_ERROR", retryable: Boolean(error.retryable), retryAfterMs: error.retryAfterMs || 0 });
  }
}
