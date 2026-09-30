import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const text = (value) => String(value ?? "").replace(/[\u2022\u2013\u2014]/g, "-").replace(/\u2019/g, "'").trim();
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const navy = rgb(0.105, 0.102, 0.09);
const coral = rgb(0.847, 0.361, 0.235);
const muted = rgb(0.36, 0.34, 0.31);
const sage = rgb(0.86, 0.91, 0.82);

function wrap(value, font, size, width) {
  const words = text(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !current) current = candidate;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

export async function createTeacherGuidePdf(input, teacherGuides = [], generalPlan = null) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const width = 595.28;
  const height = 841.89;
  const margin = 48;
  const contentWidth = width - margin * 2;
  let page;
  let y;

  const newPage = () => {
    page = pdf.addPage([width, height]);
    y = height - margin;
    page.drawRectangle({ x: 0, y: height - 5, width, height: 5, color: coral });
    page.drawText("GERADOR DE AULAS  /  GUIA DO PROFESSOR", { x: margin, y: height - 32, size: 8, font: bold, color: muted });
  };
  const ensure = (needed = 28) => { if (y < margin + needed) newPage(); };
  const paragraph = (value, opts = {}) => {
    const font = opts.font || regular;
    const size = opts.size || 10;
    const lineHeight = opts.lineHeight || size * 1.45;
    const color = opts.color || navy;
    for (const line of wrap(value, font, size, contentWidth - (opts.indent || 0))) {
      ensure(lineHeight + 8);
      page.drawText(line, { x: margin + (opts.indent || 0), y, size, font, color });
      y -= lineHeight;
    }
    y -= opts.after ?? 7;
  };
  const heading = (value, level = 2) => {
    ensure(level === 1 ? 58 : 42);
    const size = level === 1 ? 20 : level === 2 ? 13 : 10.5;
    page.drawText(text(value), { x: margin, y, size, font: bold, color: level === 1 ? navy : coral });
    y -= size + 8;
    if (level === 1) { page.drawLine({ start: { x: margin, y: y + 3 }, end: { x: width - margin, y: y + 3 }, thickness: 0.7, color: sage }); y -= 6; }
  };
  const bullets = (values, fallback = "Não informado.") => {
    const entries = list(values);
    paragraph(entries.length ? entries.map((item) => `- ${item}`).join("\n") : `- ${fallback}`, { indent: 8, after: 5 });
  };

  newPage();
  page.drawText("Guia do professor", { x: margin, y: y - 24, size: 28, font: bold, color: navy });
  y -= 64;
  paragraph(input.title || "Curso sem título", { font: italic, size: 14, color: coral, after: 14 });
  paragraph(`Público: ${input.audience || "não informado"}  |  Nível: ${input.level || "não informado"}  |  ${input.weeks || teacherGuides.length} semana(s)`, { size: 9, color: muted });
  if (input.objectives?.length) { heading("Visão do percurso", 2); paragraph("Objetivos gerais do curso:", { font: bold, size: 10, after: 2 }); bullets(input.objectives); }
  if (generalPlan?.totals) { heading("Carga e planejamento geral", 2); paragraph(`Meta do aluno: ${Number(generalPlan.totals.targetHours || 0).toFixed(1)} h. Carga calculada: ${Number(generalPlan.totals.calculatedHours || 0).toFixed(1)} h. Diferença: ${Number(generalPlan.totals.varianceMinutes || 0).toFixed(0)} minutos.`, { color: muted }); }

  for (const guide of teacherGuides) {
    newPage();
    heading(`Semana ${guide.weekNumber} - ${guide.title}`, 1);
    heading("Intenção pedagógica", 2);
    paragraph(guide.purpose);
    heading("Arco didático escolhido", 2);
    paragraph(`${guide.didacticArc.label}: ${guide.didacticArc.rationale}`);
    paragraph(`Percurso: ${guide.didacticArc.sequence.join(" -> ")}. ${guide.didacticArc.webPracticeRole}`, { color: muted });
    if (guide.didacticArc.phasePlan) { paragraph(`Fases ativas: ${Object.entries(guide.didacticArc.phasePlan).filter(([key, value]) => key !== "labels" && key !== "omitted" && value === true).map(([key]) => guide.didacticArc.phasePlan.labels?.[key] || key).join("; ")}`, { color: muted }); }
    if (guide.didacticArc.phasePlan?.omitted?.length) { paragraph(`Fases omitidas com justificativa: ${guide.didacticArc.phasePlan.omitted.map((item) => `${item.label}: ${item.reason}`).join(" | ")}`, { color: muted }); }
    heading("Objetivos da semana", 2); bullets(guide.objectives);
    if (guide.alignmentMatrix.length) {
      heading("Matriz de alinhamento", 2);
      for (const row of guide.alignmentMatrix) paragraph(`Objetivo: ${row.objective}\nConteúdo: ${(row.contentSections || []).join(", ") || "a conferir"}\nEvidência: ${row.evidence || "a definir"}\nAvaliação: ${(row.assessmentQuestions || []).join(", ") || "a conferir"}`, { indent: 8, after: 8 });
    }
    if (guide.diagnostic && Object.keys(guide.diagnostic).length) { heading("Diagnóstico inicial", 2); paragraph(guide.diagnostic.prompt || guide.diagnostic.question || guide.diagnostic.instructions || JSON.stringify(guide.diagnostic)); }
    if (guide.formativeChecks.length) { heading("Checagens formativas", 2); bullets(guide.formativeChecks.map((item) => typeof item === "string" ? item : `${item.prompt || item.question || item.title}${item.feedback ? ` — feedback: ${item.feedback}` : ""}`)); }
    if (guide.summativeAssessment && Object.keys(guide.summativeAssessment).length) { heading("Avaliação somativa", 2); paragraph(`${guide.summativeAssessment.title || "Avaliação final"}: ${guide.summativeAssessment.format || ""}`); }
    if (guide.mediationQuestions.length) { heading("Perguntas para mediação", 2); bullets(guide.mediationQuestions); }
    if (guide.commonMisconceptions.length) { heading("Equívocos comuns", 2); bullets(guide.commonMisconceptions); }
    if (guide.interventions.length) { heading("Intervenções do professor", 2); bullets(guide.interventions); }
    heading("Diferenciação", 2);
    paragraph("Apoio/recuperação:", { font: bold, after: 2 }); bullets(guide.differentiation.support);
    paragraph("Percurso padrão:", { font: bold, after: 2 }); bullets(guide.differentiation.standard);
    paragraph("Aprofundamento:", { font: bold, after: 2 }); bullets(guide.differentiation.extension);
    if (guide.accessibility && Object.keys(guide.accessibility).length) { heading("Acessibilidade", 2); paragraph(JSON.stringify(guide.accessibility, null, 2)); }
    if (guide.assessmentNotes.length) { heading("Notas de avaliação", 2); bullets(guide.assessmentNotes); }
    if (guide.spiralReview && Object.keys(guide.spiralReview).length) { heading("Revisão espiral", 2); paragraph(JSON.stringify(guide.spiralReview, null, 2)); }
    if (guide.webPractices.length) { heading("Webpráticas associadas", 2); for (const practice of guide.webPractices) { paragraph(`${practice.title || "Projeto"}: ${practice.objective || ""}\nProblema: ${practice.problem || practice.context || "a definir"}\nPapel do estudante: ${practice.studentRole || "a definir"}\nProduto: ${practice.product || practice.delivery || "a definir"}\nDuração: ${practice.durationMinutes || "a definir"} minutos`, { indent: 8 }); if (practice.steps?.length) bullets(practice.steps.map((step) => `${step.order || ""}. ${step.title}: ${step.instructions} (${step.minutes || 0} min) — evidência: ${step.evidence || "a definir"}`)); if (practice.rubric?.length) bullets(practice.rubric.map((criterion) => `${criterion.criterion}: excelente — ${criterion.excellent}; em desenvolvimento — ${criterion.developing}`)); if (practice.fallbackPlan) paragraph(`Plano B: ${practice.fallbackPlan}`, { indent: 8 }); } }
    heading("Checklist antes da publicação", 2);
    for (const check of guide.qualityReview?.checks || []) paragraph(`${check.pass ? "OK" : "REVISAR"} - ${check.label}`, { color: check.pass ? muted : coral, indent: 8, after: 3 });
    if (guide.workloadAdvice.length) { heading("Ajustes de carga sugeridos", 2); bullets(guide.workloadAdvice); }
  }

  return Buffer.from(await pdf.save());
}
