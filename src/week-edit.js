// Alteração PONTUAL de uma semana já aprovada: em vez de reescrever a semana inteira
// (e perder questões, recursos e figuras que o professor já conferiu), a IA devolve só
// as mudanças pedidas e elas são aplicadas por cima do texto atual.
//   scope "title" -> só o título (tema) da semana
//   scope "edit"  -> parágrafos/títulos de seção, boas-vindas, síntese e ponte para a próxima
// Tudo o que não foi tocado (questões, atividades, mediação, recursos, figuras, glossário,
// referências) permanece como estava.

import { callJson } from "./ai-client.js";
import { normalizeLesson } from "./aula-schema.js";
import { htmlToMarkdown, parseWeekMarkdown, plain } from "./writer-markdown.js";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);

const SYSTEM = `Você é o editor do material didático de uma pós-graduação a distância. O professor já aprovou o texto da semana; ele pede uma alteração PONTUAL. Mude somente o que o pedido exige, no mesmo tom e estilo do texto, e deixe todo o resto intacto. Não acrescente fatos, números ou casos que não estejam no texto atual, a menos que o professor tenha fornecido esses fatos no pedido. Responda somente com o objeto JSON pedido, válido, sem texto fora dele.`;

// Divide o HTML do corpo em blocos de primeiro nível (p, ul, ol, table, blockquote), sem perder nada entre eles.
export function splitBlocks(html) {
  const source = String(html ?? "");
  const pattern = /<(p|ul|ol|table|blockquote|h[1-6])\b[^>]*>[\s\S]*?<\/\1>/gi;
  const parts = [];
  let last = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > last && source.slice(last, match.index).trim()) parts.push({ html: source.slice(last, match.index), editable: false });
    parts.push({ html: match[0], editable: true });
    last = match.index + match[0].length;
  }
  if (last < source.length && source.slice(last).trim()) parts.push({ html: source.slice(last), editable: false });
  return parts;
}

// Markdown (parágrafos, listas, tabelas) → HTML, pelo mesmo analisador da escrita.
export function markdownToHtml(markdown) {
  const clean = String(markdown ?? "").replace(/^\s*#{1,6}\s+.*$/gm, "").replace(/^\s*>\s*(🔎|💭|💡|⚠️|⚠|📌|🖼️|🖼).*$/gmu, "");
  const { lessonPlan } = parseWeekMarkdown(`## 1. x\n\n${clean}`, {});
  return lessonPlan.contentSections[0]?.body || "";
}

// Cria um "mapa" editável da semana: id -> bloco, e o texto numerado enviado ao modelo.
function buildMap(plan) {
  const areas = []; // { key, label, get(), set(blocks) }
  const addArea = (key, label, html, assign) => areas.push({ key, label, parts: splitBlocks(html), assign });
  // Boas-vindas, síntese e ponte entram mesmo vazias (com um bloco-guia "(vazio)"), para a IA poder escrevê-las.
  addArea("welcome", "Boas-vindas", plan.welcome, (html) => { plan.welcome = html; });
  list(plan.contentSections).forEach((section) => {
    addArea(`${section.number}`, `Seção ${section.number} — ${text(section.title)}`, section.body, (html) => { section.body = html; });
    list(section.subsections).forEach((sub) => addArea(`${sub.number}`, `Subseção ${sub.number} — ${text(sub.title)}`, sub.body, (html) => { sub.body = html; }));
  });
  addArea("synthesis", "Síntese", plan.synthesis, (html) => { plan.synthesis = html; });
  addArea("next", "Ligação com a próxima semana", plan.nextWeekConnection, (html) => { plan.nextWeekConnection = html; });
  const index = new Map();
  let prompt = `Objetivos de aprendizagem atuais: ${list(plan.learningObjectives).map((item) => `“${text(item)}”`).join(" · ") || "(nenhum)"}\n`;
  areas.forEach((area) => {
    // Área sem nenhum bloco (ex.: síntese ainda não escrita): cria um bloco vazio que pode ser substituído.
    if (!area.parts.some((part) => part.editable)) area.parts.push({ html: "", editable: true, placeholder: true });
    prompt += `\n### ${area.label}\n`;
    let n = 0;
    area.parts.forEach((part) => {
      if (!part.editable) return;
      n += 1;
      part.id = `${area.key}:p${n}`;
      index.set(part.id, { area, part });
      prompt += `[${part.id}] ${part.placeholder ? "(vazio)" : htmlToMarkdown(part.html).replace(/\n{2,}/g, "\n")}\n`;
    });
  });
  return { areas, index, prompt };
}

const INSTRUCTION_FORMAT = `Devolva este JSON (listas vazias quando não houver o que mudar):
{
  "title": null,
  "objectives": null,
  "sectionTitles": [{"number": "3", "title": "novo título da seção"}],
  "changes": [
    {"id": "3:p2", "action": "replace", "markdown": "novo texto do bloco (Markdown simples: parágrafo, lista ou tabela)"},
    {"id": "3:p4", "action": "delete"},
    {"after": "3:p2", "action": "insert", "markdown": "novo bloco a inserir depois de 3:p2"}
  ],
  "summary": "uma frase dizendo o que foi alterado"
}
Regras: use apenas ids que existem no texto; ao substituir, mantenha negritos e links do bloco que não precisam mudar; não escreva títulos (#) nem callouts (> 🔎, > 💭 ...) nos blocos; em "title", devolva o novo título da semana somente se o professor pediu para mudá-lo (caso contrário, null); em "objectives", devolva a lista completa dos novos objetivos de aprendizagem somente se o pedido for sobre os objetivos (caso contrário, null); blocos marcados “(vazio)” podem ser preenchidos com "replace".`;

function titleContext(plan, ctx) {
  const sections = list(plan.contentSections).map((section) => `${text(section.number)}. ${text(section.title)}`).join(" | ");
  return `Título atual da semana: ${text(plan.theme)}
Seções: ${sections}
Boas-vindas: ${plain(htmlToMarkdown(plan.welcome)).slice(0, 700)}
${ctx.previousTheme ? `Semana anterior: ${ctx.previousTheme}\n` : ""}${ctx.nextTheme ? `Próxima semana: ${ctx.nextTheme}\n` : ""}`;
}

async function proposeTitle(input, plan, instruction, ctx, ask) {
  const result = await ask([
    { role: "system", content: SYSTEM },
    { role: "user", content: `Curso: ${text(input.title)}\n${titleContext(plan, ctx)}\nPedido do professor:\n${instruction}\n\nProponha SOMENTE o novo título da semana: específico (nomeia o problema, o conceito ou o caso da semana), sem "Semana N", até 90 caracteres.\nDevolva: {"title": "…"}` }
  ], { temperature: 0.6, maxTokens: 1500, retryMaxTokens: 1500, label: "edit:title", cacheSystem: true });
  return text(result?.title).replace(/^semana\s*\d+\s*[—–:.-]\s*/i, "").slice(0, 120);
}

async function proposeEdits(input, plan, instruction, ctx, ask) {
  const map = buildMap(plan);
  const result = await ask([
    { role: "system", content: SYSTEM },
    { role: "user", content: `Curso: ${text(input.title)} · Semana: ${text(plan.theme)}\n\nTEXTO ATUAL (cada bloco editável tem um id entre colchetes):\n${map.prompt}\n\nPedido do professor:\n${instruction}\n\n${INSTRUCTION_FORMAT}` }
  ], { temperature: 0.4, maxTokens: 9000, retryMaxTokens: 9000, label: "edit:text", cacheSystem: true });
  return { map, result: result && typeof result === "object" ? result : {} };
}

// Aplica as mudanças aos blocos; devolve quantas foram aplicadas e as que não puderam ser.
export function applyEdits(map, result) {
  let applied = 0;
  const skipped = [];
  const inserted = new Map(); // id -> html[]
  list(result.changes).forEach((change) => {
    const action = text(change?.action).toLowerCase();
    if (action === "insert") {
      const target = map.index.get(text(change.after));
      const html = markdownToHtml(change.markdown);
      if (!target || !html) { skipped.push(text(change.after || change.id)); return; }
      inserted.set(target.part.id, [...(inserted.get(target.part.id) || []), html]);
      applied += 1;
      return;
    }
    const target = map.index.get(text(change?.id));
    if (!target) { skipped.push(text(change?.id)); return; }
    if (action === "delete") { target.part.html = ""; applied += 1; return; }
    if (action === "replace") {
      const html = markdownToHtml(change.markdown);
      if (!html) { skipped.push(text(change.id)); return; }
      target.part.html = html;
      applied += 1;
    }
  });
  map.areas.forEach((area) => {
    area.assign(area.parts.map((part) => part.html + (part.id && inserted.has(part.id) ? inserted.get(part.id).join("") : "")).join(""));
  });
  return { applied, skipped };
}

export async function editWeek(input, index, week, instruction, scope = "edit", ctx = {}, ask = callJson) {
  const plan = JSON.parse(JSON.stringify(week?.lessonPlan || {}));
  if (!list(plan.contentSections).length) {
    const error = new Error("Envie a semana já escrita para alterá-la.");
    error.code = "EDIT_WEEK_MISSING";
    throw error;
  }
  const order = text(instruction);
  let summary = "";
  let applied = 0;
  let skipped = [];
  let title = "";
  if (scope === "title") {
    title = await proposeTitle(input, plan, order, ctx, ask);
    if (!title) { const error = new Error("A IA não devolveu um título. Tente de novo."); error.code = "EDIT_NO_RESULT"; error.retryable = true; throw error; }
    summary = `Título alterado para “${title}”.`;
  } else {
    const { map, result } = await proposeEdits(input, plan, order, ctx, ask);
    ({ applied, skipped } = applyEdits(map, result));
    list(result.sectionTitles).forEach((item) => {
      const section = plan.contentSections.find((candidate) => text(candidate.number) === text(item?.number));
      if (section && text(item.title)) { section.title = text(item.title); applied += 1; }
    });
    title = text(result.title).replace(/^semana\s*\d+\s*[—–:.-]\s*/i, "").slice(0, 120);
    const objectives = list(result.objectives).map((item) => text(item)).filter(Boolean);
    if (objectives.length >= 2) { plan.learningObjectives = objectives; applied += 1; }
    if (!applied && !title) {
      const error = new Error("A IA não encontrou o que alterar com esse pedido. Descreva o trecho ou a seção e tente de novo.");
      error.code = "EDIT_NO_RESULT";
      error.retryable = true;
      throw error;
    }
    summary = text(result.summary) || `${applied} alteração(ões) aplicada(s).`;
  }
  if (title) plan.theme = title;
  const lesson = normalizeLesson({ lessonPlan: plan, teacherGuide: week?.teacherGuide || {} }, input, index);
  lesson.generationMeta = { ...(week?.generationMeta || {}), ...(lesson.generationMeta || {}), lastEdit: { scope, at: new Date().toISOString(), summary } };
  return { week: lesson, summary, applied, skipped, title };
}
