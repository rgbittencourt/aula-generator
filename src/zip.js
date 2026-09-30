import JSZip from "jszip";
import { slugify } from "./aula-schema.js";

export async function createWeeksZip(input, weeks) {
  const zip = new JSZip();
  const folder = zip.folder("semanas");
  for (const [index, lesson] of weeks.entries()) {
    const number = String(index + 1).padStart(2, "0");
    const slug = slugify(lesson.meta?.title || `${input.title}-semana-${number}`, `semana-${number}`);
    folder.file(`semana-${number}-${slug}.aula.json`, JSON.stringify(lesson, null, 2));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
