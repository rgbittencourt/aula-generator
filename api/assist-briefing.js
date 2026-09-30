import { accessRequired, hasValidAccess } from "../src/access.js";
import { normalizeCourseInput } from "../src/aula-schema.js";
import { assistBriefing } from "../src/ai.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const missingFields = Array.isArray(request.body?.missingFields) ? request.body.missingFields.slice(0, 20) : [];
    const briefing = await assistBriefing(input, missingFields);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ ok: true, briefing, filledFields: missingFields });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível completar o briefing." });
  }
}
