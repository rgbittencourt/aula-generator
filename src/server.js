import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateCourseWorkload } from "./calculations.js";
import { buildFallbackLesson, normalizeCourseInput, normalizeWeeklyOutput, slugify, validateLesson } from "./aula-schema.js";
import { generateWithAI } from "./ai.js";
import { createWeeksZip } from "./zip.js";

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
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    output: ".aula.json por semana + ZIP"
  });
});

app.post("/api/generate", async (req, res) => {
  try {
    const input = normalizeCourseInput(req.body?.input || req.body || {});
    const workload = calculateCourseWorkload(input);
    const useFallback = Boolean(req.body?.fallback);
    const weeks = useFallback
      ? Array.from({ length: input.weeks }, (_, index) => buildFallbackLesson(input, index))
      : await generateWithAI(input);
    const normalizedWeeks = normalizeWeeklyOutput({ weeks }, input);
    res.json({
      ok: true,
      provider: useFallback ? "fallback" : "ai",
      model: useFallback ? null : (process.env.OPENAI_MODEL || "gpt-4o-mini"),
      input,
      workload,
      weeks: normalizedWeeks,
      filePrefix: slugify(input.title, "curso")
    });
  } catch (error) {
    const status = error.code === "AI_KEY_MISSING" ? 503 : 400;
    res.status(status).json({ ok: false, error: error.message || "Não foi possível gerar o curso." });
  }
});

app.post("/api/zip", async (req, res) => {
  try {
    const input = normalizeCourseInput(req.body?.input || {});
    const weeks = normalizeWeeklyOutput({ weeks: req.body?.weeks || [] }, input);
    if (!weeks.every(validateLesson)) return res.status(400).json({ ok: false, error: "O conjunto de semanas contém uma aula inválida." });
    const buffer = await createWeeksZip(input, weeks);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${slugify(input.title, "curso")}-semanas.zip"`);
    res.send(buffer);
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || "Não foi possível criar o ZIP." });
  }
});

app.listen(port, host, () => {
  console.log(`Aula Generator em http://${host}:${port}`);
});
