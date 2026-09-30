import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachWorkloadToLessons, buildGeneralPlan, calculateCourseWorkload } from "./calculations.js";
import { buildFallbackLesson, normalizeCourseInput, normalizeWeeklyOutput, slugify, validateLesson } from "./aula-schema.js";
import { assistBriefing, generateWithAI } from "./ai.js";
import { enrichLessonsWithResources } from "./research.js";
import { createWeeksZip } from "./zip.js";
import { accessRequired, hasValidAccess } from "./access.js";
import { buildTeacherGuides } from "./teacher-guide.js";
import { createTeacherGuidePdf } from "./pdf.js";

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
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    output: ".aula.json por semana + ZIP"
  });
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
    res.json({
      ok: true,
      provider: useFallback ? "fallback" : "ai",
      model: useFallback ? null : (process.env.OPENAI_MODEL || "gpt-4o-mini"),
      input,
      workload,
      generalPlan,
      weeks: enrichedWeeks,
      teacherGuides,
      filePrefix: slugify(input.title, "curso")
    });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : 400;
    res.status(status).json({ ok: false, error: error.message || "Não foi possível gerar o curso." });
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
    const buffer = await createWeeksZip(input, enrichedWeeks, generalPlan, teacherGuides);
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
    const buffer = await createTeacherGuidePdf(input, teacherGuides, generalPlan);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${slugify(input.title, "curso")}-guia-do-professor.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || "Não foi possível criar o PDF do professor." });
  }
});

app.listen(port, host, () => {
  console.log(`Aula Generator em http://${host}:${port}`);
});
