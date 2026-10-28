import JSZip from "jszip";
import { slugify } from "./aula-schema.js";
import { createWebPracticeDocxFiles, createWebPracticeFiles } from "./webpractice.js";
import { createMediationMaterialPdf } from "./pdf.js";
import { collectWebPracticeProjects } from "./teacher-guide.js";
import { toStudentLesson } from "./student-export.js";
import { createMoodleXml, createCombinedMoodleXml } from "./moodle-xml.js";
import { createProductionWorkbook, hasProduction, productionMarkdown } from "./production-xlsx.js";

export async function createWeeksZip(input, weeks, generalPlan = null, teacherGuides = [], options = {}) {
  const zip = new JSZip();
  const folder = zip.folder("semanas");
  for (const [index, lesson] of weeks.entries()) {
    const number = String(index + 1).padStart(2, "0");
    const slug = slugify(lesson.meta?.title || `${input.title}-semana-${number}`, `semana-${number}`);
    folder.file(`semana-${number}-${slug}.aula.json`, JSON.stringify(toStudentLesson(lesson), null, 2));
    // O quiz do Moodle vai em arquivo separado, fora do .aula.json.
    const xml = createMoodleXml(lesson, { courseTitle: input.title, weekNumber: index + 1 });
    if (xml) zip.file(`moodle/semana-${number}-quiz.xml`, xml);
  }
  const combined = createCombinedMoodleXml(weeks, { courseTitle: input.title });
  if (combined && weeks.length > 1) zip.file("moodle/todas-as-semanas-quiz.xml", combined);
  if (generalPlan) zip.file("planejamento-geral.json", JSON.stringify(generalPlan, null, 2));
  const pdf = await createMediationMaterialPdf(input, teacherGuides, generalPlan, options);
  zip.file("professor/material-de-mediacao.pdf", pdf);
  const practices = collectWebPracticeProjects(input, teacherGuides);
  createWebPracticeFiles(input, practices).forEach(({ path, content }) => zip.file(path, content));
  const docxFiles = await createWebPracticeDocxFiles(input, practices);
  docxFiles.forEach(({ path, content }) => zip.file(path, content));
  if (hasProduction(options.production)) {
    zip.file("producao/planilha-de-producao.xlsx", await createProductionWorkbook(JSZip, options.production, { title: input.title }, "nodebuffer"));
    zip.file("producao/roteiros-de-video.md", productionMarkdown(options.production, { title: input.title }));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
