import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCompositionPlan, compositionPlanForWeek } from "../src/composition.js";
import { figureAsk } from "../src/claude-writer.js";

test("quantidade de figuras por tipo: padrão, exceção por semana e vazio = IA decide", () => {
  const plan = normalizeCompositionPlan({ default: { rows: {}, figures: { diagrama: 1, napkin: 2, foto: "" } }, weeks: [{ weekNumber: 2, rows: {}, figures: { napkin: 0, foto: 1 } }] }, 3);
  const w1 = compositionPlanForWeek({ compositionPlan: plan, weeks: 3 }, 0);
  const w2 = compositionPlanForWeek({ compositionPlan: plan, weeks: 3 }, 1);
  assert.deepEqual(w1.figures, { diagrama: 1, napkin: 2, foto: null });
  assert.deepEqual(w2.figures, { diagrama: 1, napkin: 0, foto: 1 });
  assert.match(figureAsk(w1.figures), /EXATAMENTE 1 diagrama, 2 figuras napkin/);
  assert.match(figureAsk(w1.figures), /Para foto, use só se fizer falta/);
  assert.equal(figureAsk({ diagrama: null, napkin: null, foto: null }), "");
  assert.equal(compositionPlanForWeek({ weeks: 1 }, 0).figures.diagrama, null);
});
