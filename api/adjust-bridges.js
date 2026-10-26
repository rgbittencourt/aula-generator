import { accessRequired, hasValidAccess } from "../src/access.js";
import { normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { adjustWeekEdgesWithAI } from "../src/ai.js";
import { applyEdgePatch, summarizeWeekBridge } from "../src/bridge.js";
import { getAIModel, getAIProvider } from "../src/ai-client.js";

// Ajuste de pontas: reescreve só a abertura e/ou o fechamento da semana pedida,
// com base no resumo de ponte da semana vizinha. O corpo da aula não é tocado.
export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const index = Math.max(0, Math.min(input.weeks - 1, Number.parseInt(request.body?.weekIndex, 10) || 0));
    const week = request.body?.week;
    if (!week || typeof week !== "object") return response.status(400).json({ ok: false, error: "Envie a semana a ser ajustada.", code: "ADJUST_WEEK_MISSING" });
    const opening = request.body?.previousBridge ? { previousBridge: request.body.previousBridge } : null;
    const closing = request.body?.nextBridge ? { nextBridge: request.body.nextBridge } : null;
    if (!opening && !closing) return response.status(400).json({ ok: false, error: "Informe a semana vizinha (anterior ou seguinte) para ajustar a ponte.", code: "ADJUST_TARGET_MISSING" });
    const patch = await adjustWeekEdgesWithAI(input, index, week, { opening, closing });
    if (!patch.welcome && !patch.nextWeekConnection) return response.status(502).json({ ok: false, error: "A IA não devolveu um novo trecho de ponte. A semana foi mantida; tente novamente.", code: "ADJUST_EMPTY", retryable: true });
    const patched = normalizeLesson(applyEdgePatch(week, patch), input, index);
    return response.status(200).json({ ok: true, aiProvider: getAIProvider(), model: getAIModel(), weekIndex: index, patch, week: patched, summary: summarizeWeekBridge(patched, index) });
  } catch (error) {
    console.error("adjust-bridges failed", error);
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_PROVIDER_ERROR" ? 502 : error.code === "AI_REQUEST_TOO_LARGE" ? 413 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível ajustar as pontas.", code: error.code || "ADJUST_ERROR", retryable: Boolean(error.retryable), retryAfterMs: error.retryAfterMs || 0 });
  }
}
