import { attachWorkloadToLessons, buildGeneralPlan, calculateCourseWorkload } from "../src/calculations.js";
import { createWeeksZip } from "../src/zip.js";
import { normalizeCourseInput, normalizeWeeklyOutput, slugify, validateLesson } from "../src/aula-schema.js";
import { buildTeacherGuides } from "../src/teacher-guide.js";
import { validateCourse } from "../src/validation.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const weeks = normalizeWeeklyOutput({ weeks: request.body?.weeks || [] }, input);
    if (!weeks.every(validateLesson)) return response.status(400).json({ ok: false, error: "O conjunto de semanas contém uma aula inválida." });
    const workload = calculateCourseWorkload(input, input.formulaConfig, weeks);
    const enrichedWeeks = attachWorkloadToLessons(weeks, workload);
    const teacherGuides = buildTeacherGuides(input, enrichedWeeks, request.body?.teacherGuides || []);
    const generalPlan = buildGeneralPlan(input, workload, enrichedWeeks, teacherGuides);
    const validation = validateCourse(input, enrichedWeeks, workload, teacherGuides);
    const buffer = await createWeeksZip(input, enrichedWeeks, { ...generalPlan, validation }, teacherGuides);
    response.setHeader("Content-Type", "application/zip");
    response.setHeader("Content-Disposition", `attachment; filename="${slugify(input.title, "curso")}-semanas.zip"`);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).send(buffer);
  } catch (error) {
    return response.status(400).json({ ok: false, error: error.message || "Não foi possível criar o ZIP." });
  }
}
