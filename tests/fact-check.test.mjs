import test from "node:test";
import assert from "node:assert/strict";
import { extractClaims, factCheckPlan, applyFactCheck, normalizeNumber, numbersIn } from "../src/fact-check.js";

const plan = (body, extra = {}) => ({
  welcome: "<p>Olá, pessoal.</p>",
  contentSections: [{ number: "1", title: "Seção", body, subsections: [], callouts: [] }],
  synthesis: "", nextWeekConnection: "", references: [], claimEvidence: [], ...extra
});

test("normalizeNumber trata milhar e decimal em português", () => {
  assert.equal(normalizeNumber("14.129"), "14129");
  assert.equal(normalizeNumber("2,5"), "2.5");
  assert.equal(normalizeNumber("800"), "800");
  assert.ok(numbersIn("Lei 14.129/2021 e 800 mil").has("14129"));
});

test("não trata 'Semana 2' nem 'seção 3' como afirmação factual", () => {
  const claims = extractClaims(plan("<p>Como vimos na Semana 2, a seção 3 retoma o tema com calma e cuidado.</p>"));
  assert.equal(claims.length, 0);
});

test("número ausente do briefing e das semanas anteriores vira pendência", () => {
  const input = { content: "O briefing cita o Ifal e o SUAP." };
  const result = factCheckPlan(plan("<p>O Ifal anunciou uma <strong>economia de mais de R$ 800 mil</strong> com a migração em 2019.</p>"), { input });
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].verificationStatus, "needs-human-review");
  assert.match(result.entries[0].note, /R\$ 800 mil/);
  assert.match(result.entries[0].note, /2019/);
  assert.equal(result.entries[0].sectionNumber, "1");
});

test("número que consta no briefing ou em semana anterior não é sinalizado", () => {
  const input = { content: "Segundo o briefing, a migração ocorreu em 2019 e custou R$ 800 mil." };
  const previous = [{ lessonPlan: { contentSections: [{ body: "<p>Em 2021 foi publicada a Lei 14.129.</p>", subsections: [] }] } }];
  const result = factCheckPlan(plan("<p>A migração ocorreu em 2019 e economizou R$ 800 mil. A Lei 14.129/2021 reforçou o caminho.</p>"), { input, previousWeeks: previous });
  assert.equal(result.entries.length, 0);
  assert.ok(result.stats.supported >= 1);
});

test("o que o autor já listou em Pontos a conferir não é duplicado", () => {
  const p = plan("<p>O Instituto Federal de Goiás levou cerca de 8 meses para reintegrar o código customizado.</p>", {
    claimEvidence: [{ claim: "Goiás levou cerca de 8 meses para reintegrar", verificationStatus: "needs-human-review" }]
  });
  const result = factCheckPlan(p, { input: {} });
  assert.equal(result.entries.length, 0);
  assert.equal(result.stats.alreadyListed, 1);
});

test("citação direta longa é sinalizada mesmo sem números", () => {
  const result = factCheckPlan(plan("<p>O diretor disse que “o Suap foi desenvolvido com as características do Instituto Federal e o SIG foi criado numa universidade”.</p>"), { input: {} });
  assert.equal(result.entries.length, 1);
  assert.match(result.entries[0].note, /citação direta/);
});

test("normas são sinalizadas e applyFactCheck acrescenta ao claimEvidence", () => {
  const p = plan("<p>A Portaria 1.234/2020 do MEC tratou do tema.</p>");
  const stats = applyFactCheck(p, { input: {} });
  assert.equal(stats.flagged, 1);
  assert.equal(p.claimEvidence.length, 1);
  assert.match(p.claimEvidence[0].id, /^auto-claim-/);
});
