const providerBase = () => (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

function extractJsonValue(content) {
  const source = String(content || "").replace(/^\uFEFF/, "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
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
      while (/\s/.test(value[next] || "")) next += 1;
      if (value[next] === "}" || value[next] === "]") continue;
    }
    output += char;
  }
  return output;
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

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response, attempt) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(30000, Math.max(1000, retryAfter * 1000));
  const reset = response.headers.get("x-ratelimit-reset-tokens") || response.headers.get("x-ratelimit-reset-project-tokens") || "";
  const seconds = Number.parseFloat(reset);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(30000, Math.max(1000, seconds * 1000));
  return Math.min(30000, 1000 * (2 ** attempt) + Math.round(Math.random() * 500));
}

export async function callJson(messages, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY não está configurada. Cadastre a chave como segredo na Vercel.");
    error.code = "AI_KEY_MISSING";
    throw error;
  }
  const maxAttempts = Math.max(1, Number(process.env.OPENAI_MAX_RETRIES || 3));
  let formatRetry = false;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const retryingFormat = formatRetry;
    const requestMessages = formatRetry
      ? [...messages, { role: "user", content: options.formatRetryInstruction || "A resposta anterior veio em formato JSON inválido ou foi truncada. Gere novamente uma versão compacta e completa do mesmo objeto, sem markdown, comentários ou texto fora do JSON; use aspas duplas em todas as propriedades e não deixe vírgula antes de } ou ]." }]
      : messages;
    const response = await fetch(`${providerBase()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: options.model || process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: options.temperature ?? 0.45,
        max_tokens: Math.max(256, Number(retryingFormat ? (options.retryMaxTokens || options.maxTokens || process.env.OPENAI_MAX_TOKENS || 16000) : (options.maxTokens || process.env.OPENAI_MAX_TOKENS || 16000))),
        response_format: { type: "json_object" },
        messages: requestMessages
      })
    });
    const payload = await response.json().catch(() => ({}));
    const providerError = payload?.error?.message || (typeof payload?.error === "string" ? payload.error : "");
    if (providerError) {
      const retryable = response.status === 429 || response.status === 503 || /tokens per min|request too large|rate limit|temporar|timeout/i.test(providerError);
      if (retryable && attempt < maxAttempts - 1) {
        await wait(retryDelay(response, attempt));
        continue;
      }
      const error = new Error(`A API de IA recusou a solicitação: ${providerError}`);
      error.code = /tokens per min|request too large|rate limit/i.test(providerError) ? "AI_TPM_LIMIT" : "AI_PROVIDER_ERROR";
      error.retryable = retryable;
      throw error;
    }
    if (response.ok) {
      const choice = payload?.choices?.[0];
      const content = choice?.message?.content;
      if (!content) throw new Error("A API de IA retornou uma resposta vazia.");
      if (choice?.finish_reason === "length") {
        if (attempt < maxAttempts - 1) {
          formatRetry = true;
          await wait(250);
          continue;
        }
        const truncatedError = new Error("A resposta da IA atingiu o limite de saída antes de concluir a aula.");
        truncatedError.code = "AI_OUTPUT_TRUNCATED";
        truncatedError.retryable = true;
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
        throw parseError;
      }
    }
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    const retryable = response.status === 429 || response.status === 503;
    if (retryable && attempt < maxAttempts - 1) {
      await wait(retryDelay(response, attempt));
      continue;
    }
    const error = new Error(`A API de IA recusou a solicitação: ${detail}`);
    error.code = /tokens per min|request too large|rate limit/i.test(detail) ? "AI_TPM_LIMIT" : "AI_PROVIDER_ERROR";
    error.retryable = retryable;
    throw error;
  }
  throw new Error("A API de IA não respondeu após as tentativas configuradas.");
}
