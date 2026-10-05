import { attachWorkloadToLessons, buildGeneralPlan, calculateCourseWorkload } from "./calculations.js";
import { normalizeLesson, normalizeWeeklyOutput, validateLesson } from "./aula-schema.js";
import { buildTeacherGuides } from "./teacher-guide.js";
import { validateCourse } from "./validation.js";

export function assembleCourse(input, rawWeeks = [], providedGuides = [], { allowPartial = false } = {}) {
  const candidates = Array.isArray(rawWeeks) ? rawWeeks : [];
  const availableCount = candidates.filter(Boolean).length;
  if (!allowPartial && availableCount < input.weeks) {
    const error = new Error(`O recálculo completo exige ${input.weeks} semanas; apenas ${availableCount} foram recebidas.`);
    error.code = "INCOMPLETE_WEEKS";
    throw error;
  }
  const weeks = allowPartial
    ? candidates.map((week, index) => week ? normalizeLesson(week, input, index) : null).filter(Boolean)
    : normalizeWeeklyOutput({ weeks: candidates }, input);
  const calculationInput = allowPartial ? { ...input, weeks: weeks.length } : input;
  if (!weeks.every(validateLesson)) {
    const error = new Error("O conjunto de semanas contém uma aula inválida.");
    error.code = "INVALID_WEEKS";
    throw error;
  }
  const workload = calculateCourseWorkload(calculationInput, calculationInput.formulaConfig, weeks);
  const enrichedWeeks = attachWorkloadToLessons(weeks, workload);
  const teacherGuides = buildTeacherGuides(input, enrichedWeeks, providedGuides);
  const generalPlan = buildGeneralPlan(input, workload, enrichedWeeks, teacherGuides);
  const validation = validateCourse(input, enrichedWeeks, workload, teacherGuides);
  return {
    input,
    partial: allowPartial && weeks.length < input.weeks,
    availableWeeks: weeks.length,
    requestedWeeks: input.weeks,
    workload,
    generalPlan: { ...generalPlan, validation },
    validation,
    weeks: enrichedWeeks,
    teacherGuides
  };
}
