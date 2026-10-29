import test from "node:test";
import assert from "node:assert/strict";
import figureHandler, { originAllowed } from "../src/figure-handler.js";
import { drawFigureFromPrompt } from "../src/illustrate.js";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="Fila de pedidos"><rect width="960" height="540" fill="#fbf9f4"/><text x="40" y="80" font-size="28">Fila</text></svg>';

function res() {
  const out = { headers: {}, status: 0, body: undefined, ended: false };
  return Object.assign(out, {
    setHeader(k, v) { out.headers[k] = v; },
    status(code) { out.status = code; return out; },
    json(b) { out.body = b; return out; },
    end() { out.ended = true; return out; }
  });
}
const req = (over = {}) => ({ method: "POST", headers: { origin: "https://rgbittencourt.github.io" }, body: { prompt: "Fila de pedidos em uma cozinha" }, ...over });
const draw = async (input) => ({ src: "data:image/svg+xml;base64,AAAA", alt: "alt", caption: "c", credit: "x", got: input.prompt });

test("origens: GitHub Pages do autor e localhost passam; outras não", () => {
  assert.ok(originAllowed("https://rgbittencourt.github.io", {}));
  assert.ok(originAllowed("http://localhost:8000", {}));
  assert.ok(!originAllowed("https://evil.example", {}));
  assert.ok(originAllowed("https://outro.example", { AULA_CORS_ORIGINS: "https://outro.example/" }));
});

test("OPTIONS: 204 com CORS para origem permitida, 403 para as outras", async () => {
  const ok = res(); await figureHandler(req({ method: "OPTIONS" }), ok);
  assert.equal(ok.status, 204);
  assert.equal(ok.headers["Access-Control-Allow-Origin"], "https://rgbittencourt.github.io");
  assert.match(ok.headers["Access-Control-Allow-Headers"], /x-aula-access-code/);
  const bad = res(); await figureHandler(req({ method: "OPTIONS", headers: { origin: "https://evil.example" } }), bad);
  assert.equal(bad.status, 403); assert.equal(bad.headers["Access-Control-Allow-Origin"], undefined);
});

test("POST: devolve a figura; recusa origem estranha; exige código quando configurado", async () => {
  const ok = res(); await figureHandler(req(), ok, { draw });
  assert.equal(ok.status, 200); assert.equal(ok.body.ok, true); assert.equal(ok.body.got, "Fila de pedidos em uma cozinha");
  const evil = res(); await figureHandler(req({ headers: { origin: "https://evil.example" } }), evil, { draw });
  assert.equal(evil.status, 403);
  process.env.AULA_ACCESS_CODE = "segredo";
  try {
    const no = res(); await figureHandler(req(), no, { draw }); assert.equal(no.status, 401);
    const yes = res(); await figureHandler(req({ headers: { origin: "https://rgbittencourt.github.io", "x-aula-access-code": "segredo" } }), yes, { draw }); assert.equal(yes.status, 200);
  } finally { delete process.env.AULA_ACCESS_CODE; }
});

test("erro da IA vira resposta clara (sem chave: 503; prompt vazio: 400)", async () => {
  const e1 = res(); await figureHandler(req(), e1, { draw: async () => { const e = new Error("sem chave"); e.code = "AI_KEY_MISSING"; throw e; } });
  assert.equal(e1.status, 503);
  const e2 = res(); await figureHandler(req({ body: { prompt: "" } }), e2);
  assert.equal(e2.status, 400); assert.equal(e2.body.code, "FIGURE_PROMPT_MISSING");
});

test("drawFigureFromPrompt limpa o SVG, tenta de novo se vier inválido e rotula como IA", async () => {
  const calls = [];
  const ask = async (messages) => { calls.push(messages.length); return { text: calls.length === 1 ? "<svg>sem viewBox</svg>" : "```svg\n" + SVG + "\n```" }; };
  const out = await drawFigureFromPrompt({ prompt: "Fila de pedidos", context: "<p>Texto do parágrafo</p>", title: "Semana 2" }, { ask });
  assert.equal(calls.length, 2);
  assert.match(out.src, /^data:image\/svg\+xml;base64,/);
  assert.equal(out.alt, "Fila de pedidos");
  assert.match(out.caption, /Ilustração criada por IA\.$/);
  assert.match(out.credit, /IA/);
  await assert.rejects(() => drawFigureFromPrompt({ prompt: "Fila" }, { ask: async () => ({ text: "<script>x</script>" }) }), (e) => e.code === "FIGURE_INVALID");
});
