import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachWorkloadToLessons, buildGeneralPlan, calculateCourseWorkload } from "./calculations.js";
import { buildFallbackLesson, normalizeCourseInput, normalizeLesson, normalizeWeeklyOutput, slugify, validateLesson } from "./aula-schema.js";
import { assistBriefing, generateOneWeek, generateWithAI, regenerateMediationMessageWithAI, regenerateWeekWithAI } from "./ai.js";
import { enrichLessonsWithResources } from "./research.js";
import { createWeeksZip } from "./zip.js";
import { accessRequired, hasValidAccess } from "./access.js";
import { buildTeacherGuides, collectWebPracticeProjects } from "./teacher-guide.js";
import { createMediationMaterialPdf } from "./pdf.js";
import { createWebPracticeDocx } from "./webpractice.js";
import { validateCourse } from "./validation.js";
import { assembleCourse } from "./course-assembly.js";
import { scopeGeneralPlan, scopeMediationMaterial } from "./mediation-scope.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const app = express();
const port = Number(process.env.PORT || 4310);
const host = process.env.HOST || "127.0.0.1";

app.use(express.json({ limit: "4mb" }));
app.use(express.static(publicDir, { etag: true }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    accessRequired: accessRequired(),
    resourceResearch: process.env.AULA_RESOURCE_RESEARCH !== "false",
    youtubeConfigured: Boolean(process.env.YOUTUBE_API_KEY),
    openAlexFallback: process.env.AULA_OPENALEX_ENABLED !== "false",
    model: process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    autoRepair: process.env.AULA_AUTO_REPAIR !== "false",
    academicPipeline: process.env.AULA_ACADEMIC_PIPELINE !== "false",
    academicReview: process.env.AULA_ACADEMIC_REVIEW !== "false",
    distributedGeneration: true,
    singlePass: process.env.AULA_SINGLE_PASS !== "false",
    researchTimeoutMs: Math.max(3000, Number(process.env.AULA_RESEARCH_TIMEOUT_MS || 8000)),
    reviewBeforeExport: true,
    maxTokens: Number(process.env.OPENAI_MAX_TOKENS || 16000),
    regenerationMaxTokens: Math.min(Number(process.env.OPENAI_REGEN_MAX_TOKENS || 10000), 12000),
    maxRetries: Number(process.env.OPENAI_MAX_RETRIES || 3),
    aiBatchSize: Math.min(3, Math.max(1, Number(process.env.AULA_AI_BATCH_SIZE) || 1)),
    output: ".aula.json por semana + ZIP + revisão/regeneração individual"
  });
});

app.post("/api/generate-week", async (req, res) => {
  if (accessRequired() && !hasValidAccess(req)) return res.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(req.body?.input || req.body || {});
    const index = Math.max(0, Math.min(input.weeks - 1, Number.parseInt(req.body?.weekIndex, 10) || 0));
    const raw = await generateOneWeek(input, index);
    const normalized = normalizeLesson(raw, input, index);
    const researched = process.env.AULA_RESOURCE_RESEARCH === "false" ? normalized : (await enrichLessonsWithResources(input, [normalized]))[0];
    const teacherGuide = buildTeacherGuides(input, [researched], [raw.teacherGuide || {}])[0];
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, provider: "ai-week", model: process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini", weekIndex: index, completed: index + 1, total: input.weeks, week: researched, teacherGuide });
  } catch (error) {
    console.error("generate-week failed", error);
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_PROVIDER_ERROR" ? 502 : 400;
    res.status(status).json({ ok: false, error: error.message || "Não foi possível gerar esta semana.", code: error.code || "GENERATION_ERROR", retryable: Boolean(error.retryable) });
  }
});

app.post("/api/assemble-course", (req, res) => {
  if (accessRequired() && !hasValidAccess(req)) return res.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(req.body?.input || {});
    const result = assembleCourse(input, req.body?.weeks || [], req.body?.teacherGuides || []);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, provider: "ai-distributed", model: process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini", ...result });
  } catch (error) {
    console.error("assemble-course failed", error);
    res.status(400).json({ ok: false, error: error.message || "Não foi possível consolidar o curso.", code: error.code || "ASSEMBLY_ERROR" });
  }
});

app.post("/api/generate", async (req, res) => {
  if (accessRequired() && !hasValidAccess(req)) return res.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(req.body?.input || req.body || {});
    const useFallback = Boolean(req.body?.fallback);
    const generated = useFallback
      ? { weeks: Array.from({ length: input.weeks }, (_, index) => buildFallbackLesson(input, index)), teacherGuides: [] }
      : await generateWithAI(input);
    const normalizedWeeks = normalizeWeeklyOutput({ weeks: generated.weeks }, input);
    const researchedWeeks = useFallback ? normalizedWeeks : await enrichLessonsWithResources(input, normalizedWeeks);
    const workload = calculateCourseWorkload(input, input.formulaConfig, researchedWeeks);
    const enrichedWeeks = attachWorkloadToLessons(researchedWeeks, workload);
    const teacherGuides = buildTeacherGuides(input, enrichedWeeks, generated.teacherGuides);
    const generalPlan = buildGeneralPlan(input, workload, enrichedWeeks, teacherGuides);
    const validation = validateCourse(input, enrichedWeeks, workload, teacherGuides);
    res.json({
      ok: true,
      provider: useFallback ? "fallback" : "ai",
      model: useFallback ? null : (process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini"),
      input,
      workload,
      generalPlan: { ...generalPlan, validation },
      validation,
      weeks: enrichedWeeks,
      teacherGuides,
      filePrefix: slugify(input.title, "curso")
    });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : 400;
    res.status(status).json({ ok: false, error: error.message || "Não foi possível gerar o curso." });
  }
});

app.post("/api/regenerate-week", async (req, res) => {
  if (accessRequired() && !hasValidAccess(req)) return res.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(req.body?.input || {});
    const index = Math.max(0, Math.min(input.weeks - 1, Number.parseInt(req.body?.weekIndex, 10) || 0));
    const instruction = String(req.body?.instruction || "").trim().slice(0, 4000);
    if (!instruction) return res.status(400).json({ ok: false, error: "Descreva o que deve mudar nesta semana." });
    const currentWeeks = normalizeWeeklyOutput({ weeks: Array.isArray(req.body?.weeks) ? req.body.weeks : [] }, input);
    const raw = await regenerateWeekWithAI(input, index, currentWeeks[index], instruction);
    const normalized = normalizeLesson(raw, input, index);
    const researched = process.env.AULA_RESOURCE_RESEARCH === "false" ? normalized : (await enrichLessonsWithResources(input, [normalized]))[0];
    const weeks = currentWeeks.map((week, weekIndex) => weekIndex === index ? researched : week);
    const workload = calculateCourseWorkload(input, input.formulaConfig, weeks);
    const enrichedWeeks = attachWorkloadToLessons(weeks, workload);
    const providedGuides = Array.isArray(req.body?.teacherGuides) ? [...req.body.teacherGuides] : [];
    providedGuides[index] = raw.teacherGuide || providedGuides[index] || {};
    const teacherGuides = buildTeacherGuides(input, enrichedWeeks, providedGuides);
    const generalPlan = buildGeneralPlan(input, workload, enrichedWeeks, teacherGuides);
    const validation = validateCourse(input, enrichedWeeks, workload, teacherGuides);
    res.json({ ok: true, provider: "ai-regenerate", model: process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini", weekIndex: index, instruction, input, workload, generalPlan: { ...generalPlan, validation }, validation, week: enrichedWeeks[index], weeks: enrichedWeeks, teacherGuides });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_INVALID_JSON" ? 502 : 400;
    res.status(status).json({ ok: false, error: error.message || "Não foi possível refazer a semana." });
  }
});

app.post("/api/regenerate-message", async (req, res) => {
  if (accessRequired() && !hasValidAccess(req)) return res.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(req.body?.input || {});
    const message = await regenerateMediationMessageWithAI({ ...req.body, input });
    if (!message.text) return res.status(502).json({ ok: false, error: "A IA não retornou uma mensagem utilizável." });
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, message });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : error.code === "AI_TPM_LIMIT" ? 429 : error.code === "AI_PROVIDER_ERROR" ? 502 : 400;
    res.status(status).json({ ok: false, error: error.message || "Não foi possível refazer a mensagem." });
  }
});

app.post("/api/assist-briefing", async (req, res) => {
  if (accessRequired() && !hasValidAccess(req)) return res.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(req.body?.input || {});
    const missingFields = Array.isArray(req.body?.missingFields) ? req.body.missingFields.slice(0, 20) : [];
    const briefing = await assistBriefing(input, missingFields);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, briefing, filledFields: missingFields });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : 400;
    res.status(status).json({ ok: false, error: error.message || "Não foi possível completar o briefing." });
  }
});

app.post("/api/zip", async (req, res) => {
  try {
    const input = normalizeCourseInput(req.body?.input || {});
    const weeks = normalizeWeeklyOutput({ weeks: req.body?.weeks || [] }, input);
    if (!weeks.every(validateLesson)) return res.status(400).json({ ok: false, error: "O conjunto de semanas contém uma aula inválida." });
    const workload = calculateCourseWorkload(input, input.formulaConfig, weeks);
    const enrichedWeeks = attachWorkloadToLessons(weeks, workload);
    const teacherGuides = buildTeacherGuides(input, enrichedWeeks, req.body?.teacherGuides || []);
    const generalPlan = buildGeneralPlan(input, workload, enrichedWeeks, teacherGuides);
    const validation = validateCourse(input, enrichedWeeks, workload, teacherGuides);
    const scoped = scopeMediationMaterial(enrichedWeeks, teacherGuides, req.body?.weekApprovals);
    const scopedPlan = scopeGeneralPlan({ ...generalPlan, validation }, scoped.releasedIndexes, scoped.explicit);
    const buffer = await createWeeksZip(input, enrichedWeeks, scopedPlan, scoped.releasedGuides, {
      explicitScope: scoped.explicit,
      releasedWeekIndexes: scoped.releasedIndexes
    });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${slugify(input.title, "curso")}-semanas.zip"`);
    res.send(buffer);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || "Não foi possível criar o ZIP." });
  }
});

app.post("/api/teacher-pdf", async (req, res) => {
  try {
    const input = normalizeCourseInput(req.body?.input || {});
    const weeks = normalizeWeeklyOutput({ weeks: req.body?.weeks || [] }, input);
    const workload = calculateCourseWorkload(input, input.formulaConfig, weeks);
    const enrichedWeeks = attachWorkloadToLessons(weeks, workload);
    const teacherGuides = buildTeacherGuides(input, enrichedWeeks, req.body?.teacherGuides || []);
    const generalPlan = buildGeneralPlan(input, workload, enrichedWeeks, teacherGuides);
    const scoped = scopeMediationMaterial(enrichedWeeks, teacherGuides, req.body?.weekApprovals);
    const buffer = await createMediationMaterialPdf(input, scoped.releasedGuides, generalPlan, {
      explicitScope: scoped.explicit,
      releasedWeekIndexes: scoped.releasedIndexes
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${slugify(input.title, "curso")}-material-de-mediacao.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || "Não foi possível criar o Material de Mediação em PDF." });
  }
});

app.post("/api/webpractice-docx", async (req, res) => {
  if (accessRequired() && !hasValidAccess(req)) return res.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(req.body?.input || {});
    const weeks = normalizeWeeklyOutput({ weeks: req.body?.weeks || [] }, input);
    const guides = buildTeacherGuides(input, weeks, req.body?.teacherGuides || []);
    const projects = collectWebPracticeProjects(input, guides);
    const requestedId = String(req.body?.practiceId || "").trim();
    const requestedIndex = Number.parseInt(req.body?.practiceIndex, 10);
    const practice = requestedId ? projects.find((item) => String(item.id || "").trim() === requestedId || String(item.title || "").trim() === requestedId) : projects[Number.isInteger(requestedIndex) ? requestedIndex : 0];
    if (!practice) return res.status(404).json({ ok: false, error: "Webprática não encontrada no planejamento." });
    const index = projects.indexOf(practice);
    const buffer = await createWebPracticeDocx(input, practice, Math.max(0, index));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${slugify(practice.title || `webpratica-${index + 1}`, `webpratica-${index + 1}`)}-roteiro.docx"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || "Não foi possível criar o DOCX da webprática." });
  }
});

app.listen(port, host, () => {
  console.log(`Aula Generator em http://${host}:${port}`);
});
