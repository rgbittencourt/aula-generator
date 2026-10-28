import test from "node:test";
import assert from "node:assert/strict";
import { abntIssues, abntRules, sortReferencesAbnt, abntToday } from "../src/abnt.js";
import { referenceItemHtml } from "../src/student-export.js";
import { parseWeekMarkdown, planToMarkdown } from "../src/writer-markdown.js";

test("ABNT: ordena em ordem alfabética ignorando acento e negrito", () => {
  const sorted = sortReferencesAbnt([
    { citation: "SILVA, Ana. **Título**. São Paulo: X, 2020." },
    { citation: "ÁVILA, Bruno. **Obra**. Rio: Y, 2019." },
    { citation: "BRASIL. **Lei nº 9.394**. Brasília, 1996." }
  ]).map((item) => item.citation.split(/[,.]/)[0]);
  assert.deepEqual(sorted, ["ÁVILA", "BRASIL", "SILVA"]);
});

test("ABNT: conferência de forma aponta o que falta", () => {
  assert.deepEqual(abntIssues("SILVA, Ana. **Gestão escolar**. 2. ed. São Paulo: Cortez, 2020."), []);
  assert.ok(abntIssues("gestão educacional na era digital").length >= 2);
  assert.ok(abntIssues("SILVA, Ana. **Título**. São Paulo: X, 2020. Disponível em: <https://exemplo.org>.").some((m) => /Acesso em/.test(m)));
  assert.ok(abntIssues({ citation: "SILVA, Ana. **Título**. São Paulo: X, 2020.", href: "https://exemplo.org" }).some((m) => /Disponível em/.test(m)));
  assert.ok(abntIssues("SILVA, Ana. Título sem destaque. São Paulo: X, 2020.").some((m) => /destaque/.test(m)));
});

test("ABNT: prompts trazem as regras e a data de acesso no formato da norma", () => {
  assert.match(abntRules("28 out. 2026"), /NBR 6023:2018/);
  assert.match(abntRules("28 out. 2026"), /Acesso em: 28 out\. 2026\./);
  assert.match(abntToday(new Date(2026, 9, 28)), /^28 out\. 2026$/);
});

test("ABNT: título em **negrito** vira <strong> no ClassAtelier e sobrevive ao ciclo markdown", () => {
  assert.equal(referenceItemHtml("SILVA, Ana. **Gestão <escolar>**. São Paulo: X, 2020."), "SILVA, Ana. <strong>Gestão &lt;escolar&gt;</strong>. São Paulo: X, 2020.");
  const md = "# Semana 1 — T\n\n## Referências desta semana\n\n- ZAGO, Rui. **Livro B**. Rio: Y, 2018.\n- ALVES, Eva. *Livro A*. Recife: Z, 2017.\n";
  const { lessonPlan: plan } = parseWeekMarkdown(md, { weekNumber: 1 });
  const refs = plan.references.map((r) => r.citation);
  assert.ok(refs.includes("ZAGO, Rui. **Livro B**. Rio: Y, 2018."));
  assert.ok(refs.includes("ALVES, Eva. **Livro A**. Recife: Z, 2017."));
  assert.match(planToMarkdown({ references: plan.references, title: "T", weekNumber: 1 }), /\*\*Livro B\*\*/);
});
