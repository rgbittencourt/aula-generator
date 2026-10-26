import { accessRequired, hasValidAccess } from "./access.js";
import { normalizeCourseInput, normalizeLesson } from "./aula-schema.js";
import { adjustWeekEdgesWithAI } from "./ai.js";
import { applyEdgePatch, compareBridges, sanitizeBridges, summarizeWeekBridge } from "./bridge.js";
import { getAIModel, getAIProvider } from "./ai-client.js";

// Manipulador das duas ações de ponte entre semanas. Não é uma função serverless
// própria: o plano Hobby da Vercel aceita no máximo 12 por implantação, então
// api/regenerate-week.js o chama quando recebe action "summary" ou "adjust"
// (vercel.json encaminha /api/bridge para lá). O servidor local o monta em /api/bridge.
//
//   action "summary" (padrão): resumo de ponte de uma semana; não chama IA.
//     previousSummary: a última versão aprovada desta mesma semana (detecta
//       mudança de abertura).
//     linkedSummary: o resumo desta semana usado para construir a seguinte
//       (detecta quando a abertura da seguinte deixou de encaixar).
//   action "adjust": reescreve só a abertura e/ou o fechamento da semana pedida,
//     com base no resumo da vizinha. O corpo da aula não é tocado.
function summarize(request, response) {
  const index = Math.max(0, Number.parseInt(request.body?.weekIndex, 10) || 0);
  const week = request.body?.week;
  if (!week || typeof week !== "object") return response.status(400).json({ ok: false, error: "Envie a semana a ser aprovada.", code: "BRIDGE_WEEK_MISSING" });
  const summary = summarizeWeekBridge(week, index);
  const [previous] = sanitizeBridges(request.body?.previousSummary ? [request.body.previousSummary] : []);
  const [linked] = sanitizeBridges(request.body?.linkedSummary ? [request.body.linkedSummary] : []);
  return response.status(200).json({
    ok: true,
    weekIndex: index,
    summary,
    comparison: previous ? compareBridges(previous, summary) : null,
    linkComparison: linked ? compareBridges(linked, summary) : null
  });
}

async function adjust(request, response) {
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
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  const action = String(request.body?.action || "summary");
  try {
    if (action === "summary") return summarize(request, response);
    if (action === "adjust") return await adjust(request, response);
    return response.status(400).json({ ok: false, error: "Ação de ponte desconhecida.", code: "BRIDGE_ACTION_UNKNOWN" });
  } catch (error) {
    console.error(`bridge ${action} failed`, error);
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_PROVIDER_ERROR" ? 502 : error.code === "AI_REQUEST_TOO_LARGE" ? 413 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível processar a ponte entre semanas.", code: error.code || "BRIDGE_ERROR", retryable: Boolean(error.retryable), retryAfterMs: error.retryAfterMs || 0 });
  }
}
