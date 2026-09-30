import { accessRequired } from "../src/access.js";

export default function handler(_request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    accessRequired: accessRequired(),
    resourceResearch: process.env.AULA_RESOURCE_RESEARCH !== "false",
    youtubeConfigured: Boolean(process.env.YOUTUBE_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    output: ".aula.json por semana + ZIP"
  });
}
