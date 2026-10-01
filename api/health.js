import { accessRequired } from "../src/access.js";

export default function handler(_request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    accessRequired: accessRequired(),
    resourceResearch: process.env.AULA_RESOURCE_RESEARCH !== "false",
    youtubeConfigured: Boolean(process.env.YOUTUBE_API_KEY),
    model: process.env.OPENAI_CONTENT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    autoRepair: process.env.AULA_AUTO_REPAIR !== "false",
    academicPipeline: process.env.AULA_ACADEMIC_PIPELINE !== "false",
    academicReview: process.env.AULA_ACADEMIC_REVIEW !== "false",
    distributedGeneration: true,
    singlePass: process.env.AULA_SINGLE_PASS !== "false",
    researchTimeoutMs: Math.max(3000, Number(process.env.AULA_RESEARCH_TIMEOUT_MS || 8000)),
    reviewBeforeExport: true,
    maxTokens: Number(process.env.OPENAI_MAX_TOKENS || 16000),
    maxRetries: Number(process.env.OPENAI_MAX_RETRIES || 3),
    aiBatchSize: Math.min(3, Math.max(1, Number(process.env.AULA_AI_BATCH_SIZE) || 1)),
    output: ".aula.json por semana + ZIP + revisão/regeneração individual"
  });
}
