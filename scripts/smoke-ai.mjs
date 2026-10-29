#!/usr/bin/env node
// Teste de fumaça com a IA de verdade: escreve UMA semana (texto + avaliação + guia do professor) e
// mostra o que importa para o professor conferir: referências no padrão ABNT, citações, afirmações
// sem fonte, tamanho e tempo. Usa a chave do ambiente (.env ou variáveis), nunca a imprime.
//
//   AI_PROVIDER=anthropic ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=claude-sonnet-5-5 node scripts/smoke-ai.mjs
//   node scripts/smoke-ai.mjs --semana 2 --tema "Learning analytics na gestão escolar" --salvar saida.json
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { normalizeCourseInput, normalizeLesson } from "../src/aula-schema.js";
import { measureLessonQuality } from "../src/content-quality.js";
import { generateOneWeek } from "../src/ai.js";
import { completeWeekDerivatives } from "../src/claude-writer.js";
import { getAIProvider, getAIModel, isAIConfigured } from "../src/ai-client.js";
import { abntReport, abntIssues } from "../src/abnt.js";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
if (!isAIConfigured()) {
  console.error(`Sem chave de IA para o provedor "${getAIProvider()}". Defina ANTHROPIC_API_KEY (com AI_PROVIDER=anthropic) ou OPENAI_API_KEY.`);
  process.exit(2);
}
const weekNumber = Math.max(1, Number(opt("semana", 1)));
const input = normalizeCourseInput({
  title: opt("curso", "Tecnologias para Gestão Educacional"),
  audience: "Profissionais da educação profissional e tecnológica em pós-graduação a distância",
  weeks: Math.max(weekNumber, 3), hoursPerWeek: 4,
  objectives: ["Analisar sistemas de informação usados na gestão escolar", "Interpretar indicadores educacionais", "Propor melhorias com base em dados"],
  topics: opt("tema", "Dados e indicadores na gestão educacional") 
});
const started = Date.now();
console.log(`Provedor: ${getAIProvider()} · modelo: ${getAIModel()} · semana ${weekNumber}\nEscrevendo o texto…`);
const index = weekNumber - 1;
const draft = await generateOneWeek(input, index, { deferDerivatives: true, deferRepair: true });
console.log(`Texto pronto em ${Math.round((Date.now() - started) / 1000)} s. Gerando avaliação e guia do professor…`);
let lesson = normalizeLesson(draft, input, index);
let guide = draft.teacherGuide || {};
try {
  const done = await completeWeekDerivatives(input, index, lesson, guide);
  lesson = done.week; guide = done.teacherGuide || guide;
} catch (error) { console.log(`Etapa de avaliação falhou: ${error.message}`); }
const quality = measureLessonQuality(lesson, input, {});
const week = { lesson, teacherGuide: guide, quality };
const plan = lesson.lessonPlan || {};
const refs = Array.isArray(plan.references) ? plan.references : [];
const citationOf = (ref) => String(ref?.citation || ref?.title || ref || "");
const report = abntReport(refs);
const bodyText = [plan.welcome, ...(plan.contentSections || []).map((s) => `${s.body} ${(s.subsections || []).map((x) => x.body).join(" ")}`)].join(" ").replace(/<[^>]+>/g, " ");
const parenthetical = bodyText.match(/\(([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'’ -]+(?: et al\.)?),? (?:19|20)\d{2}[a-z]?\)/g) || [];
const narrative = bodyText.match(/[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ'’-]+(?: et al\.)? \((?:19|20)\d{2}[a-z]?\)/g) || [];
const citations = [...new Set([...parenthetical, ...narrative])];
const quotes = bodyText.match(/[“"][^”"]{40,}[”"]/g) || [];
console.log("\n── RESULTADO ──");
console.log(`Título: ${plan.title || lesson.meta?.title}`);
console.log(`Seções: ${(plan.contentSections || []).length} · palavras: ${quality.wordCount} · status de qualidade: ${quality.status} (nota ${quality.score})`);
console.log(`Questões: ${plan.assessment?.questions?.length ?? 0} · guia do professor: ${Object.keys(guide).length ? "sim" : "não"}`);
console.log(`\nReferências: ${report.total} · fora do padrão ABNT: ${report.flagged.length}`);
refs.forEach((ref, i) => { const issues = abntIssues(ref); console.log(`  ${String(i + 1).padStart(2)}. ${citationOf(ref).replace(/\s+/g, " ").slice(0, 160)}${issues.length ? `\n      ⚠ ${issues.join("; ")}` : ""}`); });
console.log(`\nCitações autor-data no texto: ${citations.length}`);
const refText = refs.map(citationOf).join(" ").toUpperCase();
const orphan = [...new Set(citations)].filter((c) => { const author = c.replace(/[()]/g, "").replace(/\s*(?:19|20)\d{2}[a-z]?$/, "").split(/,| et al\./)[0].trim().split(" ").pop().toUpperCase(); return !refText.includes(author); });
console.log(`  sem correspondência na lista de referências: ${orphan.length}${orphan.length ? `\n    ${orphan.slice(0, 10).join("; ")}` : ""}`);
console.log(`Citações diretas longas (conferir autor, obra e página): ${quotes.length}`);
const issues = quality.issues || [];
console.log(`\nPendências do próprio ClassAuthor (${issues.length}):`); issues.forEach((issue) => console.log(`  - ${issue}`));
if (opt("salvar", "")) { writeFileSync(opt("salvar", ""), JSON.stringify(week, null, 2)); console.log(`\nSemana salva em ${opt("salvar", "")}`); }
console.log(`\nTempo total: ${Math.round((Date.now() - started) / 1000)} s`);
