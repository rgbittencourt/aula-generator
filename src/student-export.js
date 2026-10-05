const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value, fallback = "") => String(value ?? "").trim() || fallback;

const STUDENT_PLAN_KEYS = [
  "weekNumber", "theme", "welcome", "learningObjectives", "prerequisites", "contentDensity",
  "contentSections", "activities", "diagnostic", "formativeChecks", "differentiation",
  "selfAssessment", "synthesis", "nextWeekConnection", "glossary", "references", "assessment"
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
  // uma experiência utilizável pelo estudante no Aula Studio.
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
  result.assessment = source.assessment || { questions: [] };
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
 * Gera a versão que pode ser aberta no Aula Studio.
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
      license: text(meta.license)
    },
    lessonPlan: studentPlan(source.lessonPlan),
    blocks: Array.isArray(source.blocks) ? source.blocks.map(sanitizeBlock).filter(Boolean) : []
  };
}

export function toStudentLessons(lessons = []) {
  return Array.isArray(lessons) ? lessons.map(toStudentLesson) : [];
}
