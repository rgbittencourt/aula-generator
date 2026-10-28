import { accessRequired, hasValidAccess } from "./access.js";
import { normalizeCourseInput } from "./aula-schema.js";
import { editWeek } from "./week-edit.js";
import { getAIModel, getAIProvider } from "./ai-client.js";

// Alteração pontual (título ou trechos) de uma semana. Roda dentro de api/regenerate-week.js
// (action "edit"): não é uma função própria por causa do limite de 12 do plano Hobby.
export default async function weekEditHandler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const index = Math.max(0, Math.min(input.weeks - 1, Number.parseInt(request.body?.weekIndex, 10) || 0));
    const instruction = String(request.body?.instruction || "").trim().slice(0, 4000);
    if (!instruction) return response.status(400).json({ ok: false, error: "Descreva o que deve mudar nesta semana." });
    const scope = request.body?.scope === "title" ? "title" : "edit";
    const ctx = { previousTheme: String(request.body?.previousTheme || "").slice(0, 300), nextTheme: String(request.body?.nextTheme || "").slice(0, 300) };
    const result = await editWeek(input, index, request.body?.week, instruction, scope, ctx);
    return response.status(200).json({ ok: true, provider: "ai-edit", aiProvider: getAIProvider(), model: getAIModel(), weekIndex: index, scope, ...result });
  } catch (error) {
    console.error("edit failed", error);
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_PROVIDER_ERROR" ? 502 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível alterar a semana.", code: error.code || "EDIT_ERROR", retryable: Boolean(error.retryable), retryAfterMs: error.retryAfterMs || 0 });
  }
}
