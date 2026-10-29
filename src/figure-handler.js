import { accessRequired, hasValidAccess } from "./access.js";
import { drawFigureFromPrompt } from "./illustrate.js";
import { getAIModel, getAIProvider } from "./ai-client.js";

// Figura avulsa para o ClassAtelier (editor publicado em outro endereço, por isso CORS).
// Não é uma função própria (limite de 12 no plano Hobby): api/regenerate-week.js a despacha
// com action "figure" e responde ao OPTIONS (pré-verificação do navegador).

const DEFAULT_ORIGINS = ["https://rgbittencourt.github.io"];

export function allowedOrigins(env = process.env) {
  const extra = String(env.AULA_CORS_ORIGINS || "").split(",").map((item) => item.trim().replace(/\/$/, "")).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

export function originAllowed(origin, env = process.env) {
  if (!origin) return false;
  if (allowedOrigins(env).includes(origin)) return true;
  // Para testar o ClassAtelier no próprio computador.
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function cors(request, response) {
  const origin = request.headers?.origin;
  if (origin && originAllowed(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, x-aula-access-code");
    response.setHeader("Access-Control-Max-Age", "600");
    return true;
  }
  return false;
}

export default async function figureHandler(request, response, { draw = drawFigureFromPrompt } = {}) {
  response.setHeader("Cache-Control", "no-store");
  const known = cors(request, response);
  if (request.method === "OPTIONS") return response.status(known ? 204 : 403).end();
  if (request.headers?.origin && !known) return response.status(403).json({ ok: false, error: "Este endereço não tem permissão para pedir figuras ao ClassAuthor.", code: "FIGURE_ORIGIN" });
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Código de acesso do ClassAuthor ausente ou incorreto.", code: "FIGURE_ACCESS" });
  try {
    const body = request.body || {};
    const figure = await draw({ prompt: body.prompt, context: body.context, title: body.title });
    return response.status(200).json({ ok: true, aiProvider: getAIProvider(), model: getAIModel(), ...figure });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_PROVIDER_ERROR" ? 502 : error.code === "FIGURE_INVALID" ? 502 : 400;
    return response.status(status).json({ ok: false, error: error.message || "Não foi possível criar a figura.", code: error.code || "FIGURE_ERROR", retryable: Boolean(error.retryable) });
  }
}
