import { localizeUnit } from "./unit.js";
// Material de Mediação (PDF do professor).
//
// Pensado como um guia de acompanhamento que CRESCE a cada semana gerada: o mesmo arquivo é
// refeito com tudo o que existe até agora (semanas liberadas e rascunhos, estes marcados) e
// lista as semanas que ainda não foram geradas. Cada semana segue a mesma ordem, do que o
// professor precisa entender até o que fazer antes, durante e depois:
//   a semana em uma página → ideias-chave → roteiro de acompanhamento (com as mensagens prontas)
//   → perguntas dos alunos → equívocos → sinais de alerta → atividades → gabarito comentado
//   → recursos → pontos a conferir → vídeos → ponte → diferenciação → anexo técnico.
// Seções sem conteúdo não aparecem (nada de "Não informado").

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DIDACTIC_PHASE_LABELS } from "./pedagogy.js";
import { buildCourseProgression, progressionForWeek } from "./curriculum.js";
import { formatDuration, productionVideos } from "./production-xlsx.js";
import { GENERATOR_CREDIT } from "./student-export.js";

// ---------- texto seguro para as fontes padrão do PDF (WinAnsi) ----------

const REPLACEMENTS = [
  [/[•–—]/g, "-"], [/’/g, "'"], [/→|⇒/g, "->"], [/←/g, "<-"], [/≥/g, ">="], [/≤/g, "<="], [/≠/g, "!="],
  [/[✓✔]/g, "ok"], [/ /g, " "], [/\t/g, " "], [/[−]/g, "-"], [/≈/g, "~"]
];
const ENCODABLE = /[\n -~¡-ÿ‘“”…€™ŒœŠšŽžŸ]/u;

function clean(value) {
  let text = localizeUnit(String(value ?? ""));
  for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement);
  // Emojis e símbolos que a fonte do PDF não tem seriam um erro de geração; saem do texto.
  return Array.from(text).filter((char) => ENCODABLE.test(char)).join("").replace(/[ ]{2,}/g, " ").trim();
}

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

const entries = (value) => (Array.isArray(value) ? value.map(display).filter(Boolean) : []);
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const plain = (html) => display(String(html ?? "").replace(/<\/(p|li|h\d|div|tr)>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")).replace(/\s+/g, " ");
const clip = (value, max) => { const text = display(value); return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…`.replace("…", "...") : text; };

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

// ---------- paleta ----------

const navy = rgb(0.105, 0.13, 0.22);
const ink = rgb(0.18, 0.20, 0.24);
const coral = rgb(0.82, 0.30, 0.20);
const muted = rgb(0.38, 0.41, 0.46);
const lightMuted = rgb(0.48, 0.51, 0.55);
const sage = rgb(0.83, 0.90, 0.84);
const pale = rgb(0.97, 0.98, 0.98);
const paleCoral = rgb(0.99, 0.95, 0.93);
const paleGold = rgb(1, 0.97, 0.88);
const paleGreen = rgb(0.93, 0.97, 0.94);
const green = rgb(0.18, 0.42, 0.31);
const white = rgb(1, 1, 1);

const phaseLabel = (value) => DIDACTIC_PHASE_LABELS[value] || display(value);
const reviewStatus = (value) => ({ approved: "Aprovada", "approved-with-review": "Aprovada com pendências", "needs-revision": "Requer revisão", "not-run": "Ainda não executada" }[value] || display(value));
const LETTERS = ["A", "B", "C", "D", "E", "F"];

// Padrões de acompanhamento da turma, sugeridos para qualquer UC (o professor ajusta ao seu calendário).
const ROUTINE = [
  ["Na véspera da abertura", "Aviso no Moodle (fórum de avisos) e vídeo curto no WhatsApp dizendo que a semana abre amanhã.", "WhatsApp + Moodle"],
  ["Dia da abertura", "Publicar o vídeo de abertura e a mensagem da semana; conferir se os links e as datas estão certos.", "Moodle + WhatsApp"],
  ["Meio da semana", "Uma pergunta provocadora no fórum; olhar quem ainda não acessou e chamar no privado.", "Moodle + WhatsApp"],
  ["48 h antes do prazo", "Lembrete curto, sem cobrança, com o que falta e onde pedir ajuda.", "WhatsApp"],
  ["Fechamento", "Síntese da semana, devolutiva da atividade e ponte para a próxima.", "Moodle"],
  ["Depois do prazo", "Ver as questões que mais erraram, anotar o que ajustar no texto e responder as dúvidas pendentes.", "Moodle"]
];
const ALERTS = [
  ["Três dias sem acessar a sala", "Mensagem individual, acolhedora e sem cobrança: perguntar se há algum obstáculo e indicar por onde começar.", "WhatsApp"],
  ["Resposta que só copia o texto", "Devolutiva com uma pergunta de aplicação ao contexto do estudante, em vez de nota seca.", "Moodle"],
  ["A mesma dúvida em vários alunos", "Responder uma vez, em público, no fórum, e anotar o ponto como candidato a ajuste no texto.", "Moodle"],
  ["Atividade atrasada", "Perguntar o que travou e combinar um novo prazo curto e realista.", "WhatsApp"],
  ["Desempenho baixo nas questões", "Apontar a seção do texto que corrige o erro (cada alternativa tem feedback) e oferecer nova tentativa, se o regulamento permitir.", "Moodle"]
];

export async function createMediationMaterialPdf(input, teacherGuides = [], generalPlan = null, options = {}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const width = 595.28;
  const height = 841.89;
  const margin = 48;
  const footerHeight = 34;
  const contentWidth = width - margin * 2;
  const courseTitle = clip(input.title || "Curso", 70);
  let page;
  let y;
  let runningLabel = "MATERIAL DE MEDIAÇÃO";

  const drawPageChrome = () => {
    const pageNumber = pdf.getPageCount();
    page.drawRectangle({ x: 0, y: height - 5, width, height: 5, color: coral });
    page.drawText(clean(`${runningLabel}`).toUpperCase(), { x: margin, y: height - 31, size: 8, font: bold, color: muted });
    page.drawLine({ start: { x: margin, y: footerHeight }, end: { x: width - margin, y: footerHeight }, thickness: 0.45, color: sage });
    page.drawText(clean(`${courseTitle} · uso interno do professor`), { x: margin, y: 21, size: 7.5, font: regular, color: lightMuted });
    const pageLabel = `p. ${pageNumber}`;
    page.drawText(pageLabel, { x: width - margin - regular.widthOfTextAtSize(pageLabel, 7.5), y: 21, size: 7.5, font: regular, color: lightMuted });
  };

  const newPage = () => { page = pdf.addPage([width, height]); y = height - 58; drawPageChrome(); };
  const ensure = (needed = 28) => { if (y < footerHeight + needed) newPage(); };

  const paragraph = (value, opts = {}) => {
    const content = display(value);
    if (!content) return;
    const font = opts.font || regular;
    const size = opts.size || 9.4;
    const lineHeight = opts.lineHeight || size * 1.42;
    const indent = opts.indent || 0;
    for (const line of wrap(content, font, size, contentWidth - indent)) {
      ensure(lineHeight + 8);
      if (line) page.drawText(line, { x: margin + indent, y, size, font, color: opts.color || ink });
      y -= lineHeight;
    }
    y -= opts.after ?? 5;
  };

  const heading = (value, level = 2, opts = {}) => {
    const content = display(value);
    if (!content) return;
    const size = level === 1 ? 18 : level === 2 ? 12.4 : 10.2;
    const lineHeight = level === 1 ? 22 : level === 2 ? 15 : 13;
    const color = level === 1 ? navy : level === 2 ? coral : navy;
    const lines = wrap(content, bold, size, contentWidth);
    ensure(lines.length * lineHeight + (level === 1 ? 28 : 34));
    if (level === 2) y -= 6;
    for (const line of lines) { page.drawText(line, { x: margin, y, size, font: bold, color }); y -= lineHeight; }
    if (level === 1) { page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: width - margin, y: y + 4 }, thickness: 0.8, color: sage }); y -= 7; }
    else y -= opts.after ?? 4;
  };

  const bullet = (value, opts = {}) => {
    const content = display(value);
    if (!content) return;
    const font = opts.font || regular;
    const size = opts.size || 9.2;
    const lineHeight = opts.lineHeight || size * 1.38;
    const indent = opts.indent || 10;
    const lines = wrap(content, font, size, contentWidth - indent - 11);
    lines.forEach((line, index) => {
      ensure(lineHeight + 5);
      page.drawText(index === 0 ? `- ${line}` : line, { x: margin + indent + (index === 0 ? 0 : 11), y, size, font, color: opts.color || ink });
      y -= lineHeight;
    });
    y -= opts.after ?? 2;
  };
  const bullets = (values, opts = {}) => entries(values).forEach((item) => bullet(item, opts));

  // Caixa com título e corpo; corpo longo é cortado em blocos para não passar da página.
  const callout = (title, body, opts = {}) => {
    const titleText = display(title);
    const size = opts.size || 9;
    const lineHeight = size * 1.4;
    const allLines = wrap(clip(body, opts.max || 2200), regular, size, contentWidth - 24);
    const perPage = Math.max(6, Math.floor((height - 58 - footerHeight - 70) / lineHeight));
    for (let start = 0; start < allLines.length || start === 0; start += perPage) {
      const bodyLines = allLines.slice(start, start + perPage);
      const titleHeight = titleText && start === 0 ? 15 : 0;
      const boxHeight = titleHeight + bodyLines.length * lineHeight + 20;
      ensure(boxHeight + 10);
      page.drawRectangle({ x: margin, y: y - boxHeight + 7, width: contentWidth, height: boxHeight, color: opts.background || pale, borderColor: opts.border || sage, borderWidth: 0.6 });
      let boxY = y - 10;
      if (titleHeight) { page.drawText(titleText, { x: margin + 12, y: boxY, size: 9.2, font: bold, color: opts.titleColor || navy }); boxY -= titleHeight; }
      for (const line of bodyLines) { page.drawText(line, { x: margin + 12, y: boxY, size, font: regular, color: opts.color || ink }); boxY -= lineHeight; }
      y -= boxHeight + 8;
      if (!allLines.length) break;
    }
  };

  // Rótulo em negrito seguido do texto, em um bloco só (cartão pergunta/resposta, sinal/ação…).
  const labelled = (pairs, opts = {}) => {
    const size = opts.size || 9;
    const lineHeight = size * 1.4;
    const prepared = pairs.map(([label, value]) => [clean(label), display(value)]).filter(([, value]) => value);
    if (!prepared.length) return;
    const lines = [];
    prepared.forEach(([label, value]) => {
      const labelWidth = bold.widthOfTextAtSize(`${label}: `, size);
      const wrapped = wrap(clip(value, opts.max || 1400), regular, size, contentWidth - 24 - labelWidth);
      wrapped.forEach((line, index) => lines.push({ label: index === 0 ? `${label}: ` : "", labelWidth, text: line }));
    });
    const boxHeight = lines.length * lineHeight + 16;
    ensure(Math.min(boxHeight, 220) + 10);
    // Se o cartão for maior que o restante da página, ele continua na seguinte sem caixa; o texto não se perde.
    const fits = y - boxHeight > footerHeight + 6;
    if (fits) page.drawRectangle({ x: margin, y: y - boxHeight + 7, width: contentWidth, height: boxHeight, color: opts.background || pale, borderColor: opts.border || sage, borderWidth: 0.5 });
    let lineY = y - 8;
    lines.forEach((line) => {
      if (!fits) ensure(lineHeight + 8), (lineY = y);
      if (line.label) page.drawText(line.label, { x: margin + 12, y: lineY, size, font: bold, color: opts.labelColor || navy });
      page.drawText(line.text, { x: margin + 12 + line.labelWidth, y: lineY, size, font: regular, color: ink });
      lineY -= lineHeight;
      if (!fits) y = lineY;
    });
    if (fits) y -= boxHeight + 6;
    else y -= 6;
  };

  const chip = (label, { color = navy, background = pale, x = margin } = {}) => {
    const text = clean(label).toUpperCase();
    const size = 7.2;
    const chipWidth = bold.widthOfTextAtSize(text, size) + 14;
    page.drawRectangle({ x, y: y - 4, width: chipWidth, height: 14, color: background, borderColor: color, borderWidth: 0.6 });
    page.drawText(text, { x: x + 7, y: y, size, font: bold, color });
    return chipWidth;
  };

  const table = (columns, rows, opts = {}) => {
    const size = opts.size || 8.4;
    const lineHeight = size * 1.35;
    const pad = 4;
    const totalWeight = columns.reduce((sum, column) => sum + column.width, 0);
    const widths = columns.map((column) => contentWidth * column.width / totalWeight);
    const drawHeader = () => {
      ensure(lineHeight + pad * 2 + 16);
      const top = y;
      page.drawRectangle({ x: margin, y: top - lineHeight - pad * 2 + 2, width: contentWidth, height: lineHeight + pad * 2 - 2, color: navy });
      let x = margin;
      columns.forEach((column, index) => { page.drawText(clean(column.label), { x: x + pad, y: top - pad - size + 1, size, font: bold, color: white }); x += widths[index]; });
      y = top - lineHeight - pad * 2 + 2;
    };
    drawHeader();
    rows.forEach((cells, rowIndex) => {
      const wrapped = cells.map((cell, index) => wrap(clip(cell, opts.cellMax || 420), index === 0 && opts.boldFirst ? bold : regular, size, widths[index] - pad * 2));
      const rowHeight = Math.max(...wrapped.map((lines) => lines.length)) * lineHeight + pad * 2;
      if (y - rowHeight < footerHeight + 8) { newPage(); drawHeader(); }
      const top = y;
      page.drawRectangle({ x: margin, y: top - rowHeight, width: contentWidth, height: rowHeight, color: rowIndex % 2 ? white : pale });
      page.drawLine({ start: { x: margin, y: top - rowHeight }, end: { x: margin + contentWidth, y: top - rowHeight }, thickness: 0.3, color: sage });
      let x = margin;
      wrapped.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => { if (line) page.drawText(line, { x: x + pad, y: top - pad - size - lineIndex * lineHeight + 1, size, font: index === 0 && opts.boldFirst ? bold : regular, color: ink }); });
        x += widths[index];
      });
      y = top - rowHeight;
    });
    y -= 10;
  };

  // ---------- dados do material ----------

  const explicitScope = Boolean(options.explicitScope);
  const releasedSet = new Set(Array.isArray(options.releasedWeekIndexes) ? options.releasedWeekIndexes : teacherGuides.map((_, index) => index));
  const isReleased = (position) => !explicitScope || releasedSet.has(position);
  const totalWeeks = Math.max(Number(input.weeks) || 0, teacherGuides.length);
  const releasedCount = teacherGuides.filter((_, position) => isReleased(position)).length;
  const draftCount = teacherGuides.length - releasedCount;
  const pendingCount = Math.max(0, totalWeeks - teacherGuides.length);
  const progression = buildCourseProgression(input);
  const productionData = options.production && typeof options.production === "object" ? options.production : null;
  const videos = productionData ? productionVideos(productionData) : [];
  const dateLabel = new Date(options.generatedAt || Date.now()).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const weekTitle = (guide) => {
    const raw = display(guide.title || `Semana ${guide.weekNumber}`);
    const withoutPrefix = raw.replace(new RegExp(`^(?:Semana\\s*${guide.weekNumber}\\s*[-–—:]?\\s*)+`, "iu"), "");
    return withoutPrefix.replace(new RegExp(`\\s*[-–—·:]?\\s*Semana\\s*${guide.weekNumber}\\s*$`, "iu"), "").trim() || `Semana ${guide.weekNumber}`;
  };
  const centralQuestion = (guide) => display(guide.academicPlan?.centralQuestion) || "";
  const toc = [];
  const mark = (label) => toc.push({ label: clean(label), page: pdf.getPageCount() });

  // ---------- capa ----------

  newPage();
  y -= 20;
  page.drawText("Material de Mediação", { x: margin, y, size: 29, font: bold, color: navy });
  y -= 38;
  paragraph(input.title || "Curso sem título", { font: italic, size: 14, color: coral, after: 8 });
  const authorship = [display(input.author), display(input.role), display(input.institution)].filter(Boolean).join(" · ");
  if (authorship) paragraph(`Autoria: ${authorship}`, { size: 9.4, color: ink, after: 2 });
  paragraph(GENERATOR_CREDIT, { size: 8.6, color: muted, after: 6 });
  paragraph(`Público: ${display(input.audience) || "não informado"}  ·  Nível: ${display(input.level) || "não informado"}  ·  Atualizado em ${dateLabel}`, { size: 9, color: muted, after: 14 });

  const cards = [[String(teacherGuides.length), `semana(s) neste material`], [String(releasedCount), explicitScope ? "liberada(s)" : "incluída(s)"], [String(draftCount), "rascunho(s) em revisão"], [String(pendingCount), "ainda a gerar"]];
  const cardWidth = (contentWidth - 3 * 8) / 4;
  ensure(70);
  cards.forEach(([value, label], index) => {
    const x = margin + index * (cardWidth + 8);
    page.drawRectangle({ x, y: y - 52, width: cardWidth, height: 56, color: index === 2 && draftCount ? paleGold : index === 3 && pendingCount ? paleCoral : paleGreen, borderColor: sage, borderWidth: 0.6 });
    page.drawText(value, { x: x + 10, y: y - 26, size: 22, font: bold, color: navy });
    page.drawText(clean(label), { x: x + 10, y: y - 42, size: 7.6, font: regular, color: muted });
  });
  y -= 76;

  callout("Como usar este material", `Este guia é para quem acompanha a turma, mesmo sem ter escrito o texto. Ele cresce a cada semana gerada: gere de novo o PDF depois de cada semana e o arquivo traz tudo o que já existe, com as semanas em rascunho marcadas e as que faltam listadas. Em cada semana, leia primeiro "A semana em uma página"; depois siga o roteiro de acompanhamento (antes, durante e depois), que já traz as mensagens prontas de WhatsApp e Moodle. Os arquivos .aula.json são do estudante; as webpráticas têm roteiro DOCX próprio.`, { background: paleGold, border: rgb(0.9, 0.78, 0.45), size: 9.2 });
  if (!teacherGuides.length) callout("Nenhuma semana gerada ainda", "Assim que a primeira semana for gerada, ela entra aqui, com o roteiro de acompanhamento e as explicações para o professor.", { background: paleCoral, border: coral });

  if (input.objectives?.length) { heading("Objetivos gerais da UC", 2); bullets(input.objectives); }
  if (input.academicProfile?.discipline) {
    heading("Perfil acadêmico configurado", 2);
    paragraph(`Área: ${display(input.academicProfile.discipline)} · profundidade: ${display(input.academicProfile.depth) || "a definir"} · metas por semana: ${input.academicProfile.targetWords || "a definir"} palavras, ${input.academicProfile.minimumSections || "a definir"} seções mínimas, ${input.academicProfile.minimumReferences || 0} referências mínimas.`, { color: muted });
  }
  if (generalPlan?.totals) {
    const totals = generalPlan.totals;
    const target = Number(totals.targetHours || 0);
    const calculated = Number(totals.calculatedHours || 0);
    if (target || calculated) paragraph(`Carga: meta do aluno ${target.toFixed(1)} h · calculada até agora ${calculated.toFixed(1)} h (diferença de ${Number(totals.varianceMinutes || 0).toFixed(0)} min). A carga só fecha quando todas as semanas existirem.`, { color: muted });
  }

  // ---------- sumário (preenchido no fim) e mapa da UC ----------

  newPage();
  heading("Sumário", 1);
  const tocPage = page;
  const tocTop = y;
  const tocEntries = 3 + (videos.some((video) => video.week === "UC") ? 1 : 0) + teacherGuides.length + (pendingCount ? 1 : 0);
  y -= tocEntries * 15 + 12;

  mark("Mapa da UC");
  heading("Mapa da UC", 2);
  paragraph("Onde cada semana está: tema, pergunta central, o que o estudante entrega e em que pé está o material.", { color: muted });
  const mapRows = Array.from({ length: totalWeeks }, (_, position) => {
    const guide = teacherGuides[position];
    if (!guide) {
      const planned = progressionForWeek(input, position, progression);
      return [`Semana ${position + 1}`, display(planned?.theme) || "a definir", display(planned?.centralQuestion) || "", "", "A gerar"];
    }
    const activity = list(guide.activities)[0];
    const evidence = display(activity?.title) || entries(guide.learnerEvidence)[0] || "";
    return [`Semana ${position + 1}`, weekTitle(guide), clip(centralQuestion(guide) || guide.purpose, 170), clip(evidence, 90), isReleased(position) ? "Liberada" : "Rascunho"];
  });
  table([{ label: "Semana", width: 10 }, { label: "Tema", width: 26 }, { label: "Pergunta central", width: 32 }, { label: "Entrega / evidência", width: 20 }, { label: "Situação", width: 12 }], mapRows, { boldFirst: true });

  mark("Ritmo de acompanhamento e sinais de alerta");
  heading("Ritmo de acompanhamento da turma", 2);
  paragraph("Padrão sugerido para qualquer semana; ajuste os dias ao calendário da sua turma. Cada semana, adiante, traz as mensagens prontas para cada momento.", { color: muted });
  table([{ label: "Momento", width: 20 }, { label: "O que fazer", width: 60 }, { label: "Canal", width: 20 }], ROUTINE, { boldFirst: true });
  heading("Sinais de alerta e o que fazer", 2);
  table([{ label: "Sinal", width: 26 }, { label: "Como agir", width: 58 }, { label: "Canal", width: 16 }], ALERTS, { boldFirst: true });
  paragraph("WhatsApp serve para acolher e lembrar; o Moodle é o registro (avisos, fórum, devolutiva). O que pede combinado com a turma entra no Moodle.", { color: muted });

  const courseVideos = videos.filter((video) => video.week === "UC");
  if (courseVideos.length) {
    mark("Vídeos da UC");
    heading("Vídeos da UC", 2);
    table([{ label: "Vídeo", width: 30 }, { label: "Plataforma", width: 16 }, { label: "Duração", width: 10 }, { label: "Como produzir", width: 20 }, { label: "Cenário", width: 24 }], courseVideos.map((video) => [video.kind, video.platform, formatDuration(video.seconds), video.mode, video.setting]), { boldFirst: true });
  }

  // ---------- semanas ----------

  const weekVideos = (number) => videos.filter((video) => video.week === number);

  const formatActivity = (activity) => {
    labelled([
      ["Atividade", `${display(activity.title) || "Atividade"}${activity.durationMinutes ? ` (${activity.durationMinutes} min)` : ""}${activity.required === false ? " · complementar" : ""}`],
      ["O que pedir", activity.instructions],
      ["Evidência esperada", activity.evidence],
      ["Critérios de devolutiva", entries(activity.criteria).join("; ")],
      ["Como dar o retorno", activity.feedback]
    ]);
  };

  const weekSection = (guide, position) => {
    const number = guide.weekNumber || position + 1;
    const released = isReleased(position);
    const title = weekTitle(guide);
    runningLabel = `Semana ${number} · ${clip(title, 60)}`;
    newPage();
    mark(`Semana ${number} · ${title}`);

    // Faixa de título.
    const titleLines = wrap(title, bold, 17, contentWidth - 28);
    const bandHeight = 30 + titleLines.length * 21;
    page.drawRectangle({ x: margin, y: y - bandHeight + 14, width: contentWidth, height: bandHeight, color: navy });
    page.drawText(`SEMANA ${number}`, { x: margin + 14, y: y - 4, size: 8, font: bold, color: rgb(0.95, 0.75, 0.68) });
    let lineY = y - 24;
    titleLines.forEach((line) => { page.drawText(line, { x: margin + 14, y: lineY, size: 17, font: bold, color: white }); lineY -= 21; });
    y -= bandHeight + 6;
    const statusWidth = chip(released ? (explicitScope ? "Liberada" : "Incluída") : "Rascunho em revisão", released ? { color: green, background: paleGreen } : { color: coral, background: paleGold });
    const minutes = list(guide.timePlan?.items).reduce((sum, item) => sum + (Number(item.minutes || item.learnerMinutes) || 0), 0);
    const info = [minutes ? `carga estimada do aluno: ${Math.round(minutes / 6) / 10} h` : "", guide.webPractices?.length ? "tem webprática" : ""].filter(Boolean).join("  ·  ");
    if (info) page.drawText(clean(info), { x: margin + statusWidth + 12, y, size: 8.4, font: regular, color: muted });
    y -= 22;
    if (!released) callout("Semana ainda não liberada", "Este conteúdo é um rascunho: pode mudar depois da sua conferência. Use as orientações como preparação, não como versão final.", { background: paleGold, border: rgb(0.9, 0.78, 0.45), size: 8.8 });

    // 1. A semana em uma página.
    heading("A semana em uma página", 2);
    if (centralQuestion(guide)) labelled([["Pergunta central", centralQuestion(guide)]], { background: paleGreen });
    if (guide.weekSummary) paragraph(guide.weekSummary);
    else paragraph(guide.purpose, { color: ink });
    if (!guide.weekSummary) callout("Resumo para o professor ainda não gerado", "Na prévia da semana, use “Completar explicações do Material de Mediação” para gerar o resumo, as perguntas dos alunos, os equívocos comuns e os sinais de alerta desta semana.", { background: paleCoral, border: coral, size: 8.8 });
    if (guide.objectives?.length) { paragraph("O estudante, ao fim da semana, deve ser capaz de:", { font: bold, size: 9.2, after: 2 }); bullets(guide.objectives); }
    if (guide.keyIdeas?.length) { heading("Ideias-chave para levar", 3); bullets(guide.keyIdeas); }

    // 1b. Como aplicar a metodologia ativa da semana.
    const mg = object(guide.methodologyGuide);
    if (Object.keys(mg).length) {
      heading(`Como aplicar a metodologia: ${display(mg.method) || "metodologia ativa"}`, 2);
      if (mg.whatItIs) labelled([["O que é", mg.whatItIs], ["Por que nesta semana", mg.whyHere]], { background: paleGreen });
      if (list(mg.beforeTheWeek).length) { paragraph("Antes de abrir a semana", { font: bold, size: 9.4, color: navy, after: 2 }); bullets(mg.beforeTheWeek); }
      if (list(mg.phases).length) {
        paragraph("Passo a passo", { font: bold, size: 9.4, color: navy, after: 2 });
        list(mg.phases).forEach((phase, position) => labelled([
          ["Etapa", `${position + 1}. ${display(phase.name)}${phase.when ? ` · ${display(phase.when)}` : ""}`],
          ["Para quê", phase.goal],
          ["Professor", entries(phase.teacherActions).join(" · ")],
          ["Estudante", entries(phase.studentActions).join(" · ")],
          ["Usa", entries(phase.materials).join(" · ")]
        ], { background: white, max: 1400 }));
      }
      if (mg.studentInstructions) labelled([["Texto para o aluno (Moodle)", mg.studentInstructions]], { background: paleGold, max: 1600 });
      if (list(mg.monitoring).length) {
        paragraph("Como acompanhar se está funcionando", { font: bold, size: 9.4, color: navy, after: 2 });
        list(mg.monitoring).forEach((item) => labelled([["Indicador", item.indicator], ["Onde ver", item.howToCheck], ["Quando", item.when], ["Se estiver baixo", item.ifLow]], { background: white }));
      }
      if (list(mg.successSignals).length) { paragraph("Sinais de que deu certo", { font: bold, size: 9.4, color: navy, after: 2 }); bullets(mg.successSignals); }
      if (list(mg.warningSignals).length) {
        paragraph("Sinais de alerta e o que fazer", { font: bold, size: 9.4, color: navy, after: 2 });
        list(mg.warningSignals).forEach((item) => labelled([["Sinal", item.signal], ["O que fazer", item.action]], { background: paleCoral, border: rgb(0.93, 0.78, 0.72), labelColor: coral }));
      }
      const assess = object(mg.assessment);
      if (assess.howToAssess || list(assess.criteria).length) {
        paragraph("Como avaliar a aprendizagem com esta metodologia", { font: bold, size: 9.4, color: navy, after: 2 });
        if (assess.howToAssess) paragraph(assess.howToAssess);
        list(assess.criteria).forEach((item) => labelled([["Critério", item.criterion], ["Evidência", item.evidence]], { background: white }));
      }
      if (list(mg.pitfalls).length) { paragraph("Erros comuns de quem aplica pela primeira vez", { font: bold, size: 9.4, color: navy, after: 2 }); bullets(mg.pitfalls); }
      const adapt = object(mg.adaptations);
      if (adapt.ead || adapt.synchronous || adapt.largeClass) labelled([["100% a distância", adapt.ead], ["Encontro ao vivo / webprática", adapt.synchronous], ["Turma grande ou pouco participativa", adapt.largeClass]], { background: white });
    } else if (guide.activeMethodology?.label || guide.methodologyRequested) {
      callout("Guia da metodologia ainda não gerado", "Na prévia da semana, use “Gerar o guia de aplicação da metodologia” para receber o passo a passo, como acompanhar e como avaliar.", { background: paleGold, border: rgb(0.9, 0.78, 0.45), size: 8.8 });
    }

    // 2. Roteiro de acompanhamento.
    heading("Roteiro de acompanhamento: antes, durante e depois", 2);
    const pendingResources = list(guide.resourceNotes).filter((resource) => !resource.href || /suggested|a conferir|needs/i.test(display(resource.verificationStatus))).length;
    const weekMediaIds = weekVideos(number);
    const before = [
      pendingResources ? `Conferir os ${pendingResources} recurso(s) ainda sem link ou sem verificação (veja “Recursos” abaixo).` : "Conferir se os links dos recursos continuam abrindo.",
      weekMediaIds.length ? `Ter prontos os vídeos da semana: ${weekMediaIds.map((video) => video.kind.toLowerCase()).join(", ")}.` : "Se for usar vídeo de abertura, gravar ou gerar antes de publicar.",
      guide.webPractices?.length ? "Confirmar data, horário e materiais da webprática." : "",
      "Ler “A semana em uma página” e as perguntas prováveis dos alunos."
    ].filter(Boolean);
    paragraph("Antes de abrir", { font: bold, size: 9.4, color: navy, after: 2 });
    bullets(before);

    const stops = list(guide.mediationStops);
    const messages = [...list(guide.mediationMessages?.whatsapp).map((item) => ({ ...item, channel: "WhatsApp" })), ...list(guide.mediationMessages?.moodle).map((item) => ({ ...item, channel: "Moodle" }))];
    const used = new Set();
    paragraph("Durante a semana", { font: bold, size: 9.4, color: navy, after: 2 });
    stops.forEach((stop) => {
      const own = messages.filter((message) => display(message.relatedId) && display(message.relatedId) === display(stop.id));
      own.forEach((message) => used.add(message));
      labelled([
        ["Momento", [display(stop.timing), display(stop.title) !== display(stop.timing) ? display(stop.title) : ""].filter(Boolean).join(" · ") || "Durante a semana"],
        ["Para quê", stop.purpose],
        ["O que observar", stop.studentNeed],
        ["Intenção do professor", stop.teacherIntent],
        ...own.map((message) => [`Mensagem ${message.channel}`, message.text || message.message || message.body])
      ], { background: white, max: 1200 });
    });
    const extra = messages.filter((message) => !used.has(message));
    extra.forEach((message) => labelled([[`${message.channel} · ${display(message.timing) || "mensagem"}`, message.text || message.message || message.body], ["Para quê", message.purpose]], { background: white }));
    if (guide.mediationMessages) paragraph("As mensagens estão prontas, mas ajuste nomes, datas e links antes de enviar. Emojis não aparecem neste PDF; acrescente-os ao enviar, se quiser.", { size: 8.2, color: muted });

    paragraph("Depois do prazo", { font: bold, size: 9.4, color: navy, after: 2 });
    bullets([
      "Dar a devolutiva da atividade com um ponto forte e um próximo passo (critérios em “Atividades”).",
      guide.summativeAssessment?.questions?.length ? "Ver quais questões mais erraram e usar o “Gabarito comentado” para orientar quem errou." : "",
      "Anotar as dúvidas que se repetiram: elas dizem o que ajustar no texto da próxima edição."
    ].filter(Boolean));

    // 3. Perguntas dos alunos, equívocos, perguntas de mediação, sinais.
    if (guide.studentFAQ?.length) {
      heading("Perguntas prováveis dos alunos", 2);
      guide.studentFAQ.forEach((item) => labelled([["Pergunta", item.question], ["Resposta", `${display(item.answer)}${item.sectionRef ? ` (seção ${display(item.sectionRef)})` : ""}`]], { background: white }));
    }
    if (guide.commonMisconceptions?.length) {
      heading("Equívocos comuns e como corrigir", 2);
      guide.commonMisconceptions.forEach((item) => labelled([["Equívoco", item.misconception], ["Por que acontece", item.whyItHappens], ["Como corrigir", item.howToAddress]], { background: paleCoral, border: rgb(0.93, 0.78, 0.72), labelColor: coral }));
    }
    if (guide.mediationQuestions?.length) { heading("Perguntas para provocar o fórum ou o WhatsApp", 2); bullets(guide.mediationQuestions); }
    if (guide.interventions?.length) {
      heading("Quando o aluno trava: sinais e intervenções", 2);
      guide.interventions.forEach((item) => labelled([["Sinal", item.signal], ["O que fazer", item.action], ["Mensagem pronta", item.message]], { background: white }));
    }
    if (guide.sensitivePoints?.length) { heading("Pontos delicados do texto", 2); paragraph("Números, datas e casos que pedem cuidado ao falar deles com a turma.", { color: muted, after: 2 }); bullets(guide.sensitivePoints); }

    // 4. Atividades, diagnóstico e paradas.
    const hasDiagnostic = guide.diagnostic && (guide.diagnostic.prompt || guide.diagnostic.question || guide.diagnostic.purpose);
    if (hasDiagnostic || guide.formativeChecks?.length || list(guide.activities).length) {
      heading("Atividades, diagnóstico e paradas", 2);
      if (hasDiagnostic) labelled([["Diagnóstico de entrada", guide.diagnostic.prompt || guide.diagnostic.question || guide.diagnostic.purpose], ["Evidência esperada", guide.diagnostic.expectedEvidence || entries(guide.diagnostic.expectedEvidences).join("; ")], ["Como devolver", guide.diagnostic.feedback]], { background: white });
      list(guide.formativeChecks).forEach((check) => labelled([[`Parada · ${display(check.moment) || "durante a leitura"}`, check.prompt || check.question], ["Evidência esperada", check.expectedEvidence], ["Retorno", check.feedback], ["Se errar", check.action]], { background: white }));
      list(guide.activities).forEach(formatActivity);
      if (guide.selfAssessment?.prompts?.length) labelled([["Autoavaliação do estudante", entries(guide.selfAssessment.prompts).join(" · ")]], { background: white });
    }

    // 5. Gabarito comentado.
    const questions = list(guide.summativeAssessment?.questions);
    if (questions.length) {
      heading("Gabarito comentado", 2);
      paragraph(`${display(guide.summativeAssessment.title) || "Atividade avaliativa"} — ${display(guide.summativeAssessment.format) || `${questions.length} questões`}. A alternativa correta está marcada; cada alternativa errada tem o retorno que o estudante recebe.`, { color: muted });
      questions.forEach((question, questionIndex) => {
        const options = list(question.options);
        const correct = Number.isInteger(question.answer) ? question.answer : -1;
        const feedback = list(question.feedbackByOption);
        heading(`Questão ${questionIndex + 1}${question.objective ? ` — ${clip(question.objective, 80)}` : ""}`, 3, { after: 2 });
        paragraph(question.q || question.question, { font: bold, size: 9.2, after: 2 });
        options.forEach((option, optionIndex) => bullet(`${LETTERS[optionIndex] || optionIndex + 1}) ${display(option)}${optionIndex === correct ? "  (CORRETA)" : ""}`, { font: optionIndex === correct ? bold : regular, color: optionIndex === correct ? green : ink, size: 8.8, after: 0 }));
        if (question.explanation) paragraph(`Por quê: ${display(question.explanation)}`, { size: 8.8, color: muted, after: 2 });
        const wrongFeedback = feedback.map((text, optionIndex) => ({ text: display(text), optionIndex })).filter((item) => item.text && item.optionIndex !== correct);
        if (wrongFeedback.length) { paragraph("Retorno a quem escolheu:", { font: bold, size: 8.4, color: muted, after: 1 }); wrongFeedback.forEach((item) => bullet(`${LETTERS[item.optionIndex]}: ${item.text}`, { size: 8.4, color: muted, after: 0 })); }
        y -= 4;
      });
      if (guide.assessmentNotes?.length) { heading("Como ler o desempenho", 3); bullets(guide.assessmentNotes); }
    }

    // 6. Recursos.
    if (guide.resourceNotes?.length) {
      heading("Recursos no ponto de uso", 2);
      paragraph("Onde cada recurso entra no texto, o que observar e em que pé está a verificação. O estudante vê só o recurso e a frase de apresentação.", { color: muted });
      table([{ label: "Recurso", width: 28 }, { label: "Onde entra", width: 15 }, { label: "O que observar", width: 39 }, { label: "Situação", width: 18 }], guide.resourceNotes.map((resource) => [
        `${display(resource.kind)}: ${display(resource.title)}${resource.durationMinutes ? ` (${resource.durationMinutes} min)` : ""}${resource.href ? `\n${clip(resource.href, 60)}` : ""}`,
        [resource.sectionNumber && resource.sectionNumber !== "a definir" ? `Seção ${resource.sectionNumber}` : "", resource.required ? "obrigatório" : "complementar"].filter(Boolean).join(" · "),
        display(resource.guidingQuestion || resource.bridgeParagraph || resource.pedagogicalUse),
        `${resource.href ? "Com link" : "Sem link"} · ${/verified/.test(display(resource.verificationStatus)) ? "verificado" : "a conferir"}`
      ]), { size: 8, cellMax: 260 });
    }

    // 7. Pontos a conferir antes de publicar.
    const claims = list(guide.claimEvidence).filter((claim) => claim.verificationStatus !== "verified");
    const issues = list(guide.academicReview?.issues);
    const failed = list(guide.qualityReview?.checks).filter((check) => !check.pass);
    if (claims.length || issues.length || failed.length) {
      heading("Pontos a conferir antes de publicar", 2);
      if (claims.length) { paragraph("Afirmações do texto sem fonte vinculada:", { font: bold, size: 9.2, after: 2 }); claims.forEach((claim) => bullet(`${display(claim.claim)}${claim.sectionNumber ? ` (seção ${display(claim.sectionNumber)})` : ""}`, { color: coral })); }
      if (issues.length) { paragraph(`Revisão acadêmica (${reviewStatus(guide.academicReview.status) || "pendente"}):`, { font: bold, size: 9.2, after: 2 }); issues.forEach((issue) => bullet(`${String(issue.severity || "revisar").toUpperCase()}: ${display(issue.description)}${issue.suggestedRepair ? ` - ${display(issue.suggestedRepair)}` : ""}`)); }
      if (failed.length) { paragraph("Checklist pedagógico, itens pendentes:", { font: bold, size: 9.2, after: 2 }); failed.forEach((check) => bullet(display(check.label), { color: coral, size: 8.8 })); }
    }

    // 8. Produção audiovisual.
    if (weekMediaIds.length) {
      heading("Vídeos desta semana (planilha de produção)", 2);
      table([{ label: "ID", width: 14 }, { label: "Vídeo", width: 30 }, { label: "Duração", width: 10 }, { label: "Como produzir", width: 20 }, { label: "Título", width: 26 }], weekMediaIds.map((video) => [video.id, video.kind, formatDuration(video.seconds), video.mode, video.title]), { size: 8 });
    }

    // 9. Ponte, diferenciação, acessibilidade, webprática.
    const spiral = object(guide.spiralReview);
    const previous = entries(spiral.previousConceptsReviewed);
    const next = entries(spiral.preparationForNextWeek);
    const newConcepts = entries(spiral.newConcepts);
    if (previous.length || next.length || newConcepts.length || spiral.projectMilestone) {
      heading("Ponte entre as semanas", 2);
      if (previous.length) { paragraph("Retoma da semana anterior:", { font: bold, size: 9.2, after: 2 }); bullets(previous); }
      if (newConcepts.length) { paragraph("Conceitos novos:", { font: bold, size: 9.2, after: 2 }); bullets(newConcepts); }
      if (next.length) { paragraph("Prepara para a próxima:", { font: bold, size: 9.2, after: 2 }); bullets(next); }
      if (spiral.projectMilestone) paragraph(`Marco do projeto: ${display(spiral.projectMilestone)}`);
    }
    const trails = [["Apoio", guide.differentiation?.support], ["Percurso padrão", guide.differentiation?.standard], ["Aprofundamento", guide.differentiation?.extension]].filter(([, items]) => list(items).length);
    if (trails.length) { heading("Trilhas de estudo", 2); trails.forEach(([label, items]) => { paragraph(label, { font: bold, size: 9.2, after: 2 }); bullets(list(items).map((item) => display(item.instructions || item.title || item))); }); }
    const accessibility = Object.entries(object(guide.accessibility)).filter(([, value]) => display(value));
    if (accessibility.length) { heading("Acessibilidade", 2); accessibility.forEach(([key, value]) => bullet(`${key}: ${display(value)}`)); }
    if (guide.webPractices?.length) {
      heading("Webprática desta semana", 2);
      guide.webPractices.forEach((practice) => {
        labelled([
          ["Sessão", practice.title || "Webprática"],
          ["Agenda", [practice.weekNumber ? `Semana ${practice.weekNumber}` : "", practice.date, practice.startTime && practice.endTime ? `${practice.startTime}-${practice.endTime}` : ""].filter(Boolean).join(" · ")],
          ["Objetivo", practice.objective], ["Problema", practice.problem || practice.context], ["Produto", practice.product || practice.delivery || practice.deliverable],
          ["Duração", practice.durationMinutes ? `${practice.durationMinutes} minutos` : ""], ["Plano B", practice.fallbackPlan]
        ], { background: white });
        if (practice.steps?.length) bullets(practice.steps.map((step) => `${display(step.title) || "Etapa"}: ${display(step.instructions || step.description)}${step.minutes ? ` (${step.minutes} min)` : ""}`), { size: 8.8 });
      });
    }

    // 10. Anexo técnico.
    const arc = object(guide.didacticArc);
    const technical = [];
    if (arc.label) technical.push(`Arco didático: ${display(arc.label)}${arc.rationale ? ` - ${display(arc.rationale)}` : ""}`);
    const sequence = list(arc.sequence).map(phaseLabel).filter(Boolean);
    if (sequence.length) technical.push(`Percurso: ${sequence.join(" -> ")}`);
    if (technical.length || guide.alignmentMatrix?.length || guide.workloadAdvice?.length) {
      heading("Anexo técnico da semana", 2);
      paragraph("Para quem quer ver a estrutura por trás do texto; não é necessário para acompanhar a turma.", { color: muted, size: 8.6 });
      technical.forEach((line) => paragraph(line, { size: 8.6, color: muted }));
      if (guide.alignmentMatrix?.length) table([{ label: "Objetivo", width: 40 }, { label: "Seções", width: 12 }, { label: "Evidência", width: 24 }, { label: "Questões", width: 24 }], guide.alignmentMatrix.map((row) => [display(row.objective), entries(row.contentSections).join(", "), display(row.evidence), entries(row.assessmentQuestions).join(", ")]), { size: 8, cellMax: 200 });
      if (guide.workloadAdvice?.length) { paragraph("Ajustes de carga sugeridos:", { font: bold, size: 8.8, after: 2 }); bullets(guide.workloadAdvice, { size: 8.6 }); }
    }
  };

  teacherGuides.forEach(weekSection);
  runningLabel = "MATERIAL DE MEDIAÇÃO";

  if (pendingCount) {
    newPage();
    mark("Semanas ainda não geradas");
    heading("Semanas ainda não geradas", 1);
    paragraph("Quando cada uma for gerada, entra neste material com o mesmo roteiro das anteriores. O tema abaixo é o previsto no planejamento do curso.", { color: muted });
    table([{ label: "Semana", width: 12 }, { label: "Tema previsto", width: 38 }, { label: "Pergunta central prevista", width: 50 }], Array.from({ length: pendingCount }, (_, offset) => {
      const position = teacherGuides.length + offset;
      const planned = progressionForWeek(input, position, progression);
      return [`Semana ${position + 1}`, display(planned?.theme) || "a definir", display(planned?.centralQuestion) || ""];
    }), { boldFirst: true });
  }

  // Sumário: desenhado agora que se sabe em que página cada parte caiu.
  let tocY = tocTop;
  toc.slice(0, tocEntries).forEach((entry) => {
    const pageLabel = String(entry.page);
    const labelText = clip(entry.label, 90);
    tocPage.drawText(labelText, { x: margin, y: tocY, size: 9.6, font: regular, color: ink });
    const textWidth = regular.widthOfTextAtSize(labelText, 9.6);
    const numberWidth = regular.widthOfTextAtSize(pageLabel, 9.6);
    const dotsWidth = contentWidth - textWidth - numberWidth - 12;
    if (dotsWidth > 10) tocPage.drawText(".".repeat(Math.floor(dotsWidth / regular.widthOfTextAtSize(".", 9.6))), { x: margin + textWidth + 6, y: tocY, size: 9.6, font: regular, color: sage });
    tocPage.drawText(pageLabel, { x: width - margin - numberWidth, y: tocY, size: 9.6, font: bold, color: navy });
    tocY -= 15;
  });

  return Buffer.from(await pdf.save());
}

// Alias técnico temporário para consumidores antigos da API interna.
export const createTeacherGuidePdf = createMediationMaterialPdf;
