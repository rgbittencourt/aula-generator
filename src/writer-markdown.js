import { citationHasSource } from "./composition.js";
// Converte o Markdown escrito pelo modo de prosa (writer-voice.js) em lessonPlan.
//
// Nada aqui chama IA. O analisador é tolerante: aceita variações de título,
// callout sem colchetes, listas com "-" ou "*", etc. O que não encontra, deixa
// vazio, e a camada de qualidade (content-quality.js) decide se a semana precisa
// de reparo.

const KIND_ALIASES = [
  [/^v[ií]deo/i, "video"],
  [/^podcast|^[aá]udio/i, "podcast"],
  [/^imagem|^figura|^foto/i, "image"],
  [/^dados|^dataset|^base de dados/i, "dataset"],
  [/^artigo|^documento|^leitura|^livro|^norma|^lei|^relat[oó]rio|^not[ií]cia|^site|^portal/i, "reading"]
];

const text = (value) => String(value ?? "").trim();
const escapeHtml = (value) => text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Texto sem marcação (para campos que o ClassAuthor escapa depois).
// Como plain(), mas preserva o **negrito** do título: a ABNT pede destaque nele.
export function plainReference(markdown) {
  return text(markdown)
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/__([^_]+)__/g, "**$1**")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1**$2**")
    .replace(/\s+/g, " ")
    .trim();
}

export function plain(markdown) {
  return text(markdown)
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// Marcação em linha → HTML seguro. Escapa primeiro e só depois reintroduz as tags.
export function inlineHtml(markdown) {
  let out = escapeHtml(markdown);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, label, href) => `<a href="${href.replace(/"/g, "%22")}" target="_blank" rel="noopener">${label}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return out;
}

function tokenize(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const tokens = [];
  let paragraph = [];
  let quote = [];
  let list = null;
  let table = null;
  const flushParagraph = () => { if (paragraph.length) { tokens.push({ type: "p", text: paragraph.join(" ").trim() }); paragraph = []; } };
  const flushQuote = () => { if (quote.length) { tokens.push({ type: "quote", text: quote.join(" ").trim() }); quote = []; } };
  const flushList = () => { if (list) { tokens.push({ type: "list", items: list, ordered: Boolean(list.ordered) }); list = null; } };
  const flushTable = () => { if (table) { tokens.push({ type: "table", rows: table }); table = null; } };
  const flushAll = () => { flushParagraph(); flushQuote(); flushList(); flushTable(); };
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) { flushAll(); continue; }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushAll(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+?)\s*#*$/);
    if (heading) { flushAll(); tokens.push({ type: "h", level: heading[1].length, text: heading[2].trim() }); continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushParagraph(); flushQuote(); flushList();
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) (table ||= []).push(cells);
      continue;
    }
    flushTable();
    if (/^\s*>/.test(line)) { flushParagraph(); flushList(); quote.push(line.replace(/^\s*>\s?/, "")); continue; }
    const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) {
      flushParagraph(); flushQuote();
      if (!list) { list = []; list.ordered = /^\s*\d+[.)]/.test(line); }
      list.push(item[1].trim());
      continue;
    }
    flushQuote(); flushList();
    paragraph.push(line.trim());
  }
  flushAll();
  return tokens;
}

const normalizeTitle = (value) => plain(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function classifyH2(title) {
  const key = normalizeTitle(title);
  if (/^boas vindas/.test(key)) return "welcome";
  if (/^objetivos/.test(key)) return "objectives";
  if (/^sintese/.test(key)) return "synthesis";
  if (/^o que vem|^proxima (?:semana|aula)|^na proxima (?:semana|aula)|^conexao com a proxima/.test(key)) return "next";
  if (/^glossario/.test(key)) return "glossary";
  if (/^referencias/.test(key)) return "references";
  if (/^pontos a conferir|^notas de verificacao|^a conferir/.test(key)) return "notes";
  return "section";
}

function blocksToHtml(tokens) {
  return tokens.map((token) => {
    if (token.type === "p") return `<p>${inlineHtml(token.text)}</p>`;
    if (token.type === "list") { const tag = token.ordered ? "ol" : "ul"; return `<${tag}>${token.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${tag}>`; }
    if (token.type === "table") {
      const [head, ...rows] = token.rows;
      const cells = (row, tag) => row.map((cell) => `<${tag}>${inlineHtml(cell)}</${tag}>`).join("");
      return `<table><thead><tr>${cells(head, "th")}</tr></thead><tbody>${rows.map((row) => `<tr>${cells(row, "td")}</tr>`).join("")}</tbody></table>`;
    }
    if (token.type === "quote") return `<blockquote>${inlineHtml(token.text)}</blockquote>`;
    return "";
  }).filter(Boolean).join("");
}

function resourceKind(label) {
  const clean = plain(label);
  for (const [pattern, kind] of KIND_ALIASES) if (pattern.test(clean)) return kind;
  return "reading";
}

function parseCallout(raw) {
  const source = text(raw);
  const emoji = (source.match(/^\s*(🔎|💭|💡|⚠️|⚠|📌|📜|🖼️|🖼)/u) || [])[1] || "";
  if (!emoji) return null;
  const rest = source.replace(/^\s*(🔎|💭|💡|⚠️|⚠|📌|📜|🖼️|🖼)\s*/u, "");
  if (emoji === "🖼️" || emoji === "🖼") {
    const match = rest.match(/^(?:\*\*[^*]*\*\*|[^\[:]*)\s*\[([^\]]*)\]\s*:?\s*([\s\S]*)$/);
    const attrs = match ? match[1].split("|").map((part) => part.trim()) : [];
    const field = (name) => (attrs.find((part) => new RegExp(`^${name}\\s*:`, "i").test(part)) || "").replace(new RegExp(`^${name}\\s*:\\s*`, "i"), "").replace(/^["“”']|["“”']$/g, "").trim();
    const description = field("descri[cç][aã]o");
    const rawKind = (attrs[0] || "").toLowerCase();
    const kind = /foto|imagem|fotografia/.test(rawKind) ? "foto" : /napkin/.test(rawKind) ? "napkin" : "diagrama";
    return { type: "figure", kind, description, prompt: field("prompt"), napkinText: field("texto"), body: plain(match ? match[2] : rest.replace(/^\*\*[^*]*\*\*\s*:?\s*/, "")) };
  }
  if (emoji === "🔎") {
    const match = rest.match(/^(?:\*\*[^*]*\*\*|[^\[:]*)\s*\[([^\]]*)\]\s*:?\s*([\s\S]*)$/);
    const attrs = match ? match[1].split("|").map((part) => part.trim()) : [];
    const kindLabel = attrs[0] || "artigo";
    const query = (attrs.find((part) => /^busca\s*:/i.test(part)) || "").replace(/^busca\s*:\s*/i, "").replace(/^["“”']|["“”']$/g, "").trim();
    const url = (attrs.find((part) => /^url\s*:/i.test(part)) || "").replace(/^url\s*:\s*/i, "").trim();
    const body = match ? match[2] : rest.replace(/^\*\*[^*]*\*\*\s*:?\s*/, "");
    return { type: "resource", kind: resourceKind(kindLabel), query, url, body: plain(body) };
  }
  const title = (rest.match(/^\*\*([^*]+)\*\*/) || [])[1] || "";
  const body = rest.replace(/^\*\*[^*]+\*\*\s*:?\s*/, "");
  if (emoji === "💭") return { type: "reflection", title: plain(title) || "Para refletir", body: plain(body) };
  // 📌 Dica do professor: dica, lembrete, detalhe importante ou aviso curto.
  if (emoji === "📌") return { type: "tip", title: plain(title) || "Dica", body: plain(body) };
  // 📜 Citação direta: "trecho exato" — AUTOR, Obra, ano, p. N.
  if (emoji === "📜") {
    const raw = plain(body);
    const match = raw.match(/^[“"«]([\s\S]+?)[”"»]\s*[—–-]+\s*([\s\S]+)$/);
    const quoteText = match ? match[1].trim() : raw.replace(/^[“"«]|[”"»]$/g, "").trim();
    const attribution = match ? match[2].trim().replace(/\.$/, "") : "";
    const [author, ...rest] = attribution.split(/\.\s+|,\s+(?=[A-ZÁÉÍÓÚ*])/);
    return { type: "quote", quote: quoteText, attribution, author: (author || "").trim(), source: rest.join(". ").trim() || attribution };
  }
  if (emoji === "💡") return { type: "highlight", title: plain(title) || "Em uma frase", body: plain(body) };
  return { type: "attention", title: plain(title) || "Atenção", body: plain(body) };
}

function keyTermsFrom(markdownChunks) {
  const seen = new Set();
  const terms = [];
  for (const chunk of markdownChunks) {
    for (const match of String(chunk).matchAll(/\*\*([^*]{2,80})\*\*/g)) {
      const base = match[1].replace(/\s*\(.*$/, "").replace(/[.:;,]+$/, "").trim();
      const words = base.split(/\s+/);
      if (!base || words.length > 4 || /^\d|R\$|%/.test(base)) continue;
      if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(base) && words.length > 2) continue;
      const key = base.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push(base);
    }
  }
  return terms.slice(0, 8);
}

function bucketFor(kind, state) {
  if (kind === "video") return "videos";
  if (kind === "image") return "images";
  if (kind === "podcast") return "podcasts";
  if (kind === "dataset") return "datasets";
  if (state.requiredLeft > 0) { state.requiredLeft -= 1; return "readingsRequired"; }
  return "readingsExtra";
}

/**
 * @param {string} markdown
 * @param {{ allowedUrls?: Set<string>, requiredReadings?: number, weekNumber?: number }} options
 * @returns {{ lessonPlan: object, stats: object }}
 */
export function parseWeekMarkdown(markdown, options = {}) {
  const allowedUrls = options.allowedUrls instanceof Set ? options.allowedUrls : new Set();
  const weekNumber = Number(options.weekNumber) || 1;
  const source = String(markdown ?? "").replace(/^\s*```(?:markdown|md)?\s*\n/i, "").replace(/\n```\s*$/i, "");
  const tokens = tokenize(source);
  const resources = { videos: [], readingsRequired: [], readingsExtra: [], images: [], podcasts: [], datasets: [] };
  const state = { requiredLeft: Math.max(0, Number(options.requiredReadings) || 0) };
  const plan = { weekNumber, theme: "", welcome: "", learningObjectives: [], contentSections: [], synthesis: "", nextWeekConnection: "", glossary: [], references: [], claimEvidence: [], notes: [], resources, writer: "prose" };

  let zone = "";
  let section = null;
  let sub = null;
  let resourceCounter = 0;
  let figureCounter = 0;
  let sectionCounter = 0;
  const raw = { synthesis: [], next: [], welcome: [] };

  const addProse = (tokensChunk) => {
    const html = blocksToHtml(tokensChunk);
    if (!html || !section) return;
    if (sub) sub.body += html; else section.body += html;
    (sub || section).md.push(...tokensChunk.filter((token) => token.type === "p").map((token) => token.text));
  };

  const finishSection = () => {
    if (!section) return;
    section.keyTerms = keyTermsFrom(section.md);
    const reflections = section.callouts.filter((callout) => callout.kind === "reflexao");
    if (reflections.length) section.reflection = { question: reflections.at(-1).body, body: "" };
    section.subsections.forEach((item) => { delete item.md; });
    delete section.md;
    plan.contentSections.push(section);
    section = null;
    sub = null;
  };

  for (const token of tokens) {
    if (token.type === "h" && token.level === 1) {
      const match = plain(token.text).match(/^(?:semana|aula)\s*\d+\s*[—–:.-]\s*(.+)$/i);
      plan.theme = match ? match[1].trim() : plain(token.text);
      continue;
    }
    if (token.type === "h" && token.level === 2) {
      finishSection();
      zone = classifyH2(token.text);
      if (zone === "section") {
        sectionCounter += 1;
        const numbered = plain(token.text).match(/^(\d+)\s*[.)\-–—:]?\s*(.+)$/);
        section = { number: numbered ? numbered[1] : String(sectionCounter), title: numbered ? numbered[2].trim() : plain(token.text), didacticRole: "", body: "", subsections: [], callouts: [], resources: [], figures: [], keyTerms: [], caseStudy: null, reflection: null, md: [] };
      }
      continue;
    }
    if (zone === "section" && section) {
      if (token.type === "h" && token.level >= 3) {
        const title = plain(token.text);
        const numbered = title.match(/^(\d+(?:\.\d+)+)\s*[.)\-–—:]?\s*(.+)$/);
        const isCase = /^caso\s*:/i.test(numbered ? numbered[2] : title);
        sub = { number: numbered ? numbered[1] : `${section.number}.${section.subsections.length + 1}`, title: numbered ? numbered[2].trim() : title, body: "", md: [] };
        section.subsections.push(sub);
        if (isCase) section.caseStudy = { title: sub.title.replace(/^caso\s*:\s*/i, ""), context: "", data: "", questions: [] };
        continue;
      }
      if (token.type === "quote") {
        const callout = parseCallout(token.text);
        if (!callout) {
          // Citação em bloco sem autor/obra/ano: entra como pendência para o professor (a fonte é obrigatória).
          if (!/[—–]\s*\S.*\b(1[5-9]\d{2}|20\d{2})\b|\([^)]*\b(1[5-9]\d{2}|20\d{2})\b[^)]*\)/.test(token.text)) {
            const snippet = plain(token.text).slice(0, 110);
            const claim = `Citação sem autor, obra e ano: “${snippet}${snippet.length >= 110 ? "…" : ""}”. Informe a fonte (autor, obra, ano, página) ou remova a citação.`;
            plan.notes.push(claim);
            plan.claimEvidence.push({ id: `quote-${String(plan.claimEvidence.length + 1).padStart(2, "0")}`, claim, sectionNumber: (sub ? sub.number : section.number), sourceIds: [], sourceType: "", supportLevel: "insufficient", verificationStatus: "needs-human-review", note: "Citação direta exige fonte completa." });
          }
          addProse([token]); continue;
        }
        const anchor = sub ? sub.number : section.number;
        if (callout.type === "figure") {
          figureCounter += 1;
          if (callout.description) section.figures.push({ id: `w${weekNumber}-f${figureCounter}`, kind: callout.kind || "diagrama", description: callout.description, prompt: callout.prompt || "", napkinText: callout.napkinText || "", caption: callout.body, sectionNumber: anchor });
          continue;
        }
        if (callout.type === "resource") {
          resourceCounter += 1;
          const kind = callout.kind;
          const bucket = bucketFor(kind, state);
          const href = callout.url && allowedUrls.has(callout.url) ? callout.url : "";
          const title = callout.query || callout.body.split(/[.!?]/)[0].slice(0, 90) || `Recurso ${resourceCounter}`;
          const entry = {
            id: `w${weekNumber}-r${resourceCounter}`,
            kind: kind === "reading" ? (bucket === "readingsRequired" ? "reading-required" : "reading-extra") : kind,
            title: title.slice(0, 120),
            href,
            required: bucket === "readingsRequired",
            sectionNumber: anchor,
            moment: `Seção ${anchor}`,
            searchQuery: callout.query,
            bridgeParagraph: callout.body,
            objective: "",
            pedagogicalUse: "Recurso inserido no ponto exato do texto em que ajuda a entender o conceito.",
            verificationStatus: href ? "provided-needs-review" : "suggested-no-url",
            requiresVerification: true
          };
          resources[bucket].push(entry);
          section.resources.push(entry);
        } else {
          if (callout.type === "quote") {
            // Citação sem autor, obra e ano não vai para o aluno: vira um ponto a conferir.
            if (!citationHasSource(callout.author, callout.attribution)) {
              plan.claimEvidence.push({ id: `quote-${String(plan.claimEvidence.length + 1).padStart(2, "0")}`, claim: `Citação retirada da aula por estar sem fonte completa (autor, obra, ano e página): "${callout.quote.slice(0, 300)}"`, sectionNumber: anchor, sourceIds: [], sourceType: "", supportLevel: "insufficient", requiresVerification: true });
              continue;
            }
            section.callouts.push({ kind: "citacao", title: "Citação", body: callout.quote, quote: callout.quote, author: callout.author, source: callout.attribution, anchor });
            continue;
          }
          const kind = callout.type === "reflection" ? "reflexao" : callout.type === "highlight" ? "destaque" : callout.type === "tip" ? "pitaco" : "atencao";
          section.callouts.push({ kind, title: callout.title, body: callout.body, anchor });
        }
        continue;
      }
      addProse([token]);
      continue;
    }
    if (zone === "welcome" && token.type !== "h") { raw.welcome.push(token); continue; }
    if (zone === "objectives" && token.type === "list") { plan.learningObjectives.push(...token.items.map(plain)); continue; }
    if (zone === "synthesis" && token.type !== "h") { raw.synthesis.push(token); continue; }
    if (zone === "next" && token.type !== "h") { raw.next.push(token); continue; }
    if (zone === "glossary" && token.type === "list") {
      for (const item of token.items) {
        const match = item.match(/^\*\*([^*]+)\*\*\s*[:—–-]\s*(.+)$/) || item.match(/^([^:—–]{2,60})\s*[:—–]\s+(.+)$/);
        if (match) plan.glossary.push({ term: plain(match[1]), definition: plain(match[2]) });
      }
      continue;
    }
    if (zone === "references" && token.type === "list") { plan.references.push(...token.items.map((item) => ({ citation: plainReference(item), type: "fonte-a-conferir", verificationStatus: "needs-human-review", verified: false }))); continue; }
    if (zone === "references" && token.type === "p" && token.text.length > 20) { plan.references.push({ citation: plainReference(token.text), type: "fonte-a-conferir", verificationStatus: "needs-human-review", verified: false }); continue; }
    if (zone === "notes" && token.type === "list") {
      token.items.forEach((item, index) => {
        const match = item.match(/^\[(?:se[cç][aã]o\s*)?([\d.]+)\]\s*(.+)$/i);
        const claim = plain(match ? match[2] : item);
        plan.notes.push(claim);
        plan.claimEvidence.push({ id: `claim-${String(index + 1).padStart(2, "0")}`, claim, sectionNumber: match ? match[1] : "", sourceIds: [], sourceType: "", supportLevel: "insufficient", verificationStatus: "needs-human-review", note: "Marcado pelo autor do texto para conferência antes de publicar." });
      });
    }
  }
  finishSection();

  plan.welcome = blocksToHtml(raw.welcome);
  plan.synthesis = blocksToHtml(raw.synthesis);
  // Um único parágrafo: o bloco de síntese acrescenta "Na próxima semana:" na frente dele.
  plan.nextWeekConnection = raw.next.length ? `<p>${raw.next.filter((token) => token.type === "p").map((token) => inlineHtml(token.text)).join(" ")}</p>` : "";

  // Estudo de caso: guarda um resumo em texto simples para metadados e ponte.
  for (const item of plan.contentSections) {
    if (item.caseStudy) {
      const caseSub = item.subsections.find((candidate) => /^caso\s*:/i.test(candidate.title));
      item.caseStudy.context = plain((caseSub?.body || "").replace(/<[^>]+>/g, " ")).slice(0, 700);
    }
  }
  const words = (value) => plain(String(value).replace(/<[^>]+>/g, " ")).split(/\s+/).filter(Boolean).length;
  const bodyWords = plan.contentSections.reduce((total, item) => total + words(item.body) + item.subsections.reduce((sum, subsection) => sum + words(subsection.body), 0), 0);
  return {
    lessonPlan: plan,
    stats: { sections: plan.contentSections.length, bodyWords, resources: resourceCounter, objectives: plan.learningObjectives.length, glossary: plan.glossary.length, references: plan.references.length, notes: plan.notes.length, hasWelcome: Boolean(plan.welcome), hasSynthesis: Boolean(plan.synthesis), hasNext: Boolean(plan.nextWeekConnection) }
  };
}

// ---------------------------------------------------------------------------
// Caminho de volta: lessonPlan → Markdown, para a refação da semana no modo de
// prosa (o autor recebe o texto atual do jeito que o escreveu) e para exportar.
// ---------------------------------------------------------------------------

export function htmlToMarkdown(html) {
  return String(html ?? "")
    .replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_m, inner) => {
      const rows = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => cell[1].replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**").replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*").replace(/<[^>]+>/g, "").trim()));
      if (!rows.length) return "";
      const line = (cells) => `| ${cells.join(" | ")} |`;
      return `\n\n${[line(rows[0]), line(rows[0].map(() => "---")), ...rows.slice(1).map(line)].join("\n")}\n\n`;
    })
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_m, inner) => { let n = 0; return `\n${inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_x, item) => `${++n}. ${item}\n`)}\n`; })
    .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, "**$2**")
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, "*$2*")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<\/(p|ul|ol|blockquote|h[1-6])>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const KIND_LABEL = { video: "vídeo", image: "imagem", podcast: "podcast", dataset: "dados", "reading-required": "artigo", "reading-extra": "artigo", reading: "artigo" };

function resourceCallout(resource) {
  const attrs = [KIND_LABEL[resource.kind] || "artigo"];
  if (resource.href) attrs.push(`url: ${resource.href}`);
  if (resource.searchQuery || resource.title) attrs.push(`busca: "${resource.searchQuery || resource.title}"`);
  const note = resource.href && resource.title && resource.title !== resource.searchQuery ? ` (${resource.title})` : "";
  return `> 🔎 **Veja mais aqui** [${attrs.join(" | ")}]${note}: ${plain(resource.bridgeParagraph || resource.pedagogicalUse || resource.objective || "")}`;
}

const figureField = (name, value) => (plain(value) ? ` | ${name}: "${plain(value).replace(/"/g, "'").replace(/\|/g, "/")}"` : "");
const figureCallout = (figure) => `> 🖼️ **Figura** [${figure.kind || "diagrama"} | descrição: "${plain(figure.description).replace(/"/g, "'")}"${figureField("prompt", figure.prompt)}${figureField("texto", figure.napkinText)}]: ${plain(figure.caption || "")}`;
const CALLOUT_EMOJI = { reflexao: ["💭", "Para refletir (não vale nota)"], destaque: ["💡", "Em uma frase"], atencao: ["⚠️", "Atenção"], pitaco: ["📌", "Dica"] };
const calloutLine = (callout) => {
  if (callout.kind === "citacao") return `> 📜 **Citação**: "${plain(callout.quote || callout.body)}" — ${plain(callout.source || callout.author)}`;
  const [emoji, label] = CALLOUT_EMOJI[callout.kind] || CALLOUT_EMOJI.destaque;
  return `> ${emoji} **${callout.title || label}**: ${callout.body}`;
};

export function planToMarkdown(plan = {}) {
  const out = [];
  out.push(`# Semana ${plan.weekNumber || ""} — ${plain(plan.theme)}`.replace(/\s+—\s*$/, ""));
  if (plan.welcome) out.push("## Boas-vindas", htmlToMarkdown(plan.welcome));
  const objectives = Array.isArray(plan.learningObjectives) ? plan.learningObjectives : [];
  if (objectives.length) out.push("## Objetivos de aprendizagem", "Ao final desta semana, você será capaz de:", objectives.map((item) => `- ${plain(item)}`).join("\n"));
  for (const section of Array.isArray(plan.contentSections) ? plan.contentSections : []) {
    out.push(`## ${section.number}. ${plain(section.title)}`);
    const callouts = Array.isArray(section.callouts) ? section.callouts : [];
    const subNumbers = new Set((section.subsections || []).map((sub) => String(sub.number)));
    const resourcesFor = (anchor, own) => (section.resources || []).filter((resource) => own ? String(resource.sectionNumber) === anchor : !subNumbers.has(String(resource.sectionNumber)));
    if (section.body) out.push(htmlToMarkdown(section.body));
    for (const resource of resourcesFor(String(section.number), false)) out.push(resourceCallout(resource));
    for (const figure of (section.figures || [])) out.push(figureCallout(figure));
    for (const callout of callouts.filter((item) => !subNumbers.has(String(item.anchor)))) out.push(calloutLine(callout));
    for (const sub of section.subsections || []) {
      out.push(`### ${sub.number} ${plain(sub.title)}`);
      if (sub.body) out.push(htmlToMarkdown(sub.body));
      for (const resource of resourcesFor(String(sub.number), true)) out.push(resourceCallout(resource));
      for (const callout of callouts.filter((item) => String(item.anchor) === String(sub.number))) out.push(calloutLine(callout));
    }
    if (section.reflection?.question && !callouts.some((callout) => callout.kind === "reflexao")) out.push(calloutLine({ kind: "reflexao", body: plain(section.reflection.question) }));
  }
  if (plan.synthesis) out.push("## Síntese conceitual", htmlToMarkdown(plan.synthesis));
  if (plan.nextWeekConnection) out.push("## O que vem por aí", htmlToMarkdown(plan.nextWeekConnection));
  const glossary = Array.isArray(plan.glossary) ? plan.glossary : [];
  if (glossary.length) out.push("## Glossário rápido desta semana", glossary.map((item) => `- **${plain(item.term)}**: ${plain(item.definition)}`).join("\n"));
  const references = Array.isArray(plan.references) ? plan.references : [];
  if (references.length) out.push("## Referências desta semana", references.map((item) => `- ${plainReference(typeof item === "string" ? item : item.citation || item.title || item.href)}`).join("\n"));
  const claims = Array.isArray(plan.claimEvidence) ? plan.claimEvidence : [];
  if (claims.length) out.push("## Pontos a conferir", claims.map((item) => `- ${item.sectionNumber ? `[${item.sectionNumber}] ` : ""}${plain(item.claim)}`).join("\n"));
  return `${out.join("\n\n")}\n`;
}
