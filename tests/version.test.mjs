import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_VERSION } from "../src/version.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("a versão (SemVer) é a mesma em package.json, no código e no rodapé", () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(read("../package.json")).version, APP_VERSION);
  assert.equal(JSON.parse(read("../package-lock.json")).version, APP_VERSION);
  assert.match(read("../public/index.html"), new RegExp(`id="app-version"[^>]*>v${APP_VERSION.replace(/\./g, "\\.")}<`));
});
