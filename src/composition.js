const text = (value, fallback = "") => String(value ?? fallback).trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const integer = (value, fallback = 0) => {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? number : fallback;
};
const clampCount = (value, fallback = 0) => Math.min(12, Math.max(0, integer(value, fallback)));
const clampItems = (value, fallback = 3) => Math.min(12, Math.max(1, integer(value, fallback)));

export const COMPOSITION_CATALOG = Object.freeze([
  { key: "destaque", type: "destaque", label: "Destaque conceitual", group: "Destaques", unit: "bloco", defaultCount: 1, defaultPolicy: "prefer" },
  { key: "atencao", type: "atencao", label: "Atenção / erro comum", group: "Destaques", unit: "bloco", defaultCount: 1, defaultPolicy: "prefer" },
  { key: "reflexao", type: "reflexao", label: "Reflexão", group: "Destaques", unit: "bloco", defaultCount: 1, defaultPolicy: "prefer" },
  { key: "citacao", type: "citacao", label: "Citação", group: "Texto", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer" },
  { key: "pitaco", type: "pitaco", label: "Comentário / pitaco", group: "Destaques", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer" },
  { key: "imagem", type: "imagem", label: "Imagem com legenda", group: "Mídia", unit: "bloco", defaultCount: 1, defaultPolicy: "prefer" },
  { key: "parallax", type: "parallax", label: "Imagem parallax", group: "Mídia", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer" },
  { key: "textoimagem", type: "textoimagem", label: "Texto + imagem", group: "Mídia", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer" },
  { key: "cases", type: "cases", label: "Cards de casos", group: "Mídia", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer", itemsPerBlock: 3 },
  { key: "feature", type: "feature", label: "Destaques com ícones", group: "Mídia", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer", itemsPerBlock: 3 },
  { key: "tabela", type: "tabela", label: "Tabela comparativa", group: "Mídia", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer", itemsPerBlock: 3 },
  { key: "filmstrip", type: "filmstrip", label: "Filmstrip / carrossel", group: "Mídia", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer", itemsPerBlock: 3 },
  { key: "audio", type: "audio", label: "Áudio / podcast", group: "Mídia", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer" },
  { key: "accordion", type: "accordion", label: "Acordeão / FAQ", group: "Interativos", unit: "bloco", defaultCount: 1, defaultPolicy: "prefer", itemsPerBlock: 3 },
  { key: "flashcards", type: "flashcards", label: "Flashcards", group: "Interativos", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer", itemsPerBlock: 6 },
  { key: "slider", type: "slider", label: "Slider / passo a passo", group: "Interativos", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer", itemsPerBlock: 3 },
  { key: "linhadotempo", type: "linhadotempo", label: "Linha do tempo", group: "Interativos", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer", itemsPerBlock: 4 },
  { key: "columns", type: "columns", label: "Colunas comparativas", group: "Interativos", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer", itemsPerBlock: 2 },
  { key: "quiz", type: "quiz", label: "Quiz formativo", group: "Interativos", unit: "bloco", defaultCount: 1, defaultPolicy: "prefer", itemsPerBlock: 5 },
  { key: "externalembed", type: "externalembed", label: "Conteúdo externo", group: "Mídia", unit: "bloco", defaultCount: 0, defaultPolicy: "prefer" }
]);

const CATALOG_BY_KEY = Object.fromEntries(COMPOSITION_CATALOG.map((item) => [item.key, item]));
const POLICIES = new Set(["auto", "prefer", "required", "none"]);

function defaultRow(definition) {
  return {
    key: definition.key,
    type: definition.type,
    label: definition.label,
    group: definition.group,
    count: definition.defaultCount,
    policy: definition.defaultPolicy,
    itemsPerBlock: definition.itemsPerBlock || 1
  };
}

function normalizeRow(value, definition, fallback = defaultRow(definition)) {
  const source = typeof value === "number" || typeof value === "string" ? { count: value } : object(value);
  const count = clampCount(source.count ?? source.quantity ?? source.number, fallback.count);
  const policyValue = text(source.policy || source.mode, fallback.policy).toLowerCase();
  return {
    ...fallback,
    key: definition.key,
    type: definition.type,
    label: definition.label,
    group: definition.group,
    count,
    policy: POLICIES.has(policyValue) ? policyValue : fallback.policy,
    itemsPerBlock: definition.itemsPerBlock ? clampItems(source.itemsPerBlock ?? source.items ?? source.cardsPerBlock, fallback.itemsPerBlock || definition.itemsPerBlock) : 1
  };
}

function rowsFromSource(value, fallbackRows) {
  const source = object(value);
  const rows = {};
  COMPOSITION_CATALOG.forEach((definition) => {
    const candidate = source[definition.key] ?? source[definition.type];
    rows[definition.key] = normalizeRow(candidate, definition, fallbackRows[definition.key]);
  });
  return rows;
}

export function normalizeCompositionPlan(value = {}, weeks = 1) {
  const source = object(value);
  const baseRows = Object.fromEntries(COMPOSITION_CATALOG.map((definition) => [definition.key, defaultRow(definition)]));
  const defaultSource = source.default?.rows || source.defaults?.rows || source.default || source.defaults || source;
  const defaults = rowsFromSource(defaultSource, baseRows);
  const entries = Array.isArray(source.weeks) ? source.weeks : [];
  const weekPlans = entries.map((entry) => {
    const item = object(entry);
    const weekNumber = integer(item.weekNumber || item.week, 0);
    if (weekNumber < 1 || weekNumber > weeks) return null;
    const overrideSource = item.rows || item.composition || item;
    const rows = {};
    COMPOSITION_CATALOG.forEach((definition) => {
      const raw = overrideSource[definition.key] ?? overrideSource[definition.type];
      rows[definition.key] = raw === undefined ? null : normalizeRow(raw, definition, defaults[definition.key]);
    });
    return { weekNumber, rows };
  }).filter(Boolean).filter((entry, index, list) => list.findIndex((candidate) => candidate.weekNumber === entry.weekNumber) === index);
  return {
    preset: text(source.preset || source.mode, "balanced"),
    default: { rows: defaults },
    weeks: weekPlans
  };
}

export function compositionPlanForWeek(input = {}, index = 0) {
  const plan = input.compositionPlan || normalizeCompositionPlan({}, input.weeks || 1);
  const defaults = plan.default?.rows || Object.fromEntries(COMPOSITION_CATALOG.map((definition) => [definition.key, defaultRow(definition)]));
  const override = (plan.weeks || []).find((entry) => Number(entry.weekNumber) === index + 1)?.rows || {};
  const rows = {};
  COMPOSITION_CATALOG.forEach((definition) => {
    rows[definition.key] = override[definition.key] ? normalizeRow(override[definition.key], definition, defaults[definition.key]) : normalizeRow(defaults[definition.key], definition);
  });
  return { weekNumber: index + 1, preset: plan.preset || "balanced", rows };
}

function html(value) {
  return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function richHtml(value) {
  const source = text(value);
  if (!source) return "";
  if (/<(?:p|ul|ol|h[1-6]|strong|em|blockquote|br)\b/i.test(source)) return source.replace(/<script[\s\S]*?<\/script>/gi, "");
  return `<p>${html(source)}</p>`;
}

function stripHtml(value) { return text(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function sentence(value, fallback) { return stripHtml(value).split(/(?<=[.!?])\s+/)[0] || fallback; }
function sectionTitle(section, fallback) { return text(section?.title, fallback); }
function sectionBody(section) { return stripHtml(section?.body); }

function entryForType(entries, type, index) {
  return entries.filter((entry) => text(entry?.type || entry?.kind || entry?.blockType) === type)[index] || {};
}

function fallbackEntry(type, section, sectionIndex, itemIndex, weekPlan) {
  const title = sectionTitle(section, `Conceito ${sectionIndex + 1}`);
  const body = sentence(sectionBody(section), `O conceito de ${title} ajuda a interpretar o problema desta seção.`);
  const lead = `Retome ${title.toLowerCase()} e observe como isso aparece no problema analisado nesta seção.`;
  switch (type) {
    case "destaque": return { title: "Veja bem", body: lead, tone: "sage" };
    case "atencao": return { title: "Atenção", body: `Um erro comum é tratar ${title.toLowerCase()} como uma solução automática. Compare a explicação da seção com as condições concretas do contexto.`, tone: "coral" };
    case "reflexao": return { title: "Para refletir", question: `Que decisão do seu contexto poderia ser diferente se você aplicasse o conceito de ${title.toLowerCase()}?`, body: "" };
    case "citacao": return { quote: body, author: "Síntese da seção", source: "Aula-base · conferir fonte se for citação literal" };
    case "pitaco": return { kicker: "Pitaco", name: "Olhar profissional", role: "Comentário de contexto", body: `<p>${lead}</p>` };
    case "imagem": return { caption: `Imagem ou diagrama para visualizar ${title.toLowerCase()}.`, credit: "Fonte e licença a conferir" };
    case "parallax": return { overlayTitle: title, caption: `Imagem contextual de ${title.toLowerCase()}.`, credit: "Fonte e licença a conferir" };
    case "textoimagem": return { legenda: `Figura para acompanhar ${title.toLowerCase()}.`, fonte: "Fonte a conferir", body: `<p>${body}</p>` };
    case "cases": return { title: `Casos: ${title}`, intro: `Compare situações que tornam ${title.toLowerCase()} observável.`, cards: Array.from({ length: weekPlan.rows.cases.itemsPerBlock || 3 }, (_, index) => ({ mediaType: "icon", icon: ["lightbulb", "scale-balanced", "route"][index % 3], tag: `Caso ${index + 1}`, title: `${title} em contexto ${index + 1}`, text: `Analise como ${title.toLowerCase()} aparece nesta situação e qual decisão seria justificável.` })) };
    case "feature": return { title: `O que observar em ${title}`, intro: "Use estes sinais para organizar a leitura.", features: Array.from({ length: weekPlan.rows.feature.itemsPerBlock || 3 }, (_, index) => ({ icon: ["lightbulb", "route", "check"][index % 3], tone: ["ocean", "marigold", "sage"][index % 3], title: `Ponto ${index + 1}`, text: `Relacione este ponto ao argumento sobre ${title.toLowerCase()}.` })) };
    case "tabela": return { caption: `Tabela comparativa: ${title}`, headers: ["Aspecto", "O que observar", "Pergunta"], rows: [["Conceito", title, "Como se define?"], ["Aplicação", "Contexto educacional", "Que decisão orienta?"]], fonte: "Síntese da aula-base" };
    case "filmstrip": return { label: `Percurso de ${title}`, ratio: "3/2", items: Array.from({ length: weekPlan.rows.filmstrip.itemsPerBlock || 3 }, (_, index) => ({ tag: `0${index + 1}`, title: `Momento ${index + 1}`, text: `Observe um aspecto de ${title.toLowerCase()}.`, back: "Anote uma evidência ou dúvida." })) };
    case "audio": return { title: `Áudio de apoio: ${title}`, show: "Aula-base", description: `Use um áudio curto para retomar ${title.toLowerCase()}. Duração e link a conferir.` };
    case "accordion": return { items: Array.from({ length: weekPlan.rows.accordion.itemsPerBlock || 3 }, (_, index) => ({ title: `Pergunta ${index + 1} sobre ${title}`, body: `<p>Retorne à seção e explique, com suas palavras, por que ${title.toLowerCase()} importa para o problema estudado.</p>`, children: [] })) };
    case "flashcards": return { label: `Revisão: ${title}`, cards: Array.from({ length: weekPlan.rows.flashcards.itemsPerBlock || 6 }, (_, index) => ({ front: `O que significa o ponto ${index + 1} de ${title}?`, back: `Responda usando a definição, um exemplo e um limite apresentados na seção.` })) };
    case "slider": return { label: `Passo a passo: ${title}`, steps: Array.from({ length: weekPlan.rows.slider.itemsPerBlock || 3 }, (_, index) => ({ marker: String(index + 1).padStart(2, "0"), icon: "", title: `Etapa ${index + 1}`, body: `Avance na análise de ${title.toLowerCase()} e registre uma evidência.` })) };
    case "linhadotempo": return { title: `Linha do tempo: ${title}`, eras: [{ label: "Antes", range: "Contexto", tone: "ocean", events: [{ date: "1", title: "Ponto de partida", text: `Identifique o contexto de ${title.toLowerCase()}.`, open: true, children: [] }] }, { label: "Agora", range: "Aplicação", tone: "terracotta", events: [{ date: "2", title: "Decisão atual", text: `Relacione ${title.toLowerCase()} a uma decisão presente.`, open: false, children: [] }] }] };
    case "columns": return { gap: "normal", emphasis: "none", columns: Array.from({ length: weekPlan.rows.columns.itemsPerBlock || 2 }, (_, index) => ({ title: index === 0 ? "Conceito" : "Aplicação", body: `<p>Relacione ${title.toLowerCase()} ao ${index === 0 ? "argumento da seção" : "seu contexto"}.</p>`, children: [] })) };
    case "quiz": return { title: `Cheque sua compreensão: ${title}`, intro: "Responda depois de ler a seção e confira a explicação.", avaliativo: false, passMark: 6, questions: Array.from({ length: weekPlan.rows.quiz.itemsPerBlock || 5 }, (_, index) => ({ objective: "compreensão conceitual", q: `Qual afirmação melhor explica ${title.toLowerCase()}?`, options: ["A definição e o exemplo apresentados na seção.", "Uma generalização sem evidência.", "Uma resposta que ignora o contexto.", "Uma opinião sem relação com o problema."], answer: 0, explanation: `A alternativa correta retoma a definição e o exemplo trabalhados em ${title.toLowerCase()}.` })) };
    case "externalembed": return { title: `Conteúdo externo sobre ${title}`, embed: "", responsive: true, useEmbedDimensions: true, width: "", height: 600 };
    default: return { title };
  }
}

function blockFromEntry(type, entry, fallback, weekNumber, sectionIndex, itemIndex, planResources = {}) {
  const source = { ...fallback, ...object(entry) };
  const id = `c-composition-${weekNumber}-${sectionIndex + 1}-${type}-${itemIndex + 1}`;
  const common = { id, type, sectionNumber: sectionIndex + 1 };
  if (type === "destaque" || type === "atencao") return { ...common, type, props: { title: text(source.title, type === "atencao" ? "Atenção" : "Veja bem"), body: richHtml(source.body), tone: text(source.tone, type === "atencao" ? "coral" : "sage"), icon: text(source.icon) } };
  if (type === "reflexao") return { ...common, type, props: { title: text(source.title, "Para refletir"), question: text(source.question, "Que relação você faz entre esta seção e seu contexto?"), body: richHtml(source.body), tone: text(source.tone, "lavender"), icon: text(source.icon) } };
  if (type === "citacao") return { ...common, type, props: { quote: text(source.quote, source.body), author: text(source.author, "Autor a conferir"), source: text(source.source, "Fonte a conferir"), showAttribution: source.showAttribution !== false } };
  if (type === "pitaco") return { ...common, type, props: { kicker: text(source.kicker, "Pitaco"), name: text(source.name, "Olhar profissional"), role: text(source.role, "Comentário de contexto"), tone: text(source.tone, "coral"), src: text(source.src), slotId: id, body: richHtml(source.body) } };
  if (type === "imagem" || type === "parallax") {
    const resource = Array.isArray(planResources.images) ? planResources.images.find((item) => item.id === source.resourceId) || planResources.images[itemIndex] : null;
    const props = type === "imagem"
      ? { src: text(source.src || source.href || resource?.href), slotId: id, caption: text(source.caption, resource?.caption || "Imagem ou diagrama contextual."), credit: text(source.credit, resource?.credit || resource?.source || "Fonte e licença a conferir"), ratio: text(source.ratio, "16/9"), resourceId: text(source.resourceId || resource?.id) }
      : { src: text(source.src || source.href || resource?.href), slotId: id, overlayTitle: text(source.overlayTitle), caption: text(source.caption, resource?.caption || "Imagem contextual."), credit: text(source.credit, resource?.credit || resource?.source || "Fonte e licença a conferir"), height: text(source.height, "70vh"), resourceId: text(source.resourceId || resource?.id) };
    return { ...common, type, props };
  }
  if (type === "textoimagem") return { ...common, type, props: { ordem: text(source.ordem, "texto-imagem"), largura: text(source.largura, "46%"), sangria: text(source.sangria, "8%"), src: text(source.src || source.href), slotId: id, fonte: text(source.fonte, "Fonte a conferir"), legenda: text(source.legenda || source.caption, "Figura contextual"), body: richHtml(source.body) } };
  if (type === "cases") return { ...common, type, props: { title: text(source.title, "Casos reais"), intro: text(source.intro), columns: integer(source.columns, 2), layout: text(source.layout, "vertical"), cards: Array.isArray(source.cards) ? source.cards : [] } };
  if (type === "feature") return { ...common, type, props: { title: text(source.title, "Pontos-chave"), intro: text(source.intro), align: text(source.align, "center"), columns: integer(source.columns, 3), features: Array.isArray(source.features) ? source.features : [] } };
  if (type === "tabela") return { ...common, type, props: { caption: text(source.caption, "Tabela comparativa"), fonte: text(source.fonte), striped: source.striped !== false, destacarPrimeira: source.destacarPrimeira !== false, compact: Boolean(source.compact), headers: Array.isArray(source.headers) ? source.headers.map((item) => text(item)) : ["Aspecto", "Descrição"], rows: Array.isArray(source.rows) ? source.rows.map((row) => Array.isArray(row) ? row.map((item) => text(item)) : []) : [] } };
  if (type === "filmstrip") return { ...common, type, props: { mode: text(source.mode, "hero"), label: text(source.label, "Galeria"), ratio: text(source.ratio, "3/2"), items: Array.isArray(source.items) ? source.items : [] } };
  if (type === "audio") return { ...common, type, props: { spotify: text(source.spotify), src: text(source.src || source.href), title: text(source.title, "Áudio de apoio"), show: text(source.show, "Aula-base"), description: text(source.description, source.body), duration: text(source.duration || source.durationMinutes) } };
  if (type === "accordion") return { ...common, type, props: { items: Array.isArray(source.items) ? source.items.map((item) => ({ title: text(item.title), body: richHtml(item.body), children: Array.isArray(item.children) ? item.children : [] })) : [] } };
  if (type === "flashcards") return { ...common, type, props: { label: text(source.label, "Flashcards"), cards: Array.isArray(source.cards) ? source.cards.map((item) => ({ front: text(item.front), back: text(item.back) })) : [] } };
  if (type === "slider") return { ...common, type, props: { label: text(source.label, "Passo a passo"), steps: Array.isArray(source.steps) ? source.steps.map((item, index) => ({ marker: text(item.marker, String(index + 1).padStart(2, "0")), icon: text(item.icon), title: text(item.title), body: text(item.body) })) : [] } };
  if (type === "linhadotempo") return { ...common, type, props: { title: text(source.title, "Linha do tempo"), eras: Array.isArray(source.eras) ? source.eras : [] } };
  if (type === "columns") return { ...common, type, props: { gap: text(source.gap, "normal"), emphasis: text(source.emphasis, "none"), columns: Array.isArray(source.columns) ? source.columns.map((item) => ({ title: text(item.title), body: richHtml(item.body), children: Array.isArray(item.children) ? item.children : [] })) : [] } };
  if (type === "quiz") return { ...common, type, props: { title: text(source.title, "Cheque sua compreensão"), intro: text(source.intro), avaliativo: Boolean(source.avaliativo), passMark: Number(source.passMark) || 6, questions: Array.isArray(source.questions) ? source.questions : [] } };
  if (type === "externalembed") return { ...common, type, props: { title: text(source.title, "Conteúdo externo"), embed: text(source.embed), responsive: source.responsive !== false, useEmbedDimensions: source.useEmbedDimensions !== false, width: text(source.width), height: integer(source.height, 600) } };
  return null;
}

export function materializeComposition(plan = {}, weekPlan, weekNumber = 1) {
  const sections = Array.isArray(plan.contentSections) && plan.contentSections.length ? plan.contentSections : [{ title: "Conceitos centrais", body: "" }];
  const rawEntries = Array.isArray(plan.composition) ? plan.composition : Array.isArray(plan.composition?.entries) ? plan.composition.entries : [];
  const blocksBySection = Array.from({ length: sections.length }, () => []);
  const entries = [];
  COMPOSITION_CATALOG.forEach((definition) => {
    const row = weekPlan?.rows?.[definition.key] || defaultRow(definition);
    if (!row || row.policy === "none" || row.count <= 0) return;
    for (let itemIndex = 0; itemIndex < row.count; itemIndex += 1) {
      const sourceEntry = entryForType(rawEntries, definition.type, itemIndex);
      const explicitSection = integer(sourceEntry.sectionNumber || sourceEntry.section, 0);
      const sectionIndex = explicitSection >= 1 && explicitSection <= sections.length ? explicitSection - 1 : (itemIndex + definition.key.length) % sections.length;
      const fallback = fallbackEntry(definition.type, sections[sectionIndex], sectionIndex, itemIndex, weekPlan);
      const entry = { ...fallback, ...sourceEntry, type: definition.type, sectionNumber: sectionIndex + 1, generatedFallback: !Object.keys(sourceEntry).length };
      const block = blockFromEntry(definition.type, entry, fallback, weekNumber, sectionIndex, itemIndex, plan.resources || {});
      if (block) {
        blocksBySection[sectionIndex].push(block);
        entries.push(entry);
      }
    }
  });
  return { blocksBySection, entries, requested: weekPlan };
}

export function compositionSummary(plan = {}) {
  const rows = plan.rows || {};
  return COMPOSITION_CATALOG.filter((definition) => Number(rows[definition.key]?.count) > 0).map((definition) => `${rows[definition.key].count} ${definition.label.toLowerCase()}`).join(", ");
}
