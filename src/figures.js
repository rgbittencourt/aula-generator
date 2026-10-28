// Figuras (diagramas) criadas por IA em SVG.
//
// O redator marca, no ponto do texto, onde um diagrama ajuda:
//   > 🖼️ **Figura** [diagrama | descrição: "árvore de álgebra relacional da consulta X"]: legenda
// Uma etapa própria (/api/illustrate) pede ao modelo o SVG de cada figura; aqui ficam as
// partes puras: limpeza do SVG (nada de script nem recurso externo), URI de dados e o bloco
// "imagem" do ClassAtelier, sempre com a legenda "Ilustração criada por IA".

export const AI_FIGURE_CREDIT = "Ilustração criada por IA (Claude, Anthropic) · revisar antes de publicar";

const text = (value) => String(value ?? "").trim();

export function sanitizeSvg(raw) {
  const match = String(raw || "").match(/<svg[\s\S]*<\/svg>/i);
  if (!match) return "";
  let svg = match[0];
  if (svg.length > 60000) return "";
  // Elementos e atributos que executam código ou buscam recursos de fora.
  if (/<\s*(script|foreignObject|iframe|object|embed|image|audio|video|use)\b/i.test(svg)) return "";
  if (/\son[a-z]+\s*=/i.test(svg)) return "";
  if (/(?:href|src)\s*=\s*["']?\s*(?:https?:|data:|javascript:|\/\/)/i.test(svg)) return "";
  if (/@import|url\(\s*["']?\s*(?:https?:|data:|\/\/)/i.test(svg)) return "";
  if (!/\sxmlns\s*=/.test(svg.slice(0, 200))) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!/viewBox\s*=/.test(svg.slice(0, 400))) return "";
  // O tamanho vem do contêiner (o bloco de imagem), não do SVG.
  svg = svg.replace(/(<svg[^>]*?)\s(?:width|height)\s*=\s*["'][^"']*["']/gi, "$1").replace(/(<svg[^>]*?)\s(?:width|height)\s*=\s*["'][^"']*["']/gi, "$1");
  return svg;
}

export function svgDataUri(svg) {
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

export function figureCaption(figure) {
  const base = text(figure.caption || figure.description).replace(/[.\s]+$/, "");
  return `${base}. Ilustração criada por IA.`;
}

export function figureBlock(figure) {
  return {
    id: `c-figure-${text(figure.id)}`,
    type: "imagem",
    props: {
      src: text(figure.src),
      slotId: `figure-${text(figure.id)}`,
      caption: figureCaption(figure),
      credit: AI_FIGURE_CREDIT,
      alt: text(figure.description || figure.caption),
      ratio: "16/9"
    }
  };
}

// Figuras já ilustradas (com src) de uma seção do plano.
export function figuresOf(section) {
  return (Array.isArray(section?.figures) ? section.figures : []).filter((figure) => text(figure?.src));
}

export function allFigures(plan = {}) {
  return (Array.isArray(plan.contentSections) ? plan.contentSections : []).flatMap((section) => (Array.isArray(section.figures) ? section.figures : []).map((figure) => ({ ...figure, sectionNumber: text(figure.sectionNumber || section.number) })));
}
