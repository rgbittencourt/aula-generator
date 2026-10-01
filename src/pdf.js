import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DIDACTIC_PHASE_LABELS } from "./pedagogy.js";

const clean = (value) => String(value ?? "").replace(/[\u2022\u2013\u2014]/g, "-").replace(/\u2019/g, "'").trim();

function display(value) {
  if (value == null || value === "") return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return clean(value);
  if (Array.isArray(value)) return value.map(display).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const preferred = ["title", "label", "name", "term", "text", "prompt", "question", "description", "claim", "value"];
    for (const key of preferred) if (value[key] != null && display(value[key])) return display(value[key]);
    return Object.entries(value).map(([key, item]) => `${key}: ${display(item)}`).filter(Boolean).join("; ");
  }
  return clean(value);
}

function entries(value) {
  if (!Array.isArray(value)) return [];
  return value.map(display).filter(Boolean);
}

function wrap(value, font, size, width) {
  const source = display(value);
  const lines = [];
  for (const rawLine of source.split(/\r?\n/u)) {
    const words = rawLine.trim().split(/\s+/u).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width || !current) current = candidate;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

const navy = rgb(0.105, 0.13, 0.22);
const ink = rgb(0.18, 0.20, 0.24);
const coral = rgb(0.82, 0.30, 0.20);
const muted = rgb(0.38, 0.41, 0.46);
const lightMuted = rgb(0.48, 0.51, 0.55);
const sage = rgb(0.83, 0.90, 0.84);
const pale = rgb(0.97, 0.98, 0.98);
const paleCoral = rgb(0.99, 0.95, 0.93);
const paleGold = rgb(1, 0.97, 0.88);
const white = rgb(1, 1, 1);

const phaseLabel = (value) => DIDACTIC_PHASE_LABELS[value] || display(value);
const reviewStatus = (value) => ({
  approved: "Aprovada",
  "approved-with-review": "Aprovada com pendências",
  "needs-revision": "Requer revisão",
  "not-run": "Ainda não executada"
}[value] || display(value) || "Não informado");

export async function createTeacherGuidePdf(input, teacherGuides = [], generalPlan = null) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const width = 595.28;
  const height = 841.89;
  const margin = 48;
  const footerHeight = 34;
  const contentWidth = width - margin * 2;
  let page;
  let y;

  const drawPageChrome = () => {
    const pageNumber = pdf.getPageCount();
    page.drawRectangle({ x: 0, y: height - 5, width, height: 5, color: coral });
    page.drawText("GERADOR DE AULAS  /  GUIA DO PROFESSOR", { x: margin, y: height - 31, size: 8, font: bold, color: muted });
    page.drawLine({ start: { x: margin, y: footerHeight }, end: { x: width - margin, y: footerHeight }, thickness: 0.45, color: sage });
    page.drawText("Guia do professor · uso interno de planejamento", { x: margin, y: 21, size: 7.5, font: regular, color: lightMuted });
    const pageLabel = `p. ${pageNumber}`;
    page.drawText(pageLabel, { x: width - margin - regular.widthOfTextAtSize(pageLabel, 7.5), y: 21, size: 7.5, font: regular, color: lightMuted });
  };

  const newPage = () => {
    page = pdf.addPage([width, height]);
    y = height - 58;
    drawPageChrome();
  };

  const ensure = (needed = 28) => {
    if (y < footerHeight + needed) newPage();
  };

  const paragraph = (value, opts = {}) => {
    const content = display(value);
    if (!content) return;
    const font = opts.font || regular;
    const size = opts.size || 9.4;
    const lineHeight = opts.lineHeight || size * 1.42;
    const color = opts.color || ink;
    const indent = opts.indent || 0;
    const available = contentWidth - indent;
    for (const line of wrap(content, font, size, available)) {
      ensure(lineHeight + 8);
      if (line) page.drawText(line, { x: margin + indent, y, size, font, color });
      y -= lineHeight;
    }
    y -= opts.after ?? 5;
  };

  const heading = (value, level = 2, opts = {}) => {
    const content = display(value);
    if (!content) return;
    const size = level === 1 ? 18 : level === 2 ? 12.4 : 10.2;
    const lineHeight = level === 1 ? 22 : level === 2 ? 15 : 13;
    const color = level === 1 ? navy : coral;
    const lines = wrap(content, bold, size, contentWidth);
    ensure(lines.length * lineHeight + (level === 1 ? 28 : 22));
    for (const line of lines) {
      page.drawText(line, { x: margin, y, size, font: bold, color });
      y -= lineHeight;
    }
    if (level === 1) {
      page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: width - margin, y: y + 4 }, thickness: 0.8, color: sage });
      y -= 7;
    } else y -= opts.after ?? 5;
  };

  const bullet = (value, opts = {}) => {
    const content = display(value);
    if (!content) return;
    const font = opts.font || regular;
    const size = opts.size || 9.2;
    const lineHeight = opts.lineHeight || size * 1.38;
    const indent = opts.indent || 10;
    const bulletWidth = 11;
    const lines = wrap(content, font, size, contentWidth - indent - bulletWidth);
    lines.forEach((line, index) => {
      ensure(lineHeight + 5);
      page.drawText(index === 0 ? `- ${line}` : line, { x: margin + indent + (index === 0 ? 0 : bulletWidth), y, size, font, color: opts.color || ink });
      y -= lineHeight;
    });
    y -= opts.after ?? 2;
  };

  const bullets = (values, fallback = "Não informado.", opts = {}) => {
    const items = entries(values);
    if (!items.length) bullet(fallback, opts);
    else items.forEach((item) => bullet(item, opts));
  };

  const callout = (title, body, opts = {}) => {
    const titleText = display(title);
    const bodyLines = wrap(body, regular, opts.size || 9, contentWidth - 24);
    const titleHeight = titleText ? 15 : 0;
    const lineHeight = (opts.size || 9) * 1.4;
    const boxHeight = titleHeight + bodyLines.length * lineHeight + 20;
    ensure(boxHeight + 10);
    page.drawRectangle({ x: margin, y: y - boxHeight + 7, width: contentWidth, height: boxHeight, color: opts.background || pale, borderColor: opts.border || sage, borderWidth: 0.6 });
    let boxY = y - 10;
    if (titleText) { page.drawText(titleText, { x: margin + 12, y: boxY, size: 9.2, font: bold, color: opts.titleColor || navy }); boxY -= titleHeight; }
    for (const line of bodyLines) { page.drawText(line, { x: margin + 12, y: boxY, size: opts.size || 9, font: regular, color: opts.color || ink }); boxY -= lineHeight; }
    y -= boxHeight + 8;
  };

  const row = (label, value, opts = {}) => {
    const content = display(value) || opts.fallback || "Não informado";
    paragraph(`${label}: ${content}`, { font: opts.font || regular, size: opts.size || 9.2, color: opts.color || ink, indent: opts.indent || 0, after: opts.after ?? 3 });
  };

  const formatDiagnostic = (diagnostic) => {
    const value = diagnostic || {};
    if (value.purpose) row("Propósito", value.purpose);
    if (value.prompt || value.question || value.instructions) row("Orientação", value.prompt || value.question || value.instructions);
    if (value.prompts?.length) { paragraph("Perguntas de diagnóstico:", { font: bold, size: 9.2, after: 2 }); bullets(value.prompts); }
    if (value.expectedEvidences?.length) { paragraph("Evidências esperadas:", { font: bold, size: 9.2, after: 2 }); bullets(value.expectedEvidences); }
    if (!value.purpose && !value.prompt && !value.question && !value.instructions && !value.prompts?.length) paragraph("Diagnóstico inicial ainda não detalhado.", { color: muted });
  };

  const formatAccessibility = (accessibility) => {
    const pairs = Object.entries(accessibility || {}).filter(([, value]) => display(value));
    if (!pairs.length) { paragraph("Orientações de acessibilidade ainda não detalhadas.", { color: muted }); return; }
    pairs.forEach(([key, value]) => row(key, value));
  };

  const formatSpiralReview = (review) => {
    if (!review || typeof review !== "object") return;
    if (review.previousConceptsReviewed?.length) { paragraph("Conceitos retomados:", { font: bold, size: 9.2, after: 2 }); bullets(review.previousConceptsReviewed); }
    if (review.newConcepts?.length) { paragraph("Novos conceitos:", { font: bold, size: 9.2, after: 2 }); bullets(review.newConcepts); }
    if (review.preparationForNextWeek?.length) { paragraph("Preparação para a próxima semana:", { font: bold, size: 9.2, after: 2 }); bullets(review.preparationForNextWeek); }
    if (review.cumulativeEvidence?.length) { paragraph("Evidências cumulativas:", { font: bold, size: 9.2, after: 2 }); bullets(review.cumulativeEvidence); }
    if (review.projectMilestone) row("Marco do projeto", review.projectMilestone);
    if (!review.previousConceptsReviewed?.length && !review.newConcepts?.length && !review.preparationForNextWeek?.length && !review.cumulativeEvidence?.length && !review.projectMilestone) paragraph("Revisão espiral ainda não detalhada.", { color: muted });
  };

  const formatPractice = (practice) => {
    row("Sessão", practice.title || "Webprática");
    row("Agenda", [practice.weekNumber ? `Semana ${practice.weekNumber}` : "", practice.date, practice.startTime && practice.endTime ? `${practice.startTime}–${practice.endTime}` : ""].filter(Boolean).join(" · "), { fallback: "a confirmar" });
    row("Objetivo", practice.objective, { fallback: "a definir" });
    row("Problema/contexto", practice.problem || practice.context, { fallback: "a definir" });
    row("Produto", practice.product || practice.delivery, { fallback: "a definir" });
    row("Duração", practice.durationMinutes ? `${practice.durationMinutes} minutos` : "a definir");
    if (practice.steps?.length) { paragraph("Etapas:", { font: bold, size: 9.2, after: 2 }); bullets(practice.steps.map((step) => `${step.order || ""} ${step.title || "Etapa"}: ${step.instructions || step.description || "a definir"}${step.minutes ? ` (${step.minutes} min)` : ""}`)); }
    if (practice.rubric?.length) { paragraph("Rubrica:", { font: bold, size: 9.2, after: 2 }); bullets(practice.rubric.map((criterion) => `${criterion.criterion || criterion.label || "Critério"}: excelente — ${criterion.excellent || "a definir"}; em desenvolvimento — ${criterion.developing || "a definir"}`)); }
    if (practice.fallbackPlan) row("Plano B", practice.fallbackPlan);
  };

  const formatChecklist = (checks = []) => {
    const items = Array.isArray(checks) ? checks : [];
    if (!items.length) { bullet("Checklist não disponível.", { color: muted, size: 8.5, lineHeight: 11, after: 0 }); return; }
    for (const check of items) {
      const label = `${check.pass ? "OK" : "REVISAR"} - ${check.label || "Item de verificação"}`;
      bullet(label, { color: check.pass ? muted : coral, size: 8.5, lineHeight: 11, after: 0 });
    }
  };

  // Capa e instruções de uso.
  newPage();
  y -= 22;
  page.drawText("Guia do professor", { x: margin, y, size: 29, font: bold, color: navy });
  y -= 41;
  paragraph(input.title || "Curso sem título", { font: italic, size: 14, color: coral, after: 12 });
  paragraph(`Público: ${input.audience || "não informado"}  |  Nível: ${input.level || "não informado"}  |  ${input.weeks || teacherGuides.length} semana(s)`, { size: 9.2, color: muted, after: 14 });
  callout("Como usar este guia", "Use este PDF para preparar, acompanhar e revisar a mediação do professor. Primeiro leia a visão geral; depois, em cada semana, confira objetivos, percurso, avaliação, diferenciação e checklist. Os arquivos .aula.json são do estudante e devem ser abertos no Aula Studio. As webpráticas têm roteiro DOCX próprio e não entram no texto-base semanal.", { background: paleCoral, border: rgb(0.95, 0.78, 0.70), titleColor: coral });
  if (input.academicProfile) {
    heading("Perfil acadêmico configurado", 2);
    row("Área", input.academicProfile.discipline, { fallback: "a definir" });
    row("Profundidade", input.academicProfile.depth, { fallback: "a definir" });
    row("Metas", `${input.academicProfile.targetWords || "a definir"} palavras/semana · ${input.academicProfile.minimumSections || "a definir"} seções mínimas · ${input.academicProfile.minimumReferences || 0} referências mínimas · ${input.academicProfile.primarySourcesRequired || 0} fonte(s) acadêmica(s)/oficial(is)`);
  }
  if (input.objectives?.length) {
    heading("Visão do percurso", 2);
    paragraph("Objetivos gerais do curso", { font: bold, size: 9.5, after: 3 });
    bullets(input.objectives);
  }
  if (generalPlan?.totals) {
    heading("Carga e planejamento geral", 2);
    const totals = generalPlan.totals;
    callout("Carga calculada", `Meta do aluno: ${Number(totals.targetHours || 0).toFixed(1)} h\nCarga calculada: ${Number(totals.calculatedHours || 0).toFixed(1)} h\nDiferença: ${Number(totals.varianceMinutes || 0).toFixed(0)} minutos`, { background: pale, border: sage });
  }

  for (const guide of teacherGuides) {
    newPage();
    const rawTitle = display(guide.title || `Semana ${guide.weekNumber}`);
    const withoutPrefix = rawTitle.replace(new RegExp(`^(?:Semana\\s*${guide.weekNumber}\\s*[-–—:]?\\s*)+`, "iu"), "");
    const withoutDuplicate = withoutPrefix.replace(new RegExp(`\\s*[-–—·:]?\\s*Semana\\s*${guide.weekNumber}\\s*$`, "iu"), "").trim();
    heading(`Semana ${guide.weekNumber} · ${withoutDuplicate || `Semana ${guide.weekNumber}`}`, 1);

    heading("Intenção pedagógica", 2); paragraph(guide.purpose || "Orientar a aprendizagem da semana com foco nos objetivos previstos.");
    heading("Arco didático escolhido", 2);
    const arc = guide.didacticArc || {};
    paragraph(`${display(arc.label) || "Arco variável"}: ${display(arc.rationale) || "O arco organiza a progressão desta semana."}`);
    const sequence = Array.isArray(arc.sequence) ? arc.sequence.map(phaseLabel).filter(Boolean) : [];
    if (sequence.length) paragraph(`Percurso: ${sequence.join(" -> ")}. ${display(arc.webPracticeRole)}`, { color: muted });
    const phasePlan = arc.phasePlan || {};
    const active = Object.entries(phasePlan).filter(([key, value]) => key !== "labels" && key !== "omitted" && value === true).map(([key]) => phasePlan.labels?.[key] || phaseLabel(key));
    if (active.length) paragraph(`Fases ativas: ${active.join("; ")}`, { color: muted });
    const omitted = Array.isArray(phasePlan.omitted) ? phasePlan.omitted.filter((item) => display(item.reason)) : [];
    if (omitted.length) paragraph(`Fases omitidas: ${omitted.map((item) => `${display(item.label)} — ${display(item.reason)}`).join(" | ")}`, { color: muted });

    heading("Objetivos da semana", 2); bullets(guide.objectives);
    if (guide.alignmentMatrix?.length) {
      heading("Matriz de alinhamento", 2);
      for (const rowData of guide.alignmentMatrix) {
        callout("Alinhamento objetivo–evidência–avaliação", `Objetivo: ${display(rowData.objective) || "a definir"}\nConteúdo: ${entries(rowData.contentSections).join(", ") || "a conferir"}\nEvidência: ${display(rowData.evidence) || "a definir"}\nAvaliação: ${entries(rowData.assessmentQuestions).join(", ") || "a conferir"}`, { background: pale, border: sage, size: 8.8 });
      }
    }
    if (guide.academicPlan && Object.keys(guide.academicPlan).length) {
      heading("Plano acadêmico da semana", 2);
      row("Pergunta central", guide.academicPlan.centralQuestion, { fallback: "a definir" });
      if (guide.academicPlan.centralConcepts?.length) { paragraph("Conceitos centrais", { font: bold, size: 9.2, after: 2 }); bullets(guide.academicPlan.centralConcepts); }
      if (guide.academicPlan.controversies?.length) { paragraph("Controvérsias e limites", { font: bold, size: 9.2, after: 2 }); bullets(guide.academicPlan.controversies); }
    }
    if (guide.claimEvidence?.length) {
      heading("Mapa de evidências", 2);
      for (const claim of guide.claimEvidence) {
        const status = claim.verificationStatus === "verified" ? "CONFIRMADA" : "A CONFERIR";
        const source = claim.sourceIds?.length ? `Fontes: ${claim.sourceIds.join(", ")}` : "Sem fonte vinculada";
        bullet(`${status} — ${display(claim.claim)} (${source})`, { color: status === "CONFIRMADA" ? muted : coral });
      }
    }
    if (guide.academicReview && (guide.academicReview.issues?.length || guide.academicReview.status)) {
      heading("Revisão acadêmica", 2);
      row("Status", reviewStatus(guide.academicReview.status), { color: guide.academicReview.status === "needs-revision" ? coral : muted });
      if (guide.academicReview.strengths?.length) { paragraph("Pontos fortes", { font: bold, size: 9.2, after: 2 }); bullets(guide.academicReview.strengths); }
      if (guide.academicReview.issues?.length) bullets(guide.academicReview.issues.map((issue) => `${String(issue.severity || "revisar").toUpperCase()}: ${display(issue.description)}${issue.suggestedRepair ? ` — ${display(issue.suggestedRepair)}` : ""}`), "Nenhuma pendência registrada.", { color: coral });
    }
    if (guide.diagnostic && Object.keys(guide.diagnostic).length) { heading("Diagnóstico inicial", 2); formatDiagnostic(guide.diagnostic); }
    if (guide.formativeChecks?.length) { heading("Checagens formativas", 2); bullets(guide.formativeChecks.map((item) => `${display(item.prompt || item.question || item.title || item.instructions) || "Checagem a definir"}${item.feedback ? ` — feedback: ${display(item.feedback)}` : ""}`)); }
    if (guide.summativeAssessment && Object.keys(guide.summativeAssessment).length) { heading("Avaliação somativa", 2); row("Formato", `${display(guide.summativeAssessment.title) || "Avaliação final"}${guide.summativeAssessment.format ? ` · ${display(guide.summativeAssessment.format)}` : ""}`); }
    if (guide.mediationQuestions?.length) { heading("Perguntas para mediação", 2); bullets(guide.mediationQuestions); }
    if (guide.commonMisconceptions?.length) { heading("Equívocos comuns", 2); bullets(guide.commonMisconceptions); }
    if (guide.interventions?.length) { heading("Intervenções do professor", 2); bullets(guide.interventions); }
    heading("Diferenciação", 2);
    paragraph("Apoio/recuperação", { font: bold, size: 9.2, after: 2 }); bullets(guide.differentiation?.support);
    paragraph("Percurso padrão", { font: bold, size: 9.2, after: 2 }); bullets(guide.differentiation?.standard);
    paragraph("Aprofundamento", { font: bold, size: 9.2, after: 2 }); bullets(guide.differentiation?.extension);
    if (guide.accessibility && Object.keys(guide.accessibility).length) { heading("Acessibilidade", 2); formatAccessibility(guide.accessibility); }
    if (guide.assessmentNotes?.length) { heading("Notas de avaliação", 2); bullets(guide.assessmentNotes); }
    if (guide.spiralReview && Object.keys(guide.spiralReview).length) { heading("Revisão espiral", 2); formatSpiralReview(guide.spiralReview); }
    if (guide.webPractices?.length) { heading("Webpráticas associadas", 2); guide.webPractices.forEach(formatPractice); }
    if (guide.qualityReview?.checks?.length) {
      ensure(180);
      heading("Checklist antes da publicação", 2);
      formatChecklist(guide.qualityReview.checks);
    }
    if (guide.workloadAdvice?.length) { heading("Ajustes de carga sugeridos", 2); bullets(guide.workloadAdvice); }
  }

  return Buffer.from(await pdf.save());
}
