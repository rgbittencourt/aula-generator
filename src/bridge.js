// Contrato de ponte entre semanas.
//
// Quando o professor aprova uma semana, guardamos um resumo curto do que ela
// realmente ensinou e do gancho que deixou para a próxima. A semana seguinte
// recebe esse resumo (e não o texto completo), o que mantém a continuidade e
// o custo de tokens baixos. Se uma semana aprovada for refeita, comparamos o
// resumo antigo com o novo para decidir se basta ajustar as pontas (abertura
// da próxima / fechamento da anterior), se a próxima ficou desatualizada ou se
// nada precisa ser tocado.
//
// Nada aqui chama IA: o resumo é derivado do lessonPlan já normalizado.

import { richHtml, synthesisBlockBody } from "./aula-schema.js";

const text = (value) => String(value ?? "").trim();
const normalizeKey = (value) => text(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set("a ao aos as com da das de do dos e em entre essa esse esta este para por que um uma o os no nos na nas se sem sua seu suas seus como mais menos sobre ou ja foi ser sao vai vamos tem nos voce voces semana".split(" "));

export function clip(value, limit) {
  const source = text(value).replace(/\s+/g, " ");
  return source.length > limit ? `${source.slice(0, Math.max(0, limit - 1)).trim()}…` : source;
}

function sentences(value) {
  return text(value).replace(/\s+/g, " ").split(/(?<=[.!?…])\s+/u).map((item) => item.trim()).filter(Boolean);
}

function tokens(value) {
  return new Set(normalizeKey(value).split(" ").filter((word) => word.length >= 4 && !STOP.has(word)));
}

function overlap(left, right) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

function jaccard(left = [], right = []) {
  const a = new Set(left.map(normalizeKey).filter(Boolean));
  const b = new Set(right.map(normalizeKey).filter(Boolean));
  if (!a.size && !b.size) return 1;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function hash(value) {
  let h = 5381;
  const source = String(value);
  for (let index = 0; index < source.length; index += 1) h = ((h << 5) + h + source.charCodeAt(index)) >>> 0;
  return h.toString(36);
}

export function summarizeWeekBridge(lesson = {}, index = 0) {
  const plan = lesson?.lessonPlan || {};
  const sections = Array.isArray(plan.contentSections) ? plan.contentSections : [];
  const glossary = Array.isArray(plan.glossary) ? plan.glossary.map((item) => text(item?.term)).filter(Boolean) : [];
  const keyTerms = sections.flatMap((section) => Array.isArray(section?.keyTerms) ? section.keyTerms.map(text) : []).filter(Boolean);
  const concepts = [...new Set([...glossary, ...keyTerms].map((item) => clip(item, 80)))].slice(0, 12);
  const withCase = sections.find((section) => section?.caseStudy && (section.caseStudy.title || section.caseStudy.context));
  const anchorExample = withCase
    ? clip([withCase.caseStudy.title, withCase.caseStudy.context].filter(Boolean).join(": "), 260)
    : clip(sections[0]?.title, 160);
  const reflections = sections.map((section) => text(section?.reflection?.question)).filter(Boolean);
  const synthesisQuestion = sentences(plan.synthesis).filter((sentence) => sentence.includes("?")).at(-1) || "";
  const openQuestion = clip(reflections.at(-1) || synthesisQuestion, 260);
  const summary = {
    weekNumber: Number(plan.weekNumber) || index + 1,
    theme: clip(plan.theme || lesson?.meta?.title, 200),
    concepts,
    anchorExample,
    openQuestion,
    sectionTitles: sections.map((section) => clip(section?.title, 120)).filter(Boolean).slice(0, 10),
    hookIn: clip(sentences(plan.welcome).slice(0, 3).join(" "), 480),
    hookOut: clip(plan.nextWeekConnection, 800)
  };
  summary.fingerprint = hash(JSON.stringify([summary.concepts.map(normalizeKey), summary.anchorExample, summary.hookOut]));
  return summary;
}

// Aceita somente o formato produzido por summarizeWeekBridge, com limites de
// tamanho. O cliente guarda esses resumos e os devolve a cada chamada; não
// confiamos em tamanho nem em tipos.
export function sanitizeBridges(value) {
  const list = Array.isArray(value) ? value : [];
  return list.slice(-8).filter((item) => item && typeof item === "object").map((item) => ({
    weekNumber: Number(item.weekNumber) || 0,
    theme: clip(item.theme, 200),
    concepts: (Array.isArray(item.concepts) ? item.concepts : []).slice(0, 12).map((entry) => clip(entry, 80)).filter(Boolean),
    anchorExample: clip(item.anchorExample, 260),
    openQuestion: clip(item.openQuestion, 260),
    sectionTitles: (Array.isArray(item.sectionTitles) ? item.sectionTitles : []).slice(0, 10).map((entry) => clip(entry, 120)).filter(Boolean),
    hookIn: clip(item.hookIn, 480),
    hookOut: clip(item.hookOut, 800),
    fingerprint: clip(item.fingerprint, 24)
  })).filter((item) => item.weekNumber > 0);
}

// Compara o resumo aprovado com o da versão refeita.
//   none  – a ponte não mudou; nenhuma outra semana é tocada.
//   edges – a ponte mudou; basta reescrever a abertura da próxima semana e/ou
//           o fechamento da anterior.
//   stale – o conteúdo central mudou tanto que a próxima semana deve ser
//           sinalizada como desatualizada para o professor decidir.
export function compareBridges(before, after) {
  if (!before || !after) return { level: "none", needsNextOpening: false, needsPreviousClosing: false, reasons: [] };
  const reasons = [];
  const conceptSimilarity = jaccard(before.concepts, after.concepts);
  const closingSimilarity = overlap(before.hookOut, after.hookOut);
  const openingSimilarity = overlap(before.hookIn, after.hookIn);
  const anchorSimilarity = overlap(before.anchorExample, after.anchorExample);
  const closingChanged = before.hookOut !== after.hookOut && closingSimilarity < 0.6;
  const openingChanged = before.hookIn !== after.hookIn && openingSimilarity < 0.5;
  const conceptsChanged = conceptSimilarity < 0.75;
  const anchorChanged = before.anchorExample !== after.anchorExample && anchorSimilarity < 0.4;
  if (closingChanged) reasons.push("o gancho de fechamento mudou");
  if (conceptsChanged) reasons.push("os conceitos ensinados mudaram");
  if (anchorChanged) reasons.push("o exemplo-âncora mudou");
  if (openingChanged) reasons.push("a abertura, que retoma a semana anterior, mudou");
  const needsNextOpening = closingChanged || conceptsChanged || anchorChanged;
  const needsPreviousClosing = openingChanged;
  let level = "none";
  if (needsNextOpening || needsPreviousClosing) level = "edges";
  if (conceptSimilarity < 0.4) level = "stale";
  return { level, needsNextOpening, needsPreviousClosing, reasons, conceptSimilarity: Number(conceptSimilarity.toFixed(2)) };
}

// Bloco de prompt com o que a semana anterior realmente entregou.
export function formatBridgeContext(bridges = [], weekNumber = 0) {
  const previous = sanitizeBridges(bridges).filter((item) => item.weekNumber < weekNumber).at(-1);
  if (!previous) return "";
  return `CONTRATO DE PONTE — a semana ${previous.weekNumber} já foi APROVADA pelo professor. Cumpra o que ela prometeu; não reensine o que ela já ensinou:
- tema aprovado: ${previous.theme}
- conceitos que ela já ensinou (retome, não reexplique): ${JSON.stringify(previous.concepts)}
- exemplo-âncora usado: ${previous.anchorExample || "(nenhum)"}
- pergunta deixada em aberto: ${previous.openQuestion || "(nenhuma)"}
- gancho que ela prometeu no fechamento (a abertura desta semana deve cumpri-lo explicitamente): ${previous.hookOut || "(nenhum)"}
- regra: o "welcome" desta semana deve começar retomando um conceito e o exemplo-âncora acima e, na sequência, mostrar como esta semana responde ao gancho. Se o gancho acima divergir do tema desta semana, siga o tema desta semana e ajuste a retomada sem contradizer o que a semana anterior ensinou.`;
}

export function closingRequirement() {
  return `O fechamento ("nextWeekConnection", pelo menos 60 palavras) é o gancho que a próxima semana vai cumprir. Declare nele, de forma explícita e em texto corrido para o estudante: (1) qual conceito desta semana passa adiante, (2) a pergunta que fica em aberto, (3) o que o estudante vai encontrar na próxima semana para respondê-la.`;
}

function walk(blocks, visit) {
  return (Array.isArray(blocks) ? blocks : []).map((block) => {
    const copy = { ...block, props: { ...(block?.props || {}) } };
    if (Array.isArray(copy.props.children)) copy.props.children = walk(copy.props.children, visit);
    return visit(copy) || copy;
  });
}

// Aplica somente os trechos de ponta (abertura e/ou fechamento) a uma semana
// já normalizada, sem reescrever o corpo e sem perder recursos já inseridos.
export function applyEdgePatch(lesson = {}, patch = {}) {
  const welcome = text(patch.welcome);
  const next = text(patch.nextWeekConnection);
  if (!welcome && !next) return lesson;
  const lessonPlan = { ...(lesson.lessonPlan || {}) };
  if (welcome) lessonPlan.welcome = welcome;
  if (next) lessonPlan.nextWeekConnection = next;
  const blocks = walk(lesson.blocks, (block) => {
    if (welcome && block.type === "prose" && String(block.id || "").startsWith("c-welcome-")) block.props.body = richHtml(welcome);
    if (block.type === "sintese") block.props.body = synthesisBlockBody(lessonPlan);
    return block;
  });
  return { ...lesson, lessonPlan, blocks };
}
