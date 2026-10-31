// Unidade de organização do curso: "semana" (padrão, como sempre foi) ou "aula".
// A estrutura dos dados não muda (cada unidade continua sendo um item da lista, com weekNumber);
// só os NOMES mudam. Com "aula", tudo o que chega ao professor e ao estudante diz "aula":
// pedidos à IA, respostas da API, PDF, DOCX e arquivos do pacote.

import { AsyncLocalStorage } from "node:async_hooks";
import { localizeUnitText } from "../public/unit-text.js";

export { localizeUnitText };

const store = new AsyncLocalStorage();

export function normalizeUnit(value) { return value === "aula" ? "aula" : "semana"; }
export function currentUnit() { return store.getStore()?.unit || "semana"; }
export const localizeUnit = (value) => localizeUnitText(value, currentUnit());

// Troca em todos os textos de um objeto (não toca em chaves, URLs nem dados binários).
export function deepLocalize(value, unit = currentUnit(), depth = 0) {
  if (unit !== "aula" || depth > 40) return value;
  if (typeof value === "string") return /^(?:data:|https?:\/\/|blob:)/i.test(value) || value.length > 400000 ? value : localizeUnitText(value, unit);
  if (Array.isArray(value)) return value.map((item) => deepLocalize(item, unit, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = /^(src|href|url|link|svg|image|dataUri)$/i.test(key) ? item : deepLocalize(item, unit, depth + 1);
    return out;
  }
  return value;
}

// Envolve um handler da API: com unidade "aula", o pedido é traduzido na entrada, o contexto fica
// disponível para os geradores (IA, PDF, DOCX, ZIP) e a resposta JSON é traduzida na saída.
export function withUnit(handler) {
  return async function unitHandler(request, response) {
    const unit = normalizeUnit(request?.body?.input?.unit || request?.body?.unit);
    if (unit !== "aula") return store.run({ unit }, () => handler(request, response));
    if (request.body && typeof request.body === "object") request.body = deepLocalize(request.body, unit);
    const json = response.json?.bind(response);
    if (json) response.json = (payload) => json(deepLocalize(payload, unit));
    const setHeader = response.setHeader?.bind(response);
    if (setHeader) response.setHeader = (name, value) => setHeader(name, /^content-disposition$/i.test(name) ? localizeUnitText(String(value), unit) : value);
    return store.run({ unit }, () => handler(request, response));
  };
}
