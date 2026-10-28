// Planilha de produção audiovisual (xlsx) e roteiros em Markdown.
// Módulo sem dependências de Node: serve ao navegador (public/production-xlsx.js, que é
// uma cópia deste arquivo, como student-export.js) e ao servidor (ZIP). O xlsx é montado à
// mão (OOXML mínimo) sobre o JSZip que o chamador entrega.

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

export const PRODUCTION_STATUS = ["Pendente", "Roteiro revisado", "Em produção", "Gravado / gerado", "Publicado"];
export const PRODUCTION_MODES = ["HeyGen (avatar)", "Gravação própria", "Slides + voz clonada", "A definir"];
const DEFAULT_MODE = { moodle: "HeyGen (avatar)", whatsapp: "Gravação própria", slides: "Slides + voz clonada" };

const pad = (number) => String(number).padStart(2, "0");

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

export function hasProduction(production) {
  const data = object(production);
  return Boolean(object(data.course).videos?.length || Object.keys(object(data.weeks)).length);
}

function weekEntries(production) {
  return Object.entries(object(object(production).weeks))
    .map(([index, value]) => ({ index: Number(index), value: object(value) }))
    .filter((entry) => Number.isInteger(entry.index) && entry.index >= 0)
    .sort((a, b) => a.index - b.index);
}

// Uma linha por vídeo, na ordem de produção: UC primeiro, depois semana a semana.
export function productionVideos(production) {
  const videos = [];
  const course = object(object(production).course);
  const courseIds = { opening: "UC-ABERTURA", whatsapp: "UC-WHATS", closing: "UC-ENCERRAMENTO" };
  const courseNames = { opening: "Apresentação da UC", whatsapp: "UC no WhatsApp", closing: "Encerramento da UC" };
  list(course.videos).forEach((video) => {
    const key = text(video.key);
    videos.push({
      id: courseIds[key] || `UC-${videos.length + 1}`, week: "UC", kind: courseNames[key] || text(video.title),
      platform: text(video.platform) || (key === "whatsapp" ? "WhatsApp" : "Moodle"),
      seconds: video.durationSeconds, mode: key === "whatsapp" ? DEFAULT_MODE.whatsapp : DEFAULT_MODE.moodle,
      setting: text(video.setting), title: text(video.title), speech: text(video.speech), message: text(video.message) || text(video.description),
      notes: text(video.postProduction), segments: list(video.segments), kindKey: key || "video"
    });
  });
  weekEntries(production).forEach(({ index, value }) => {
    const id = `S${pad(index + 1)}`;
    const week = index + 1;
    const moodle = object(value.moodleVideo);
    if (list(moodle.segments).length) {
      videos.push({
        id: `${id}-MOODLE`, week, kind: "Abertura da semana", platform: "Moodle", seconds: moodle.durationSeconds, mode: DEFAULT_MODE.moodle,
        setting: text(moodle.setting) || text(value.setting), title: text(moodle.title), speech: text(moodle.speech),
        message: [text(moodle.description), moodle.linkToPreviousWeek ? `Retomada: ${text(moodle.linkToPreviousWeek)}` : "", moodle.linkToNextWeek ? `Gancho: ${text(moodle.linkToNextWeek)}` : ""].filter(Boolean).join("\n"),
        notes: text(moodle.postProduction), segments: list(moodle.segments), kindKey: "moodle"
      });
    }
    const whats = object(value.whatsappVideo);
    if (list(whats.segments).length) {
      videos.push({
        id: `${id}-WHATS`, week, kind: "Vídeo curto de WhatsApp", platform: "WhatsApp", seconds: whats.durationSeconds, mode: DEFAULT_MODE.whatsapp,
        setting: text(whats.setting) || text(value.setting), title: text(whats.title), speech: text(whats.speech), message: text(whats.message),
        notes: text(whats.postProduction), segments: list(whats.segments), kindKey: "whatsapp"
      });
    }
    const slides = object(value.slides);
    if (list(slides.slides).length) {
      const tts = list(slides.ttsNotes).map((note) => `${text(note.term)} → ${text(note.say)}${note.pause ? ` (${text(note.pause)})` : ""}`).join("\n");
      videos.push({
        id: `${id}-SLIDES`, week, kind: "Slides + narração (voz clonada)", platform: "Moodle (vídeo de slides)", seconds: Math.round(Number(slides.estimatedMinutes || 0) * 60),
        mode: DEFAULT_MODE.slides, setting: "Slides em tela cheia, sem câmera", title: text(slides.title), speech: text(slides.narrationText), message: text(slides.description),
        notes: tts, segments: [], kindKey: "slides"
      });
    }
  });
  return videos;
}

export function productionSheets(production, meta = {}) {
  const videos = productionVideos(production);
  const weeks = weekEntries(production);
  const sheets = [];

  sheets.push({
    name: "Leia-me",
    columns: [{ header: "Planilha de produção audiovisual", width: 110 }],
    rows: [
      [`UC: ${text(meta.title) || "—"}`],
      [`Gerada em ${new Date().toLocaleDateString("pt-BR")} pelo Gerador de Aulas. Cada semana liberada acrescenta linhas; baixe de novo a planilha depois de gerar a próxima.`],
      [""],
      ["ABA «Produção»: uma linha por vídeo (UC e cada semana). Escolha em «Como produzir» se será avatar HeyGen, gravação própria ou slides com a voz clonada; acompanhe o andamento em «Status». A fala completa está na coluna I, pronta para colar no HeyGen ou ler no teleprompter."],
      ["ABA «Roteiros»: o mesmo roteiro quebrado em cenas, com tempo, direção de cena, fala e texto na tela."],
      ["ABA «Slides»: a apresentação de cada semana, slide a slide (título, tópicos, visual sugerido e a narração do slide)."],
      ["ABA «Narração»: o texto corrido da narração de cada apresentação, para a voz clonada, com notas de pronúncia."],
      [""],
      ["Revise cada roteiro antes de gravar ou gerar o avatar: os textos foram escritos por IA a partir do texto aprovado da semana e precisam passar pelo seu olhar (fatos, nomes, tom)."]
    ],
    wrap: true,
    plain: true
  });

  sheets.push({
    name: "Produção",
    columns: [
      { header: "ID", width: 16 }, { header: "Semana", width: 9, center: true }, { header: "Vídeo", width: 28 }, { header: "Plataforma", width: 18 },
      { header: "Duração", width: 10, center: true }, { header: "Como produzir", width: 22 }, { header: "Cenário", width: 34 }, { header: "Título", width: 34 },
      { header: "Roteiro completo (fala)", width: 80 }, { header: "Descrição / mensagem de acompanhamento", width: 50 }, { header: "Status", width: 18 },
      { header: "Responsável", width: 16 }, { header: "Data prevista", width: 14 }, { header: "Link do vídeo", width: 30 }, { header: "Observações de produção", width: 50 }
    ],
    rows: videos.map((video) => [video.id, video.week, video.kind, video.platform, formatDuration(video.seconds), video.mode, video.setting, video.title, video.speech, video.message, PRODUCTION_STATUS[0], "", "", "", video.notes]),
    validations: [{ column: 5, values: PRODUCTION_MODES }, { column: 10, values: PRODUCTION_STATUS }]
  });

  sheets.push({
    name: "Roteiros",
    columns: [
      { header: "ID", width: 16 }, { header: "Semana", width: 9, center: true }, { header: "Vídeo", width: 28 }, { header: "Tempo", width: 12, center: true },
      { header: "Cena / direção", width: 50 }, { header: "Fala", width: 80 }, { header: "Texto na tela", width: 34 }
    ],
    rows: videos.flatMap((video) => video.segments.map((segment) => [video.id, video.week, video.kind, text(segment.time), text(segment.scene), text(segment.speech), text(segment.onScreen)]))
  });

  sheets.push({
    name: "Slides",
    columns: [
      { header: "ID", width: 16 }, { header: "Semana", width: 9, center: true }, { header: "Slide", width: 7, center: true }, { header: "Título do slide", width: 36 },
      { header: "Tópicos na tela", width: 50 }, { header: "Visual sugerido", width: 50 }, { header: "Narração do slide", width: 80 }, { header: "Duração (s)", width: 11, center: true }, { header: "Seção do texto", width: 12, center: true }
    ],
    rows: weeks.flatMap(({ index, value }) => list(object(value.slides).slides).map((slide) => [`S${pad(index + 1)}-SLIDES`, index + 1, slide.number, text(slide.title), list(slide.bullets).map((bullet) => `• ${text(bullet)}`).join("\n"), text(slide.visual), text(slide.narration), Number(slide.seconds) || 0, text(slide.sectionRef)]))
  });

  sheets.push({
    name: "Narração",
    columns: [
      { header: "ID", width: 16 }, { header: "Semana", width: 9, center: true }, { header: "Apresentação", width: 36 }, { header: "Texto completo da narração (voz clonada)", width: 100 },
      { header: "Palavras", width: 10, center: true }, { header: "Minutos", width: 10, center: true }, { header: "Notas de pronúncia e pausas", width: 50 }
    ],
    rows: weeks.filter(({ value }) => text(object(value.slides).narrationText)).map(({ index, value }) => {
      const slides = object(value.slides);
      const tts = list(slides.ttsNotes).map((note) => `${text(note.term)} → ${text(note.say)}${note.pause ? ` (${text(note.pause)})` : ""}`).join("\n");
      return [`S${pad(index + 1)}-SLIDES`, index + 1, text(slides.title), text(slides.narrationText), Number(slides.wordCount) || 0, Number(slides.estimatedMinutes) || 0, tts];
    })
  });
  return sheets;
}

// ---------- xlsx (OOXML mínimo) ----------

const colName = (position) => {
  let number = position + 1;
  let name = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
};

// eslint-disable-next-line no-control-regex
const xmlEscape = (value) => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CELL_LIMIT = 32000;

function cellXml(value, reference, style) {
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  const content = xmlEscape(String(value ?? "").slice(0, CELL_LIMIT));
  if (!content) return `<c r="${reference}" s="${style}"/>`;
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${content}</t></is></c>`;
}

function sheetXml(sheet) {
  const columns = sheet.columns;
  const header = sheet.plain ? [] : [`<row r="1" ht="30" customHeight="1">${columns.map((column, position) => cellXml(column.header, `${colName(position)}1`, 1)).join("")}</row>`];
  const dataStart = sheet.plain ? 2 : 2;
  const body = sheet.rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + dataStart;
    return `<row r="${rowNumber}">${columns.map((column, position) => {
      const value = row[position];
      const style = sheet.plain ? 6 : position === 0 ? 3 : column.center ? 5 : 2;
      return cellXml(value, `${colName(position)}${rowNumber}`, style);
    }).join("")}</row>`;
  });
  const plainHeader = sheet.plain ? [`<row r="1" ht="26" customHeight="1">${cellXml(columns[0].header, "A1", 4)}</row>`] : [];
  const lastRow = Math.max(1, sheet.rows.length + 1);
  const cols = `<cols>${columns.map((column, position) => `<col min="${position + 1}" max="${position + 1}" width="${column.width || 20}" customWidth="1"/>`).join("")}</cols>`;
  const view = sheet.plain
    ? `<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>`;
  const filter = sheet.plain || !sheet.rows.length ? "" : `<autoFilter ref="A1:${colName(columns.length - 1)}${lastRow}"/>`;
  const validations = list(sheet.validations).length
    ? `<dataValidations count="${sheet.validations.length}">${sheet.validations.map((validation) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${colName(validation.column)}2:${colName(validation.column)}${Math.max(lastRow, 200)}"><formula1>"${xmlEscape(validation.values.join(","))}"</formula1></dataValidation>`).join("")}</dataValidations>`
    : "";
  const rows = sheet.plain ? [...plainHeader, ...body] : [...header, ...body];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows.join("")}</sheetData>${filter}${validations}</worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FF1B4F72"/><name val="Arial"/></font><font><sz val="11"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1B4F72"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEBF5FB"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBDC3C7"/></left><right style="thin"><color rgb="FFBDC3C7"/></right><top style="thin"><color rgb="FFBDC3C7"/></top><bottom style="thin"><color rgb="FFBDC3C7"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const sheetName = (name, taken) => {
  const base = String(name).replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Planilha";
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate.toLowerCase())) candidate = `${base.slice(0, 28)} ${suffix++}`;
  taken.add(candidate.toLowerCase());
  return candidate;
};

// JSZipConstructor: window.JSZip no navegador, ou o import de "jszip" no servidor.
// output: "blob" (navegador) | "nodebuffer" | "uint8array" | "base64".
export async function createProductionWorkbook(JSZipConstructor, production, meta = {}, output = "uint8array") {
  const sheets = productionSheets(production, meta);
  const taken = new Set();
  const names = sheets.map((sheet) => sheetName(sheet.name, taken));
  const zip = new JSZipConstructor();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, position) => `<Override PartName="/xl/worksheets/sheet${position + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="1"/></bookViews><sheets>${names.map((name, position) => `<sheet name="${xmlEscape(name)}" sheetId="${position + 1}" r:id="rId${position + 1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, position) => `<Relationship Id="rId${position + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${position + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", STYLES_XML);
  sheets.forEach((sheet, position) => zip.file(`xl/worksheets/sheet${position + 1}.xml`, sheetXml(sheet)));
  return zip.generateAsync({ type: output, compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ---------- roteiros legíveis (Markdown) ----------

function videoMarkdown(video) {
  const lines = [`### ${video.id} — ${video.kind}: ${video.title}`.trim(), `*${video.platform} · ${formatDuration(video.seconds)} · ${video.mode} · cenário: ${video.setting || "a definir"}*`, ""];
  if (video.segments.length) {
    video.segments.forEach((segment) => {
      lines.push(`**${text(segment.time) || "—"}** · ${text(segment.scene)}`);
      if (text(segment.speech)) lines.push(`> ${text(segment.speech).replace(/\n+/g, "\n> ")}`);
      if (text(segment.onScreen)) lines.push(`_Na tela:_ ${text(segment.onScreen)}`);
      lines.push("");
    });
  } else if (video.speech) {
    lines.push("**Narração completa**", "", video.speech, "");
  }
  if (video.message) lines.push(`**Descrição / mensagem:** ${video.message}`, "");
  if (video.notes) lines.push(`**Produção / pronúncia:**\n${video.notes}`, "");
  return lines.join("\n");
}

export function productionMarkdown(production, meta = {}) {
  const videos = productionVideos(production);
  const out = [`# Roteiros de vídeo — ${text(meta.title) || "UC"}`, ""];
  const groups = [...new Set(videos.map((video) => video.week))];
  groups.forEach((week) => {
    out.push(week === "UC" ? "## Unidade curricular" : `## Semana ${week}`, "");
    videos.filter((video) => video.week === week).forEach((video) => {
      out.push(videoMarkdown(video));
      if (video.kindKey === "slides") {
        const slides = list(object(object(object(production).weeks)[week - 1]).slides?.slides);
        slides.forEach((slide) => {
          out.push(`#### Slide ${slide.number} — ${text(slide.title)}`);
          if (list(slide.bullets).length) out.push(list(slide.bullets).map((bullet) => `- ${text(bullet)}`).join("\n"));
          if (text(slide.visual)) out.push(`_Visual:_ ${text(slide.visual)}`);
          if (text(slide.narration)) out.push("", `> ${text(slide.narration).replace(/\n+/g, "\n> ")}`);
          out.push("");
        });
      }
    });
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
