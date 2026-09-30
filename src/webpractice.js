import { slugify } from "./aula-schema.js";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
const md = (value) => text(value).replace(/\r?\n/g, "\n");

function bullets(values, fallback = "A definir pelo professor.") {
  const entries = list(values);
  return entries.length ? entries.map((value) => `- ${value}`).join("\n") : `- ${fallback}`;
}

function artifactContent(artifact) {
  if (text(artifact.content)) return md(artifact.content);
  if (text(artifact.template)) return md(artifact.template);
  return `# ${text(artifact.title || artifact.filename || "Arquivo de apoio")}\n\n${text(artifact.purpose || "Arquivo a ser preparado para a webprática.")}`;
}

export function practicePackageMarkdown(input, practice, index = 0) {
  const number = index + 1;
  const roteiro = practice.roteiro || {};
  const blocks = Array.isArray(roteiro.blocks) ? roteiro.blocks : [];
  const blockText = blocks.length
    ? blocks.map((block, blockIndex) => `### ${blockIndex + 1}. ${text(block.title || `Bloco ${blockIndex + 1}`)}\n\n**Duração:** ${text(block.durationMinutes || block.minutes || "a definir")} minutos\n\n${text(block.instructions || block.body || block.description || "Desenvolver este bloco com a turma.")}`).join("\n\n")
    : "### Roteiro ainda não detalhado\n\nDistribua o tempo entre abertura, preparação, produção, revisão e fechamento.";
  return `# Webprática ${number} — ${text(practice.title || "Sem título")}

**Curso:** ${text(input.title)}  
**Tipo:** ${text(practice.type || "Webprática")}  
**Duração prevista:** ${text(practice.durationMinutes || practice.sessionMinutes || "a definir")} minutos  
**Momento:** ${list(practice.moments).join(", ") || "a definir"}

## Objetivo

${text(practice.objective || "Definir o objetivo específico da prática.")}

## Contexto e situação-problema

${text(practice.context || practice.scenario || "Apresente o problema, caso ou situação que dará sentido à prática.")}

## Pré-requisitos

${bullets(practice.prerequisites)}

## Preparação do professor

${bullets(practice.teacherPreparation || practice.preparation)}

## Preparação do estudante

${bullets(practice.studentPreparation)}

## Materiais e ferramentas

${bullets(practice.materials)}

## Roteiro da sessão

${blockText}

## Passo a passo para os estudantes

${(Array.isArray(practice.steps) ? practice.steps : []).map((step, stepIndex) => `### ${stepIndex + 1}. ${text(step.title || `Etapa ${stepIndex + 1}`)}\n\n${text(step.instructions || step.body || "Descreva a ação.")}\n\n**Tempo:** ${text(step.minutes || "a definir")} minutos`).join("\n\n") || "Descreva as etapas em ordem, com o produto esperado em cada uma."}

## Produto/evidência

${text(practice.product || practice.delivery || "Definir o produto final e o formato de entrega.")}

## Critérios de avaliação

${bullets(practice.criteria || practice.rubric)}

## Prompts ou comandos de apoio

${bullets(practice.prompts, "A IA deve gerar os prompts específicos desta etapa.")}

## Plano B e acessibilidade

${text(practice.fallbackPlan || "Defina uma alternativa para falha de internet, ferramenta ou arquivo.")}

## Continuidade

${text(practice.continuation || "Indique como o produto será retomado na semana seguinte.")}
`;
}

export function createWebPracticeFiles(input, practices = []) {
  const files = [];
  practices.forEach((practice, index) => {
    const slug = slugify(practice.title || `webpratica-${index + 1}`, `webpratica-${index + 1}`);
    const folder = `webpraticas/${String(index + 1).padStart(2, "0")}-${slug}`;
    files.push({ path: `${folder}/guia-e-roteiro.md`, content: practicePackageMarkdown(input, practice, index) });
    files.push({ path: `${folder}/pacote.json`, content: JSON.stringify({ course: input.title, webPractice: practice }, null, 2) });
    const artifacts = Array.isArray(practice.artifacts || practice.files || practice.outputs) ? (practice.artifacts || practice.files || practice.outputs) : [];
    artifacts.forEach((artifact, artifactIndex) => {
      const originalName = text(artifact.filename || artifact.title || `arquivo-${artifactIndex + 1}`);
      const originalExtension = originalName.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() || "";
      const filename = slugify(originalName.replace(/\.[a-z0-9]+$/i, ""), `arquivo-${artifactIndex + 1}`);
      const extension = originalExtension || (text(artifact.format).toLowerCase().includes("json") ? ".json" : text(artifact.format).toLowerCase().includes("csv") ? ".csv" : ".md");
      files.push({ path: `${folder}/arquivos/${filename}${extension}`, content: artifactContent(artifact) });
    });
  });
  return files;
}
