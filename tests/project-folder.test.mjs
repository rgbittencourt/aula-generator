import test from "node:test";
import assert from "node:assert/strict";
import { subfolderFor } from "../public/project-folder.js";

test("cada arquivo salvo vai para a subpasta certa da pasta do projeto", () => {
  const cases = {
    "banco-de-dados-backup.json": "backup",
    "rascunho-atual.json": "backup",
    "Aula01-Consultas-ClassAtelier.json": "classatelier",
    "Semana02-Indices-ClassAuthor.json": "classauthor",
    "Aula01-Consultas-Quiz.xml": "moodle",
    "banco-de-dados-material-de-mediacao.pdf": "professor",
    "Aula01-webpratica.docx": "praticas",
    "banco-de-dados-planilha-de-producao.xlsx": "producao",
    "banco-de-dados-roteiros-de-video.md": "producao",
    "banco-de-dados-aulas.zip": "pacotes",
    "Aula01-Texto-editado.txt": "textos"
  };
  for (const [name, folder] of Object.entries(cases)) assert.equal(subfolderFor(name), folder, name);
});
