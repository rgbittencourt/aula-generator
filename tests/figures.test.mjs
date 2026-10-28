import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { parseWeekMarkdown, planToMarkdown } from "../src/writer-markdown.js";
import { sanitizeSvg, svgDataUri, figureBlock, AI_FIGURE_CREDIT } from "../src/figures.js";
import { illustrateWeek } from "../src/illustrate.js";

const GOOD_SVG = '<svg viewBox="0 0 960 540" width="100" height="50"><rect width="960" height="540" fill="#fbf9f4"/><text x="40" y="80" font-size="24">π nome (σ idade&gt;18 (Aluno))</text></svg>';
const MD = `# Semana 1 — Álgebra

## Boas-vindas

Olá.

## 1. A árvore da consulta

Uma consulta vira uma árvore de operadores.

> 🖼️ **Figura** [diagrama | descrição: "árvore com π na raiz, σ no meio e Aluno na folha"]: Como a consulta vira árvore.

Mais texto da seção.

## 2. Outra seção

Texto.
`;
const input = normalizeCourseInput({ title: "Banco de Dados", weeks: 1, hoursPerWeek: 4, year: 2026, author: "A" });

test("parser: callout 🖼️ vira figura da seção e volta ao Markdown", () => {
  const { lessonPlan } = parseWeekMarkdown(MD, { weekNumber: 1 });
  const figures = lessonPlan.contentSections[0].figures;
  assert.equal(figures.length, 1);
  assert.match(figures[0].description, /árvore com π/);
  assert.equal(figures[0].caption, "Como a consulta vira árvore.");
  assert.match(planToMarkdown(lessonPlan), /> 🖼️ \*\*Figura\*\* \[diagrama \| descrição: "árvore com π/);
});

test("sanitizeSvg aceita SVG simples e recusa script, imagem, link externo e SVG sem viewBox", () => {
  const clean = sanitizeSvg("```svg\n" + GOOD_SVG + "\n```");
  assert.match(clean, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox/);
  assert.doesNotMatch(clean, /width="100"/);
  assert.equal(sanitizeSvg('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'), "");
  assert.equal(sanitizeSvg('<svg viewBox="0 0 1 1"><image href="https://x/y.png"/></svg>'), "");
  assert.equal(sanitizeSvg('<svg viewBox="0 0 1 1"><rect onclick="x()"/></svg>'), "");
  assert.equal(sanitizeSvg('<svg viewBox="0 0 1 1"><a href="https://evil"><rect/></a></svg>'), "");
  assert.equal(sanitizeSvg('<svg><rect/></svg>'), "");
  assert.equal(sanitizeSvg("sem svg"), "");
});

test("bloco de figura: imagem com legenda e crédito de IA", () => {
  const block = figureBlock({ id: "w1-f1", description: "d", caption: "Legenda", src: svgDataUri(sanitizeSvg(GOOD_SVG)) });
  assert.equal(block.type, "imagem");
  assert.match(block.props.src, /^data:image\/svg\+xml;base64,/);
  assert.match(block.props.caption, /Legenda\. Ilustração criada por IA\.$/);
  assert.equal(block.props.credit, AI_FIGURE_CREDIT);
});

test("illustrateWeek desenha a figura, coloca o bloco depois do texto da seção e é idempotente", async () => {
  const { lessonPlan } = parseWeekMarkdown(MD, { weekNumber: 1 });
  const week = normalizeLesson({ lessonPlan }, input, 0);
  let calls = 0;
  const ask = async () => { calls += 1; return { text: GOOD_SVG }; };
  const first = await illustrateWeek(input, week, { ask });
  assert.equal(first.drawn, 1);
  assert.equal(calls, 1);
  const children = first.week.blocks.find((block) => block.type === "topic").props.children;
  const titleAt = children.findIndex((block) => block.type === "titulo" && /^1 /.test(block.props.text));
  assert.equal(children[titleAt + 1].type, "prose");
  assert.equal(children[titleAt + 2].type, "imagem", "a figura vem logo depois do corpo da seção");
  assert.match(children[titleAt + 2].props.caption, /Ilustração criada por IA/);
  assert.match(first.week.lessonPlan.contentSections[0].figures[0].src, /^data:image\/svg\+xml/);
  const again = await illustrateWeek(input, first.week, { ask });
  assert.equal(again.drawn, 0);
  assert.equal(calls, 1, "figura já ilustrada não é desenhada de novo");
  assert.equal(again.week.blocks.find((block) => block.type === "topic").props.children.filter((block) => block.type === "imagem").length, 1);
});

test("illustrateWeek: SVG inválido duas vezes deixa a figura pendente sem derrubar a semana", async () => {
  const { lessonPlan } = parseWeekMarkdown(MD, { weekNumber: 1 });
  const week = normalizeLesson({ lessonPlan }, input, 0);
  let calls = 0;
  const result = await illustrateWeek(input, week, { ask: async () => { calls += 1; return { text: "<svg><script/></svg>" }; } });
  assert.equal(calls, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.week.lessonPlan.contentSections[0].figures[0].src, "");
});
