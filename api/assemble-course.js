import { accessRequired, hasValidAccess } from "../src/access.js";
import { normalizeCourseInput } from "../src/aula-schema.js";
import { assembleCourse } from "../src/course-assembly.js";

export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") return response.status(405).json({ ok: false, error: "Método não permitido." });
  if (accessRequired() && !hasValidAccess(request)) return response.status(401).json({ ok: false, error: "Informe o código de acesso configurado para esta aplicação." });
  try {
    const input = normalizeCourseInput(request.body?.input || {});
    const result = assembleCourse(input, request.body?.weeks || [], request.body?.teacherGuides || [], { allowPartial: Boolean(request.body?.allowPartial) });
    return response.status(200).json({ ok: true, provider: "ai-distributed", model: process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini", ...result });
  } catch (error) {
    console.error("assemble-course failed", error);
    return response.status(400).json({ ok: false, error: error.message || "Não foi possível consolidar o curso.", code: error.code || "ASSEMBLY_ERROR" });
  }
}
