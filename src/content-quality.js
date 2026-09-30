import { normalizeAcademicProfile } from "./academic.js";

const wordCount = (value) => String(value ?? "").trim().split(/\s+/u).filter(Boolean).length;
const text = (value) => String(value ?? "").trim();
const genericTitles = new Set(["", "conteúdo da semana", "sem título", "seção 1", "aula", "semana"]);

function sectionWords(section = {}) {
  return wordCount([
    section.body,
    ...(Array.isArray(section.subsections) ? section.subsections.flatMap((item) => [item.title, item.body]) : []),
    section.caseStudy?.context,
    section.caseStudy?.data,
    section.reflection?.body
  ].filter(Boolean).join(" "));
}

export function qualityTargets(input = {}) {
  const profile = normalizeAcademicProfile(input.academicProfile, input);
  const targetWords = profile.targetWords;
  const minimumWords = Math.max(1200, Math.round(targetWords * 0.72));
  return {
    minimumWords,
    targetWords,
    minimumSections: profile.minimumSections,
    minimumObjectives: 4,
    minimumSectionWords: Math.max(120, Math.round(targetWords / Math.max(4, profile.minimumSections * 1.65))),
    minimumWelcomeWords: 80,
    minimumReferences: profile.minimumReferences,
    primarySourcesRequired: profile.primarySourcesRequired,
    requireCounterarguments: profile.requireCounterarguments,
    requireConceptComparison: profile.requireConceptComparison,
    requireCaseStudy: profile.requireCaseStudy
  };
}

export function measureLessonQuality(lesson = {}, input = {}) {
  const plan = lesson?.lessonPlan || lesson?.plan || {};
  const sections = Array.isArray(plan.contentSections) ? plan.contentSections : [];
  const objectives = Array.isArray(plan.learningObjectives) ? plan.learningObjectives.filter(Boolean) : [];
  const sectionWordCounts = sections.map(sectionWords);
  const bodyText = [
    plan.welcome,
    ...sections.flatMap((section) => [section.title, section.body, ...(section.subsections || []).flatMap((item) => [item.title, item.body]), section.caseStudy?.context, section.caseStudy?.data, section.reflection?.question, section.reflection?.body]),
    plan.synthesis,
    plan.nextWeekConnection,
    ...(Array.isArray(plan.glossary) ? plan.glossary.flatMap((item) => [item.term, item.definition]) : []),
    ...(Array.isArray(plan.references) ? plan.references.flatMap((item) => [item?.citation || item?.title || item?.href || item, ...(item?.authors || [])]) : []),
    ...(Array.isArray(plan.assessment?.questions) ? plan.assessment.questions.flatMap((item) => [item.q, item.explanation, ...(item.options || [])]) : [])
  ].filter(Boolean).join(" ");
  const words = wordCount(bodyText);
  const title = text(plan.theme || lesson?.meta?.title);
  const hasSpecificTitle = Boolean(title) && !genericTitles.has(title.toLowerCase()) && !/^semana\s*\d+$/iu.test(title);
  const hasObjectives = objectives.length >= 1;
  const hasDetailedObjectives = objectives.length >= qualityTargets(input).minimumObjectives;
  const hasSections = sections.length >= qualityTargets(input).minimumSections;
  const hasDevelopedSections = sectionWordCounts.filter((count) => count >= qualityTargets(input).minimumSectionWords).length >= Math.min(4, qualityTargets(input).minimumSections);
  const hasWelcome = wordCount(plan.welcome) >= qualityTargets(input).minimumWelcomeWords;
  const hasSynthesis = wordCount(plan.synthesis) >= 35;
  const hasAssessment = Array.isArray(plan.assessment?.questions) && plan.assessment.questions.length >= 4;
  const hasHero = (lesson?.blocks || []).some((block) => block?.type === "hero" && text(block?.props?.title));
  const hasObjectiveBlock = (lesson?.blocks || []).some((block) => {
    const titleValue = text(block?.props?.title).toLowerCase();
    return block?.type === "destaque" && titleValue.includes("objetiv");
  });
  const hasTopic = (lesson?.blocks || []).some((block) => ["topic", "topic-collapsible", "topic-slider"].includes(block?.type) && Array.isArray(block?.props?.children) && block.props.children.length > 0);
  const pedagogicalReview = plan.pedagogicalReview || {};
  const hasPedagogicalAlignment = pedagogicalReview.status === "ready" || (Array.isArray(plan.alignmentMatrix) && plan.alignmentMatrix.length >= objectives.length && plan.alignmentMatrix.every((item) => Array.isArray(item.contentSections) && item.contentSections.length && item.evidence && Array.isArray(item.assessmentQuestions) && item.assessmentQuestions.length));
  const target = qualityTargets(input);
  const references = Array.isArray(plan.references) ? plan.references : [];
  const verifiedReferences = references.filter((reference) => reference.verified || reference.verificationStatus === "verified");
  const primaryReferences = references.filter((reference) => /artigo|livro|oficial|acadêm|univers|relatório/i.test(`${reference.type} ${reference.publisher} ${reference.citation}`));
  const claimEvidence = Array.isArray(plan.claimEvidence) ? plan.claimEvidence : [];
  const unsupportedClaims = claimEvidence.filter((claim) => claim.supportLevel === "insufficient" || claim.verificationStatus === "needs-human-review");
  const hasMinimumReferences = references.length >= target.minimumReferences;
  const hasPrimarySources = primaryReferences.length >= target.primarySourcesRequired;
  const hasEvidenceMap = claimEvidence.length === 0 || claimEvidence.every((claim) => claim.sourceIds.length > 0 || claim.verificationStatus === "needs-human-review");
  const hasCounterpoint = sections.some((section) => section.counterpoint || section.reflection || section.caseStudy) || Boolean(plan.academicPlan?.controversies?.length);
  const hardChecks = [hasSpecificTitle, hasDetailedObjectives, hasSections, hasDevelopedSections, hasWelcome, hasSynthesis, hasAssessment, hasHero, hasObjectiveBlock, hasTopic, hasPedagogicalAlignment, hasMinimumReferences, hasPrimarySources, hasEvidenceMap, !target.requireCounterarguments || hasCounterpoint];
  const passedHardChecks = hardChecks.filter(Boolean).length;
  const wordRatio = Math.min(1, words / Math.max(1, target.minimumWords));
  const score = Math.round((passedHardChecks / hardChecks.length) * 70 + wordRatio * 30);
  const issues = [];
  if (!hasSpecificTitle) issues.push("título principal ausente ou genérico");
  if (!hasDetailedObjectives) issues.push(`objetivos insuficientes: ${objectives.length}/${target.minimumObjectives}`);
  if (!hasSections) issues.push(`poucas seções: ${sections.length}/${target.minimumSections}`);
  if (!hasDevelopedSections) issues.push("o texto das seções ainda não está desenvolvido");
  if (!hasWelcome) issues.push("boas-vindas ausentes ou curtas");
  if (words < target.minimumWords) issues.push(`conteúdo curto: ${words} palavras; piso ${target.minimumWords}`);
  if (!hasSynthesis) issues.push("síntese conceitual ausente ou curta");
  if (!hasAssessment) issues.push("avaliação alinhada ausente ou incompleta");
  if (!hasMinimumReferences) issues.push(`referências insuficientes: ${references.length}/${target.minimumReferences}`);
  if (!hasPrimarySources) issues.push(`fontes acadêmicas/oficiais insuficientes: ${primaryReferences.length}/${target.primarySourcesRequired}`);
  if (!hasEvidenceMap) issues.push("mapa de evidências incompleto");
  if (unsupportedClaims.length) issues.push(`${unsupportedClaims.length} afirmação(ões) aguardam verificação humana`);
  if (target.requireCounterarguments && !hasCounterpoint) issues.push("contraponto, limite ou controvérsia ausente");
  if (!hasPedagogicalAlignment) issues.push("matriz/checklist pedagógico ainda não está completo");
  if (!hasHero) issues.push("bloco hero/título ausente no JSON");
  if (!hasObjectiveBlock) issues.push("bloco visível de objetivos ausente no JSON");
  if (!hasTopic) issues.push("tópico de conteúdo ausente ou vazio no JSON");
  const structural = hasSpecificTitle && hasDetailedObjectives && hasSections && hasDevelopedSections && hasWelcome && hasHero && hasObjectiveBlock && hasTopic && hasPedagogicalAlignment && hasMinimumReferences && hasPrimarySources && hasEvidenceMap && (!target.requireCounterarguments || hasCounterpoint);
  return {
    status: structural && words >= target.minimumWords && hasSynthesis && hasAssessment ? "complete" : structural ? "needs-review" : "insufficient",
    score,
    wordCount: words,
    targetWords: target.targetWords,
    minimumWords: target.minimumWords,
    objectiveCount: objectives.length,
    sectionCount: sections.length,
    sectionWordCounts,
    passedHardChecks,
    totalHardChecks: hardChecks.length,
    checks: { hasSpecificTitle, hasObjectives, hasDetailedObjectives, hasSections, hasDevelopedSections, hasWelcome, hasSynthesis, hasAssessment, hasHero, hasObjectiveBlock, hasTopic, hasPedagogicalAlignment, hasMinimumReferences, hasPrimarySources, hasEvidenceMap, hasCounterpoint },
    academic: { minimumReferences: target.minimumReferences, referenceCount: references.length, verifiedReferenceCount: verifiedReferences.length, primarySourceCount: primaryReferences.length, claimCount: claimEvidence.length, unsupportedClaimCount: unsupportedClaims.length },
    issues
  };
}

export function qualityPromptGuidance(input = {}) {
  const target = qualityTargets(input);
  const profile = normalizeAcademicProfile(input.academicProfile, input);
  return `PADRÃO ACADÊMICO CONFIGURADO: perfil ${profile.level}, profundidade ${profile.depth}, disciplina ${profile.discipline || "a definir"}. Escreva pelo menos ${target.minimumWords} palavras úteis (meta ${target.targetWords}), ${target.minimumSections} ou mais seções desenvolvidas, pelo menos ${target.minimumObjectives} objetivos observáveis e uma abertura de no mínimo ${target.minimumWelcomeWords} palavras. Entregue pelo menos ${target.minimumReferences} referências, incluindo ${target.primarySourcesRequired} fonte(s) acadêmica(s) ou oficial(is) — fontes acadêmicas/oficiais. Regra: não inventar dados bibliográficos. Nenhuma seção pode ter apenas uma frase. A semana precisa de título específico, síntese, avaliação e conexão com a próxima semana. ${target.requireCounterarguments ? "Inclua limite, controvérsia ou contraponto.\n" : ""}${target.requireConceptComparison ? "Compare conceitos próximos ou interpretações alternativas quando pertinente.\n" : ""}Toda afirmação central deve aparecer no mapa de evidências; quando não houver fonte, marque needs-human-review em vez de inventar dados.`;
}
