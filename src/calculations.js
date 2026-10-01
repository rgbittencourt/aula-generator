import {
  assessmentMinutes,
  datasetMinutes,
  digitalContentMinutes,
  forumMinutes,
  imageMinutes,
  readingMinutes,
  resolveFormulaProfile,
  synchronousCommunicationMinutes,
  formulaProfileSummary
} from "./formula-profile.js";
import { practiceScheduledForWeek } from "./aula-schema.js";

const round = (value) => Math.max(0, Math.round(Number(value) || 0));
const decimal = (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
const text = (value) => String(value ?? "").trim();
const positive = (value) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; };
const stripHtml = (value) => text(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const words = (value) => stripHtml(value).split(/\s+/).filter(Boolean).length;

export const PENDING_FORMULA_PROFILE = { status: "internal-profile", ...resolveFormulaProfile() };

function item({ id, title, category, minutes, basis, confidence = "medium", required = true, formulaKey = "", details = {}, instructionalMinutes = 0 }) {
  const learnerMinutes = decimal(minutes);
  return {
    id,
    title,
    category,
    minutes: learnerMinutes,
    estimatedMinutes: learnerMinutes,
    learnerMinutes,
    instructionalMinutes: decimal(instructionalMinutes || learnerMinutes * PENDING_FORMULA_PROFILE.constants.instructionalToLearnerRatio),
    required,
    basis,
    confidence,
    formulaKey,
    details
  };
}

function countWordsInSection(section) {
  return words(section?.body) + (Array.isArray(section?.subsections) ? section.subsections.reduce((sum, sub) => sum + words(sub?.body), 0) : 0);
}

function estimateContentItems(lesson, profile) {
  const sections = Array.isArray(lesson?.lessonPlan?.contentSections) ? lesson.lessonPlan.contentSections : [];
  const items = sections.map((section, index) => {
    const wordCount = countWordsInSection(section);
    const minutes = digitalContentMinutes(wordCount, profile);
    return item({ id: `content-${index + 1}`, title: section.title || `Conteúdo didático ${index + 1}`, category: "content", minutes, basis: `${wordCount} palavras ÷ ${profile.constants.wordsPerMinute} × ${profile.constants.digitalContentFactor} minutos`, confidence: wordCount ? "high" : "low", required: true, formulaKey: "digitalContent", details: { wordCount, source: "perfil interno · conteúdo digital" } });
  }).filter((entry) => entry.minutes > 0);
  return items;
}

function resourceReadingItem(resource, index, required, profile, category) {
  const minutes = readingMinutes(resource, profile);
  const kind = /popular|blog|site|not[ií]cia/i.test(`${resource.type || resource.kind} ${resource.title}`) ? "popular" : "scientific";
  const basis = resource.pages ? `${resource.pages} páginas × ${kind === "popular" ? profile.constants.popularMinutesPerPage : profile.constants.scientificMinutesPerPage} min/página` : `${resource.wordCount || resource.words || 0} palavras ÷ ${profile.constants.wordsPerMinute} × ${kind === "popular" ? profile.constants.popularMinutesPerPage : profile.constants.scientificMinutesPerPage} min`;
  return { entry: item({ id: `${category}-${index + 1}`, title: resource.title || `Leitura ${index + 1}`, category: "reading", minutes, basis, confidence: minutes ? (resource.pages || resource.wordCount ? "high" : "medium") : "low", required, formulaKey: kind === "popular" ? "popularReading" : "scientificReading", details: { pages: resource.pages, wordCount: resource.wordCount || resource.words || 0, kind, href: resource.href, verificationStatus: resource.verificationStatus } }), pending: minutes ? null : { type: "reading", title: resource.title || `Leitura ${index + 1}`, reason: "informe páginas ou número de palavras para calcular o tempo" } };
}

function estimateResourceItems(lesson, profile) {
  const resources = lesson?.lessonPlan?.resources || {};
  const items = [];
  const unresolved = [];
  const requiredReadings = Array.isArray(resources.readingsRequired) ? resources.readingsRequired : [];
  const extraReadings = Array.isArray(resources.readingsExtra) ? resources.readingsExtra : [];
  requiredReadings.forEach((resource, index) => { const result = resourceReadingItem(resource, index, true, profile, "required-reading"); if (result.entry.minutes) items.push(result.entry); if (result.pending) unresolved.push(result.pending); });
  extraReadings.forEach((resource, index) => { const result = resourceReadingItem(resource, index, false, profile, "extra-reading"); if (result.entry.minutes) items.push(result.entry); if (result.pending) unresolved.push(result.pending); });
  const videos = Array.isArray(resources.videos) ? resources.videos : [];
  videos.forEach((resource, index) => {
    const minutes = positive(resource.durationMinutes);
    if (minutes) items.push(item({ id: `video-${index + 1}`, title: resource.title || `Vídeo ${index + 1}`, category: "video", minutes, basis: "duração informada/conferida do vídeo", confidence: resource.verificationStatus === "verified" ? "high" : "medium", required: Boolean(resource.required), formulaKey: "video", details: { href: resource.href, searchQuery: resource.searchQuery, verificationStatus: resource.verificationStatus } }));
    else unresolved.push({ type: "video", title: resource.title || `Vídeo ${index + 1}`, reason: "informe ou confira a duração antes de fechar a carga" });
  });
  const podcasts = Array.isArray(resources.podcasts) ? resources.podcasts : [];
  podcasts.forEach((resource, index) => {
    const minutes = positive(resource.durationMinutes);
    if (minutes) items.push(item({ id: `podcast-${index + 1}`, title: resource.title || `Podcast ${index + 1}`, category: "audio", minutes, basis: "duração informada do áudio", confidence: "medium", required: Boolean(resource.required), formulaKey: "audio", details: { href: resource.href } }));
    else unresolved.push({ type: "audio", title: resource.title || `Podcast ${index + 1}`, reason: "informe a duração do áudio" });
  });
  const images = Array.isArray(resources.images) ? resources.images : [];
  if (images.length) items.push(item({ id: "images", title: "Observação de imagens, diagramas e legendas", category: "image", minutes: imageMinutes(images.length, profile), basis: `${images.length} imagem(ns) × ${profile.constants.imageMinutes} minutos de observação orientada`, confidence: "low", required: false, formulaKey: "image", details: { count: images.length } }));
  const datasets = Array.isArray(resources.datasets) ? resources.datasets : [];
  if (datasets.length) items.push(item({ id: "datasets", title: "Exploração orientada de dados", category: "data", minutes: datasetMinutes(datasets.length, profile), basis: `${datasets.length} base(s) × ${profile.constants.datasetMinutes} minutos de exploração inicial`, confidence: "low", required: true, formulaKey: "dataset", details: { count: datasets.length } }));
  return { items, unresolved };
}

function estimatePracticeItems(lesson, input, profile) {
  const weekIndex = Math.max(0, Number(lesson?.meta?.weekNumber || 1) - 1);
  const practices = (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, weekIndex));
  return practices.map((practice, index) => {
    const minutes = positive(practice.durationMinutes || practice.sessionMinutes) || (Array.isArray(practice.steps) ? practice.steps.reduce((sum, step) => sum + positive(step.minutes), 0) : 0);
    return item({ id: `webpractice-${index + 1}`, title: practice.title || `Webprática ${index + 1}`, category: "practice", minutes, basis: minutes ? "duração da sessão/etapas da webprática" : "webprática sem duração definida", confidence: minutes ? "medium" : "low", required: true, formulaKey: "webPractice", details: { type: practice.type, moments: practice.moments, artifacts: (practice.artifacts || []).length } });
  }).filter((entry) => entry.minutes > 0);
}

function estimateAssessmentItems(lesson, profile) {
  const assessment = lesson?.lessonPlan?.assessment || {};
  const questions = Array.isArray(assessment.questions) ? assessment.questions.length : 0;
  const explicit = positive(assessment.durationMinutes || assessment.timeEstimateMinutes);
  if (!questions && !explicit) return [];
  const minutes = explicit || assessmentMinutes({ count: questions, durationMinutes: profile.constants.quizMinutesPerQuestion }, profile);
  return [item({ id: "assessment", title: assessment.title || "Atividade avaliativa", category: "assessment", minutes, basis: explicit ? "duração informada da avaliação" : `${questions} questão(ões) × ${profile.constants.quizMinutesPerQuestion} minutos`, confidence: explicit ? "high" : "low", required: assessment.required !== false, formulaKey: "quiz", details: { questions, passMark: assessment.passMark } })];
}

function estimateActivityItems(lesson, profile) {
  const activities = Array.isArray(lesson?.lessonPlan?.activities) ? lesson.lessonPlan.activities : [];
  return activities.map((activity, index) => {
    const kind = `${activity.type || activity.kind || ""} ${activity.title || ""}`.toLowerCase();
    const count = positive(activity.count || activity.quantity) || 1;
    let minutes = positive(activity.durationMinutes || activity.minutes);
    let formulaKey = "customActivity";
    let category = "other";
    let basis = "duração informada da atividade";
    if (/f[oó]rum|discuss[aã]o|post/.test(kind)) { minutes = forumMinutes(count, profile); formulaKey = "forum"; category = "forum"; basis = `${count} post(s) × ${profile.constants.forumMinutesPerPost} minutos`; }
    else if (/s[ií]ncrona|webconfer[eê]ncia|reuni[aã]o|comunica/.test(kind)) { minutes = synchronousCommunicationMinutes({ count, hoursPerCommunication: activity.hoursPerCommunication, durationMinutes: activity.unitDurationMinutes || activity.durationMinutes }); formulaKey = "communication"; category = "communication"; basis = `${count} comunicação(ões) conforme duração/horas informadas`; }
    else if (/quiz|teste|avalia/.test(kind)) { minutes = assessmentMinutes({ count, durationMinutes: activity.unitDurationMinutes || activity.durationMinutes }, profile); formulaKey = "quiz"; category = "assessment"; basis = `${count} avaliação(ões) × duração informada ou padrão`; }
    else if (/projeto|pr[aá]tica/.test(kind)) { category = "project"; formulaKey = "project"; basis = "duração do projeto/prática informada"; }
    return item({ id: `activity-${index + 1}`, title: activity.title || `Atividade ${index + 1}`, category, minutes, basis, confidence: minutes ? "medium" : "low", required: activity.required !== false, formulaKey, details: { type: activity.type || activity.kind, count } });
  }).filter((entry) => entry.minutes > 0);
}

function estimateReviewItems(lesson) {
  const plan = lesson?.lessonPlan || {};
  const items = [];
  if (plan.synthesis) items.push(item({ id: "synthesis", title: "Síntese e revisão final", category: "review", minutes: 10, basis: "síntese conceitual da semana", confidence: "low", required: true, formulaKey: "review" }));
  if (plan.nextWeekConnection) items.push(item({ id: "next-week", title: "Conexão com a próxima semana", category: "review", minutes: 3, basis: "leitura da transição curricular", confidence: "low", required: false, formulaKey: "review" }));
  return items;
}

function explicitItems(lesson) {
  const items = lesson?.lessonPlan?.timePlan?.items;
  if (!Array.isArray(items) || !items.some((entry) => positive(entry?.minutes || entry?.estimatedMinutes))) return [];
  return items.map((entry, index) => item({ id: entry.id || `time-${index + 1}`, title: entry.title || `Atividade ${index + 1}`, category: entry.category || "content", minutes: entry.minutes || entry.estimatedMinutes, basis: entry.basis || "tempo informado no plano", confidence: entry.confidence || "medium", required: entry.required !== false, formulaKey: entry.formulaKey || "explicit", details: entry.details || {}, instructionalMinutes: entry.instructionalMinutes }));
}

function derivedItems(input, lesson, profile) {
  const explicit = explicitItems(lesson);
  if (explicit.length) return { items: explicit, unresolved: [] };
  const resources = estimateResourceItems(lesson, profile);
  return {
    items: [...estimateContentItems(lesson, profile), ...resources.items, ...estimatePracticeItems(lesson, input, profile), ...estimateActivityItems(lesson, profile), ...estimateAssessmentItems(lesson, profile), ...estimateReviewItems(lesson)].filter((entry) => entry.minutes > 0),
    unresolved: resources.unresolved
  };
}

function allocationFromItems(items) {
  const output = { contentMinutes: 0, resourcesMinutes: 0, practiceMinutes: 0, assessmentMinutes: 0, reviewMinutes: 0, communicationMinutes: 0, projectMinutes: 0, otherMinutes: 0 };
  for (const entry of items) {
    const key = entry.category === "practice" ? "practiceMinutes" : entry.category === "assessment" ? "assessmentMinutes" : entry.category === "review" ? "reviewMinutes" : entry.category === "communication" ? "communicationMinutes" : entry.category === "project" ? "projectMinutes" : ["reading", "video", "audio", "image", "data"].includes(entry.category) ? "resourcesMinutes" : entry.category === "content" ? "contentMinutes" : "otherMinutes";
    output[key] += entry.minutes;
  }
  return output;
}

function workloadAdjustment(items, targetMinutes, calculatedMinutes) {
  const variance = calculatedMinutes - targetMinutes;
  const suggestions = [];
  if (variance > 0) {
    const optional = items.filter((entry) => entry.required === false).sort((a, b) => b.minutes - a.minutes);
    for (const entry of optional.slice(0, 4)) {
      suggestions.push({ action: entry.category === "video" ? "make-optional" : "move-resource", resourceId: entry.id, title: entry.title, minutesSaved: entry.minutes, toWeek: null, rationale: "Reduzir a carga obrigatória sem retirar o núcleo conceitual." });
    }
    const video = items.find((entry) => entry.category === "video" && entry.required !== false);
    if (video) suggestions.push({ action: "shorten-or-replace-video", resourceId: video.id, title: video.title, minutesSaved: Math.round(video.minutes * 0.5), rationale: "Substituir por vídeo mais curto ou por alternativa textual equivalente." });
    const practice = items.find((entry) => entry.category === "practice");
    if (practice) suggestions.push({ action: "split-practice", resourceId: practice.id, title: practice.title, minutesSaved: Math.round(practice.minutes * 0.35), toWeek: null, rationale: "Dividir a produção em duas entregas ou mover uma etapa para a semana seguinte." });
  } else if (variance < 0) {
    suggestions.push({ action: "deepen-content", minutesAdded: Math.abs(variance), rationale: "Acrescentar exemplo aplicado, leitura extra ou prática de interpretação sem alterar os objetivos." });
    suggestions.push({ action: "add-formative-check", minutesAdded: Math.min(15, Math.abs(variance)), rationale: "Inserir uma checagem formativa com feedback durante o texto." });
  }
  return { targetMinutes, calculatedMinutes, status: variance > 0 ? "over-target" : variance < 0 ? "under-target" : "balanced", varianceMinutes: variance, suggestions };
}

function ratioAllocation(totalMinutes, ratios) {
  const keys = ["content", "practice", "assessment", "review"];
  const values = keys.map((key) => Math.max(0, Number(ratios?.[key]) || 0));
  const sum = values.reduce((a, b) => a + b, 0);
  if (!sum) return null;
  const scaled = values.map((value) => value / sum * totalMinutes);
  const contentMinutes = round(scaled[0]);
  const practiceMinutes = round(scaled[1]);
  const assessmentMinutes = round(scaled[2]);
  const reviewMinutes = Math.max(0, totalMinutes - contentMinutes - practiceMinutes - assessmentMinutes);
  return { contentMinutes, practiceMinutes, assessmentMinutes, reviewMinutes };
}

export function calculateWeekWorkload(input, formulaConfigOrIndex = input.formulaConfig || PENDING_FORMULA_PROFILE, lessonOrFormulaConfig = null, legacyLesson = null) {
  const legacySignature = typeof formulaConfigOrIndex === "number";
  const index = legacySignature ? formulaConfigOrIndex : 0;
  let formulaConfig = legacySignature ? (lessonOrFormulaConfig || input.formulaConfig || PENDING_FORMULA_PROFILE) : formulaConfigOrIndex;
  let lesson = legacySignature ? legacyLesson : lessonOrFormulaConfig;
  if (Array.isArray(formulaConfig)) { lesson = formulaConfig; formulaConfig = input.formulaConfig || PENDING_FORMULA_PROFILE; }
  const profile = resolveFormulaProfile(formulaConfig);
  const targetMinutes = round(input.hoursPerWeek * 60);
  const derived = derivedItems(input, lesson, profile);
  const calculatedMinutes = derived.items.reduce((sum, entry) => sum + entry.learnerMinutes, 0);
  const requiredMinutes = derived.items.filter((entry) => entry.required).reduce((sum, entry) => sum + entry.learnerMinutes, 0);
  const optionalMinutes = calculatedMinutes - requiredMinutes;
  const instructionalMinutes = derived.items.reduce((sum, entry) => sum + entry.instructionalMinutes, 0);
  const varianceMinutes = calculatedMinutes - targetMinutes;
  const tolerance = Math.max(15, Math.round(targetMinutes * 0.1));
  const fitStatus = Math.abs(varianceMinutes) <= tolerance ? "balanced" : varianceMinutes > 0 ? "over-target" : "under-target";
  return {
    weekNumber: lesson?.meta?.weekNumber || index + 1,
    targetMinutes,
    targetLearnerMinutes: targetMinutes,
    targetInstructionalMinutes: round(targetMinutes * profile.constants.instructionalToLearnerRatio),
    totalMinutes: targetMinutes,
    calculatedMinutes,
    derivedMinutes: calculatedMinutes,
    requiredMinutes,
    optionalMinutes,
    instructionalMinutes,
    totalHours: input.hoursPerWeek,
    varianceMinutes,
    fitStatus,
    webPracticeEnabled: input.webPractice.enabled,
    allocation: ratioAllocation(targetMinutes, formulaConfig?.ratios) || allocationFromItems(derived.items),
    categoryTotals: allocationFromItems(derived.items),
    items: derived.items,
    unresolved: derived.unresolved,
    workloadAdjustment: workloadAdjustment(derived.items, targetMinutes, calculatedMinutes),
    formulaStatus: formulaConfig?.ratios ? "configured" : "internal-profile",
    formulaProfile: formulaProfileSummary(profile),
    formulaNote: "Perfil interno: o conteúdo é calculado depois que a semana é escrita; itens sem páginas, palavras ou duração ficam pendentes de conferência."
  };
}

export function calculateCourseWorkload(input, formulaConfig = input.formulaConfig || PENDING_FORMULA_PROFILE, lessons = []) {
  if (Array.isArray(formulaConfig)) { lessons = formulaConfig; formulaConfig = input.formulaConfig || PENDING_FORMULA_PROFILE; }
  const weeks = Array.from({ length: input.weeks }, (_, index) => ({ ...calculateWeekWorkload(input, formulaConfig, lessons[index] || null), weekNumber: index + 1 }));
  return {
    totalHours: input.hoursPerWeek * input.weeks,
    totalMinutes: weeks.reduce((sum, week) => sum + week.totalMinutes, 0),
    totalTargetLearnerMinutes: weeks.reduce((sum, week) => sum + week.targetLearnerMinutes, 0),
    totalTargetInstructionalMinutes: weeks.reduce((sum, week) => sum + week.targetInstructionalMinutes, 0),
    calculatedMinutes: weeks.reduce((sum, week) => sum + week.calculatedMinutes, 0),
    derivedMinutes: weeks.reduce((sum, week) => sum + week.calculatedMinutes, 0),
    requiredMinutes: weeks.reduce((sum, week) => sum + week.requiredMinutes, 0),
    optionalMinutes: weeks.reduce((sum, week) => sum + week.optionalMinutes, 0),
    instructionalMinutes: weeks.reduce((sum, week) => sum + week.instructionalMinutes, 0),
    formulaStatus: formulaConfig?.ratios ? "configured" : "internal-profile",
    formulaProfile: formulaProfileSummary(resolveFormulaProfile(formulaConfig)),
    weeks
  };
}

export function buildGeneralPlan(input, workload, lessons = [], teacherGuides = []) {
  const categoryTotals = {};
  const unresolved = [];
  for (const week of workload.weeks || []) {
    for (const [key, value] of Object.entries(week.categoryTotals || {})) categoryTotals[key] = (categoryTotals[key] || 0) + value;
    (week.unresolved || []).forEach((entry) => unresolved.push({ ...entry, weekNumber: week.weekNumber }));
  }
  const webPractices = [];
  (teacherGuides || []).forEach((guide) => (guide.webPracticeProjects || guide.webPractices || []).forEach((practice) => { if (!webPractices.some((current) => current.id === practice.id)) webPractices.push(practice); }));
  if (!webPractices.length) (lessons || []).forEach((lesson) => (lesson.lessonPlan?.webPractices || []).forEach((practice) => { if (!webPractices.some((current) => current.id === practice.id)) webPractices.push(practice); }));
  if (!webPractices.length) input.webPractices.filter((practice) => Number(practice.weekNumber || practice.week) > 0 || text(practice.date || practice.sessionDate) || Array.isArray(practice.moments) && practice.moments.length).forEach((practice) => { if (!webPractices.some((current) => current.id === practice.id)) webPractices.push(practice); });
  const target = workload.totalTargetLearnerMinutes || workload.totalMinutes || 0;
  const calculated = workload.calculatedMinutes || workload.derivedMinutes || 0;
  const progression = lessons.map((lesson, index) => ({ weekNumber: index + 1, theme: lesson.lessonPlan?.theme, previousConceptsReviewed: lesson.lessonPlan?.spiralReview?.previousConceptsReviewed || [], newConcepts: lesson.lessonPlan?.spiralReview?.newConcepts || [], preparationForNextWeek: lesson.lessonPlan?.spiralReview?.preparationForNextWeek || [], projectMilestone: lesson.lessonPlan?.spiralReview?.projectMilestone || "" }));
  const checklist = lessons.flatMap((lesson, index) => (lesson.lessonPlan?.pedagogicalReview?.checks || []).map((check) => ({ ...check, weekNumber: index + 1 })));
  return {
    title: input.title,
    course: { audience: input.audience, level: input.level, weeks: input.weeks, hoursPerWeek: input.hoursPerWeek, calendarMode: input.calendarMode, startDate: input.startDate, objectives: input.objectives },
    formulaProfile: workload.formulaProfile,
    totals: { targetLearnerMinutes: target, targetInstructionalMinutes: workload.totalTargetInstructionalMinutes || 0, calculatedLearnerMinutes: calculated, requiredMinutes: workload.requiredMinutes || 0, optionalMinutes: workload.optionalMinutes || 0, instructionalMinutes: workload.instructionalMinutes || 0, varianceMinutes: calculated - target, targetHours: target / 60, calculatedHours: calculated / 60 },
    categoryTotals,
    weeks: (workload.weeks || []).map((week) => ({ weekNumber: week.weekNumber, targetMinutes: week.targetMinutes, calculatedMinutes: week.calculatedMinutes, requiredMinutes: week.requiredMinutes, optionalMinutes: week.optionalMinutes, varianceMinutes: week.varianceMinutes, fitStatus: week.fitStatus, items: week.items, unresolved: week.unresolved, workloadAdjustment: week.workloadAdjustment })),
    webPractices,
    didacticArcs: (teacherGuides || []).map((guide) => ({ weekNumber: guide.weekNumber, id: guide.didacticArc?.id, label: guide.didacticArc?.label })),
    webPracticeSchedule: webPractices.map((practice) => ({ id: practice.id, title: practice.title, weekNumber: practice.weekNumber || null, date: practice.date || "", dayOfWeek: practice.dayOfWeek || "", startTime: practice.startTime || "", endTime: practice.endTime || "", modality: practice.modality || "", durationMinutes: practice.durationMinutes || 0 })),
    teacherGuide: { available: Boolean(teacherGuides?.length), format: "pdf + docx por webprática" },
    progression,
    pedagogicalChecks: lessons.map((lesson) => ({ weekNumber: lesson.meta?.weekNumber, review: lesson.lessonPlan?.pedagogicalReview, contentQuality: lesson.contentQuality })),
    pedagogicalChecklist: checklist,
    unresolvedResources: unresolved,
    notes: ["A carga da semana é calculada depois da redação do conteúdo.", "Links sem duração, leituras sem páginas/palavras e fontes não conferidas permanecem sinalizados para revisão humana."]
  };
}

export function attachWorkloadToLessons(lessons, workload) {
  return lessons.map((lesson, index) => {
    const week = workload.weeks[index];
    if (!week) return lesson;
    return {
      ...lesson,
      lessonPlan: {
        ...lesson.lessonPlan,
        timePlan: {
          ...(lesson.lessonPlan?.timePlan || {}),
          targetMinutes: week.targetMinutes,
          targetLearnerMinutes: week.targetLearnerMinutes,
          targetInstructionalMinutes: week.targetInstructionalMinutes,
          calculatedMinutes: week.calculatedMinutes,
          requiredMinutes: week.requiredMinutes,
          optionalMinutes: week.optionalMinutes,
          instructionalMinutes: week.instructionalMinutes,
          items: week.items,
          unresolved: week.unresolved,
          workloadAdjustment: week.workloadAdjustment,
          formulaProfile: week.formulaProfile,
          calculationMethod: "aula-generator-internal-profile",
          notes: `${week.fitStatus}; diferença de ${week.varianceMinutes} minutos em relação à meta do estudante.`
        }
      }
    };
  });
}
