import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { buildFallbackLesson, normalizeCourseInput, normalizeLesson, normalizeWeeklyOutput, resourcePlanForWeek, weekCalendar, validateLesson } from "../src/aula-schema.js";
import { attachWorkloadToLessons, buildGeneralPlan, calculateCourseWorkload, calculateWeekWorkload } from "../src/calculations.js";
import { digitalContentMinutes, readingMinutes } from "../src/formula-profile.js";
import { createWeeksZip } from "../src/zip.js";
import { buildBriefingPrompt, buildWeekGenerationPrompt } from "../src/ai.js";
import { compositionPlanForWeek } from "../src/composition.js";
import { buildTeacherGuides } from "../src/teacher-guide.js";
import { createTeacherGuidePdf } from "../src/pdf.js";
import { toStudentLesson } from "../src/student-export.js";
import { buildCourseProgression } from "../src/curriculum.js";
import { measureLessonQuality, qualityTargets } from "../src/content-quality.js";
import { scopeGeneralPlan, scopeMediationMaterial } from "../src/mediation-scope.js";

function hasBlock(lesson, type) {
  const visit = (blocks) => (blocks || []).some((block) => block.type === type || visit(block.props?.children));
  return visit(lesson.blocks);
}

test("Material de Mediação inicial não expõe semanas pendentes e cresce ao liberar semanas", () => {
  const weeks = [{ meta: { weekNumber: 1 } }, { meta: { weekNumber: 2 } }, { meta: { weekNumber: 3 } }];
  const guides = [{ weekNumber: 1 }, { weekNumber: 2 }, { weekNumber: 3 }];
  const initial = scopeMediationMaterial(weeks, guides, {});
  assert.deepEqual(initial.releasedIndexes, []);
  assert.equal(initial.releasedGuides.length, 0);
  const released = scopeMediationMaterial(weeks, guides, { 1: true });
  assert.deepEqual(released.releasedIndexes, [1]);
  assert.equal(released.releasedGuides[0].weekNumber, 2);
  const plan = scopeGeneralPlan({ course: { weeks: 3 }, weeks: [{ weekNumber: 1 }, { weekNumber: 2 }, { weekNumber: 3 }], progression: [{ weekNumber: 1 }, { weekNumber: 2 }, { weekNumber: 3 }] }, released.releasedIndexes, released.explicit);
  assert.deepEqual(plan.weeks.map((item) => item.weekNumber), [2]);
  assert.deepEqual(plan.progression.map((item) => item.weekNumber), [2]);
  assert.deepEqual(plan.mediationScope.releasedWeeks, [2]);
});

test("normaliza briefing com calendário real e webpráticas independentes", () => {
  const input = normalizeCourseInput({ title: "Cidades sustentáveis", weeks: "3", hoursPerWeek: "2.5", calendarMode: "calendar", startDate: "2026-10-05", objectives: "Analisar\nAplicar", imageLinks: "https://example.org/mapa.png", webPracticeEnabled: true, webPractices: [{ title: "Mapa do bairro", type: "Pesquisa orientada", moments: "Semana 2", objective: "Analisar" }, { title: "Debate", type: "Debate ou seminário", moments: "Semana 3", objective: "Avaliar" }], materials: [{ title: "Texto-base", type: "Texto-base", objective: "Preparar a análise", alignment: "Mobilidade urbana" }] });
  assert.equal(input.weeks, 3);
  assert.equal(input.hoursPerWeek, 2.5);
  assert.equal(input.startDate, "2026-10-05");
  assert.deepEqual(input.objectives, ["Analisar", "Aplicar"]);
  assert.equal(input.webPractice.enabled, true);
  assert.equal(input.webPractices.length, 2);
  assert.equal(input.materials[0].alignment, "Mobilidade urbana");
  assert.deepEqual(input.imageLinks, ["https://example.org/mapa.png"]);
  assert.deepEqual(weekCalendar(input, 1), { weekNumber: 2, label: "Semana 2 · 12/10/2026", startDate: "2026-10-12", endDate: "2026-10-18" });
});

test("normaliza metas de vídeos, artigos e leituras por semana", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 3, resourcePlan: { default: { videosPerWeek: 2, articlesPerWeek: 1, requiredReadingsPerWeek: 1, requiredReadingLevel: "essential" }, weeks: [{ weekNumber: 2, videosPerWeek: 0, articlesPerWeek: 3, requiredReadingsPerWeek: 2, requiredReadingLevel: "dense" }] } });
  assert.deepEqual(resourcePlanForWeek(input, 0), { weekNumber: 1, videosPerWeek: 2, articlesPerWeek: 1, requiredReadingsPerWeek: 1, requiredReadingLevel: "essential" });
  assert.deepEqual(resourcePlanForWeek(input, 1), { weekNumber: 2, videosPerWeek: 0, articlesPerWeek: 3, requiredReadingsPerWeek: 2, requiredReadingLevel: "dense" });
  assert.equal(resourcePlanForWeek(input, 2).videosPerWeek, 2);
});

test("normaliza composição Aula Studio com padrão e exceção por semana", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 2, compositionPlan: { default: { rows: { citacao: { count: 1 }, accordion: { count: 1, itemsPerBlock: 4 }, flashcards: { count: 2, itemsPerBlock: 5 }, quiz: { count: 0 } } }, weeks: [{ weekNumber: 2, rows: { accordion: { count: 0 }, quiz: { count: 1, itemsPerBlock: 4 } } }] } });
  assert.equal(compositionPlanForWeek(input, 0).rows.accordion.count, 1);
  assert.equal(compositionPlanForWeek(input, 1).rows.accordion.count, 0);
  assert.equal(compositionPlanForWeek(input, 1).rows.quiz.count, 1);
  const lesson = normalizeLesson({ lessonPlan: { contentSections: [{ number: "1", title: "Conceito", body: "Texto desenvolvido." }, { number: "2", title: "Aplicação", body: "Exemplo aplicado." }], composition: [{ type: "citacao", sectionNumber: 1, quote: "Uma formulação ligada ao conceito.", author: "Autoria", source: "Fonte" }] } }, input, 0);
  assert.equal(lesson.lessonPlan.composition.entries.length, 8);
  assert.ok(hasBlock(lesson, "accordion"));
  assert.ok(hasBlock(lesson, "flashcards"));
  assert.ok(hasBlock(lesson, "citacao"));
  assert.ok(buildWeekGenerationPrompt(input, 0).includes("COMPOSIÇÃO EDITORIAL DO AULA STUDIO"));
  assert.ok(buildWeekGenerationPrompt(input, 0).includes('"composition"'));
});

test("agenda webprática por data ou semana ocorre uma única vez", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 3, calendarMode: "calendar", startDate: "2026-10-05", webPracticeEnabled: true, webPractices: [{ title: "Por data", date: "2026-10-13" }, { title: "Por semana", weekNumber: 3 }, { title: "Sem agenda" }] });
  const lessons = [0, 1, 2].map((index) => buildFallbackLesson(input, index));
  const guides = buildTeacherGuides(input, lessons, []);
  assert.deepEqual(guides[0].webPracticeProjects, []);
  assert.deepEqual(guides[1].webPracticeProjects.map((practice) => practice.title), ["Por data"]);
  assert.deepEqual(guides[2].webPracticeProjects.map((practice) => practice.title), ["Por semana"]);
  assert.deepEqual(lessons.map((lesson) => lesson.lessonPlan.webPractices), [[], [], []]);
});

test("guia preserva todas as webpráticas agendadas quando a IA detalha apenas uma", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 1, webPracticeEnabled: true, webPractices: [{ id: "p1", title: "Laboratório 1", weekNumber: 1, objective: "Objetivo 1" }, { id: "p2", title: "Laboratório 2", weekNumber: 1, objective: "Objetivo 2" }] });
  const lesson = buildFallbackLesson(input, 0);
  const guides = buildTeacherGuides(input, [lesson], [{ webPracticeProjects: [{ id: "p1", title: "Laboratório 1", objective: "Projeto detalhado pela IA", product: "Evidência 1", steps: [{ title: "Executar", minutes: 30, instructions: "Faça", evidence: "Arquivo" }], fallbackPlan: "Plano B" }] }]);
  assert.deepEqual(guides[0].webPracticeProjects.map((practice) => practice.id), ["p1", "p2"]);
  assert.equal(guides[0].webPracticeProjects[0].objective, "Projeto detalhado pela IA");
});

test("prompt do assistente exige práticas distintas, materiais alinhados e fontes sem URLs inventadas", () => {
  const prompt = buildBriefingPrompt(normalizeCourseInput({ title: "Curso", webPracticeEnabled: true, webPractices: [{ id: "p1" }, { id: "p2" }] }), ["webPractices[0].title", "webPractices[1].title", "materials"]);
  assert.match(prompt, /webpráticas.*distintas/i);
  assert.match(prompt, /cada item de webPractices pelo índice/i);
  assert.match(prompt, /mesmo item\/id/i);
  assert.match(prompt, /retorne exatamente 2 webprática/i);
  assert.match(prompt, /títulos automáticos.*placeholders/i);
  assert.match(prompt, /materiais de apoio/i);
  assert.match(prompt, /não invente URLs/i);
});

test("prompt semanal exige unidade didática completa antes do cálculo de tempo", () => {
  const input = normalizeCourseInput({ title: "Tecnologias para Gestão Educacional", weeks: 6, hoursPerWeek: 10, objectives: ["Analisar políticas públicas"] });
  const prompt = buildWeekGenerationPrompt(input, 4);
  assert.match(prompt, /uma semana de material didático/i);
  assert.match(prompt, /lessonPlan/i);
  assert.match(prompt, /contentSections com pelo menos/i);
  assert.match(prompt, /timePlan com targetMinutes 0/i);
  assert.match(prompt, /nunca invente URLs/i);
  assert.match(prompt, /teacherGuide/i);
  assert.match(prompt, /MAPA LONGITUDINAL OBRIGATÓRIO/i);
  assert.match(prompt, /REQUISITOS DE RECURSOS DESTA SEMANA/i);
  assert.match(prompt, /bridgeParagraph/i);
  assert.match(prompt, /ponto exato/i);
  assert.match(prompt, /Ferramentas e Dashboards/i);
  assert.match(prompt, /Não começar por uma lista de softwares/i);
});

test("meta de 3.000 palavras vira piso textual com orçamento por seção", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 1, academicProfile: { targetWords: 3000, minimumSections: 6 } });
  const target = qualityTargets(input);
  const prompt = buildWeekGenerationPrompt(input, 0);
  assert.equal(target.minimumWords, 3000);
  assert.equal(target.requiredSectionCount, 7);
  assert.match(prompt, /pelo menos 3000 palavras úteis/i);
  assert.match(prompt, /aproximadamente 377 palavras/i);
  assert.match(prompt, /não entregue uma versão aproximada ou resumida/i);
});

test("mapa longitudinal distribui o curso de gestão educacional sem repetir a mesma semana", () => {
  const input = normalizeCourseInput({ title: "Tecnologias para Gestão Educacional", weeks: 6, objectives: ["Analisar fundamentos", "Avaliar políticas", "Comparar sistemas", "Interpretar dados", "Explorar ferramentas", "Planejar inovação"] });
  const progression = buildCourseProgression(input);
  assert.equal(progression.weeks.length, 6);
  assert.equal(new Set(progression.weeks.map((week) => week.theme)).size, 6);
  assert.equal(new Set(progression.weeks.map((week) => week.arc)).size >= 4, true);
  assert.match(progression.weeks[1].theme, /Governo Digital/i);
  assert.match(progression.weeks[2].theme, /SIGE|SIGAA|SUAP/i);
  assert.match(progression.weeks[3].theme, /Learning Analytics/i);
  assert.match(progression.weeks[4].theme, /Dashboard/i);
  assert.match(progression.weeks[5].theme, /Vibe Coding/i);
});

test("qualidade detecta repetição de tema ou objetivo entre semanas", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 2, objectives: ["Analisar o tema"] });
  const lesson = { lessonPlan: { theme: "Fundamentos do tema", learningObjectives: ["Analisar o tema"] } };
  const quality = measureLessonQuality(lesson, input, { peerLessons: [{ lessonPlan: { theme: "Fundamentos do tema", learningObjectives: ["Analisar o tema"] } }] });
  assert.equal(quality.repetition.detected, true);
  assert.equal(quality.checks.repetitionFree, false);
  assert.match(quality.issues.join(" "), /repetição longitudinal/i);
});

test("aula longa fica em revisão, não insuficiente, quando faltam metadados acadêmicos", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 1, academicProfile: { targetWords: 2800, minimumReferences: 4, primarySourcesRequired: 1 } });
  const body = Array.from({ length: 420 }, (_, index) => `explicação didática ${index + 1}`).join(" ");
  const lesson = normalizeLesson({
    theme: "Análise aplicada do tema",
    welcome: Array.from({ length: 100 }, () => "contexto").join(" "),
    learningObjectives: ["Explicar conceitos", "Comparar perspectivas", "Aplicar critérios", "Avaliar evidências"],
    contentSections: Array.from({ length: 7 }, (_, index) => ({ number: String(index + 1), title: `Seção desenvolvida ${index + 1}`, body })),
    synthesis: Array.from({ length: 110 }, () => "síntese").join(" "),
    nextWeekConnection: Array.from({ length: 70 }, () => "continuidade").join(" "),
    activities: [{ id: "activity-1", title: "Aplicação", instructions: "Produza uma análise.", evidence: "Análise escrita" }],
    formativeChecks: [{ prompt: "Explique o conceito.", feedback: "Revise a seção." }],
    assessment: { questions: Array.from({ length: 4 }, (_, index) => ({ q: `Questão ${index + 1}`, options: ["A", "B"], answer: 0, explanation: "Feedback" })) }
  }, input, 0);
  assert.equal(lesson.lessonPlan.contentSections.length, 7);
  assert.ok(lesson.contentQuality.wordCount >= 2800);
  assert.notEqual(lesson.contentQuality.status, "insufficient");
});

test("normaliza aula rica sem perder recursos, avaliação e metadados", () => {
  const input = normalizeCourseInput({ title: "Dados educacionais", weeks: 1, hoursPerWeek: 10, objectives: ["Analisar indicadores"] });
  const lesson = normalizeLesson({
    lessonPlan: {
      theme: "Indicadores e decisões",
      welcome: "Uma abertura contextualizada.",
      learningObjectives: ["Analisar indicadores"],
      contentSections: [{ number: "1", title: "Base conceitual", body: "Texto desenvolvido", reflection: { question: "O que muda no seu contexto?" }, resources: [{ type: "artigo", title: "Leitura extra", searchQuery: "indicadores educação artigo", required: false }] }],
      resources: { videos: [{ title: "Vídeo conferido", href: "https://youtu.be/abc123", verificationStatus: "provided-needs-review" }], images: [{ title: "Diagrama selecionado", href: "https://upload.wikimedia.org/example.png", provider: "wikimedia-commons", sourcePage: "https://commons.wikimedia.org/wiki/File:Example.png", license: "CC BY-SA", altText: "Diagrama do fluxo" }] },
      resourceResearch: { status: "ai-selected", alternatives: [{ candidateId: "commons:1" }] },
      assessment: { questions: [{ q: "O que é um indicador?", options: ["A", "B", "C", "D"], answer: 1, explanation: "Explicação." }] }
    },
    blocks: [{ type: "hero", props: { eyebrow: "Semana 1", title: "Indicadores", lead: "Começo" } }]
  }, input, 0);
  assert.equal(lesson.lessonPlan.contentSections[0].reflection.question, "O que muda no seu contexto?");
  assert.equal(lesson.lessonPlan.resources.videos[0].href, "https://youtu.be/abc123");
  assert.equal(lesson.lessonPlan.resources.images[0].provider, "wikimedia-commons");
  assert.equal(lesson.lessonPlan.resources.images[0].sourcePage, "https://commons.wikimedia.org/wiki/File:Example.png");
  assert.equal(lesson.lessonPlan.resourceResearch.status, "ai-selected");
  assert.equal(lesson.lessonPlan.assessment.questions.length, 1);
  assert.equal(validateLesson(lesson), true);
});

test("posiciona vídeo raiz depois do texto da seção indicada", () => {
  const input = normalizeCourseInput({ title: "Sistemas educacionais", weeks: 1, hoursPerWeek: 4 });
  const lesson = normalizeLesson({
    lessonPlan: {
      theme: "Sistemas e fluxos de informação",
      learningObjectives: ["Analisar sistemas"],
      contentSections: [
        { number: "1", title: "Problema", body: "Texto da primeira seção." },
        { number: "2", title: "Arquitetura", body: "Texto da seção em que o vídeo será usado." },
        { number: "3", title: "Aplicação", body: "Texto da terceira seção." }
      ],
      resources: { videos: [{ id: "video-arquitetura", title: "Vídeo de arquitetura", href: "https://youtu.be/abc123", sectionNumber: 2, bridgeParagraph: "Observe no vídeo como a arquitetura organiza os fluxos apresentados nesta seção." }] }
    },
    blocks: [
      { type: "hero", props: { title: "Sistemas", lead: "Analisar sistemas" } },
      { type: "destaque", props: { title: "Objetivos de aprendizagem", body: "Analisar sistemas" } },
      { type: "prose", props: { body: "Abertura" } },
      { type: "topic", props: { children: [
        { type: "titulo", props: { text: "1 Problema", level: "h2" } },
        { type: "prose", props: { body: "Texto da primeira seção." } },
        { type: "titulo", props: { text: "2 Arquitetura", level: "h2" } },
        { type: "prose", props: { body: "Texto da seção em que o vídeo será usado." } },
        { type: "titulo", props: { text: "3 Aplicação", level: "h2" } },
        { type: "prose", props: { body: "Texto da terceira seção." } },
        { type: "video", props: { resourceId: "video-arquitetura", id: "abc123", title: "Vídeo de arquitetura" } }
      ] } },
    ]
  }, input, 0);
  const topic = lesson.blocks.find((block) => block.type === "topic");
  const children = topic.props.children;
  const sectionTwo = children.findIndex((block) => block.props?.text === "2 Arquitetura");
  const sectionThree = children.findIndex((block) => block.props?.text === "3 Aplicação");
  const videoParagraph = children.findIndex((block) => block.type === "prose" && block.props?.inlineVideo?.resourceId === "video-arquitetura");
  assert.ok(sectionTwo >= 0 && sectionThree > sectionTwo);
  assert.ok(videoParagraph > sectionTwo && videoParagraph < sectionThree);
  assert.match(children[videoParagraph].props.body, /Observe no vídeo/);
  assert.equal(children[videoParagraph].props.inlineVideo.id, "abc123");
});

test("fallback gera uma aula válida para cada semana", () => {
  const input = normalizeCourseInput({ title: "História da ciência", weeks: 2, hoursPerWeek: 4, objectives: ["Comparar teorias"], webPracticeEnabled: true, practiceInstructions: "Faça uma pesquisa orientada.", videoLinks: "https://www.youtube.com/watch?v=abc123" });
  const weeks = normalizeWeeklyOutput({ weeks: [buildFallbackLesson(input, 0), buildFallbackLesson(input, 1)] }, input);
  assert.equal(weeks.length, 2);
  assert.equal(validateLesson(weeks[0]), true);
  assert.ok(weeks[0].lessonPlan.contentSections.length >= 1);
  assert.ok(weeks[0].blocks.some((block) => block.type === "hero"));
  assert.ok(hasBlock(weeks[0], "destaque"));
  assert.ok(weeks[0].blocks.some((block) => block.type === "topic" && block.props.children.some((child) => child.props?.inlineVideo?.id === "abc123")));
  assert.ok(weeks[0].lessonPlan.didacticArc.id);
});

test("JSON do aluno não carrega webprática e o guia preserva o projeto separado", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 1, hoursPerWeek: 2, objectives: ["Aplicar"], webPracticeEnabled: true, webPractices: [{ title: "Projeto aplicado", weekNumber: 1, objective: "Produzir evidência", teacherPreparation: ["Preparar dados"], artifacts: [{ filename: "modelo.md", content: "modelo" }] }] });
  const lesson = buildFallbackLesson(input, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(lesson, "teacherGuide"), false);
  assert.deepEqual(lesson.lessonPlan.webPractices, []);
  const guides = buildTeacherGuides(input, [lesson], []);
  assert.equal(guides[0].webPracticeProjects[0].artifacts.length, 1);
});

test("exportação do Aula Studio remove mediação, alinhamento, tempo e curadoria interna", () => {
  const input = normalizeCourseInput({ title: "Curso de exportação", weeks: 1, hoursPerWeek: 4, objectives: ["Analisar"] });
  const lesson = normalizeLesson({
    lessonPlan: {
      theme: "Semana de exportação",
      welcome: "Abertura para o estudante.",
      learningObjectives: ["Analisar"],
      contentSections: [{ number: "1", title: "Conceito", body: "Texto do estudante.", resources: [{ id: "video-1", title: "Vídeo", bridgeParagraph: "Ligação interna do professor." }] }],
      resources: { videos: [{ id: "video-1", title: "Vídeo", href: "https://youtu.be/abc123", bridgeParagraph: "Ligação interna do professor.", pedagogicalUse: "Uso interno", sectionNumber: 1 }] },
      alignmentMatrix: [{ objective: "Analisar", evidence: "Registro" }],
      timePlan: { items: [{ title: "Texto-base", minutes: 60 }], workloadAdjustment: { suggestions: [{ title: "Ajuste interno" }] } }
    },
    blocks: [
      { type: "hero", props: { title: "Semana", lead: "Analisar" } },
      { type: "destaque", props: { title: "Objetivos", body: "Analisar" } },
      { type: "topic", props: { children: [
        { type: "titulo", props: { text: "1 Conceito" } },
        { type: "prose", props: { resourceId: "video-1", body: "Ligação interna do professor.", inlineVideo: { id: "abc123", title: "Vídeo", caption: "Vídeo para a aula" } } }
      ] } }
    ]
  }, input, 0);
  const exported = toStudentLesson({ ...lesson, teacherGuide: { mediationMessages: { whatsapp: [{ text: "não exportar" }] } } });
  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(serialized, /teacherGuide|mediationMessages|alignmentMatrix|timePlan|workloadAdjustment|bridgeParagraph|pedagogicalUse|Ligação interna do professor/);
  assert.match(serialized, /abc123/);
  const topic = exported.blocks.find((block) => block.type === "topic");
  const videoBridge = topic?.props?.children?.find((block) => block.props?.inlineVideo?.id === "abc123");
  assert.ok(topic);
  assert.ok(videoBridge);
  assert.equal(videoBridge.props.body, "");
});

test("Material de Mediação em PDF é gerado separadamente", async () => {
  const input = normalizeCourseInput({ title: "Curso PDF", weeks: 1, hoursPerWeek: 2, objectives: ["Analisar"] });
  const lesson = buildFallbackLesson(input, 0);
  const guides = buildTeacherGuides(input, [lesson], []);
  const pdf = await createTeacherGuidePdf(input, guides, buildGeneralPlan(input, calculateCourseWorkload(input, input.formulaConfig, [lesson]), [lesson], guides));
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});

test("Material de Mediação inclui mensagens distintas para WhatsApp e Moodle", () => {
  const input = normalizeCourseInput({ title: "Curso de mediação", weeks: 1, objectives: ["Aplicar"] });
  const lesson = buildFallbackLesson(input, 0);
  const [guide] = buildTeacherGuides(input, [lesson], [{}]);
  assert.equal(guide.mediationMessages.whatsapp.length, 3);
  assert.equal(guide.mediationMessages.moodle.length, 3);
  assert.notEqual(guide.mediationMessages.whatsapp[0].text, guide.mediationMessages.moodle[0].text);
  assert.match(guide.mediationMessages.whatsapp[0].text, /Curso de mediação/);
});

test("cálculo deriva itens do conteúdo usando perfil interno versionado", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 2, hoursPerWeek: 5, content: "Este é um texto-base substancial para a leitura da semana.", objectives: ["Conhecer"] });
  const lessons = [buildFallbackLesson(input, 0), buildFallbackLesson(input, 1)];
  const pending = calculateCourseWorkload(input, input.formulaConfig, lessons);
  assert.equal(pending.totalMinutes, 600);
  assert.equal(pending.formulaStatus, "internal-profile");
  assert.ok(pending.derivedMinutes > 0);
  assert.ok(pending.weeks[0].items.length > 0);
  const configured = calculateWeekWorkload(input, 0, { ratios: { content: 0.5, practice: 0.25, assessment: 0.15, review: 0.1 } }, lessons[0]);
  assert.equal(configured.formulaStatus, "configured");
  assert.equal(Object.values(configured.allocation).reduce((sum, value) => sum + value, 0), 300);
  const enriched = attachWorkloadToLessons(lessons, pending);
  assert.equal(enriched[0].lessonPlan.timePlan.items.length, pending.weeks[0].items.length);
  const general = buildGeneralPlan(input, pending, enriched);
  assert.equal(general.totals.targetHours, 10);
  assert.ok(general.categoryTotals.contentMinutes > 0);
});

test("carga separa texto-base, leituras obrigatórias/extras, vídeo, quiz e fórum", () => {
  const input = normalizeCourseInput({ title: "Curso", weeks: 1, hoursPerWeek: 5, objectives: ["Analisar"] });
  const lesson = normalizeLesson({ lessonPlan: { theme: "Semana aplicada", contentSections: [{ title: "Texto-base", body: Array.from({ length: 600 }, () => "conceito").join(" ") }], resources: { videos: [{ title: "Vídeo obrigatório", durationMinutes: 20, required: true }], readingsRequired: [{ title: "Artigo obrigatório", type: "Artigo científico", pages: 10, required: true }], readingsExtra: [{ title: "Leitura complementar", type: "Texto popular", pages: 5, required: false }] }, activities: [{ type: "fórum", title: "Fórum", count: 1 }, { type: "quiz", title: "Quiz", count: 1, unitDurationMinutes: 10 }] } }, input, 0);
  const workload = calculateWeekWorkload(input, input.formulaConfig, lesson);
  assert.ok(workload.breakdown.baseTextMinutes > 0);
  assert.ok(workload.breakdown.requiredReadingMinutes > 0);
  assert.ok(workload.breakdown.extraReadingMinutes > 0);
  assert.equal(workload.breakdown.requiredVideoMinutes, 20);
  assert.ok(workload.breakdown.quizMinutes > 0);
  assert.ok(workload.breakdown.forumMinutes > 0);
  assert.equal(workload.items.find((item) => item.category === "base-text")?.details.scope, "weekly-base-text");
});

test("perfil interno calcula leitura digital, artigo científico e texto popular", () => {
  assert.equal(Math.round(digitalContentMinutes(273)), 5);
  assert.equal(Math.round(readingMinutes({ type: "Artigo científico", pages: 10 })), 50);
  assert.equal(Math.round(readingMinutes({ type: "Texto popular", pages: 10 })), 30);
  assert.equal(Math.round(readingMinutes({ type: "Artigo científico", wordCount: 273 })), 5);
});

test("ZIP contém JSON do aluno e roteiro DOCX de webprática em pasta separada", async () => {
  const input = normalizeCourseInput({ title: "Curso ZIP", weeks: 2, hoursPerWeek: 1, objectives: ["Conhecer"], webPracticeEnabled: true, webPractices: [{ title: "Mapa de dados", weekNumber: 1, type: "Projeto aplicado", objective: "Aplicar conceitos", durationMinutes: 45, artifacts: [{ filename: "modelo.md", title: "Modelo", format: "markdown", content: "# Modelo" }] }] });
  const weeks = [buildFallbackLesson(input, 0), buildFallbackLesson(input, 1)];
  const workload = calculateCourseWorkload(input, input.formulaConfig, weeks);
  const enriched = attachWorkloadToLessons(weeks, workload);
  const buffer = await createWeeksZip(input, enriched, buildGeneralPlan(input, workload, enriched));
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((name) => name.endsWith(".aula.json"));
  assert.equal(names.length, 2);
  assert.ok(names.every((name) => name.startsWith("semanas/semana-")));
  assert.ok(zip.files["planejamento-geral.json"]);
  assert.ok(zip.files["professor/material-de-mediacao.pdf"]);
  assert.ok(Object.keys(zip.files).some((name) => name.includes("webpraticas/") && name.endsWith("guia-e-roteiro.md")));
  const docxName = Object.keys(zip.files).find((name) => name.endsWith("roteiro-webpratica.docx"));
  assert.ok(docxName);
  assert.equal((await zip.files[docxName].async("nodebuffer")).subarray(0, 2).toString(), "PK");
  assert.ok(Object.keys(zip.files).some((name) => name.endsWith("modelo.md")));
  const first = JSON.parse(await zip.files[names[0]].async("string"));
  assert.ok(first.lessonPlan.contentSections.length);
});


test("normaliza perfil acadêmico configurável", () => {
  const input = normalizeCourseInput({ title: "Políticas públicas", weeks: 1, hoursPerWeek: 4, academicProfile: { level: "pós-graduação", depth: "avançado", targetWords: 4200, minimumSections: 8, minimumReferences: 6, primarySourcesRequired: 2, discipline: "Administração pública", requiredAuthors: "Autor A\nAutor B", requireCounterarguments: true } });
  assert.equal(input.academicProfile.level, "pós-graduação");
  assert.equal(input.academicProfile.targetWords, 4200);
  assert.equal(input.academicProfile.minimumSections, 8);
  assert.equal(input.academicProfile.minimumReferences, 6);
  assert.equal(input.academicProfile.primarySourcesRequired, 2);
  assert.deepEqual(input.academicProfile.requiredAuthors, ["Autor A", "Autor B"]);
});

test("prompt acadêmico exige planejamento, evidência, fontes e revisão crítica", () => {
  const input = normalizeCourseInput({ title: "Gestão educacional", weeks: 1, hoursPerWeek: 4, academicProfile: { level: "pós-graduação", targetWords: 3800, minimumReferences: 5, primarySourcesRequired: 2 } });
  const prompt = buildWeekGenerationPrompt(input, 0, { theme: "Estado e políticas educacionais", claimsRequiringEvidence: [{ claim: "afirmação" }] });
  assert.match(prompt, /Perfil acadêmico desta trilha/i);
  assert.match(prompt, /mapa de evidências/i);
  assert.match(prompt, /fonte\(s\) acadêmica\(s\) ou oficial\(is\)/i);
  assert.match(prompt, /contraponto/i);
  assert.match(prompt, /não inventar dados bibliográficos/i);
});

test("herda identidade do curso no perfil acadêmico", () => {
  const input = normalizeCourseInput({ title: "Gestão educacional", level: "Avançado", audience: "estudantes de graduação", weeks: 1, hoursPerWeek: 4 });
  assert.equal(input.academicProfile.discipline, "Gestão educacional");
  assert.equal(input.academicProfile.level, "Avançado");
  assert.equal(input.academicProfile.depth, "avançado");
});
