import { normalizeCourseInput, normalizeWeeklyOutput, slugify } from "../src/aula-schema.js";
import { buildTeacherGuides, collectWebPracticeProjects } from "../src/teacher-guide.js";
import { createWebPracticeDocx } from "../src/webpractice.js";
import { accessRequired, hasValidAccess } from "../src/access.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const weeks = normalizeWeeklyOutput({ weeks: request.body?.weeks || [] }, input);
    const teacherGuides = buildTeacherGuides(input, weeks, request.body?.teacherGuides || []);
    const projects = collectWebPracticeProjects(input, teacherGuides);
    const requestedId = String(request.body?.practiceId || "").trim();
    const requestedIndex = Number.parseInt(request.body?.practiceIndex, 10);
    const practice = requestedId
      ? projects.find((item) => String(item.id || "").trim() === requestedId || String(item.title || "").trim() === requestedId)
      : projects[Number.isInteger(requestedIndex) ? requestedIndex : 0];
    if (!practice) return response.status(404).json({ ok: false, error: "Webprática não encontrada no planejamento." });
    const index = projects.indexOf(practice);
    const buffer = await createWebPracticeDocx(input, practice, Math.max(0, index));
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    response.setHeader("Content-Disposition", `attachment; filename="${slugify(practice.title || `webpratica-${index + 1}`, `webpratica-${index + 1}`)}-roteiro.docx"`);
    response.setHeader("Cache-Control", "no-store");
    return response.status(200).send(buffer);
  } catch (error) {
    return response.status(400).json({ ok: false, error: error.message || "Não foi possível criar o DOCX da webprática." });
  }
}
