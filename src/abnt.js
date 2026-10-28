// Referências no padrão ABNT NBR 6023:2018.
// O modelo escreve a referência completa; aqui ficam as regras que vão para os prompts, a ordenação
// alfabética exigida pela norma e uma conferência simples (formato, não verdade) das referências.

const MONTHS = ["jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

export function abntToday(date = new Date()) {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function abntRules(today = abntToday()) {
  return `REFERÊNCIAS NO PADRÃO ABNT (NBR 6023:2018) — obrigatório, sem exceção:
- uma referência por linha, em ordem alfabética pelo primeiro elemento (SOBRENOME do primeiro autor ou ÓRGÃO);
- livro: SOBRENOME, Nome. **Título**: subtítulo. Edição (se não for a 1ª). Local: Editora, ano.
- capítulo: SOBRENOME, Nome. Título do capítulo. In: SOBRENOME, Nome (org.). **Título do livro**. Local: Editora, ano. p. 10-25.
- artigo: SOBRENOME, Nome. Título do artigo. **Nome do periódico**, local, v. 10, n. 2, p. 15-30, mês abreviado ano.
- documento, norma, lei ou relatório de órgão: ÓRGÃO EM MAIÚSCULAS. **Título**. Local: ano. (Lei, decreto e norma: JURISDIÇÃO ou ÓRGÃO. **Tipo e número**, de data. Ementa.)
- até três autores, todos, separados por ponto e vírgula (SOBRENOME, Nome; SOBRENOME, Nome); com mais de três, só o primeiro seguido de et al.;
- o destaque tipográfico vai só no título da obra ou do periódico, marcado entre ** ** (negrito), sempre do mesmo jeito;
- fonte online termina com "Disponível em: <URL>. Acesso em: ${today}." — somente quando a URL foi informada; nunca invente URL, DOI, páginas, volume ou editora: se faltar um elemento essencial, escreva a referência com o que você sabe com segurança e liste o que conferir em "Pontos a conferir".`;
}

const strip = (value) => String(value || "").replace(/<[^>]+>/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

export function abntSortKey(reference) {
  const item = typeof reference === "string" ? reference : reference?.citation || reference?.title || reference?.href || "";
  return strip(item).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Ordem alfabética (NBR 6023), estável: referências sem chave ficam no fim.
export function sortReferencesAbnt(references) {
  const list = Array.isArray(references) ? references : [];
  return list.map((item, index) => ({ item, index, key: abntSortKey(item) }))
    .sort((a, b) => (a.key && !b.key ? -1 : !a.key && b.key ? 1 : a.key.localeCompare(b.key, "pt-BR") || a.index - b.index))
    .map((entry) => entry.item);
}

// Conferência de forma: devolve o que falta para a referência parecer ABNT. Não verifica se a obra existe.
export function abntIssues(reference) {
  const item = typeof reference === "string" ? { citation: reference } : reference || {};
  const raw = String(item.citation || item.title || "");
  const plainText = strip(raw);
  const issues = [];
  if (!plainText) return issues;
  if (!/^(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ'’ -]+[,.]|[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,}\b)/.test(plainText)) issues.push("deve começar por SOBRENOME, Nome (ou ÓRGÃO em maiúsculas)");
  if (!/\b(1[5-9]\d{2}|20\d{2})\b|\bs\.\s?d\./.test(plainText)) issues.push("falta o ano");
  if (!/\*\*[^*]+\*\*/.test(raw)) issues.push("falta o destaque (negrito) no título");
  const hasUrl = /https?:\/\//i.test(plainText) || /^https?:\/\//i.test(String(item.href || ""));
  if (hasUrl && !/Dispon[ií]vel em:/i.test(plainText)) issues.push('fonte online sem "Disponível em: <URL>."');
  if (/Dispon[ií]vel em:/i.test(plainText) && !/Acesso em:/i.test(plainText)) issues.push('falta "Acesso em: data."');
  return issues;
}

export function abntReport(references) {
  const list = Array.isArray(references) ? references : [];
  const flagged = list.map((reference, index) => ({ index, issues: abntIssues(reference) })).filter((entry) => entry.issues.length);
  return { total: list.length, flagged };
}
