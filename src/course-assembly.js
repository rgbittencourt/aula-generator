import { attachWorkloadToLessons, buildGeneralPlan, calculateCourseWorkload } from "./calculations.js";
import { normalizeWeeklyOutput, validateLesson } from "./aula-schema.js";
import { buildTeacherGuides } from "./teacher-guide.js";
import { validateCourse } from "./validation.js";

export function assembleCourse(input, rawWeeks = [], providedGuides = []) {
  const weeks = normalizeWeeklyOutput({ weeks: rawWeeks }, input);
  if (!weeks.every(validateLesson)) {
    const error = new Error("O conjunto de semanas contém uma aula inválida.");
    error.code = "INVALID_WEEKS";
    throw error;
  }
  const workload = calculateCourseWorkload(input, input.formulaConfig, weeks);
  const enrichedWeeks = attachWorkloadToLessons(weeks, workload);
  const teacherGuides = buildTeacherGuides(input, enrichedWeeks, providedGuides);
  const generalPlan = buildGeneralPlan(input, workload, enrichedWeeks, teacherGuides);
  const validation = validateCourse(input, enrichedWeeks, workload, teacherGuides);
  return {
    input,
    workload,
    generalPlan: { ...generalPlan, validation },
    validation,
    weeks: enrichedWeeks,
    teacherGuides
  };
}
