// Etapa de ilustração: transforma cada figura marcada pelo redator (🖼️) em um diagrama SVG
// feito pelo Claude e o coloca como bloco "imagem" logo depois do corpo da seção,
// sempre com a legenda "Ilustração criada por IA".

import { callText } from "./ai-client.js";
import { allFigures, figureBlock, sanitizeSvg, svgDataUri } from "./figures.js";

const text = (value) => String(value ?? "").trim();
const plain = (html) => text(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const SYSTEM = `Você desenha diagramas didáticos em SVG para um material de pós-graduação a distância. Cada diagrama explica UMA ideia, com rótulos corretos, em português do Brasil.

REGRAS DO SVG
- Responda somente com o elemento <svg>…</svg>, sem explicação e sem cercas de código.
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="…">; sem width nem height.
- Nada de <script>, <image>, <foreignObject>, <use>, links, fontes externas ou qualquer recurso de fora. Só formas, linhas, setas (marker em <defs>), grupos e <text>.
- Fundo #fbf9f4 (um <rect> do tamanho do viewBox). Cores: azul-marinho #1f2a44 (texto e linhas), terracota #c8553d (destaque), verde-sálvia #5b8a72 e lavanda #8a7fb0 (apoio), cinza #e8e4da (caixas).
- Texto com font-family="Arial, Helvetica, sans-serif", no mínimo 20 px, nunca saindo da caixa nem da borda; quebre linhas com vários <text> ou <tspan>. Uma ideia por diagrama, no máximo uns 12 elementos rotulados.
- Os rótulos têm que ser tecnicamente corretos para o assunto (operadores, símbolos, nomes). Se não tiver certeza de um detalhe, simplifique em vez de inventar.
- Sem decoração gratuita: cada forma carrega informação.`;

function figurePrompt(input, plan, section, figure) {
  return `Curso: "${text(input.title)}". Semana: "${text(plan.theme)}".
Seção ${text(section?.number)} — ${text(section?.title)}. Trecho da seção (para você usar os mesmos termos):
${plain(section?.body).slice(0, 1800)}

Diagrama a desenhar: ${text(figure.description)}
Legenda que acompanhará a figura: ${text(figure.caption) || "(sem legenda)"}

Devolva somente o <svg>.`;
}

async function drawFigure(input, plan, section, figure, ask = callText) {
  const messages = [{ role: "system", content: SYSTEM }, { role: "user", content: figurePrompt(input, plan, section, figure) }];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await ask(messages, { temperature: 0.4, maxTokens: 7000, ignoreRequestBudget: true, cacheSystem: true });
    const svg = sanitizeSvg(result.text);
    if (svg) return svg;
    messages.push({ role: "assistant", content: String(result.text || "").slice(0, 4000) }, { role: "user", content: "Esse SVG foi recusado (precisa ser um único <svg> com viewBox, sem script, imagem, <use>, links nem recursos externos, e completo até </svg>). Devolva de novo somente o <svg>, mais simples." });
  }
  return "";
}

// Coloca a figura logo depois do primeiro parágrafo da seção correspondente.
export function insertFigureBlocks(blocks, figures) {
  const pending = figures.filter((figure) => text(figure.src));
  const visit = (list) => {
    if (!Array.isArray(list)) return list;
    const existing = new Set(list.map((block) => block?.id));
    const out = list.map((block) => (Array.isArray(block?.props?.children) ? { ...block, props: { ...block.props, children: visit(block.props.children) } } : block));
    for (const figure of pending) {
      const block = figureBlock(figure);
      if (out.some((item) => item?.id === block.id)) { out.splice(out.findIndex((item) => item?.id === block.id), 1, block); continue; }
      const titleAt = out.findIndex((item) => item?.type === "titulo" && new RegExp(`^${text(figure.sectionNumber).replace(/\./g, "\\.")}[.\\s]`).test(text(item.props?.text)));
      if (titleAt < 0) continue;
      let at = out.findIndex((item, position) => position > titleAt && item?.type === "prose");
      if (at < 0) at = titleAt;
      out.splice(at + 1, 0, block);
    }
    return out;
  };
  return visit(blocks);
}

export async function illustrateWeek(input, week, { ask = callText, limit = 3 } = {}) {
  const plan = week?.lessonPlan || {};
  const sections = Array.isArray(plan.contentSections) ? plan.contentSections : [];
  const todo = allFigures(plan).filter((figure) => !text(figure.src)).slice(0, limit);
  if (!todo.length) return { week, drawn: 0, failed: 0, total: allFigures(plan).length };
  const settled = await Promise.allSettled(todo.map((figure) => drawFigure(input, plan, sections.find((section) => text(section.number) === text(figure.sectionNumber)), figure, ask)));
  const done = new Map();
  settled.forEach((result, position) => { if (result.status === "fulfilled" && result.value) done.set(todo[position].id, result.value); });
  const nextSections = sections.map((section) => ({ ...section, figures: (section.figures || []).map((figure) => done.has(figure.id) ? { ...figure, src: svgDataUri(done.get(figure.id)), aiGenerated: true } : figure) }));
  const figures = nextSections.flatMap((section) => (section.figures || []).map((figure) => ({ ...figure, sectionNumber: text(figure.sectionNumber || section.number) })));
  const next = { ...week, lessonPlan: { ...plan, contentSections: nextSections }, blocks: insertFigureBlocks(week.blocks, figures) };
  return { week: next, drawn: done.size, failed: todo.length - done.size, total: allFigures(plan).length };
}
