// Verificação local (sem IA) de números, datas, normas e citações no texto escrito.
//
// A redação em prosa é boa de ler, e é justamente por isso que um número
// inventado passa despercebido. Este módulo procura afirmações "verificáveis"
// (valores em R$, percentuais, anos, quantidades, leis e portarias, citações
// diretas) e confere se o número aparece no que o professor forneceu (briefing)
// ou nas semanas já aprovadas. O que não aparece em lugar nenhum vira uma
// pendência em claimEvidence ("needs-human-review"), com a frase e o motivo,
// sem depender de o autor ter se lembrado de listar em "Pontos a conferir".

const MAX_FLAGS = 18;

const stripTags = (value) => String(value ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

// "14.129" -> "14129"; "2,5" -> "2.5"; "800" -> "800"
export function normalizeNumber(raw) {
  let value = String(raw).trim().replace(/[.,;:]+$/, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, "");
  return value.replace(",", ".");
}

const NUMBER = "\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?";
const SCALE = "(?:\\s+(?:mil|milh(?:ão|ões)|bilh(?:ão|ões)|trilh(?:ão|ões)))?";
const NOT_A_CLAIM_BEFORE = /(?:semana|seção|secao|capítulo|capitulo|passo|item|questão|questao|figura|tabela|parte|etapa|módulo|modulo|aula|unidade|alternativa)s?\s*$/i;

const DETECTORS = [
  { kind: "valor", weight: 5, re: new RegExp(`R\\$\\s*(${NUMBER})${SCALE}`, "gi") },
  { kind: "percentual", weight: 5, re: new RegExp(`(${NUMBER})\\s?(?:%|por cento)`, "gi") },
  { kind: "norma", weight: 5, re: /\b(?:Lei|Decreto|Portaria|Resolução|Instrução Normativa|Medida Provisória|Parecer|Emenda Constitucional)(?:\s+(?:Federal|Complementar|nº|n\.º|n°|no\.?))*\s*([\d.]+)(?:\s*\/\s*(\d{2,4}))?/gi },
  { kind: "quantidade", weight: 4, re: new RegExp(`(${NUMBER})${SCALE}\\s+(?:anos?|meses|dias|horas|alunos|estudantes|servidores|professores|instituições|institutos|universidades|campi|câmpus|municípios|cidades|escolas|cursos|sistemas|módulos|usuários|matrículas|vagas|países|estados|empresas|projetos|artigos|pessoas|mil)\\b`, "gi") },
  { kind: "ano", weight: 3, re: /\b((?:1[89]|20)\d{2})\b/g }
];

function sentencesOf(text) {
  return String(text).split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ"“(\d])/).map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 15);
}

function directQuotes(sentence) {
  const matches = [...sentence.matchAll(/[“"]([^”"]{30,})[”"]/g)];
  return matches.filter((match) => match[1].trim().split(/\s+/).length >= 6).map((match) => match[1]);
}

// Todos os números de um texto, já normalizados, para consulta rápida.
export function numbersIn(text) {
  const found = new Set();
  for (const match of String(text).matchAll(/\d[\d.,]*\d|\d/g)) found.add(normalizeNumber(match[0]));
  return found;
}

export function extractClaims(plan) {
  const items = [];
  const push = (text, sectionNumber) => {
    for (const sentence of sentencesOf(stripTags(text))) items.push({ sentence, sectionNumber });
  };
  push(plan.welcome, "");
  for (const section of plan.contentSections || []) {
    push(section.body, section.number);
    for (const sub of section.subsections || []) push(sub.body, sub.number || section.number);
    for (const callout of section.callouts || []) push(callout.body, section.number);
  }
  push(plan.synthesis, "");
  push(plan.nextWeekConnection, "");

  const claims = [];
  for (const { sentence, sectionNumber } of items) {
    const tokens = [];
    for (const detector of DETECTORS) {
      for (const match of sentence.matchAll(detector.re)) {
        const before = sentence.slice(Math.max(0, match.index - 14), match.index);
        if (detector.kind !== "valor" && detector.kind !== "norma" && NOT_A_CLAIM_BEFORE.test(before)) continue;
        const raw = detector.kind === "norma" ? [match[1], match[2]].filter(Boolean) : [match[1]];
        const numbers = raw.map(normalizeNumber).filter(Boolean);
        if (detector.kind === "ano" && tokens.some((token) => token.numbers.includes(numbers[0]))) continue;
        tokens.push({ kind: detector.kind, weight: detector.weight, label: match[0].replace(/\s+/g, " ").trim(), numbers });
      }
    }
    const quotes = directQuotes(sentence);
    if (tokens.length || quotes.length) claims.push({ sentence, sectionNumber, tokens, quotes });
  }
  return claims;
}

export function buildSourceCorpus(input = {}, previousWeeks = []) {
  const parts = [JSON.stringify(input ?? {})];
  for (const lesson of previousWeeks || []) {
    const plan = lesson?.lessonPlan || {};
    parts.push(plan.welcome, plan.synthesis, plan.nextWeekConnection);
    for (const section of plan.contentSections || []) {
      parts.push(section.body);
      for (const sub of section.subsections || []) parts.push(sub.body);
    }
  }
  return stripTags(parts.filter(Boolean).join(" "));
}

const weekReferenceNumbers = (plan) => numbersIn(JSON.stringify((plan.references || []).map((reference) => reference.citation || "")));

export function factCheckPlan(plan, { input = {}, previousWeeks = [] } = {}) {
  const corpus = buildSourceCorpus(input, previousWeeks);
  const known = numbersIn(corpus);
  const alreadyFlagged = numbersIn((plan.claimEvidence || []).map((item) => item.claim).join(" "));
  const claims = extractClaims(plan);
  const flags = [];
  let supported = 0;
  let covered = 0;
  for (const claim of claims) {
    const unsupported = claim.tokens.filter((token) => token.numbers.some((number) => !known.has(number)));
    const quoteFlag = claim.quotes.length > 0;
    if (!unsupported.length && !quoteFlag) { supported += 1; continue; }
    const allCovered = unsupported.length > 0 && unsupported.every((token) => token.numbers.every((number) => known.has(number) || alreadyFlagged.has(number))) && !quoteFlag;
    if (allCovered) { covered += 1; continue; }
    const labels = unsupported.map((token) => `“${token.label}”`);
    const reasons = [];
    if (labels.length) reasons.push(`${labels.slice(0, 4).join(", ")} não consta${labels.length > 1 ? "m" : ""} no briefing nem nas semanas anteriores`);
    if (quoteFlag) reasons.push("há citação direta, que precisa ser conferida palavra por palavra na fonte");
    const inReferences = unsupported.some((token) => token.numbers.every((number) => weekReferenceNumbers(plan).has(number)));
    flags.push({
      weight: Math.max(0, ...unsupported.map((token) => token.weight), quoteFlag ? 5 : 0),
      claim: claim.sentence.length > 240 ? `${claim.sentence.slice(0, 237)}…` : claim.sentence,
      sectionNumber: claim.sectionNumber,
      note: `Verificação automática: ${reasons.join("; ")}.${inReferences ? " O número aparece nas referências da própria semana, mas elas também foram escritas pelo modelo: confira na fonte." : ""}`
    });
  }
  flags.sort((a, b) => b.weight - a.weight);
  const entries = flags.slice(0, MAX_FLAGS).map((flag, index) => ({
    id: `auto-claim-${String(index + 1).padStart(2, "0")}`,
    claim: flag.claim,
    sectionNumber: flag.sectionNumber,
    sourceIds: [],
    sourceType: "",
    supportLevel: "insufficient",
    verificationStatus: "needs-human-review",
    note: flag.note
  }));
  return { entries, stats: { checked: claims.length, supported, alreadyListed: covered, flagged: flags.length, listed: entries.length } };
}

// Acrescenta as pendências encontradas ao claimEvidence do plano.
export function applyFactCheck(plan, options = {}) {
  const { entries, stats } = factCheckPlan(plan, options);
  plan.claimEvidence = [...(plan.claimEvidence || []), ...entries];
  return stats;
}
