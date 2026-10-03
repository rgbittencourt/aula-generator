import { buildAlignmentMatrix, buildProgression, fallbackDidacticArc, pedagogicalReview, normalizeDidacticArc } from "./pedagogy.js";
import { practiceScheduledForWeek } from "./aula-schema.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function resourceNotesForPlan(plan = {}) {
  const sections = Array.isArray(plan.contentSections) ? plan.contentSections : [];
  const root = Object.values(plan.resources || {}).flatMap((items) => Array.isArray(items) ? items : []);
  const scoped = sections.flatMap((section) => (section.resources || []).map((resource) => ({ resource, sectionNumber: section.number, sectionTitle: section.title })));
  const all = [...scoped, ...root.map((resource) => ({ resource }))];
  const merged = new Map();
  all.forEach(({ resource, sectionNumber, sectionTitle }) => {
    const item = object(resource);
    const id = text(item.id || item.title || item.href);
    if (!id) return;
    const current = merged.get(id) || { resource: {}, sectionNumber: "", sectionTitle: "" };
    merged.set(id, {
      resource: { ...current.resource, ...item },
      sectionNumber: current.sectionNumber || sectionNumber || item.sectionNumber || "",
      sectionTitle: current.sectionTitle || sectionTitle || ""
    });
  });
  return [...merged.entries()].map(([id, { resource, sectionNumber, sectionTitle }]) => {
    const item = object(resource);
    return {
      id,
      sectionNumber: text(sectionNumber || item.sectionNumber, "a definir"),
      sectionTitle: text(sectionTitle, "Ponto de uso a localizar"),
      kind: text(item.kind || item.type, "recurso"),
      title: text(item.title, "Recurso sem título"),
      href: text(item.href || item.link || item.url),
      source: text(item.source || item.publisher || item.institution),
      author: text(item.author),
      required: Boolean(item.required),
      moment: text(item.moment || item.placement),
      objective: text(item.objective || item.purpose),
      guidingQuestion: text(item.guidingQuestion || item.question),
      bridgeParagraph: text(item.bridgeParagraph || item.connectionParagraph || item.bridge),
      pedagogicalUse: text(item.pedagogicalUse),
      selectionReason: text(item.selectionReason || item.reason),
      verificationStatus: text(item.verificationStatus || item.researchStatus, "a conferir"),
      humanApproval: text(item.humanApproval || item.approvalStatus, "pending"),
      durationMinutes: Number(item.durationMinutes || item.duration || 0) || 0,
      pages: text(item.pages),
      wordCount: Number(item.wordCount || item.words || 0) || 0,
      year: text(item.year),
      sourcePage: text(item.sourcePage),
      provider: text(item.provider),
      license: text(item.license),
      curation: object(item.curation),
      accessibility: object(item.accessibility || item.videoAccessibility),
      notes: text(item.notes)
    };
  }).filter(Boolean);
}

function mediationStops(plan = {}) {
  const stops = [{
    id: "opening",
    relatedType: "opening",
    timing: "Abertura da semana",
    purpose: "Situar o estudante no problema, no percurso e no sentido de estudar este tema agora.",
    studentNeed: "Entender por onde começar e perceber que o conteúdo conversa com seu contexto.",
    teacherIntent: "Acolher, orientar a sequência e criar uma pergunta genuína de entrada."
  }];
  (Array.isArray(plan.formativeChecks) ? plan.formativeChecks : []).forEach((check, index) => {
    stops.push({
      id: text(check.id, `formative-${index + 1}`),
      relatedType: "formativeCheck",
      timing: text(check.moment, `Parada de aprendizagem ${index + 1}`),
      purpose: "Transformar a leitura em elaboração própria e revelar dúvidas antes da avaliação final.",
      studentNeed: text(check.prompt, "Responder com as próprias palavras e relacionar o conceito a uma situação concreta."),
      teacherIntent: text(check.feedback || check.action, "Acompanhar a resposta, acolher o erro e indicar o próximo passo."),
      prompt: text(check.prompt)
    });
  });
  (Array.isArray(plan.activities) ? plan.activities : []).forEach((activity, index) => {
    stops.push({
      id: text(activity.id, `activity-${index + 1}`),
      relatedType: "activity",
      timing: text(activity.title, `Atividade ${index + 1}`),
      purpose: "Ajudar o estudante a produzir uma evidência e aplicar o conteúdo, não apenas marcar presença.",
      studentNeed: text(activity.instructions, "Executar a atividade e registrar a evidência solicitada."),
      teacherIntent: text(activity.feedback || activity.criteria?.join?.("; "), "Comentar a produção destacando uma conquista e um próximo passo."),
      prompt: text(activity.instructions)
    });
  });
  if (stops.length === 1) stops.push({
    id: "study-checkpoint",
    relatedType: "studyCheckpoint",
    timing: "Durante o estudo",
    purpose: "Evitar que o estudante atravesse o texto de forma passiva.",
    studentNeed: "Anotar uma dúvida, conexão ou exemplo antes de seguir.",
    teacherIntent: "Estimular uma pequena evidência de leitura e abrir espaço para ajuda."
  });
  stops.push({
    id: "closing",
    relatedType: "closing",
    timing: "Fechamento da semana",
    purpose: "Consolidar a aprendizagem, reconhecer o esforço e preparar a continuidade do percurso.",
    studentNeed: "Saber o que precisa entregar e o que deve levar para a próxima semana.",
    teacherIntent: "Fechar o ciclo com síntese, devolutiva e convite à continuidade."
  });
  return stops;
}

function defaultMediationMessages(input = {}, plan = {}, practices = [], index = 0) {
  const theme = text(plan.theme || input.title, `o tema da semana ${index + 1}`);
  const activity = Array.isArray(plan.activities) ? plan.activities.find((item) => item?.title) : null;
  const practiceLine = practices[0] ? ` Há também a webprática “${text(practices[0].title, "atividade prática")}; confirme a agenda, os materiais e o que precisa chegar preparado.` : "";
  const stops = mediationStops(plan);
  const make = (channel, stop, stopIndex) => {
    const isWhatsApp = channel === "whatsapp";
    let message = "";
    if (stop.relatedType === "opening") {
      message = isWhatsApp
        ? `Oi, pessoal! Nesta semana vamos conversar sobre “${theme}”. Antes de correr para a atividade, leiam a abertura e os objetivos: eles mostram a pergunta que guia o percurso e ajudam a perceber por que esse assunto importa para a prática. Comecem no ritmo possível e tragam uma dúvida ou exemplo do contexto de vocês.${practiceLine}`
        : `Olá, turma! A semana ${index + 1} foi organizada em torno de “${theme}”. Iniciem pela abertura e pelos objetivos, observem a pergunta central e sigam a ordem das seções. O propósito não é apenas concluir a leitura, mas relacionar os conceitos ao contexto de vocês.${practiceLine}`;
    } else if (stop.relatedType === "formativeCheck") {
      message = isWhatsApp
        ? `Pausa rápida no caminho: chegou a hora de “${stop.timing}”. Respondam com as próprias palavras, mesmo que a resposta ainda esteja em construção. Essa parada serve para transformar leitura em pensamento e nos mostrar onde vale conversar mais. Se travar, contem o que já entenderam e apontem exatamente a dúvida — isso já é um ótimo começo.`
        : `Ao chegar a “${stop.timing}”, interrompa a leitura por alguns minutos e responda à parada de aprendizagem. A resposta não precisa ser perfeita: ela funciona como evidência do raciocínio em formação e permite identificar conceitos que precisam de retomada, exemplo ou feedback.`;
    } else if (stop.relatedType === "activity") {
      message = isWhatsApp
        ? `Agora é hora de colocar a ideia para trabalhar na atividade “${stop.timing}”. Não procure apenas uma resposta bonita: mostre como você pensou, que evidência usou e onde ficou inseguro. Uma produção honesta ajuda muito mais do que uma resposta pronta. Se puder, compartilhe uma descoberta ou pergunta no espaço combinado.`
        : `A atividade “${stop.timing}” foi pensada para transformar o conteúdo em uma evidência observável. Ao realizá-la, explicite seu raciocínio, use os conceitos da semana e registre dúvidas ou escolhas. Essa produção ajuda a turma e o professor a perceberem o que já está consolidado e o que ainda merece apoio.`;
    } else if (stop.relatedType === "closing") {
      message = isWhatsApp
        ? `Chegando ao fim da semana: revisem a síntese, confiram a entrega e anotem uma ideia que mudou ou ficou mais nítida. Se algo ainda parece embaralhado, mandem a dúvida — não precisa esperar ela virar um monstro de sete cabeças. Na próxima etapa, vamos retomar esse fio.`
        : `Para concluir a semana, revise a síntese, confira a atividade e envie a evidência solicitada. Registre também uma aprendizagem, uma dúvida e uma conexão com sua realidade. Esse pequeno balanço orienta a continuidade do percurso e ajuda a planejar o apoio necessário.`;
    } else {
      message = isWhatsApp
        ? `Como está o estudo de “${theme}”? Faça uma pausa, anote uma conexão ou pergunta e retome pelo trecho que mais gerou dúvida. Estudar em pequenos avanços vale mais do que deixar tudo para a última curva${activity?.title ? `, especialmente antes de “${activity.title}”` : ""}.`
        : `Durante o estudo de “${theme}”, faça uma pausa para registrar uma conexão, um exemplo ou uma pergunta. Essa evidência breve ajuda a transformar a leitura em aprendizagem e prepara a participação nas atividades da semana.`;
    }
    return {
      id: `${channel}-${index + 1}-${stop.id}`,
      relatedId: stop.id,
      relatedType: stop.relatedType,
      timing: stop.timing,
      purpose: stop.purpose,
      studentNeed: stop.studentNeed,
      teacherIntent: stop.teacherIntent,
      tone: isWhatsApp ? "acolhedor, próximo e com humor leve" : "acolhedor, claro e organizado",
      text: message,
      order: stopIndex + 1
    };
  };
  return {
    whatsapp: stops.map((stop, stopIndex) => make("whatsapp", stop, stopIndex)),
    moodle: stops.map((stop, stopIndex) => make("moodle", stop, stopIndex))
  };
}

function normalizeMessageList(value, channel, fallback, index) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = values.map((item, messageIndex) => {
    const source = typeof item === "string" ? { text: item } : object(item);
    const defaultItem = fallback[messageIndex] || {};
    return {
      id: text(source.id, `${channel}-${index + 1}-${messageIndex + 1}`),
      relatedId: text(source.relatedId || source.relatedTo, defaultItem.relatedId),
      relatedType: text(source.relatedType || source.type, defaultItem.relatedType),
      timing: text(source.timing || source.when || source.moment, defaultItem.timing || `Mensagem ${messageIndex + 1}`),
      purpose: text(source.purpose || source.objective, defaultItem.purpose),
      studentNeed: text(source.studentNeed || source.studentPerspective, defaultItem.studentNeed),
      teacherIntent: text(source.teacherIntent || source.mediationIntent, defaultItem.teacherIntent),
      tone: text(source.tone || source.voice, defaultItem.tone || (channel === "whatsapp" ? "acolhedor e próximo" : "acolhedor e claro")),
      instructions: text(source.instructions || source.specificInstructions || source.contextForRewrite, defaultItem.instructions),
      text: text(source.text || source.message || source.body || source.content, defaultItem.text),
      order: Number(source.order || messageIndex + 1)
    };
  }).filter((item) => item.text);
  const known = new Set(normalized.map((item) => item.relatedId).filter(Boolean));
  fallback.forEach((item) => { if (!known.has(item.relatedId)) normalized.push(item); });
  return normalized;
}

function normalizeMediationMessages(value, input, plan, practices, index) {
  const fallback = defaultMediationMessages(input, plan, practices, index);
  const source = object(value);
  return {
    whatsapp: normalizeMessageList(source.whatsapp || source.whatsApp, "whatsapp", fallback.whatsapp, index),
    moodle: normalizeMessageList(source.moodle || source.moodleMessages, "moodle", fallback.moodle, index)
  };
}

function normalizeDifferentiation(value = {}) {
  const source = object(value);
  const normalize = (items) => Array.isArray(items) ? items.map((item) => typeof item === "string" ? { title: item, instructions: item } : { title: text(item?.title || item?.label), instructions: text(item?.instructions || item?.body || item?.description), resources: item?.resources || [] }).filter((item) => item.title || item.instructions) : [];
  return {
    support: normalize(source.support || source.essential || source.recovery),
    standard: normalize(source.standard || source.core),
    extension: normalize(source.extension || source.advanced || source.deepening),
    rationale: text(source.rationale)
  };
}

function normalizeGuide(source = {}, plan = {}, input = {}, index = 0) {
  const raw = object(source);
  const inputPractices = Array.isArray(input.webPractices) ? input.webPractices : [];
  const generatedPractices = Array.isArray(raw.webPracticeProjects) && raw.webPracticeProjects.length
    ? raw.webPracticeProjects
    : (Array.isArray(raw.webPractices) ? raw.webPractices : []);
  const candidatePractices = [...inputPractices, ...generatedPractices];
  const mergedPractices = [];
  candidatePractices.forEach((practice) => {
    const original = inputPractices.find((item) => text(item.id) === text(practice?.id) || text(item.title) === text(practice?.title));
    const merged = { ...(original || {}), ...(practice || {}) };
    const key = text(merged.id || merged.title);
    const existingIndex = mergedPractices.findIndex((item) => text(item.id || item.title) === key || (text(item.title) && text(item.title) === text(merged.title)));
    if (existingIndex >= 0) mergedPractices[existingIndex] = { ...mergedPractices[existingIndex], ...merged };
    else if (key) mergedPractices.push(merged);
  });
  const practices = mergedPractices.filter((practice) => practiceScheduledForWeek(practice, input, index));
  const review = pedagogicalReview(plan);
  const mediationMessages = normalizeMediationMessages(raw.mediationMessages || raw.studentMessages || raw.communicationMessages || raw.messages, input, plan, practices, index);
  const timePlan = object(raw.timePlan || plan.timePlan);
  const workloadAdjustment = object(raw.workloadAdjustment || plan.timePlan?.workloadAdjustment);
  return {
    weekNumber: index + 1,
    title: text(raw.title || plan.theme || `${input.title} - Semana ${index + 1}`),
    purpose: text(raw.purpose || raw.instructionalPurpose || raw.rationale) || `Orientar a aprendizagem da semana ${index + 1} com foco nos objetivos previstos.`,
    didacticArc: normalizeDidacticArc(raw.didacticArc || plan.didacticArc, practices.length > 0, index),
    objectives: list(raw.objectives || plan.learningObjectives || input.objectives),
    alignmentMatrix: Array.isArray(raw.alignmentMatrix) && raw.alignmentMatrix.length ? raw.alignmentMatrix : (plan.alignmentMatrix?.length ? plan.alignmentMatrix : buildAlignmentMatrix(plan)),
    diagnostic: object(raw.diagnostic || plan.diagnostic),
    formativeChecks: Array.isArray(raw.formativeChecks || raw.checkpoints) ? (raw.formativeChecks || raw.checkpoints) : (plan.formativeChecks || []),
    mediationStops: Array.isArray(raw.mediationStops) && raw.mediationStops.length ? raw.mediationStops : mediationStops(plan),
    summativeAssessment: object(raw.summativeAssessment || raw.finalAssessment || plan.assessment),
    mediationQuestions: list(raw.mediationQuestions || raw.facilitationQuestions),
    commonMisconceptions: list(raw.commonMisconceptions || raw.misconceptions),
    interventions: list(raw.interventions || raw.interventionTips),
    differentiation: normalizeDifferentiation(raw.differentiation || plan.differentiation),
    accessibility: object(raw.accessibility || raw.accessibilityPlan),
    assessmentNotes: list(raw.assessmentNotes || raw.evaluationNotes),
    selfAssessment: object(raw.selfAssessment || raw.studentSelfAssessment || plan.selfAssessment),
    spiralReview: object(raw.spiralReview || plan.spiralReview || buildProgression(plan, index)),
    resourceNotes: Array.isArray(raw.resourceNotes) && raw.resourceNotes.length ? raw.resourceNotes : resourceNotesForPlan(plan),
    academicProfile: object(raw.academicProfile || input.academicProfile),
    academicPlan: object(raw.academicPlan || plan.academicPlan),
    claimEvidence: Array.isArray(raw.claimEvidence || plan.claimEvidence) ? (raw.claimEvidence || plan.claimEvidence) : [],
    academicReview: object(raw.academicReview || { status: "not-run", issues: [], rewriteRequired: false }),
    qualityReview: raw.qualityReview && typeof raw.qualityReview === "object" ? raw.qualityReview : review,
    webPractices: practices,
    webPracticeProjects: practices,
    mediationMessages,
    learnerEvidence: list(raw.learnerEvidence || raw.evidence),
    timePlan,
    workloadAdjustment,
    workloadAdvice: list(raw.workloadAdvice || raw.timeAdjustmentSuggestions || workloadAdjustment.suggestions?.map((item) => item.rationale || item.action || item.title)),
    notes: list(raw.notes)
  };
}

export function buildTeacherGuide(input, lesson, source = {}, index = 0) {
  const plan = lesson?.lessonPlan || {};
  const guide = normalizeGuide(source, plan, input, index);
  if (!guide.didacticArc?.sequence?.length) guide.didacticArc = fallbackDidacticArc(input, index);
  return guide;
}

export function buildTeacherGuides(input, lessons = [], provided = []) {
  return lessons.map((lesson, index) => {
    const scopedInput = { ...input, webPractices: (input.webPractices || []).filter((practice) => practiceScheduledForWeek(practice, input, index)) };
    return buildTeacherGuide(scopedInput, lesson, provided[index] || {}, index);
  });
}

export function collectWebPracticeProjects(input, teacherGuides = []) {
  const projects = [];
  for (const guide of teacherGuides) {
    for (const practice of guide.webPracticeProjects || guide.webPractices || []) {
      const id = text(practice.id || practice.title);
      if (!id || projects.some((current) => text(current.id || current.title) === id)) continue;
      projects.push(practice);
    }
  }
  if (!projects.length) return (input.webPractices || []).filter((practice) => Number(practice.weekNumber || practice.week) > 0 || text(practice.date || practice.sessionDate) || list(practice.moments || practice.moment).length);
  return projects;
}
