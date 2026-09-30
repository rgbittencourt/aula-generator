import JSZip from "jszip";
import { slugify } from "./aula-schema.js";
import { createWebPracticeFiles } from "./webpractice.js";

export async function createWeeksZip(input, weeks, generalPlan = null) {
  const zip = new JSZip();
  const folder = zip.folder("semanas");
  for (const [index, lesson] of weeks.entries()) {
    const number = String(index + 1).padStart(2, "0");
    const slug = slugify(lesson.meta?.title || `${input.title}-semana-${number}`, `semana-${number}`);
    folder.file(`semana-${number}-${slug}.aula.json`, JSON.stringify(lesson, null, 2));
  }
  if (generalPlan) zip.file("planejamento-geral.json", JSON.stringify(generalPlan, null, 2));
  const practices = generalPlan?.webPractices || weeks.flatMap((lesson) => lesson.lessonPlan?.webPractices || []);
  createWebPracticeFiles(input, practices).forEach(({ path, content }) => zip.file(path, content));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
