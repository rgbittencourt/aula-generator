import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";
import { slugify } from "./aula-schema.js";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
const md = (value) => text(value).replace(/\r?\n/g, "\n");
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function bullets(values, fallback = "A definir pelo professor.") {
  const entries = list(values);
  return entries.length ? entries.map((value) => `- ${value}`).join("\n") : `- ${fallback}`;
}

function artifactContent(artifact) {
  if (text(artifact.content)) return md(artifact.content);
  if (text(artifact.template)) return md(artifact.template);
  return `# ${text(artifact.title || artifact.filename || "Arquivo de apoio")}\n\n${text(artifact.purpose || "Arquivo a ser preparado para a webprática.")}`;
}

function practiceBlocks(practice) {
  const blocks = Array.isArray(practice.roteiro?.blocks) ? practice.roteiro.blocks : [];
  if (blocks.length) return blocks.map((block, index) => ({
    number: index + 1,
    title: text(block.title || block.name, `Bloco ${index + 1}`),
    minutes: Math.max(0, number(block.durationMinutes || block.minutes, 0)),
    instructions: text(block.instructions || block.body || block.description),
    teacherAction: text(block.teacherAction || block.teacherNotes || block.say),
    studentAction: text(block.studentAction || block.activity || block.task),
    prompt: text(block.prompt || block.prompts),
    evidence: text(block.evidence || block.product || block.delivery)
  }));
  if (Array.isArray(practice.steps) && practice.steps.length) return practice.steps.map((step, index) => ({
    number: index + 1,
    title: text(step.title, `Etapa ${index + 1}`),
    minutes: Math.max(0, number(step.minutes, 0)),
    instructions: text(step.instructions || step.body),
    teacherAction: "",
    studentAction: text(step.instructions || step.body),
    prompt: "",
    evidence: text(step.evidence)
  }));
  const total = Math.max(30, number(practice.durationMinutes, 90));
  const first = Math.max(5, Math.round(total * 0.12));
  const second = Math.max(5, Math.round(total * 0.12));
  const last = Math.max(5, Math.round(total * 0.12));
  const middle = Math.max(5, total - first - second - last);
  return [
    { number: 1, title: "Abertura e contextualização", minutes: first, instructions: "Apresente o desafio, conecte-o ao percurso do curso e combine o produto esperado.", teacherAction: "Explique o objetivo e confirme os pré-requisitos.", studentAction: "Compreenda o problema e prepare o ambiente.", prompt: "Descreva o que você pretende construir ou investigar.", evidence: "Hipótese ou plano inicial." },
    { number: 2, title: "Setup técnico", minutes: second, instructions: "Abra a ferramenta, importe os arquivos necessários e confirme que todos conseguem acompanhar.", teacherAction: "Faça o processo ao vivo antes de liberar a turma.", studentAction: "Configure a ferramenta e carregue os materiais.", prompt: "",
      evidence: "Ambiente preparado." },
    { number: 3, title: "Construção prática", minutes: middle, instructions: "Execute o roteiro em ciclos curtos: fazer, observar, testar e corrigir.", teacherAction: "Circule pelos grupos e ajude a transformar erros em novas instruções.", studentAction: "Construa, teste e registre as decisões.", prompt: text(practice.prompts?.[0]), evidence: "Protótipo ou produção em andamento." },
    { number: 4, title: "Compartilhamento e fechamento", minutes: last, instructions: "Compare resultados, retome o objetivo e registre como o produto pode continuar evoluindo.", teacherAction: "Peça demonstrações breves e faça a síntese final.", studentAction: "Apresente o produto e identifique próximos passos.", prompt: "O que funcionou, o que precisou ser corrigido e o que você faria a seguir?", evidence: text(practice.product || practice.delivery) }
  ];
}

function formatDate(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return raw.split("-").reverse().join("/");
}

function scheduleLabel(practice) {
  const parts = [];
  if (practice.weekNumber) parts.push(`Semana ${practice.weekNumber}`);
  if (practice.date) parts.push(formatDate(practice.date));
  if (practice.dayOfWeek) parts.push(practice.dayOfWeek);
  const time = [practice.startTime, practice.endTime].filter(Boolean).join("–");
  if (time) parts.push(time);
  return parts.join(" · ") || list(practice.moments).join(", ") || "A definir";
}

export function practicePackageMarkdown(input, practice, index = 0) {
  const number = index + 1;
  const blocks = practiceBlocks(practice);
  const blockText = blocks.map((block) => `### ${block.number}. ${block.title}\n\n**Duração:** ${block.minutes || "a definir"} minutos\n\n${block.instructions || "Desenvolver este bloco com a turma."}\n\n**Ação do professor:** ${block.teacherAction || "Medie a execução e faça perguntas de acompanhamento."}\n\n**Ação do estudante:** ${block.studentAction || "Execute a etapa e registre a evidência."}\n\n**Evidência:** ${block.evidence || "A definir."}`).join("\n\n");
  return `# Webprática ${number} — ${text(practice.sessionTitle || practice.title || "Sem título")}\n\n**Curso:** ${text(input.title)}  \n**Modalidade:** ${text(practice.modality || "Aula síncrona / laboratório prático")}  \n**Agenda:** ${scheduleLabel(practice)}  \n**Duração prevista:** ${text(practice.durationMinutes || "a definir")} minutos  \n**Ferramenta/plataforma:** ${[practice.tool, practice.platform].filter(Boolean).join(" · ") || "A definir"}\n\n## Visão geral\n\n${text(practice.context || practice.problem || "Apresente a situação-problema que dará sentido à prática.")}\n\n## Objetivo da sessão\n\n${text(practice.objective || "Definir o objetivo específico da prática.")}\n\n## Pré-requisitos\n\n${bullets(practice.prerequisites)}\n\n## Preparação do professor\n\n${bullets(practice.teacherPreparation || practice.preparation)}\n\n## Preparação dos estudantes\n\n${bullets(practice.studentPreparation)}\n\n## Materiais e ferramentas\n\n${bullets(practice.materials)}\n\n## Linha do tempo da sessão\n\n${blockText}\n\n## Produto e evidência\n\n${text(practice.product || practice.deliverable || practice.delivery || "Definir o produto final e o formato de entrega.")}\n\n## Critérios de avaliação\n\n${bullets(practice.criteria || practice.rubric)}\n\n## Prompts ou comandos de apoio\n\n${bullets(practice.prompts, "A IA deve gerar os prompts específicos desta etapa.")}\n\n## Plano B e acessibilidade\n\n${text(practice.fallbackPlan || "Defina uma alternativa para falha de internet, ferramenta ou arquivo.")}\n\n## Continuidade\n\n${text(practice.continuation || "Indique como o produto será retomado no percurso do curso.")}\n`;
}

function paragraph(value, options = {}) {
  const content = text(value);
  if (!content) return new Paragraph({ spacing: { after: 100 } });
  return new Paragraph({
    alignment: options.alignment,
    heading: options.heading,
    spacing: { before: options.before ?? 0, after: options.after ?? 140, line: 276 },
    children: [new TextRun({ text: content, bold: Boolean(options.bold), italics: Boolean(options.italics), color: options.color })]
  });
}

function bodyParagraphs(value) {
  return md(value).split(/\n\s*\n|\r?\n/).map((part) => part.trim()).filter(Boolean).map((part) => paragraph(part));
}

function bulletParagraph(value) {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 276 }, children: [new TextRun({ text: text(value) })] });
}

function bulletList(values, fallback) {
  const entries = list(values);
  return (entries.length ? entries : [fallback]).map(bulletParagraph);
}

function infoTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) => new TableRow({ children: [
      new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, children: [paragraph(label, { bold: true, color: "1F3B5B" })] }),
      new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, children: [paragraph(value || "A definir")] })
    ] }))
  });
}

function timelineTable(blocks) {
  const header = new TableRow({ children: ["Bloco", "Duração", "Atividade", "Evidência"].map((value) => new TableCell({ children: [paragraph(value, { bold: true, color: "FFFFFF" })] })) });
  const rows = blocks.map((block) => new TableRow({ children: [
    new TableCell({ children: [paragraph(`${block.number}. ${block.title}`)] }),
    new TableCell({ children: [paragraph(`${block.minutes || "—"} min`)] }),
    new TableCell({ children: [paragraph(block.instructions || "A desenvolver")] }),
    new TableCell({ children: [paragraph(block.evidence || "A definir")] })
  ] }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] });
}

function rubricTable(rubric) {
  const entries = Array.isArray(rubric) ? rubric : [];
  if (!entries.length) return null;
  const header = new TableRow({ children: ["Critério", "Consolidado", "Em desenvolvimento", "Inicial"].map((value) => new TableCell({ children: [paragraph(value, { bold: true, color: "FFFFFF" })] })) });
  const rows = entries.map((item) => new TableRow({ children: [
    new TableCell({ children: [paragraph(item.criterion || item.title || "Critério")] }),
    new TableCell({ children: [paragraph(item.excellent || item.advanced || item.meets || "—")] }),
    new TableCell({ children: [paragraph(item.developing || item.basic || item.partial || "—")] }),
    new TableCell({ children: [paragraph(item.beginning || item.insufficient || item.minimum || "—")] })
  ] }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] });
}

export async function createWebPracticeDocx(input, practice, index = 0) {
  const blocks = practiceBlocks(practice);
  const children = [
    paragraph("ROTEIRO DE WEBPRÁTICA", { alignment: AlignmentType.CENTER, bold: true, color: "B85C38", after: 180 }),
    paragraph(practice.sessionTitle || practice.title || `Webprática ${index + 1}`, { heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, color: "1F3B5B", after: 180 }),
    paragraph("Sessão síncrona / laboratório prático", { alignment: AlignmentType.CENTER, italics: true, color: "4F6475", after: 220 }),
    paragraph(text(input.title), { alignment: AlignmentType.CENTER, bold: true, after: 60 }),
    paragraph(`Agenda: ${scheduleLabel(practice)} · ${practice.durationMinutes || "A definir"} minutos`, { alignment: AlignmentType.CENTER, after: 260 }),
    infoTable([
      ["Modalidade", practice.modality || "Aula síncrona / laboratório prático"],
      ["Semana de ocorrência", practice.weekNumber ? `Semana ${practice.weekNumber}` : list(practice.moments).join(", ")],
      ["Data e horário", [formatDate(practice.date), practice.dayOfWeek, [practice.startTime, practice.endTime].filter(Boolean).join("–")].filter(Boolean).join(" · ")],
      ["Ferramenta/plataforma", [practice.tool, practice.platform].filter(Boolean).join(" · ")],
      ["Produto final", practice.product || practice.deliverable || practice.delivery]
    ]),
    paragraph("1. Visão geral", { heading: HeadingLevel.HEADING_1, color: "1F3B5B", before: 280 }),
    ...bodyParagraphs(practice.context || practice.problem || "Apresente a situação-problema que dará sentido à prática."),
    ...bodyParagraphs(practice.challenge ? `Desafio da sessão: ${practice.challenge}` : ""),
    paragraph("2. Objetivo da sessão", { heading: HeadingLevel.HEADING_1, color: "1F3B5B", before: 280 }),
    ...bodyParagraphs(practice.objective || "Definir o objetivo específico da prática."),
    paragraph("3. Pré-requisitos e preparação", { heading: HeadingLevel.HEADING_1, color: "1F3B5B", before: 280 }),
    paragraph("Pré-requisitos dos estudantes", { heading: HeadingLevel.HEADING_2, color: "4F6475", before: 140 }),
    ...bulletList(practice.prerequisites, "Conta, arquivo ou conhecimento prévio a confirmar."),
    paragraph("Preparação do professor", { heading: HeadingLevel.HEADING_2, color: "4F6475", before: 140 }),
    ...bulletList(practice.teacherPreparation || practice.preparation, "Testar o fluxo completo e preparar um plano de contingência."),
    paragraph("Preparação dos estudantes", { heading: HeadingLevel.HEADING_2, color: "4F6475", before: 140 }),
    ...bulletList(practice.studentPreparation, "Abrir a ferramenta e baixar os arquivos antes do encontro."),
    paragraph("4. Materiais e ferramentas", { heading: HeadingLevel.HEADING_1, color: "1F3B5B", before: 280 }),
    ...bulletList(practice.materials, "Definir ferramentas, arquivos, links e contas necessárias."),
    paragraph("5. Linha do tempo da sessão", { heading: HeadingLevel.HEADING_1, color: "1F3B5B", before: 280 }),
    paragraph("A sessão deve ser conduzida como uma oficina: demonstrar brevemente, deixar os estudantes executar, observar resultados e iterar.", { italics: true }),
    timelineTable(blocks)
  ];

  blocks.forEach((block) => {
    children.push(paragraph(`${block.number}. ${block.title}`, { heading: HeadingLevel.HEADING_2, color: "4F6475", before: 240 }));
    children.push(...bodyParagraphs(block.instructions || "Desenvolva este bloco com a turma."));
    if (block.teacherAction) children.push(paragraph(`Ação do professor: ${block.teacherAction}`));
    if (block.studentAction) children.push(paragraph(`Ação dos estudantes: ${block.studentAction}`));
    if (block.prompt) children.push(paragraph(`Prompt/comando de apoio: “${block.prompt}”`, { italics: true }));
    if (block.evidence) children.push(paragraph(`Evidência esperada: ${block.evidence}`, { bold: true }));
  });

  children.push(paragraph("6. Produto, evidência e avaliação", { heading: HeadingLevel.HEADING_1, color: "1F3B5B", before: 280 }));
  children.push(...bodyParagraphs(practice.product || practice.deliverable || practice.delivery || "Definir o produto final e o formato de entrega."));
  children.push(paragraph("Critérios de avaliação", { heading: HeadingLevel.HEADING_2, color: "4F6475", before: 140 }));
  children.push(...bulletList(practice.criteria, "Definir critérios observáveis de participação, processo e produto."));
  const rubric = rubricTable(practice.rubric);
  if (rubric) children.push(paragraph("Rubrica", { heading: HeadingLevel.HEADING_2, color: "4F6475", before: 140 }), rubric);

  children.push(paragraph("7. Prompts, comandos e arquivos de apoio", { heading: HeadingLevel.HEADING_1, color: "1F3B5B", before: 280 }));
  children.push(...bulletList(practice.prompts, "Os prompts específicos devem ser definidos pelo professor ou gerados/ajustados durante a sessão."));
  if (Array.isArray(practice.artifacts) && practice.artifacts.length) {
    children.push(paragraph("Arquivos produzidos ou fornecidos", { heading: HeadingLevel.HEADING_2, color: "4F6475", before: 140 }));
    children.push(...practice.artifacts.map((artifact) => bulletParagraph(`${artifact.filename || artifact.title}: ${artifact.purpose || "arquivo de apoio à prática"}`)));
  }

  children.push(paragraph("8. Plano B, acessibilidade e continuidade", { heading: HeadingLevel.HEADING_1, color: "1F3B5B", before: 280 }));
  children.push(...bodyParagraphs(practice.fallbackPlan || "Se o upload falhar, permita colar uma amostra dos dados; se a internet cair, use o build de referência do professor; se o grupo atrasar, entregue primeiro o produto mínimo viável."));
  children.push(...bodyParagraphs(practice.accessibility || "Ofereça alternativa de baixa conexão, instruções em etapas curtas, arquivos leves e descrição textual das imagens ou diagramas."));
  children.push(paragraph(`Continuidade: ${practice.continuation || "Registre como o produto será retomado no percurso do curso."}`));
  children.push(paragraph("Documento gerado pelo Gerador de Aulas. Revise ferramentas, links, licenças, acessibilidade e adequação da sessão antes de compartilhar com a turma.", { italics: true, color: "4F6475", before: 320 }));

  const document = new Document({
    creator: "Gerador de Aulas",
    title: `Webprática — ${text(practice.title || `Sessão ${index + 1}`)}`,
    subject: "Roteiro de sessão síncrona e laboratório prático",
    description: "Roteiro editável de webprática gerado a partir do planejamento pedagógico.",
    styles: {
      default: { document: { run: { font: "Aptos", size: 22 }, paragraph: { spacing: { after: 140, line: 276 } } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { font: "Aptos Display", size: 34, bold: true, color: "1F3B5B" }, paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 200 } } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { font: "Aptos Display", size: 28, bold: true, color: "1F3B5B" }, paragraph: { spacing: { before: 280, after: 120 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { font: "Aptos", size: 24, bold: true, color: "4F6475" }, paragraph: { spacing: { before: 180, after: 100 } } }
      ]
    },
    sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Gerador de Aulas · Página ", size: 18, color: "6B7280" }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "6B7280" })] })] }) }, children }]
  });
  return Packer.toBuffer(document);
}

export async function createWebPracticeDocxFiles(input, practices = []) {
  const files = [];
  for (const [index, practice] of practices.entries()) {
    const slug = slugify(practice.title || `webpratica-${index + 1}`, `webpratica-${index + 1}`);
    files.push({ path: `webpraticas/${String(index + 1).padStart(2, "0")}-${slug}/roteiro-webpratica.docx`, content: await createWebPracticeDocx(input, practice, index) });
  }
  return files;
}

export function createWebPracticeFiles(input, practices = []) {
  const files = [];
  practices.forEach((practice, index) => {
    const slug = slugify(practice.title || `webpratica-${index + 1}`, `webpratica-${index + 1}`);
    const folder = `webpraticas/${String(index + 1).padStart(2, "0")}-${slug}`;
    files.push({ path: `${folder}/guia-e-roteiro.md`, content: practicePackageMarkdown(input, practice, index) });
    files.push({ path: `${folder}/pacote.json`, content: JSON.stringify({ course: input.title, webPractice: practice }, null, 2) });
    const artifacts = Array.isArray(practice.artifacts || practice.files || practice.outputs) ? (practice.artifacts || practice.files || practice.outputs) : [];
    artifacts.forEach((artifact, artifactIndex) => {
      const originalName = text(artifact.filename || artifact.title || `arquivo-${artifactIndex + 1}`);
      const originalExtension = originalName.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() || "";
      const filename = slugify(originalName.replace(/\.[a-z0-9]+$/i, ""), `arquivo-${artifactIndex + 1}`);
      const extension = originalExtension || (text(artifact.format).toLowerCase().includes("json") ? ".json" : text(artifact.format).toLowerCase().includes("csv") ? ".csv" : ".md");
      files.push({ path: `${folder}/arquivos/${filename}${extension}`, content: artifactContent(artifact) });
    });
  });
  return files;
}
