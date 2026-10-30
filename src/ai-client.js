const normalizeProvider = (value) => {
  const provider = String(value || "openai").trim().toLowerCase();
  return provider === "anthropic" || provider === "claude" ? "anthropic" : "openai";
};

export function getAIProvider() {
  return normalizeProvider(process.env.AI_PROVIDER || process.env.AULA_AI_PROVIDER || "openai");
}

export function getAIModel() {
  return getAIProvider() === "anthropic"
    ? (process.env.ANTHROPIC_MODEL || process.env.AI_MODEL || "claude-sonnet-5-5")
    : (process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-4o-mini");
}

export function isAIConfigured() {
  return Boolean(getAIProvider() === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY);
}

// Diagnóstico sem segredos: qual variável falta e em que ambiente da Vercel o servidor está rodando.
export function aiConfigStatus() {
  const provider = getAIProvider();
  const keyName = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  return { provider, keyName, configured: Boolean(process.env[keyName]), missingKey: process.env[keyName] ? null : keyName, environment: process.env.VERCEL_ENV || (process.env.VERCEL ? "vercel" : "local") };
}

function providerNumberSetting(name, fallback) {
  const providerKey = getAIProvider() === "anthropic" ? `ANTHROPIC_${name}` : `OPENAI_${name}`;
  return Number(process.env[`AI_${name}`] || process.env[providerKey] || process.env[`OPENAI_${name}`] || fallback);
}

export function getAITokenSettings() {
  return {
    maxTokens: providerNumberSetting("MAX_TOKENS", 16000),
    assistMaxTokens: Math.min(8000, Math.max(3000, providerNumberSetting("ASSIST_MAX_TOKENS", 6000))),
    requestTokenBudget: providerNumberSetting("REQUEST_TOKEN_BUDGET", 28000),
    regenerationMaxTokens: Math.min(providerNumberSetting("REGEN_MAX_TOKENS", 10000), 12000),
    maxRetries: providerNumberSetting("MAX_RETRIES", 3)
  };
}

function providerBase() {
  const provider = getAIProvider();
  const configured = provider === "anthropic" ? process.env.ANTHROPIC_BASE_URL : process.env.OPENAI_BASE_URL;
  return (configured || (provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1")).replace(/\/$/u, "");
}

function providerKey() {
  return getAIProvider() === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY;
}

function endpointUrl() {
  const base = providerBase();
  if (getAIProvider() !== "anthropic") return `${base}/chat/completions`;
  return base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
}

function configuredMaxTokens(options = {}, retryingFormat = false) {
  const provider = getAIProvider();
  const providerDefault = provider === "anthropic" ? process.env.ANTHROPIC_MAX_TOKENS : process.env.OPENAI_MAX_TOKENS;
  const requested = retryingFormat ? (options.retryMaxTokens || options.maxTokens) : options.maxTokens;
  return Math.max(256, Number(requested || process.env.AI_MAX_TOKENS || providerDefault || getAITokenSettings().maxTokens || 16000));
}

function requestTokenBudget() {
  return getAITokenSettings().requestTokenBudget;
}

function estimateInputTokens(messages = []) {
  const characters = messages.reduce((total, message) => total + String(message?.content || "").length, 0);
  // JSON, português e instruções longas costumam ficar próximos de 3,5–4
  // caracteres por token. Usamos uma estimativa conservadora para reservar
  // espaço também para pequenas variações do tokenizador.
  return Math.ceil(characters / 3.5);
}

function boundedOutputTokens(messages, requested) {
  const budget = requestTokenBudget();
  const requestedTokens = Math.max(256, Number(requested) || 16000);
  if (!Number.isFinite(budget) || budget <= 0) return requestedTokens;
  const safetyMargin = 512;
  const available = budget - estimateInputTokens(messages) - safetyMargin;
  return Math.max(256, Math.min(requestedTokens, available));
}

function parseDurationMs(value) {
  const source = String(value ?? "").trim().toLowerCase();
  if (!source) return 0;
  if (/^\d+(?:\.\d+)?$/u.test(source)) return Math.round(Number(source) * 1000);
  let total = 0;
  const pattern = /(\d+(?:\.\d+)?)(ms|s|m|h)/gu;
  let match;
  while ((match = pattern.exec(source))) {
    const amount = Number(match[1]);
    const unit = match[2];
    total += unit === "h" ? amount * 3600000 : unit === "m" ? amount * 60000 : unit === "s" ? amount * 1000 : amount;
  }
  return Math.round(total);
}

function retryDelay(response, attempt) {
  const retryAfter = parseDurationMs(response.headers.get("retry-after"));
  const reset = parseDurationMs(response.headers.get("x-ratelimit-reset-tokens") || response.headers.get("x-ratelimit-reset-project-tokens"));
  if (retryAfter > 0) return retryAfter;
  if (reset > 0) return reset;
  return Math.min(30000, 1000 * (2 ** attempt) + Math.round(Math.random() * 500));
}

function providerMessages(messages = []) {
  return messages.map((message) => ({
    role: message?.role === "assistant" ? "assistant" : "user",
    content: String(message?.content || "")
  }));
}

// Raciocínio ("thinking") dos modelos Claude recentes. Nos modelos 5.x ele vem LIGADO por padrão e
// conta dentro de max_tokens: numa tarefa mais exigente, o modelo pode gastar todo o limite pensando
// e devolver resposta sem texto (stop_reason "max_tokens"). Como cada chamada do ClassAuthor já é uma
// tarefa bem especificada, o padrão aqui é desligar o raciocínio prévio onde a API permite.
// ANTHROPIC_THINKING=default|adaptive|disabled|between_tools e ANTHROPIC_EFFORT=low|medium|high mudam isso.
let thinkingUnsupported = false;
export function anthropicThinkingConfig(model = getAIModel()) {
  const configured = String(process.env.ANTHROPIC_THINKING || "").trim().toLowerCase();
  const effortEnv = String(process.env.ANTHROPIC_EFFORT || "").trim().toLowerCase();
  const effort = ["low", "medium", "high", "xhigh", "max"].includes(effortEnv) ? effortEnv : "";
  if (configured === "default" || thinkingUnsupported) return { thinking: null, effort };
  if (["adaptive", "disabled", "between_tools"].includes(configured)) return { thinking: { type: configured }, effort };
  const id = String(model || "").toLowerCase();
  // Sonnet 5.5: "disabled" é recusado; "between_tools" desliga o raciocínio antes da resposta.
  if (/sonnet-5-5/.test(id)) return { thinking: { type: "between_tools" }, effort };
  // Sonnet 5, Haiku 5.5 e Opus 5 aceitam "disabled" (com esforço até "high").
  if (/sonnet-5(?!-\d)|haiku-5-5|opus-5(?!-\d)/.test(id)) return { thinking: { type: "disabled" }, effort: effort && ["xhigh", "max"].includes(effort) ? "high" : effort };
  // Opus 5.5, Fable e Mythos: raciocínio sempre ligado; reduz o esforço para sobrar espaço ao texto.
  if (/opus-5-5|fable|mythos/.test(id)) return { thinking: null, effort: effort || "low" };
  return { thinking: null, effort };
}

function buildRequest(messages, options, maxTokens) {
  const provider = getAIProvider();
  if (provider !== "anthropic") {
    return {
      url: endpointUrl(),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${providerKey()}` },
      body: {
        model: options.model || getAIModel(),
        temperature: options.temperature ?? 0.45,
        max_tokens: maxTokens,
        ...(options.plainText ? {} : { response_format: { type: "json_object" } }),
        messages
      }
    };
  }
  const system = messages.filter((message) => message?.role === "system").map((message) => String(message.content || "").trim()).filter(Boolean).join("\n\n");
  const body = {
    model: options.model || getAIModel(),
    max_tokens: maxTokens,
    messages: providerMessages(messages.filter((message) => message?.role !== "system"))
  };
  // Modelos Claude recentes recusam `temperature` ("deprecated for this model", HTTP 400).
  // Por isso ele não é enviado à Anthropic, a menos que ANTHROPIC_SEND_TEMPERATURE=true.
  if (process.env.ANTHROPIC_SEND_TEMPERATURE === "true") body.temperature = options.temperature ?? 0.45;
  // O guia de voz e os exemplos são idênticos em todas as semanas: o cache de
  // prompt da Anthropic evita reprocessá-los (e cobra menos por eles) a cada chamada.
  if (system) body.system = options.cacheSystem ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] : system;
  // Ative somente para modelos Anthropic que tenham structured outputs habilitado
  // na conta. O padrão continua baseado em JSON para manter compatibilidade.
  if (process.env.ANTHROPIC_STRUCTURED_OUTPUTS === "true") {
    body.output_config = { format: { type: "json_schema", schema: { type: "object", additionalProperties: true } } };
  }
  const reasoning = anthropicThinkingConfig(body.model);
  if (reasoning.thinking) body.thinking = reasoning.thinking;
  if (reasoning.effort) body.output_config = { ...(body.output_config || {}), effort: reasoning.effort };
  return {
    url: endpointUrl(),
    headers: { "Content-Type": "application/json", "x-api-key": providerKey(), "anthropic-version": process.env.ANTHROPIC_VERSION || "2023-06-01" },
    body
  };
}

function responseText(payload) {
  if (getAIProvider() !== "anthropic") return payload?.choices?.[0]?.message?.content;
  return Array.isArray(payload?.content)
    ? payload.content.filter((block) => block?.type === "text").map((block) => block.text).join("\n")
    : "";
}

// Motivo de parada quando a resposta vem sem texto (ajuda a diagnosticar: limite de saída, recusa, filtro).
function emptyReason(payload) {
  const stop = getAIProvider() === "anthropic" ? payload?.stop_reason : payload?.choices?.[0]?.finish_reason;
  const refusal = getAIProvider() === "anthropic" ? "" : payload?.choices?.[0]?.message?.refusal;
  const labels = { max_tokens: "limite de saída atingido", length: "limite de saída atingido", refusal: "o modelo recusou a resposta", content_filter: "filtro de conteúdo do provedor", end_turn: "o modelo encerrou sem texto", stop: "o modelo encerrou sem texto" };
  const blocks = Array.isArray(payload?.content) ? [...new Set(payload.content.map((block) => block?.type).filter(Boolean))] : [];
  return [stop ? `${labels[stop] || stop} [${stop}]` : "", blocks.length && !blocks.includes("text") ? `blocos sem texto: ${blocks.join(", ")}` : "", refusal ? `recusa: ${String(refusal).slice(0, 160)}` : ""].filter(Boolean).join("; ");
}

function responseFinishedByLength(payload) {
  return getAIProvider() === "anthropic" ? payload?.stop_reason === "max_tokens" : payload?.choices?.[0]?.finish_reason === "length";
}

function providerErrorMessage(payload, response) {
  if (getAIProvider() === "anthropic") return payload?.error?.message || payload?.message || `HTTP ${response.status}`;
  return payload?.error?.message || (typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`);
}

function classifyProviderError(message, status) {
  const detail = String(message || "");
  const tpmLimit = /tokens per min|tokens per minute|\btpm\b|input tokens per minute|output tokens per minute|itpm|otpm/i.test(detail);
  const contextTooLarge = /context length|maximum context|prompt is too long|request too large|too many tokens/i.test(detail) && !tpmLimit;
  const actionRequired = /invalid[_ ]?api[_ ]?key|authentication|unauthorized|insufficient[_ ]?quota|quota|billing|spend limit|usage limit|credit balance|payment required|enforced_spend_limit_reached/i.test(detail);
  const transient = /temporar|timeout|overload|slow_down|try again|capacity/i.test(detail);
  const retryable = !actionRequired && !contextTooLarge && (status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || transient);
  const rateLimit = !actionRequired && (status === 429 || /rate limit|rate_limit_error/i.test(detail));
  return {
    code: tpmLimit || rateLimit ? "AI_TPM_LIMIT" : contextTooLarge ? "AI_REQUEST_TOO_LARGE" : "AI_PROVIDER_ERROR",
    retryable,
    tpmLimit,
    contextTooLarge
  };
}

function createProviderError(message, response, retryAfterMs, classification) {
  const waitTooLong = retryAfterMs > 30000;
  const error = new Error(`A API de IA (${getAIProvider()}) recusou a solicitação: ${message}${waitTooLong ? ` Aguarde aproximadamente ${Math.ceil(retryAfterMs / 60000)} minuto(s) antes de tentar novamente.` : ""}`);
  error.code = classification.code;
  error.retryable = Boolean(classification.retryable && !waitTooLong);
  error.provider = getAIProvider();
  error.status = response.status;
  error.providerMessage = message;
  error.retryAfterMs = retryAfterMs;
  return error;
}

export function parseJson(content) {
  if (content && typeof content === "object") return content;
  const candidate = extractJsonValue(content);
  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    try {
      return JSON.parse(removeTrailingCommas(candidate));
    } catch {
      throw firstError;
    }
  }
}

function extractJsonValue(content) {
  const source = String(content || "").replace(/^\uFEFF/u, "").trim().replace(/^```(?:json)?/iu, "").replace(/```$/u, "").trim();
  const starts = [source.indexOf("{"), source.indexOf("[")].filter((index) => index >= 0);
  if (!starts.length) return source;
  const start = Math.min(...starts);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === "{" || char === "[") depth += 1;
    if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

function removeTrailingCommas(value) {
  let output = "";
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quoted) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; output += char; continue; }
    if (char === ",") {
      let next = index + 1;
      while (/\s/u.test(value[next] || "")) next += 1;
      if (value[next] === "}" || value[next] === "]") continue;
    }
    output += char;
  }
  return output;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function callJson(messages, options = {}) {
  if (!isAIConfigured()) {
    const error = new Error(`A chave da API ${getAIProvider() === "anthropic" ? "Anthropic" : "OpenAI"} não está configurada.`);
    error.code = "AI_KEY_MISSING";
    error.provider = getAIProvider();
    throw error;
  }
  const maxAttempts = Math.max(1, getAITokenSettings().maxRetries);
  let formatRetry = false;
  let raisedMaxTokens = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const retryingFormat = formatRetry;
    const requestMessages = formatRetry
      ? [...messages, { role: "user", content: options.formatRetryInstruction || "A resposta anterior veio em formato JSON inválido ou foi truncada. Gere novamente uma versão compacta e completa do mesmo objeto, sem markdown, comentários ou texto fora do JSON; use aspas duplas em todas as propriedades e não deixe vírgula antes de } ou ]." }]
      : messages;
    const requestedMaxTokens = configuredMaxTokens(options, retryingFormat);
    const maxTokens = Math.max(boundedOutputTokens(requestMessages, requestedMaxTokens), raisedMaxTokens);
    const request = buildRequest(requestMessages, options, maxTokens);
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body)
    });
    const payload = await response.json().catch(() => ({}));
    const providerError = providerErrorMessage(payload, response);
    if (!response.ok || providerError && !payload?.choices && !payload?.content) {
      // Configuração de raciocínio recusada por este modelo: volta ao padrão da API e tenta de novo.
      if (response.status === 400 && getAIProvider() === "anthropic" && !thinkingUnsupported && /thinking|effort|output_config/i.test(String(providerError))) {
        console.error("thinking config rejected; falling back to API default", { model: request.body?.model, error: String(providerError).slice(0, 300) });
        thinkingUnsupported = true;
        attempt -= 1;
        continue;
      }
      const classification = classifyProviderError(providerError, response.status);
      const retryAfterMs = retryDelay(response, attempt);
      if (classification.retryable && attempt < maxAttempts - 1 && retryAfterMs <= 30000) {
        await wait(retryAfterMs);
        continue;
      }
      throw createProviderError(providerError, response, retryAfterMs, classification);
    }
    const content = responseText(payload);
    if (!content) {
      const reason = emptyReason(payload);
      console.error("empty AI response", { label: options.label || "", maxTokens, reason, usage: payload?.usage || null, model: payload?.model || "" });
      const emptyError = new Error(`A API de IA retornou uma resposta vazia${reason ? ` (motivo informado pela API: ${reason})` : ""}.`);
      emptyError.code = "AI_EMPTY_RESPONSE";
      emptyError.retryable = true;
      emptyError.provider = getAIProvider();
      // Resposta vazia por limite de saída: o modelo gastou o espaço antes de escrever (por
      // exemplo, raciocinando). A próxima tentativa vai com o dobro de espaço, até 32 mil tokens.
      if (responseFinishedByLength(payload)) raisedMaxTokens = Math.min(32000, Math.max(maxTokens * 2, 8000));
      if (attempt < maxAttempts - 1) { await wait(250); continue; }
      throw emptyError;
    }
    if (responseFinishedByLength(payload)) {
      if (attempt < maxAttempts - 1) {
        formatRetry = true;
        await wait(250);
        continue;
      }
      // Diagnóstico: qual chamada estourou, com quantos tokens pedidos e quanto a API contou de saída.
      console.error("output truncated", { label: options.label || "", maxTokens, usage: payload?.usage || null, stop: payload?.stop_reason || payload?.choices?.[0]?.finish_reason || "" });
      const truncatedError = new Error("A resposta da IA atingiu o limite de saída antes de concluir a aula.");
      truncatedError.code = "AI_OUTPUT_TRUNCATED";
      truncatedError.retryable = true;
      truncatedError.provider = getAIProvider();
      throw truncatedError;
    }
    try {
      const parsed = parseJson(content);
      formatRetry = false;
      return parsed;
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        formatRetry = true;
        await wait(250);
        continue;
      }
      const parseError = new Error(`A IA retornou uma resposta em JSON inválido após ${maxAttempts} tentativa(s). Tente refazer a semana novamente; a aula atual foi preservada. Detalhe técnico: ${error.message}`);
      parseError.code = "AI_INVALID_JSON";
      parseError.retryable = true;
      parseError.provider = getAIProvider();
      throw parseError;
    }
  }
  throw new Error("A API de IA não respondeu após as tentativas configuradas.");
}


// Texto livre (Markdown) em vez de JSON. Usado pelo modo de escrita em prosa, em
// que o texto da aula é redigido sem a camada de um esquema JSON e só depois
// convertido por um analisador local. Mesmo tratamento de erros, tentativas e
// limites de tokens de callJson; devolve { text, truncated }.
export async function callText(messages, options = {}) {
  if (!isAIConfigured()) {
    const error = new Error(`A chave da API ${getAIProvider() === "anthropic" ? "Anthropic" : "OpenAI"} não está configurada.`);
    error.code = "AI_KEY_MISSING";
    error.provider = getAIProvider();
    throw error;
  }
  const maxAttempts = Math.max(1, getAITokenSettings().maxRetries);
  let raisedMaxTokens = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    // Na Anthropic a redação leva um guia longo (em cache) e não deve ter a saída cortada
    // pela "margem local" de tokens, pensada para o limite por minuto da OpenAI.
    const requested = configuredMaxTokens(options);
    const maxTokens = Math.max(options.ignoreRequestBudget && getAIProvider() === "anthropic" ? requested : boundedOutputTokens(messages, requested), raisedMaxTokens);
    const request = buildRequest(messages, { ...options, plainText: true }, maxTokens);
    const response = await fetch(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(request.body) });
    const payload = await response.json().catch(() => ({}));
    const providerError = providerErrorMessage(payload, response);
    if (!response.ok || providerError && !payload?.choices && !payload?.content) {
      // Configuração de raciocínio recusada por este modelo: volta ao padrão da API e tenta de novo.
      if (response.status === 400 && getAIProvider() === "anthropic" && !thinkingUnsupported && /thinking|effort|output_config/i.test(String(providerError))) {
        console.error("thinking config rejected; falling back to API default", { model: request.body?.model, error: String(providerError).slice(0, 300) });
        thinkingUnsupported = true;
        attempt -= 1;
        continue;
      }
      const classification = classifyProviderError(providerError, response.status);
      const retryAfterMs = retryDelay(response, attempt);
      if (classification.retryable && attempt < maxAttempts - 1 && retryAfterMs <= 30000) {
        await wait(retryAfterMs);
        continue;
      }
      throw createProviderError(providerError, response, retryAfterMs, classification);
    }
    const content = responseText(payload);
    if (!content) {
      const reason = emptyReason(payload);
      console.error("empty AI response", { label: options.label || "", maxTokens, reason, usage: payload?.usage || null, model: payload?.model || "" });
      const emptyError = new Error(`A API de IA retornou uma resposta vazia${reason ? ` (motivo informado pela API: ${reason})` : ""}.`);
      emptyError.code = "AI_EMPTY_RESPONSE";
      emptyError.retryable = true;
      emptyError.provider = getAIProvider();
      // Resposta vazia por limite de saída: o modelo gastou o espaço antes de escrever (por
      // exemplo, raciocinando). A próxima tentativa vai com o dobro de espaço, até 32 mil tokens.
      if (responseFinishedByLength(payload)) raisedMaxTokens = Math.min(32000, Math.max(maxTokens * 2, 8000));
      if (attempt < maxAttempts - 1) { await wait(250); continue; }
      throw emptyError;
    }
    return { text: String(content), truncated: responseFinishedByLength(payload) };
  }
  throw new Error("A API de IA não respondeu após as tentativas configuradas.");
}
