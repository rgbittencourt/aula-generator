import { accessRequired } from "../src/access.js";
import { aiConfigStatus, getAIModel, getAIProvider, getAITokenSettings, isAIConfigured } from "../src/ai-client.js";

export default function handler(_request, response) {
  response.setHeader("Cache-Control", "no-store");
  const settings = getAITokenSettings();
  response.status(200).json({
    ok: true,
    aiConfigured: isAIConfigured(),
    provider: getAIProvider(),
    missingKey: aiConfigStatus().missingKey,
    environment: aiConfigStatus().environment,
    accessRequired: accessRequired(),
    resourceResearch: process.env.AULA_RESOURCE_RESEARCH !== "false",
    youtubeConfigured: Boolean(process.env.YOUTUBE_API_KEY),
    openAlexFallback: process.env.AULA_OPENALEX_ENABLED !== "false",
    model: getAIModel(),
    autoRepair: process.env.AULA_AUTO_REPAIR !== "false",
    academicPipeline: process.env.AULA_ACADEMIC_PIPELINE !== "false",
    academicReview: process.env.AULA_ACADEMIC_REVIEW !== "false",
    distributedGeneration: true,
    singlePass: process.env.AULA_SINGLE_PASS !== "false",
    researchTimeoutMs: Math.max(3000, Number(process.env.AULA_RESEARCH_TIMEOUT_MS || 8000)),
    reviewBeforeExport: true,
    maxTokens: settings.maxTokens,
    assistMaxTokens: settings.assistMaxTokens,
    requestTokenBudget: settings.requestTokenBudget,
    regenerationMaxTokens: settings.regenerationMaxTokens,
    maxRetries: settings.maxRetries,
    aiBatchSize: Math.min(3, Math.max(1, Number(process.env.AULA_AI_BATCH_SIZE) || 1)),
    output: ".aula.json por semana + ZIP + revisão/regeneração individual"
  });
}
