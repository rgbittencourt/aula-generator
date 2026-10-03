import { normalizeCourseInput } from "../src/aula-schema.js";
import { regenerateMediationMessageWithAI } from "../src/ai.js";
import { accessRequired, hasValidAccess } from "../src/access.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const message = await regenerateMediationMessageWithAI({
      input,
      weekNumber: Number(request.body?.weekNumber || 1),
      theme: request.body?.theme,
      channel: request.body?.channel,
      timing: request.body?.timing,
      purpose: request.body?.purpose,
      studentNeed: request.body?.studentNeed,
      teacherIntent: request.body?.teacherIntent,
      currentText: request.body?.currentText,
      tone: request.body?.tone,
      instructions: request.body?.instructions,
      relatedContext: request.body?.relatedContext
    });
    if (!message.text) return response.status(502).json({ ok: false, error: "A IA não retornou uma mensagem utilizável." });
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({ ok: true, message });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_PROVIDER_ERROR" ? 502 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível refazer a mensagem." });
  }
}
