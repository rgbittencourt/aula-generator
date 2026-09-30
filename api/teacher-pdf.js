import { attachWorkloadToLessons, buildGeneralPlan, calculateCourseWorkload } from "../src/calculations.js";
import { normalizeCourseInput, normalizeWeeklyOutput, slugify } from "../src/aula-schema.js";
import { buildTeacherGuides } from "../src/teacher-guide.js";
import { createTeacherGuidePdf } from "../src/pdf.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const weeks = normalizeWeeklyOutput({ weeks: request.body?.weeks || [] }, input);
    const workload = calculateCourseWorkload(input, input.formulaConfig, weeks);
    const enrichedWeeks = attachWorkloadToLessons(weeks, workload);
    const teacherGuides = buildTeacherGuides(input, enrichedWeeks, request.body?.teacherGuides || []);
    const generalPlan = buildGeneralPlan(input, workload, enrichedWeeks, teacherGuides);
    const buffer = await createTeacherGuidePdf(input, teacherGuides, generalPlan);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${slugify(input.title, "curso")}-guia-do-professor.pdf"`);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).send(buffer);
  } catch (error) {
    return response.status(400).json({ ok: false, error: error.message || "Não foi possível criar o PDF do professor." });
  }
}
