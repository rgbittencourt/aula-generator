// Exporta o quiz da semana em Moodle XML (formato de importação do banco de
// questões), separado do .aula.json do ClassAtelier.
//
// Cada questão é "multichoice" de resposta única, com feedback em TODAS as
// alternativas (certa ou errada), feedback geral (a explicação) e feedbacks
// de acerto/erro. Importar em: Banco de questões > Importar > Formato Moodle XML.

import { GENERATOR_CREDIT } from "./student-export.js";

const CHOICES_NUMBERING = "abc";

function escapeXml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cdata(value) {
  return `<![CDATA[${String(value ?? "").replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function html(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return /<\w+[^>]*>/.test(raw) ? raw : `<p>${escapeXml(raw)}</p>`;
}

function textNode(value, indent) {
  return `${indent}<text>${cdata(html(value))}</text>`;
}

function questionXml(question, { weekNumber, index }) {
  const options = question.options || [];
  const answer = Math.min(Math.max(0, Number(question.answer) || 0), options.length - 1);
  const label = `S${String(weekNumber).padStart(2, "0")} Q${index + 1}`;
  const title = String(question.q || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").slice(0, 60);
  const grade = Number(question.points) > 0 ? Number(question.points) : 1;
  const feedbackBlock = (tag, content) => `    <${tag} format="html">\n${textNode(content, "      ")}\n    </${tag}>`;
  const lines = [];
  lines.push(`  <question type="multichoice">`);
  lines.push(`    <name><text>${escapeXml(`${label} – ${title}`)}</text></name>`);
  lines.push(feedbackBlock("questiontext", question.q));
  lines.push(feedbackBlock("generalfeedback", question.explanation));
  lines.push(`    <defaultgrade>${grade.toFixed(7)}</defaultgrade>`);
  lines.push(`    <penalty>0.3333333</penalty>`);
  lines.push(`    <hidden>0</hidden>`);
  lines.push(`    <single>true</single>`);
  lines.push(`    <shuffleanswers>true</shuffleanswers>`);
  lines.push(`    <answernumbering>${CHOICES_NUMBERING}</answernumbering>`);
  lines.push(feedbackBlock("correctfeedback", "Resposta correta."));
  lines.push(feedbackBlock("partiallycorrectfeedback", "Resposta parcialmente correta."));
  lines.push(feedbackBlock("incorrectfeedback", "Resposta incorreta. Leia o feedback da alternativa que você marcou."));
  lines.push(`    <shownumcorrect/>`);
  options.forEach((option, i) => {
    lines.push(`    <answer fraction="${i === answer ? "100" : "0"}" format="html">`);
    lines.push(textNode(option, "      "));
    lines.push(`      <feedback format="html">`);
    lines.push(textNode(question.feedbackByOption?.[i] || (i === answer ? question.explanation : ""), "        "));
    lines.push(`      </feedback>`);
    lines.push(`    </answer>`);
  });
  lines.push(`  </question>`);
  return lines.join("\n");
}

export function quizQuestions(lesson) {
  const plan = lesson?.lessonPlan || lesson;
  return (plan?.assessment?.questions || []).filter((question) => question?.q && (question.options || []).length >= 2);
}

function categoryName(courseTitle, weekNumber) {
  return `$course$/top/${String(courseTitle || "Curso").replace(/\//g, "-").trim() || "Curso"}/Semana ${weekNumber}`;
}

function weekBody(lesson, { courseTitle, weekNumber }) {
  const questions = quizQuestions(lesson);
  if (!questions.length) return "";
  const head = `  <question type="category">
    <category><text>${escapeXml(categoryName(courseTitle, weekNumber))}</text></category>
    <info format="html"><text>${escapeXml(`Quiz da Semana ${weekNumber}. ${GENERATOR_CREDIT}`)}</text></info>
  </question>`;
  return [head, ...questions.map((question, index) => questionXml(question, { weekNumber, index }))].join("\n");
}

export function createMoodleXml(lesson, { courseTitle = "Curso", weekNumber = 1 } = {}) {
  const body = weekBody(lesson, { courseTitle, weekNumber });
  return body ? `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n${body}\n</quiz>\n` : "";
}

// Todas as semanas em um único arquivo, cada uma em sua categoria.
export function createCombinedMoodleXml(lessons, { courseTitle = "Curso" } = {}) {
  const parts = lessons.map((lesson, index) => weekBody(lesson, { courseTitle, weekNumber: index + 1 })).filter(Boolean);
  return parts.length ? `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n${parts.join("\n")}\n</quiz>\n` : "";
}
