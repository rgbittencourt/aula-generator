export const DEFAULT_LICENSE = "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pt-br";

export const KNOWN_BLOCK_TYPES = new Set([
  "hero", "topic", "topic-collapsible", "topic-slider", "divider", "pagebreak",
  "titulo", "sintese", "referencias", "prose", "citacao", "eyebrow", "destaque",
  "atencao", "reflexao", "pitaco", "imagem", "parallax", "video", "audio", "cases",
  "feature", "textoimagem", "filmstrip", "tabela", "flashcards", "slider", "accordion",
  "columns", "externalembed", "linhadotempo", "quiz", "materiais", "collapsebreak"
]);

const ROOT_TYPES = new Set(["hero", "pagebreak", "sintese", "referencias", "parallax", "topic", "topic-collapsible", "topic-slider", "divider"]);
const NESTED_KEYS = ["children", "items", "columns", "eras", "events", "cards", "steps", "questions", "features"];
const text = (value, fallback = "") => String(value ?? fallback).trim();
const integer = (value, fallback) => { const n = Number.parseInt(value, 10); return Number.isFinite(n) ? n : fallback; };
const number = (value, fallback) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const bool = (value, fallback = false) => value === undefined || value === null ? fallback : Boolean(value);

export function splitLines(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  return text(value).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function slugify(value, fallback = "aula") {
  const slug = text(value, fallback).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeResource(value = {}, index = 0, defaultKind = "material") {
  const resource = object(value);
  const href = text(resource.href || resource.link || resource.url);
  const verificationStatus = text(resource.verificationStatus, href ? "provided-needs-review" : "suggested-no-url");
  return {
    id: text(resource.id, `${slugify(defaultKind)}-${index + 1}`),
    kind: text(resource.kind || resource.type, defaultKind),
    title: text(resource.title, "Recurso sugerido"),
    href,
    source: text(resource.source || resource.publisher || resource.institution),
    author: text(resource.author),
    required: bool(resource.required ?? resource.mandatory, false),
    moment: text(resource.moment || resource.placement),
    objective: text(resource.objective || resource.purpose),
    guidingQuestion: text(resource.guidingQuestion || resource.question),
    durationMinutes: Math.max(0, number(resource.durationMinutes || resource.duration, 0)),
    pages: text(resource.pages),
    wordCount: Math.max(0, number(resource.wordCount || resource.words, 0)),
    year: text(resource.year),
    altText: text(resource.altText || resource.alt),
    caption: text(resource.caption),
    credit: text(resource.credit),
    license: text(resource.license),
    licenseUrl: text(resource.licenseUrl),
    sourcePage: text(resource.sourcePage),
    provider: text(resource.provider),
    thumbnail: text(resource.thumbnail),
    searchQuery: text(resource.searchQuery || resource.query),
    candidateId: text(resource.candidateId),
    researchRequestId: text(resource.researchRequestId),
    selectionReason: text(resource.selectionReason),
    pedagogicalUse: text(resource.pedagogicalUse),
    verificationStatus,
    requiresVerification: bool(resource.requiresVerification, !href || verificationStatus !== "verified"),
    notes: text(resource.notes)
  };
}

function normalizeResources(value, defaultKind = "material") {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => normalizeResource(item, index, defaultKind)).filter((item) => item.title || item.href || item.searchQuery);
}

function normalizeArtifacts(value) {
  if (!Array.isArray(value)) return [];
  return value.map((artifact, index) => {
    const item = object(artifact);
    return {
      id: text(item.id, `artifact-${index + 1}`),
      filename: text(item.filename || item.fileName, `arquivo-${index + 1}.md`),
      title: text(item.title, `Arquivo de apoio ${index + 1}`),
      format: text(item.format, "markdown"),
      purpose: text(item.purpose || item.objective),
      content: text(item.content || item.body),
      template: text(item.template),
      required: bool(item.required, true),
      notes: text(item.notes)
    };
  }).filter((item) => item.title || item.content || item.template);
}

function normalizeActivities(value) {
  if (!Array.isArray(value)) return [];
  return value.map((activity, index) => {
    const item = object(activity);
    return {
      id: text(item.id, `activity-${index + 1}`),
      type: text(item.type || item.kind, "atividade"),
      title: text(item.title, `Atividade ${index + 1}`),
      count: Math.max(0, number(item.count || item.quantity, 1)),
      durationMinutes: Math.max(0, number(item.durationMinutes || item.minutes, 0)),
      unitDurationMinutes: Math.max(0, number(item.unitDurationMinutes, 0)),
      hoursPerCommunication: Math.max(0, number(item.hoursPerCommunication, 0)),
      required: bool(item.required, true),
      instructions: text(item.instructions),
      notes: text(item.notes)
    };
  });
}

function normalizePractice(value = {}, index = 0) {
  const practice = object(value);
  const steps = Array.isArray(practice.steps)
    ? practice.steps.map((step, stepIndex) => {
      const item = object(step);
      return { order: stepIndex + 1, title: text(item.title, `Etapa ${stepIndex + 1}`), instructions: text(item.instructions || item.body || item.text), minutes: Math.max(0, number(item.minutes || item.durationMinutes, 0)) };
    })
    : splitLines(practice.steps).map((step, stepIndex) => ({ order: stepIndex + 1, title: `Etapa ${stepIndex + 1}`, instructions: step, minutes: 0 }));
  return {
    id: text(practice.id, `webpractice-${index + 1}`),
    title: text(practice.title, `Webprática ${index + 1}`),
    type: text(practice.type, "Pesquisa orientada"),
    modality: text(practice.modality || practice.format),
    context: text(practice.context || practice.scenario || practice.problem),
    prerequisites: splitLines(practice.prerequisites),
    moments: splitLines(practice.moments || practice.moment),
    objective: text(practice.objective),
    preparation: text(practice.preparation),
    teacherPreparation: splitLines(practice.teacherPreparation || practice.teacherPrep),
    studentPreparation: splitLines(practice.studentPreparation || practice.studentPrep),
    materials: splitLines(practice.materials),
    instructions: text(practice.instructions),
    steps,
    product: text(practice.product),
    assessment: text(practice.assessment),
    criteria: splitLines(practice.criteria || practice.rubric),
    rubric: splitLines(practice.rubric),
    prompts: splitLines(practice.prompts || practice.prompt),
    roteiro: object(practice.roteiro || practice.sessionPlan || practice.timeline),
    artifacts: normalizeArtifacts(practice.artifacts || practice.files || practice.outputs),
    continuation: text(practice.continuation),
    fallbackPlan: text(practice.fallbackPlan || practice.planB),
    resources: normalizeResources(practice.resources, "practice-resource"),
    durationMinutes: Math.max(0, number(practice.durationMinutes || practice.sessionMinutes, 45)),
    delivery: text(practice.delivery || practice.evidence)
  };
}

function normalizeMaterial(value = {}, index = 0) {
  const material = object(value);
  const normalized = normalizeResource({ ...material, kind: material.kind || material.type, href: material.link || material.href }, index, "material");
  return {
    ...normalized,
    type: text(material.type || material.kind, "Texto-base"),
    link: normalized.href,
    alignment: text(material.alignment || material.contentAlignment),
    use: text(material.use || material.howToUse || material.readingGuide),
    notes: text(material.notes)
  };
}

function normalizeSection(value = {}, index = 0) {
  const section = object(value);
  const reflection = section.reflection || section.reflexao;
  const caseStudy = object(section.caseStudy || section.studyCase);
  return {
    number: text(section.number, String(index + 1)),
    title: text(section.title, `Seção ${index + 1}`),
    body: text(section.body || section.content),
    subsections: Array.isArray(section.subsections) ? section.subsections.map((item, subIndex) => ({
      number: text(item?.number, `${index + 1}.${subIndex + 1}`), title: text(item?.title, `Subseção ${subIndex + 1}`), body: text(item?.body || item?.content), resources: normalizeResources(item?.resources, "subsection-resource")
    })) : [],
    caseStudy: Object.keys(caseStudy).length ? { title: text(caseStudy.title), context: text(caseStudy.context || caseStudy.body), data: text(caseStudy.data), questions: splitLines(caseStudy.questions) } : null,
    reflection: reflection ? (typeof reflection === "string" ? { question: text(reflection), body: "" } : { question: text(reflection.question || reflection.title), body: text(reflection.body || reflection.context) }) : null,
    keyTerms: splitLines(section.keyTerms || section.terms),
    resources: normalizeResources(section.resources, "section-resource")
  };
}

function normalizeGlossary(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? { term: text(item), definition: "" } : { term: text(item?.term || item?.word), definition: text(item?.definition || item?.body) }).filter((item) => item.term || item.definition);
}

function normalizeAssessment(value = {}) {
  const assessment = object(value);
  const questions = Array.isArray(assessment.questions) ? assessment.questions.map((question, index) => {
    const item = object(question);
    const options = Array.isArray(item.options) ? item.options.map((option) => text(option)).filter(Boolean) : [];
    return {
      id: text(item.id, `question-${index + 1}`),
      type: text(item.type, options.length === 2 ? "true-false" : "multiple-choice"),
      objective: text(item.objective),
      q: text(item.q || item.question),
      options,
      answer: Number.isFinite(Number(item.answer)) ? Number(item.answer) : (typeof item.answer === "boolean" ? (item.answer ? 1 : 0) : 0),
      explanation: text(item.explanation || item.feedback),
      points: Math.max(0, number(item.points, 1))
    };
  }).filter((item) => item.q) : [];
  return {
    title: text(assessment.title, "Atividade avaliativa"),
    format: text(assessment.format, "4 questões de múltipla escolha + 2 de verdadeiro/falso"),
    required: bool(assessment.required, true),
    passMark: number(assessment.passMark, 6),
    durationMinutes: Math.max(0, number(assessment.durationMinutes || assessment.timeEstimateMinutes, 0)),
    questions,
    moodleGift: text(assessment.moodleGift || assessment.gift),
    notes: text(assessment.notes)
  };
}

function normalizeTimePlan(value = {}) {
  const plan = object(value);
  const items = Array.isArray(plan.items) ? plan.items.map((item, index) => {
    const entry = object(item);
    const minutes = Math.max(0, number(entry.minutes ?? entry.estimatedMinutes, 0));
    return {
      id: text(entry.id, `time-${index + 1}`),
      title: text(entry.title, `Atividade ${index + 1}`),
      category: text(entry.category, "content"),
      minutes,
      estimatedMinutes: minutes,
      learnerMinutes: Math.max(0, number(entry.learnerMinutes, minutes)),
      instructionalMinutes: Math.max(0, number(entry.instructionalMinutes, 0)),
      required: bool(entry.required, true),
      basis: text(entry.basis, "estimativa pedagógica"),
      confidence: text(entry.confidence, "medium"),
      formulaKey: text(entry.formulaKey),
      details: object(entry.details)
    };
  }).filter((item) => item.minutes > 0 || item.title) : [];
  return {
    targetMinutes: Math.max(0, number(plan.targetMinutes, 0)),
    targetLearnerMinutes: Math.max(0, number(plan.targetLearnerMinutes, plan.targetMinutes)),
    targetInstructionalMinutes: Math.max(0, number(plan.targetInstructionalMinutes, 0)),
    calculatedMinutes: Math.max(0, number(plan.calculatedMinutes, 0)),
    requiredMinutes: Math.max(0, number(plan.requiredMinutes, 0)),
    optionalMinutes: Math.max(0, number(plan.optionalMinutes, 0)),
    instructionalMinutes: Math.max(0, number(plan.instructionalMinutes, 0)),
    items,
    unresolved: Array.isArray(plan.unresolved) ? plan.unresolved.map((entry) => object(entry)) : [],
    formulaProfile: object(plan.formulaProfile),
    calculationMethod: text(plan.calculationMethod, "derived-after-content"),
    notes: text(plan.notes)
  };
}

export function normalizeLessonPlan(raw = {}, input = {}, index = 0) {
  const plan = object(raw);
  const resources = object(plan.resources);
  const rawSections = Array.isArray(plan.contentSections) ? plan.contentSections : (Array.isArray(plan.sections) ? plan.sections : []);
  const contentSections = rawSections.length ? rawSections.map(normalizeSection) : [{ number: "1", title: "Conteúdo da semana", body: text(input.content, `Estude os conceitos centrais de ${input.title}.`), subsections: [], caseStudy: null, reflection: null, keyTerms: [], resources: [] }];
  const videos = normalizeResources(resources.videos || plan.videos, "video");
  const requiredReadings = normalizeResources(resources.readingsRequired || plan.readingsRequired, "reading-required");
  const extraReadings = normalizeResources(resources.readingsExtra || plan.readingsExtra, "reading-extra");
  const images = normalizeResources(resources.images || plan.images, "image");
  const podcasts = normalizeResources(resources.podcasts || plan.podcasts, "podcast");
  const datasets = normalizeResources(resources.datasets || plan.datasets, "dataset");
  const practices = Array.isArray(plan.webPractices) ? plan.webPractices.map(normalizePractice) : (input.webPractices || []).map(normalizePractice);
  const activities = normalizeActivities(plan.activities);
  return {
    weekNumber: index + 1,
    theme: text(plan.theme, contentSections[0]?.title || `${input.title} — Semana ${index + 1}`),
    welcome: text(plan.welcome || plan.welcomeText),
    learningObjectives: splitLines(plan.learningObjectives || plan.objectives || input.objectives),
    prerequisites: splitLines(plan.prerequisites),
    contentDensity: text(plan.contentDensity, "completa"),
    contentSections,
    resources: { videos, readingsRequired: requiredReadings, readingsExtra: extraReadings, images, podcasts, datasets },
    webPractices: practices,
    activities,
    synthesis: text(plan.synthesis),
    nextWeekConnection: text(plan.nextWeekConnection || plan.whatsNext),
    glossary: normalizeGlossary(plan.glossary),
    references: splitLines(plan.references || input.references),
    assessment: normalizeAssessment(plan.assessment),
    resourceResearch: object(plan.resourceResearch),
    timePlan: normalizeTimePlan(plan.timePlan),
    humanReview: bool(plan.humanReview ?? plan.requiresHumanReview, true),
    notes: splitLines(plan.notes)
  };
}

export function normalizeCourseInput(raw = {}) {
  const calendarMode = raw.calendarMode === "calendar" ? "calendar" : "week-number";
  const weeks = Math.min(52, Math.max(1, integer(raw.weeks, 1)));
  const hoursPerWeek = Math.min(80, Math.max(0, number(raw.hoursPerWeek, 4)));
  const practice = raw.webPractice && typeof raw.webPractice === "object" ? raw.webPractice : {};
  const enabled = Boolean(raw.webPracticeEnabled ?? practice.enabled ?? (Array.isArray(raw.webPractices) && raw.webPractices.length));
  const rawPractices = Array.isArray(raw.webPractices) ? raw.webPractices : [];
  const webPractices = enabled ? (rawPractices.length ? rawPractices.map(normalizePractice) : [normalizePractice(practice, 0)]) : [];
  const legacyMoments = webPractices.flatMap((item) => item.moments);
  const legacyInstructions = webPractices.map((item) => `${item.title}: ${item.instructions}`).filter(Boolean).join("\n");
  const materials = Array.isArray(raw.materials) ? raw.materials.map(normalizeMaterial).filter((material) => material.title || material.objective || material.alignment || material.link || material.use) : [];
  return {
    title: text(raw.title || raw.generalTheme, "Curso sem título"),
    audience: text(raw.audience, "Adultos em formação"),
    level: text(raw.level, "Intermediário"),
    objectives: splitLines(raw.objectives),
    content: text(raw.content),
    references: splitLines(raw.references),
    videoLinks: splitLines(raw.videoLinks),
    videoSearchSuggestions: splitLines(raw.videoSearchSuggestions),
    imageLinks: splitLines(raw.imageLinks),
    imageSearchSuggestions: splitLines(raw.imageSearchSuggestions),
    materials,
    weeks, hoursPerWeek, calendarMode,
    startDate: calendarMode === "calendar" && validDate(raw.startDate) ? raw.startDate : null,
    webPractices,
    webPractice: { enabled, moments: legacyMoments.length ? legacyMoments : splitLines(practice.moments || raw.practiceMoments), instructions: legacyInstructions || text(practice.instructions || raw.practiceInstructions), durationMinutes: webPractices.reduce((sum, item) => sum + item.durationMinutes, 0) },
    author: text(raw.author), role: text(raw.role), institution: text(raw.institution), year: text(raw.year, String(new Date().getFullYear())), language: text(raw.language, "pt-BR"),
    license: text(raw.license, DEFAULT_LICENSE),
    formulaConfig: raw.formulaConfig && typeof raw.formulaConfig === "object" ? raw.formulaConfig : null
  };
}

function addDays(dateString, days) { if (!dateString) return null; const date = new Date(`${dateString}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

export function weekCalendar(input, index) {
  const weekNumber = index + 1;
  if (input.calendarMode !== "calendar" || !input.startDate) return { weekNumber, label: `Semana ${weekNumber}`, startDate: null, endDate: null };
  const startDate = addDays(input.startDate, index * 7); const endDate = addDays(startDate, 6);
  return { weekNumber, label: `Semana ${weekNumber} · ${startDate.split("-").reverse().join("/")}`, startDate, endDate };
}

function newId(prefix, weekNumber, index) { return `${prefix}${weekNumber}-${String(index + 1).padStart(3, "0")}`; }
function safeProps(props) { return props && typeof props === "object" && !Array.isArray(props) ? { ...props } : {}; }

function normalizeNested(value, weekNumber, path, seen) {
  if (!Array.isArray(value)) return value;
  return value.map((item, index) => {
    if (!item || typeof item !== "object") return item;
    if (typeof item.type === "string") return sanitizeBlock(item, weekNumber, `${path}-${index}`, seen);
    const copy = { ...item };
    for (const key of NESTED_KEYS) if (Array.isArray(copy[key])) copy[key] = normalizeNested(copy[key], weekNumber, `${path}-${key}-${index}`, seen);
    return copy;
  });
}

export function sanitizeBlock(raw, weekNumber = 1, path = "block", seen = new Set()) {
  if (!raw || typeof raw !== "object") return null;
  const type = text(raw.type); if (!KNOWN_BLOCK_TYPES.has(type)) return null;
  let id = text(raw.id, `b${weekNumber}-${path}`); if (seen.has(id)) id = `${id}-${seen.size + 1}`; seen.add(id);
  const props = safeProps(raw.props);
  for (const key of NESTED_KEYS) if (Array.isArray(props[key])) props[key] = normalizeNested(props[key], weekNumber, `${id}-${key}`, seen);
  if (["topic", "topic-collapsible", "topic-slider"].includes(type)) props.children = Array.isArray(props.children) ? props.children.filter(Boolean) : [];
  return { id, type, ...(ROOT_TYPES.has(type) ? { bg: text(raw.bg, "neutral-default"), pad: text(raw.pad, "normal") } : {}), props };
}

export function weekMeta(input, index) {
  const calendar = weekCalendar(input, index);
  return { title: `${input.title} — ${calendar.label}`, courseTitle: input.title, weekNumber: calendar.weekNumber, weekLabel: calendar.label, calendarStartDate: calendar.startDate, calendarEndDate: calendar.endDate, studyHours: input.hoursPerWeek, author: input.author, role: input.role, institution: input.institution, year: input.year, aiTool: "", aiUse: "", license: input.license };
}

function html(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function youtubeId(value) { const match = text(value).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&#/]+)/i); return match ? match[1] : ""; }

function fallbackLessonPlan(input, index) {
  const videos = input.videoLinks.map((href, i) => normalizeResource({ id: `video-${i + 1}`, type: "video", title: `Vídeo fornecido ${i + 1}`, href, required: false, verificationStatus: "provided-needs-review" }, i, "video"));
  const suggestions = input.videoSearchSuggestions.map((searchQuery, i) => normalizeResource({ id: `video-search-${i + 1}`, type: "video", title: `Busca de vídeo ${i + 1}`, searchQuery, verificationStatus: "suggested-no-url", requiresVerification: true }, i, "video"));
  const imageLinks = input.imageLinks.map((href, i) => normalizeResource({ id: `image-${i + 1}`, type: "image", title: `Imagem fornecida ${i + 1}`, href, required: false, verificationStatus: "provided-needs-review", requiresVerification: true }, i, "image"));
  const suppliedMaterials = input.materials.map((material) => ({ ...material, required: Boolean(material.required) }));
  return normalizeLessonPlan({
    weekNumber: index + 1,
    theme: `${input.title} — Semana ${index + 1}`,
    welcome: `Nesta semana, você vai relacionar ${input.title} a situações concretas e construir uma compreensão progressiva do tema.`,
    learningObjectives: input.objectives,
    contentSections: [{ number: "1", title: "Conteúdo da semana", body: input.content || `Estude os conceitos centrais de ${input.title} e relacione-os a exemplos práticos.`, subsections: [], reflection: { question: "Que problema real do seu contexto pode ser melhor compreendido com este tema?" }, resources: [] }],
    resources: { videos: [...videos, ...suggestions], readingsRequired: [], readingsExtra: suppliedMaterials.map((item) => normalizeResource(item, 0, "reading-extra")), images: imageLinks, podcasts: [], datasets: [] },
    webPractices: input.webPractices,
    synthesis: "Retome os conceitos centrais, conecte-os aos exemplos e registre uma aplicação possível no seu contexto.",
    references: input.references,
    assessment: { title: "Atividade avaliativa", format: "Questões para revisão", questions: [] },
    timePlan: { calculationMethod: "derived-after-content" }
  }, input, index);
}

function fallbackBlocks(input, index, plan = fallbackLessonPlan(input, index)) {
  const week = index + 1; const calendar = weekCalendar(input, index); const objective = plan.learningObjectives[0] || `Compreender os fundamentos de ${input.title}.`;
  const blocks = [{ id: newId("b-hero-", week, 0), type: "hero", bg: "neutral-default", pad: "normal", props: { eyebrow: calendar.label.toUpperCase(), title: `${plan.theme}: ${calendar.label}`, lead: objective, author: input.author || "Autor", authorImage: "", readTime: `${input.hoursPerWeek} h de estudo`, date: input.year } }];
  const children = [];
  if (plan.welcome) { children.push({ id: newId("c-welcome-", week, children.length), type: "prose", props: { body: `<p>${html(plan.welcome)}</p>`, dropcap: false, dropcapTone: "terracotta" } }); }
  if (plan.learningObjectives.length) children.push({ id: newId("c-objectives-", week, children.length), type: "destaque", props: { title: "Objetivos de aprendizagem", body: `<ul>${plan.learningObjectives.map((item) => `<li>${html(item)}</li>`).join("")}</ul>`, tone: "sage", icon: "" } });
  plan.contentSections.forEach((section, sectionIndex) => {
    children.push({ id: newId("c-title-", week, sectionIndex + 2), type: "titulo", props: { text: `${section.number} ${section.title}`, level: "h2" } });
    if (section.body) children.push({ id: newId("c-prose-", week, sectionIndex + 20), type: "prose", props: { body: `<p>${html(section.body)}</p>`, dropcap: sectionIndex === 0, dropcapTone: "terracotta" } });
    section.subsections.forEach((sub, subIndex) => { children.push({ id: newId("c-subtitle-", week, sectionIndex * 10 + subIndex + 1), type: "titulo", props: { text: `${sub.number} ${sub.title}`, level: "h3" } }); if (sub.body) children.push({ id: newId("c-subprose-", week, sectionIndex * 10 + subIndex + 3), type: "prose", props: { body: `<p>${html(sub.body)}</p>`, dropcap: false, dropcapTone: "terracotta" } }); });
    if (section.reflection?.question) children.push({ id: newId("c-reflection-", week, sectionIndex + 1), type: "reflexao", props: { title: "Para refletir", question: html(section.reflection.question), body: html(section.reflection.body), tone: "lavender", icon: "" } });
  });
  blocks.push({ id: newId("b-topic-", week, 1), type: "topic", bg: "neutral-default", pad: "normal", props: { children } });
  plan.resources.videos.filter((resource) => youtubeId(resource.href)).slice(0, 3).forEach((resource, resourceIndex) => blocks.push({ id: newId("b-video-", week, resourceIndex), type: "video", bg: "neutral-default", pad: "normal", props: { id: youtubeId(resource.href), title: resource.title, caption: resource.objective || "Vídeo complementar.", credit: resource.source || "", start: "" } }));
  plan.resources.images.filter((resource) => resource.href).slice(0, 4).forEach((resource, resourceIndex) => blocks.push({ id: newId("b-image-", week, resourceIndex), type: "imagem", bg: "neutral-default", pad: "normal", props: { src: resource.href, slotId: "", caption: resource.caption || resource.title, credit: resource.credit || resource.source || "", ratio: "16/9" } }));
  const materials = [...plan.resources.readingsRequired, ...plan.resources.readingsExtra, ...plan.resources.podcasts, ...plan.resources.datasets].filter((item) => item.title || item.href).map((item) => ({ type: item.kind, title: `${item.required ? "Leitura obrigatória: " : "Material extra: "}${item.title}`, source: item.source || item.objective, href: item.href }));
  if (materials.length) blocks.push({ id: newId("b-materials-", week, 20), type: "materiais", bg: "neutral-default", pad: "normal", props: { title: "Materiais de apoio", items: materials } });
  plan.webPractices.forEach((practice, practiceIndex) => blocks.push({ id: newId("b-practice-", week, practiceIndex), type: "destaque", bg: "neutral-default", pad: "tight", props: { title: practice.title, body: `<p>${html([practice.objective, practice.instructions, practice.product].filter(Boolean).join(" "))}</p>`, tone: "ocean", icon: "" } }));
  if (plan.synthesis) blocks.push({ id: newId("b-synthesis-", week, 0), type: "sintese", bg: "sage-deep", pad: "airy", props: { eyebrow: "Síntese", title: "A ideia que fecha a semana", body: `<p>${html(plan.synthesis)}</p>` } });
  if (plan.references.length) blocks.push({ id: newId("b-references-", week, 0), type: "referencias", bg: "neutral-default", pad: "normal", props: { title: "Referências", items: plan.references.map((item) => ({ html: html(item) })) } });
  if (plan.assessment.questions.length) blocks.push({ id: newId("b-quiz-", week, 0), type: "quiz", bg: "neutral-subtle", pad: "normal", props: { title: plan.assessment.title, intro: plan.assessment.format, avaliativo: true, passMark: plan.assessment.passMark, questions: plan.assessment.questions } });
  return blocks;
}

export function buildFallbackLesson(input, index) {
  const lessonPlan = fallbackLessonPlan(input, index);
  return { meta: weekMeta(input, index), lessonPlan, blocks: fallbackBlocks(input, index, lessonPlan) };
}

export function normalizeLesson(raw, input, index) {
  const fallback = buildFallbackLesson(input, index); const source = raw && typeof raw === "object" ? raw : {}; const seen = new Set();
  const blocks = Array.isArray(source.blocks) ? source.blocks.map((block, i) => sanitizeBlock(block, index + 1, `block-${i}`, seen)).filter(Boolean) : [];
  const lessonPlan = normalizeLessonPlan(source.lessonPlan || source.plan || fallback.lessonPlan, input, index);
  return { meta: { ...fallback.meta, ...(source.meta && typeof source.meta === "object" ? source.meta : {}), ...weekMeta(input, index) }, lessonPlan, blocks: blocks.length ? blocks : fallback.blocks };
}

export function normalizeWeeklyOutput(raw, input) {
  const candidates = Array.isArray(raw) ? raw : (Array.isArray(raw?.weeks) ? raw.weeks : []);
  return Array.from({ length: input.weeks }, (_, index) => normalizeLesson(candidates[index], input, index));
}

export function validateLesson(lesson) {
  return Boolean(lesson && lesson.meta && lesson.lessonPlan && Array.isArray(lesson.lessonPlan.contentSections) && Array.isArray(lesson.blocks) && lesson.blocks.length > 0 && lesson.blocks.every((block) => KNOWN_BLOCK_TYPES.has(block.type)));
}
