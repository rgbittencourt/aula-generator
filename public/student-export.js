const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value, fallback = "") => String(value ?? "").trim() || fallback;

// Crédito do aplicativo, presente nos arquivos gerados (meta do ClassAtelier, PDF, Moodle XML, JSON do ClassAuthor).
export const APP_NAME = "ClassAuthor";
export const GENERATOR_TOOL = `${APP_NAME} (INOVALAB - IFSC)`;
// Continua a frase "Produzido com apoio de <ferramenta> …" no bloco Apoio de IA do rodapé das aulas.
export const GENERATOR_AI_USE = "na elaboração do conteúdo desta aula, a partir do planejamento pedagógico da semana.";
export const GENERATOR_CREDIT = `Conteúdo elaborado com ${APP_NAME}, uma ferramenta de planejamento pedagógico desenvolvida por Rogério Bittencourt, INOVALAB - IFSC.`;
const GENERATOR_CREDIT_HTML = `<p style="text-align:center;font-size:.85em;opacity:.8">Conteúdo elaborado com <strong>${APP_NAME}</strong>, uma ferramenta de planejamento pedagógico desenvolvida por Rogério Bittencourt, INOVALAB - IFSC.</p>`;

const escapeHtml = (value) => text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// O bloco "referencias" do ClassAtelier recebe cada item como texto HTML (um objeto aparece como
// "[object Object]"). O link, quando existe, vai dentro da própria linha. Aceita também o formato
// antigo ({ html, href }), que está salvo nas semanas geradas antes desta correção.
export function referenceItemHtml(item) {
  const entry = typeof item === "string" ? { citation: item } : object(item);
  const body = entry.html != null && text(entry.html) ? text(entry.html) : escapeHtml(entry.citation || entry.title || entry.href);
  const href = text(entry.href);
  const safeHref = /^https?:\/\//i.test(href) ? href.replace(/"/g, "%22") : "";
  const hasLink = safeHref && !body.includes(escapeHtml(href)) && !body.includes(safeHref);
  return hasLink ? `${body} <a href="${safeHref}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>` : body;
}

// O quiz não vai para o ClassAtelier: sai em Moodle XML (feedback em todas as alternativas), e a
// versão completa fica no JSON do ClassAuthor.
const STUDENT_PLAN_KEYS = [
  "weekNumber", "theme", "welcome", "learningObjectives", "prerequisites", "contentDensity",
  "contentSections", "activities", "diagnostic", "formativeChecks", "differentiation",
  "selfAssessment", "synthesis", "nextWeekConnection", "glossary", "references"
];

function studentSection(section = {}) {
  const item = object(section);
  return {
    number: text(item.number),
    title: text(item.title, "Seção"),
    body: text(item.body),
    subsections: Array.isArray(item.subsections) ? item.subsections.map((sub) => ({
      number: text(sub?.number),
      title: text(sub?.title, "Subseção"),
      body: text(sub?.body)
    })).filter((sub) => sub.title || sub.body) : [],
    caseStudy: item.caseStudy ? {
      title: text(item.caseStudy.title, "Estudo de caso"),
      context: text(item.caseStudy.context || item.caseStudy.body),
      data: text(item.caseStudy.data),
      questions: Array.isArray(item.caseStudy.questions) ? item.caseStudy.questions.map((question) => text(question)).filter(Boolean) : []
    } : null,
    reflection: item.reflection ? {
      question: text(item.reflection.question || item.reflection.title),
      body: text(item.reflection.body || item.reflection.context)
    } : null,
    keyTerms: Array.isArray(item.keyTerms) ? item.keyTerms.map((term) => text(term)).filter(Boolean) : []
  };
}

function sanitizeBlock(block = {}) {
  const source = object(block);
  const props = object(source.props);
  if (source.type === "quiz") return null;
  const children = Array.isArray(props.children) ? props.children.map(sanitizeBlock).filter(Boolean) : null;
  const nextProps = { ...props };
  delete nextProps.resourceId;
  delete nextProps.searchQuery;
  delete nextProps.verificationStatus;
  delete nextProps.requiresVerification;
  delete nextProps.humanApproval;
  delete nextProps.selectionReason;
  delete nextProps.pedagogicalUse;
  delete nextProps.objective;
  delete nextProps.alignment;
  delete nextProps.moment;
  delete nextProps.sectionNumber;
  delete nextProps.notes;
  if (children) nextProps.children = children;

  // Sugestões sem URL ficam disponíveis para a mediação docente, mas não são
  // uma experiência utilizável pelo estudante no ClassAtelier.
  if (source.type === "imagem" && !text(props.src || props.href)) return null;
  if (source.type === "video" && !text(props.id || props.videoId)) return null;
  if (source.type === "audio" && !text(props.src || props.href || props.spotify)) return null;
  if (source.type === "externalembed" && !text(props.embed || props.src || props.href)) return null;

  // O parágrafo de ligação é uma anotação interna do professor. Quando ele
  // carrega um vídeo inline, preservamos apenas o player para o estudante.
  if (source.type === "prose" && props.resourceId) {
    if (!props.inlineVideo?.id) return null;
    nextProps.body = "";
    nextProps.dropcap = false;
    nextProps.inlineVideo = {
      id: text(props.inlineVideo.id),
      title: text(props.inlineVideo.title, "Vídeo"),
      caption: text(props.inlineVideo.caption),
      credit: text(props.inlineVideo.credit),
      start: text(props.inlineVideo.start)
    };
  }
  if (source.type === "referencias" && Array.isArray(props.items)) {
    nextProps.items = props.items.map(referenceItemHtml).filter(Boolean);
    if (!nextProps.items.length) return null;
  }
  if (source.type === "materiais" && Array.isArray(props.items)) {
    nextProps.items = props.items.map((item) => ({
      type: text(item?.type || item?.kind, "material"),
      title: text(item?.title, "Material de apoio"),
      href: text(item?.href || item?.link || item?.url)
    })).filter((item) => item.href);
    if (!nextProps.items.length) return null;
  }
  if (source.type === "video") {
    nextProps.id = text(props.id);
    nextProps.title = text(props.title, "Vídeo");
    nextProps.caption = text(props.caption);
    nextProps.credit = text(props.credit);
    nextProps.start = text(props.start);
  }
  if (source.type === "imagem") {
    nextProps.src = text(props.src);
    nextProps.caption = text(props.caption || props.title);
    nextProps.credit = text(props.credit);
    nextProps.alt = text(props.alt || props.altText || props.caption);
  }
  return { id: text(source.id), type: text(source.type), ...(source.bg ? { bg: source.bg } : {}), ...(source.pad ? { pad: source.pad } : {}), props: nextProps };
}

function studentPlan(plan = {}) {
  const source = object(plan);
  const result = {};
  STUDENT_PLAN_KEYS.forEach((key) => {
    if (source[key] !== undefined) result[key] = source[key];
  });
  result.contentSections = Array.isArray(source.contentSections) ? source.contentSections.map(studentSection) : [];
  // A composição já foi materializada em blocks. O pedido de composição e
  // suas justificativas são dados de planejamento, não conteúdo do aluno.
  result.activities = Array.isArray(source.activities) ? source.activities.map((activity) => ({
    id: text(activity?.id),
    type: text(activity?.type, "atividade"),
    title: text(activity?.title, "Atividade"),
    count: Number(activity?.count || 1) || 1,
    durationMinutes: Number(activity?.durationMinutes || 0) || 0,
    required: activity?.required !== false,
    instructions: text(activity?.instructions),
    evidence: text(activity?.evidence),
    evidenceType: text(activity?.evidenceType),
    criteria: Array.isArray(activity?.criteria) ? activity.criteria.map((item) => text(item)).filter(Boolean) : []
  })) : [];
  result.formativeChecks = Array.isArray(source.formativeChecks) ? source.formativeChecks.map((check) => ({
    id: text(check?.id),
    moment: text(check?.moment),
    prompt: text(check?.prompt),
    expectedEvidence: text(check?.expectedEvidence)
  })) : [];
  result.differentiation = source.differentiation ? {
    support: source.differentiation.support || [],
    standard: source.differentiation.standard || [],
    extension: source.differentiation.extension || [],
    rationale: text(source.differentiation.rationale)
  } : { support: [], standard: [], extension: [], rationale: "" };
  result.diagnostic = source.diagnostic || {};
  result.selfAssessment = source.selfAssessment || {};
  result.references = Array.isArray(source.references) ? source.references.map((reference) => {
    if (typeof reference === "string") return { id: "", citation: text(reference), type: "", authors: [], year: "", publisher: "", doi: "", href: "" };
    return {
      id: text(reference?.id),
      citation: text(reference?.citation || reference?.title),
      type: text(reference?.type),
      authors: Array.isArray(reference?.authors) ? reference.authors.map((author) => text(author)).filter(Boolean) : [],
      year: text(reference?.year),
      publisher: text(reference?.publisher),
      doi: text(reference?.doi),
      href: text(reference?.href)
    };
  }) : [];
  return result;
}

/**
 * Gera a versão que pode ser aberta no ClassAtelier.
 *
 * A aula interna permanece rica para revisão, mas a camada do estudante não
 * recebe alinhamento pedagógico, cálculo de tempo, ajustes de carga, mapa de
 * evidências, estado de revisão, curadoria interna ou mensagens de mediação.
 */
export function toStudentLesson(lesson = {}) {
  const source = object(lesson);
  const meta = object(source.meta);
  return {
    meta: {
      title: text(meta.title),
      courseTitle: text(meta.courseTitle),
      weekNumber: Number(meta.weekNumber || 0) || 0,
      weekLabel: text(meta.weekLabel),
      calendarStartDate: text(meta.calendarStartDate),
      calendarEndDate: text(meta.calendarEndDate),
      author: text(meta.author),
      role: text(meta.role),
      institution: text(meta.institution),
      year: text(meta.year),
      license: text(meta.license),
      aiTool: text(meta.aiTool, GENERATOR_TOOL),
      aiUse: text(meta.aiUse, GENERATOR_AI_USE),
      generatedBy: GENERATOR_CREDIT
    },
    lessonPlan: studentPlan(source.lessonPlan),
    blocks: [...(Array.isArray(source.blocks) ? source.blocks.map(sanitizeBlock).filter(Boolean) : []), creditBlock(meta.weekNumber)]
  };
}

// Rodapé de autoria no fim da aula, como "Conteúdo elaborado com ...": o último bloco da aula do ClassAtelier.
function creditBlock(weekNumber) {
  const week = Number(weekNumber || 0) || 0;
  return { id: `b-credit-${String(week).padStart(2, "0")}`, type: "topic", bg: "neutral-default", pad: "normal", props: { children: [{ id: `c-credit-${String(week).padStart(2, "0")}`, type: "prose", props: { body: GENERATOR_CREDIT_HTML, dropcap: false } }] } };
}

export function toStudentLessons(lessons = []) {
  return Array.isArray(lessons) ? lessons.map(toStudentLesson) : [];
}

/**
 * Versão completa da semana, para o ClassAuthor (reimportar, revisar, arquivar):
 * a aula inteira, com quiz, feedbacks, revisões, cálculo de tempo e o guia do professor.
 */
export function toGeneratorWeek(lesson = {}, teacherGuide = null, extra = {}) {
  return {
    generator: "aula-generator",
    format: "classauthor-semana",
    version: 1,
    exportedAt: extra.exportedAt || new Date().toISOString(),
    credit: GENERATOR_CREDIT,
    week: lesson,
    teacherGuide: teacherGuide || lesson?.teacherGuide || null
  };
}
