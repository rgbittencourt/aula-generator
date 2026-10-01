import { normalizeAcademicProfile } from "./academic.js";

const wordCount = (value) => String(value ?? "").trim().split(/\s+/u).filter(Boolean).length;
const text = (value) => String(value ?? "").trim();
const genericTitles = new Set(["", "conteúdo da semana", "sem título", "seção 1", "aula", "semana"]);
const stopWords = new Set("a ao aos as com da das de do dos e em entre essa esse esta este para por que um uma o os no nos na nas se sem sua seu suas seus como mais menos sobre ou".split(" "));

function signature(value) {
  return new Set(text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/u).filter((word) => word.length >= 4 && !stopWords.has(word)));
}

function overlap(left, right) {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(1, Math.min(left.size, right.size));
}

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
  const sectionCount = Math.max(profile.minimumSections, targetWords >= 3000 ? 7 : 6);
  const fixedWords = Math.max(300, Math.round(targetWords * 0.12));
  const sectionTargetWords = Math.max(220, Math.round((targetWords - fixedWords) / sectionCount));
  const minimumWords = Math.max(1400, targetWords);
  return {
    minimumWords,
    targetWords,
    minimumSections: profile.minimumSections,
    requiredSectionCount: sectionCount,
    sectionTargetWords,
    sectionMinimumWords: Math.max(180, Math.round(sectionTargetWords * 0.88)),
    sectionMaximumWords: Math.round(sectionTargetWords * 1.18),
    minimumObjectives: 4,
    minimumSectionWords: Math.max(180, Math.round(sectionTargetWords * 0.88)),
    minimumWelcomeWords: 80,
    minimumReferences: profile.minimumReferences,
    primarySourcesRequired: profile.primarySourcesRequired,
    requireCounterarguments: profile.requireCounterarguments,
    requireConceptComparison: profile.requireConceptComparison,
    requireCaseStudy: profile.requireCaseStudy
  };
}

export function measureLessonQuality(lesson = {}, input = {}, context = {}) {
  const plan = lesson?.lessonPlan || lesson?.plan || {};
  const sections = Array.isArray(plan.contentSections) ? plan.contentSections : [];
  const objectives = Array.isArray(plan.learningObjectives) ? plan.learningObjectives.filter(Boolean) : [];
  const sectionWordCounts = sections.map(sectionWords);
  const instructionalText = [
    plan.welcome,
    ...sections.flatMap((section) => [section.title, section.body, ...(section.subsections || []).flatMap((item) => [item.title, item.body]), section.caseStudy?.context, section.caseStudy?.data, section.reflection?.question, section.reflection?.body]),
    plan.synthesis,
    plan.nextWeekConnection,
    ...(Array.isArray(plan.glossary) ? plan.glossary.flatMap((item) => [item.term, item.definition]) : []),
    plan.diagnostic?.prompt,
    ...(Array.isArray(plan.activities) ? plan.activities.flatMap((item) => [item.title, item.instructions, item.evidence]) : []),
    ...(Array.isArray(plan.formativeChecks) ? plan.formativeChecks.flatMap((item) => [item.prompt, item.feedback]) : [])
  ].filter(Boolean).join(" ");
  const metadataText = [
    ...(Array.isArray(plan.references) ? plan.references.flatMap((item) => [item?.citation || item?.title || item?.href || item, ...(item?.authors || [])]) : []),
    ...(Array.isArray(plan.assessment?.questions) ? plan.assessment.questions.flatMap((item) => [item.q, item.explanation, ...(item.options || [])]) : [])
  ].filter(Boolean).join(" ");
  const words = wordCount(instructionalText);
  const metadataWordCount = wordCount(metadataText);
  const title = text(plan.theme || lesson?.meta?.title);
  const hasSpecificTitle = Boolean(title) && !genericTitles.has(title.toLowerCase()) && !/^semana\s*\d+$/iu.test(title);
  const hasObjectives = objectives.length >= 1;
  const hasDetailedObjectives = objectives.length >= qualityTargets(input).minimumObjectives;
  const hasSections = sections.length >= qualityTargets(input).requiredSectionCount;
  const hasDevelopedSections = sections.length >= qualityTargets(input).requiredSectionCount && sectionWordCounts.every((count) => count >= qualityTargets(input).minimumSectionWords);
  const hasWelcome = wordCount(plan.welcome) >= qualityTargets(input).minimumWelcomeWords;
  const hasSynthesis = wordCount(plan.synthesis) >= 100;
  const hasNextWeekConnection = wordCount(plan.nextWeekConnection) >= 60;
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
  const peerLessons = Array.isArray(context.peerLessons) ? context.peerLessons : [];
  const peerThemes = peerLessons.map((peer) => peer?.lessonPlan?.theme || peer?.meta?.title).filter(Boolean);
  const peerObjectives = peerLessons.flatMap((peer) => peer?.lessonPlan?.learningObjectives || []);
  const currentThemeSignature = signature(title);
  const themeOverlap = peerThemes.length ? Math.max(...peerThemes.map((peerTheme) => overlap(currentThemeSignature, signature(peerTheme)))) : 0;
  const repeatedTheme = themeOverlap >= 0.8;
  const objectiveOverlap = objectives.length && peerObjectives.length ? Math.max(...objectives.map((objective) => Math.max(...peerObjectives.map((peerObjective) => overlap(signature(objective), signature(peerObjective)))))) : 0;
  const repetitionDetected = repeatedTheme || objectiveOverlap >= 0.78;
  const hardChecks = [hasSpecificTitle, hasDetailedObjectives, hasSections, hasDevelopedSections, hasWelcome, hasSynthesis, hasNextWeekConnection, hasAssessment, hasHero, hasObjectiveBlock, hasTopic, hasPedagogicalAlignment, hasMinimumReferences, hasPrimarySources, hasEvidenceMap, !target.requireCounterarguments || hasCounterpoint, !repetitionDetected];
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
  if (!hasNextWeekConnection) issues.push("conexão com a próxima semana ausente ou curta");
  if (!hasAssessment) issues.push("avaliação alinhada ausente ou incompleta");
  if (!hasMinimumReferences) issues.push(`referências insuficientes: ${references.length}/${target.minimumReferences}`);
  if (!hasPrimarySources) issues.push(`fontes acadêmicas/oficiais insuficientes: ${primaryReferences.length}/${target.primarySourcesRequired}`);
  if (!hasEvidenceMap) issues.push("mapa de evidências incompleto");
  if (unsupportedClaims.length) issues.push(`${unsupportedClaims.length} afirmação(ões) aguardam verificação humana`);
  if (target.requireCounterarguments && !hasCounterpoint) issues.push("contraponto, limite ou controvérsia ausente");
  if (!hasPedagogicalAlignment) issues.push("matriz/checklist pedagógico ainda não está completo");
  if (repetitionDetected) issues.push(`possível repetição longitudinal: tema/objetivos coincidem com semana anterior (sobreposição ${Math.round(Math.max(themeOverlap, objectiveOverlap) * 100)}%)`);
  if (!hasHero) issues.push("bloco hero/título ausente no JSON");
  if (!hasObjectiveBlock) issues.push("bloco visível de objetivos ausente no JSON");
  if (!hasTopic) issues.push("tópico de conteúdo ausente ou vazio no JSON");
  const structural = hasSpecificTitle && hasDetailedObjectives && hasSections && hasDevelopedSections && hasWelcome && hasSynthesis && hasNextWeekConnection && hasHero && hasObjectiveBlock && hasTopic && hasPedagogicalAlignment && hasMinimumReferences && hasPrimarySources && hasEvidenceMap && (!target.requireCounterarguments || hasCounterpoint) && !repetitionDetected;
  return {
    status: structural && words >= target.minimumWords && hasSynthesis && hasAssessment ? "complete" : structural ? "needs-review" : "insufficient",
    score,
    wordCount: words,
    metadataWordCount,
    targetWords: target.targetWords,
    minimumWords: target.minimumWords,
    objectiveCount: objectives.length,
    sectionCount: sections.length,
    sectionWordCounts,
    passedHardChecks,
    totalHardChecks: hardChecks.length,
    checks: { hasSpecificTitle, hasObjectives, hasDetailedObjectives, hasSections, hasDevelopedSections, hasWelcome, hasSynthesis, hasNextWeekConnection, hasAssessment, hasHero, hasObjectiveBlock, hasTopic, hasPedagogicalAlignment, hasMinimumReferences, hasPrimarySources, hasEvidenceMap, hasCounterpoint, repetitionFree: !repetitionDetected },
    repetition: { detected: repetitionDetected, repeatedTheme, themeOverlap: Number(themeOverlap.toFixed(2)), objectiveOverlap: Number(objectiveOverlap.toFixed(2)), comparedWeeks: peerLessons.length },
    academic: { minimumReferences: target.minimumReferences, referenceCount: references.length, verifiedReferenceCount: verifiedReferences.length, primarySourceCount: primaryReferences.length, claimCount: claimEvidence.length, unsupportedClaimCount: unsupportedClaims.length },
    issues
  };
}

export function qualityPromptGuidance(input = {}) {
  const target = qualityTargets(input);
  const profile = normalizeAcademicProfile(input.academicProfile, input);
  return `PADRÃO ACADÊMICO CONFIGURADO: perfil ${profile.level}, profundidade ${profile.depth}, disciplina ${profile.discipline || "a definir"}. A meta de ${target.targetWords} palavras é um piso obrigatório de texto útil: não entregue uma versão aproximada ou resumida. Distribua o corpo em ${target.requiredSectionCount} seções desenvolvidas, com aproximadamente ${target.sectionTargetWords} palavras em cada seção (mínimo ${target.sectionMinimumWords}, máximo ${target.sectionMaximumWords}), além de abertura de ${target.minimumWelcomeWords}–160 palavras, síntese de pelo menos 100 palavras e conexão final de pelo menos 60 palavras. O total do texto deve atingir pelo menos ${target.minimumWords} palavras. Entregue pelo menos ${target.minimumObjectives} objetivos observáveis e ${target.minimumReferences} referências, incluindo ${target.primarySourcesRequired} fonte(s) acadêmica(s) ou oficial(is). Regra: não inventar dados bibliográficos. Nenhuma seção pode ter apenas uma frase ou ser substituída por uma lista. A semana precisa de título específico, síntese, avaliação e conexão com a próxima semana. ${target.requireCounterarguments ? "Inclua limite, controvérsia ou contraponto.\n" : ""}${target.requireConceptComparison ? "Compare conceitos próximos ou interpretações alternativas quando pertinente.\n" : ""}Toda afirmação central deve aparecer no mapa de evidências; quando não houver fonte, marque needs-human-review em vez de inventar dados.`;
}
