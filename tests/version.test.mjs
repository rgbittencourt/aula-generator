import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_VERSION } from "../src/version.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("a versão (SemVer) é a mesma em package.json, no código e no rodapé", () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(read("../package.json")).version, APP_VERSION);
  assert.equal(JSON.parse(read("../package-lock.json")).version, APP_VERSION);
  const shown = [...read("../public/index.html").matchAll(/class="semver"[^>]*>v([^<]+)</g)].map((m) => m[1]);
  assert.ok(shown.length >= 2, "a versão deve aparecer na tela de entrada e no rodapé");
  for (const v of shown) assert.equal(v, APP_VERSION);
  assert.doesNotMatch(read("../public/index.html"), /v0\.1\.0/);
});
