import JSZip from "jszip";
import { slugify } from "./aula-schema.js";
import { createWebPracticeDocxFiles, createWebPracticeFiles } from "./webpractice.js";
import { createMediationMaterialPdf } from "./pdf.js";
import { collectWebPracticeProjects } from "./teacher-guide.js";
import { toStudentLesson } from "./student-export.js";

export async function createWeeksZip(input, weeks, generalPlan = null, teacherGuides = []) {
  const zip = new JSZip();
  const folder = zip.folder("semanas");
  for (const [index, lesson] of weeks.entries()) {
    const number = String(index + 1).padStart(2, "0");
    const slug = slugify(lesson.meta?.title || `${input.title}-semana-${number}`, `semana-${number}`);
    folder.file(`semana-${number}-${slug}.aula.json`, JSON.stringify(toStudentLesson(lesson), null, 2));
  }
  if (generalPlan) zip.file("planejamento-geral.json", JSON.stringify(generalPlan, null, 2));
  const pdf = await createMediationMaterialPdf(input, teacherGuides, generalPlan);
  zip.file("professor/material-de-mediacao.pdf", pdf);
  const practices = collectWebPracticeProjects(input, teacherGuides);
  createWebPracticeFiles(input, practices).forEach(({ path, content }) => zip.file(path, content));
  const docxFiles = await createWebPracticeDocxFiles(input, practices);
  docxFiles.forEach(({ path, content }) => zip.file(path, content));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
