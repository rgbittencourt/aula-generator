import assert from "node:assert/strict";
import test from "node:test";
import { applyAdjustment, applyRewrite, approveWeek, bridgesBefore, canGenerateNext, dismissIssue, emptyFlow, normalizeFlow, recordGenerated, weekFlowStatus } from "../public/step-flow.js";

const s = (n, hook = `gancho ${n}`) => ({ weekNumber: n, theme: `Tema ${n}`, hookOut: hook, concepts: [] });

test("a próxima semana só é liberada depois da aprovação da anterior no modo passo a passo", () => {
  const flow = emptyFlow();
  assert.equal(canGenerateNext(flow, 0, true), true, "a primeira semana sempre pode ser gerada");
  recordGenerated(flow, 0, s(1));
  assert.equal(canGenerateNext(flow, 1, true), false);
  assert.equal(canGenerateNext(flow, 1, false), true, "o modo contínuo não bloqueia");
  approveWeek(flow, 0, s(1));
  assert.equal(canGenerateNext(flow, 1, true), true);
});

test("as duas semanas anteriores alimentam o prompt, na ordem", () => {
  const flow = emptyFlow();
  [0, 1, 2].forEach((index) => recordGenerated(flow, index, s(index + 1)));
  assert.deepEqual(bridgesBefore(flow, 3).map((item) => item.weekNumber), [2, 3]);
  assert.deepEqual(bridgesBefore(flow, 0), []);
  assert.deepEqual(bridgesBefore(flow, 1).map((item) => item.weekNumber), [1]);
});

test("semana gerada guarda sobre qual ponte foi construída e não nasce aprovada", () => {
  const flow = emptyFlow();
  recordGenerated(flow, 0, s(1));
  approveWeek(flow, 0, s(1));
  recordGenerated(flow, 1, s(2));
  assert.equal(flow.links[1].weekNumber, 1);
  assert.equal(flow.approved[1], undefined);
  assert.equal(weekFlowStatus(flow, 0).key, "approved");
  assert.equal(weekFlowStatus(flow, 1).key, "draft");
});

test("refazer uma semana aprovada: ponte mudou marca a abertura da seguinte e exige nova aprovação", () => {
  const flow = emptyFlow();
  [0, 1, 2].forEach((index) => { recordGenerated(flow, index, s(index + 1)); approveWeek(flow, index, s(index + 1)); });
  applyRewrite(flow, 1, s(2, "gancho novo"), { comparison: { needsPreviousClosing: false }, linkComparison: { level: "edges", needsNextOpening: true, reasons: ["o gancho de fechamento mudou"] }, totalWeeks: 3 });
  assert.equal(flow.approved[1], false);
  assert.equal(flow.bridges[1].hookOut, "gancho novo");
  assert.equal(flow.issues[2].opening, true);
  assert.equal(flow.issues[2].stale, false);
  assert.match(flow.issues[2].reasons[0], /semana 2/);
  assert.equal(flow.issues[0], undefined, "a semana anterior não é tocada se a abertura não mudou");
  assert.equal(weekFlowStatus(flow, 2).key, "edges");
});

test("abertura mudou: marca o fechamento da semana anterior", () => {
  const flow = emptyFlow();
  [0, 1].forEach((index) => { recordGenerated(flow, index, s(index + 1)); approveWeek(flow, index, s(index + 1)); });
  applyRewrite(flow, 1, s(2), { comparison: { needsPreviousClosing: true }, linkComparison: null, totalWeeks: 2 });
  assert.equal(flow.issues[0].closing, true);
  assert.equal(flow.issues[1], undefined, "não há semana seguinte para avisar");
});

test("conceitos trocados: a seguinte fica desatualizada", () => {
  const flow = emptyFlow();
  [0, 1].forEach((index) => { recordGenerated(flow, index, s(index + 1)); approveWeek(flow, index, s(index + 1)); });
  applyRewrite(flow, 0, s(1, "outro"), { comparison: null, linkComparison: { level: "stale", needsNextOpening: true, reasons: ["os conceitos ensinados mudaram"] }, totalWeeks: 2 });
  assert.equal(weekFlowStatus(flow, 1).key, "stale");
});

test("sem mudança de ponte nenhuma vizinha é marcada", () => {
  const flow = emptyFlow();
  [0, 1, 2].forEach((index) => { recordGenerated(flow, index, s(index + 1)); approveWeek(flow, index, s(index + 1)); });
  applyRewrite(flow, 1, s(2), { comparison: { level: "none", needsPreviousClosing: false }, linkComparison: { level: "none", needsNextOpening: false, reasons: [] }, totalWeeks: 3 });
  assert.deepEqual(flow.issues, {});
});

test("ajustar a abertura resolve o aviso e reancora a semana na ponte atual", () => {
  const flow = emptyFlow();
  [0, 1].forEach((index) => { recordGenerated(flow, index, s(index + 1)); approveWeek(flow, index, s(index + 1)); });
  applyRewrite(flow, 0, s(1, "gancho novo"), { comparison: null, linkComparison: { level: "edges", needsNextOpening: true, reasons: ["x"] }, totalWeeks: 2 });
  applyAdjustment(flow, 1, "opening", s(2));
  assert.equal(flow.issues[1], undefined);
  assert.equal(flow.links[1].hookOut, "gancho novo");
});

test("ajustar o fechamento resolve o aviso e reancora a seguinte", () => {
  const flow = emptyFlow();
  [0, 1].forEach((index) => { recordGenerated(flow, index, s(index + 1)); approveWeek(flow, index, s(index + 1)); });
  applyRewrite(flow, 1, s(2), { comparison: { needsPreviousClosing: true }, totalWeeks: 2 });
  applyAdjustment(flow, 0, "closing", s(1, "fecha certo"));
  assert.equal(flow.issues[0], undefined);
  assert.equal(flow.bridges[0].hookOut, "fecha certo");
});

test("dispensar o aviso mantém a semana como está e reancora o vínculo", () => {
  const flow = emptyFlow();
  [0, 1].forEach((index) => { recordGenerated(flow, index, s(index + 1)); approveWeek(flow, index, s(index + 1)); });
  applyRewrite(flow, 0, s(1, "gancho novo"), { linkComparison: { level: "edges", needsNextOpening: true, reasons: [] }, totalWeeks: 2 });
  dismissIssue(flow, 1);
  assert.equal(flow.issues[1], undefined);
  assert.equal(flow.links[1].hookOut, "gancho novo");
});

test("normalizeFlow aceita lixo vindo de backups antigos", () => {
  assert.deepEqual(normalizeFlow(null), emptyFlow());
  assert.deepEqual(normalizeFlow("x"), emptyFlow());
  const restored = normalizeFlow({ approved: { 0: true }, bridges: [], extra: 1 });
  assert.equal(restored.approved[0], true);
  assert.deepEqual(restored.bridges, {});
});
