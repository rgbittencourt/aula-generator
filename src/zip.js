import JSZip from "jszip";
import { slugify } from "./aula-schema.js";
import { createWebPracticeDocxFiles, createWebPracticeFiles } from "./webpractice.js";
import { createMediationMaterialPdf } from "./pdf.js";
import { collectWebPracticeProjects } from "./teacher-guide.js";
import { toStudentLesson, toGeneratorWeek } from "./student-export.js";
import { createMoodleXml, createCombinedMoodleXml } from "./moodle-xml.js";
import { createProductionWorkbook, hasProduction, productionMarkdown } from "./production-xlsx.js";

export async function createWeeksZip(input, weeks, generalPlan = null, teacherGuides = [], options = {}) {
  const zip = new JSZip();
  const folder = zip.folder("semanas");
  const allGuides = options.mediationGuides || teacherGuides;
  for (const [index, lesson] of weeks.entries()) {
    const number = String(index + 1).padStart(2, "0");
    const slug = slugify(lesson.meta?.title || `${input.title}-semana-${number}`, `semana-${number}`);
    // Três arquivos por semana, com o destino no nome: o do Aula Studio (sem o quiz), o completo
    // do ClassAuthor (com quiz, feedbacks e guia do professor) e o quiz em Moodle XML.
    folder.file(`semana-${number}-${slug}-studio.aula.json`, JSON.stringify(toStudentLesson(lesson), null, 2));
    zip.file(`classauthor/semana-${number}-${slug}-classauthor.json`, JSON.stringify(toGeneratorWeek(lesson, allGuides[index]), null, 2));
    const xml = createMoodleXml(lesson, { courseTitle: input.title, weekNumber: index + 1 });
    if (xml) zip.file(`moodle/semana-${number}-${slug}-quiz.xml`, xml);
  }
  const combined = createCombinedMoodleXml(weeks, { courseTitle: input.title });
  if (combined && weeks.length > 1) zip.file("moodle/todas-as-semanas-quiz.xml", combined);
  if (generalPlan) zip.file("planejamento-geral.json", JSON.stringify(generalPlan, null, 2));
  const pdf = await createMediationMaterialPdf(input, options.mediationGuides || teacherGuides, generalPlan, options);
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
