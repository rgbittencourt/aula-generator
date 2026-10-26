import { accessRequired, hasValidAccess } from "../src/access.js";
import { compareBridges, sanitizeBridges, summarizeWeekBridge } from "../src/bridge.js";

// Resumo de ponte de uma semana aprovada. Não chama IA: é derivado do
// lessonPlan. Quando recebe resumos anteriores, devolve também o nível de
// impacto da mudança sobre as semanas vizinhas.
export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const index = Math.max(0, Number.parseInt(request.body?.weekIndex, 10) || 0);
    const week = request.body?.week;
    if (!week || typeof week !== "object") return response.status(400).json({ ok: false, error: "Envie a semana a ser aprovada.", code: "BRIDGE_WEEK_MISSING" });
    const summary = summarizeWeekBridge(week, index);
    // previousSummary: a última versão aprovada desta mesma semana (detecta mudança de abertura).
    // linkedSummary: o resumo desta semana usado para construir a semana seguinte (detecta
    // quando a abertura da seguinte deixou de encaixar).
    const [previous] = sanitizeBridges(request.body?.previousSummary ? [request.body.previousSummary] : []);
    const [linked] = sanitizeBridges(request.body?.linkedSummary ? [request.body.linkedSummary] : []);
    return response.status(200).json({
      ok: true,
      weekIndex: index,
      summary,
      comparison: previous ? compareBridges(previous, summary) : null,
      linkComparison: linked ? compareBridges(linked, summary) : null
    });
  } catch (error) {
    console.error("week-bridge failed", error);
    return response.status(400).json({ ok: false, error: error.message || "Não foi possível resumir a ponte desta semana.", code: "BRIDGE_ERROR" });
  }
}
