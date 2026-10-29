import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toGeneratorWeek } from "../src/student-export.js";
import { parseSavedWeek, planPlacement, weekNumberOf } from "../src/week-import.js";

const lesson = (n, extra = {}) => ({ meta: { title: `Semana ${n} · Redes`, weekNumber: n }, lessonPlan: { weekNumber: n, theme: "Redes" }, blocks: [{ id: "b1", type: "prose", props: { body: "Texto" } }], ...extra });
const saved = (n, guide = { notes: ["x"] }) => JSON.stringify(toGeneratorWeek(lesson(n), guide));

test("lê a semana salva por baixarWeekFull (ida e volta) com guia do professor", () => {
  const out = parseSavedWeek(saved(3), "Semana03-redes-ClassAuthor.json");
  assert.equal(out.number, 3);
  assert.equal(out.week.blocks.length, 1);
  assert.deepEqual(out.teacherGuide, { notes: ["x"] });
});

test("descobre o número pelo título ou pelo nome do arquivo quando faltar no conteúdo", () => {
  assert.equal(weekNumberOf({ meta: { title: "Semana 07 · X" } }), 7);
  assert.equal(weekNumberOf({ meta: { title: "Sem número" } }, "Semana12-x-ClassAuthor.json"), 12);
  assert.equal(weekNumberOf({ lessonPlan: { weekNumber: 99 }, meta: { title: "x" } }), 0);
});

test("recusa com mensagem clara: JSON inválido, backup, arquivo do ClassAtelier e semana vazia", () => {
  assert.throws(() => parseSavedWeek("{nao-json"), /JSON válido/);
  assert.throws(() => parseSavedWeek(JSON.stringify({ version: 2, app: "classauthor", form: {} })), /Restaurar backup/);
  assert.throws(() => parseSavedWeek(JSON.stringify({ format: "classatelier-project", blocks: [] })), /ClassAtelier/);
  assert.throws(() => parseSavedWeek(JSON.stringify({ blocks: [{}], meta: {} })), /ClassAtelier/);
  assert.throws(() => parseSavedWeek(JSON.stringify({ generator: "outro", format: "classauthor-semana", week: lesson(1) })), /não é uma semana salva/);
  assert.throws(() => parseSavedWeek(JSON.stringify(toGeneratorWeek({ meta: { title: "Semana 2" }, blocks: [] }))), /vazia/);
  assert.throws(() => parseSavedWeek("[]"), /não é uma semana salva/);
});

test("posicionamento: substitui, acrescenta a seguinte ou recusa quebra de sequência", () => {
  assert.deepEqual(planPlacement(2, 4), { action: "replace", index: 1 });
  assert.deepEqual(planPlacement(5, 4), { action: "append", index: 4 });
  assert.equal(planPlacement(1, 0).action, "append");
  assert.equal(planPlacement(7, 4).action, "refuse");
  assert.match(planPlacement(3, 0).reason, /Semana 1/);
  assert.match(planPlacement(5, 3).reason, /a Semana 4 \(ou/);
  assert.match(planPlacement(7, 3).reason, /semanas 4 a 6/);
});

test("public/week-import.js é cópia idêntica de src/week-import.js", () => {
  assert.equal(readFileSync(new URL("../public/week-import.js", import.meta.url), "utf8"), readFileSync(new URL("../src/week-import.js", import.meta.url), "utf8"));
});
