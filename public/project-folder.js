// Pasta do projeto: tudo o que o ClassAuthor salva vai para uma pasta no computador do professor,
// organizada em subpastas. Usa a File System Access API (Chrome e Edge no computador). Nos outros
// navegadores, os arquivos continuam indo para Downloads, como sempre.

const DB_NAME = "classauthor-folder";
const STORE = "handles";
const KEY = "project";
export const MARKER = ".classauthor-projeto.json";

export const SUBFOLDERS = Object.freeze([
  ["backup", "Backups do planejamento (o mais recente e o histórico)"],
  ["classatelier", "Aulas para abrir e editar no ClassAtelier (…-ClassAtelier.json)"],
  ["classauthor", "Aulas completas do ClassAuthor, com quiz, feedbacks e guia do professor (…-ClassAuthor.json)"],
  ["moodle", "Questões para importar no Moodle (XML)"],
  ["professor", "Material de Mediação do professor (PDF)"],
  ["praticas", "Roteiros das práticas, laboratórios e aulas síncronas (DOCX e anexos)"],
  ["producao", "Produção audiovisual: planilha e roteiros de vídeo"],
  ["pacotes", "Pacotes completos (ZIP)"],
  ["fontes", "Cópias das apostilas e livros anexados como fonte (PDF, DOCX)"],
  ["textos", "Textos editados e outros arquivos"]
]);

export const folderSupported = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function idb(mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(request?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

let current = null; // { handle, name }

export async function loadProjectFolder() {
  if (!folderSupported()) return null;
  try { current = (await idb("readonly", (store) => store.get(KEY))) || null; } catch { current = null; }
  return current;
}
export const projectFolder = () => current;
export async function forgetProjectFolder() { current = null; try { await idb("readwrite", (store) => store.delete(KEY)); } catch { /* nada */ } }

export async function folderPermission(interactive = false) {
  if (!current?.handle) return "none";
  const options = { mode: "readwrite" };
  let state = await current.handle.queryPermission(options);
  if (state !== "granted" && interactive) state = await current.handle.requestPermission(options);
  return state;
}

const slug = (value) => String(value || "planejamento").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "planejamento";

async function writeText(dir, name, text) {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}

// O professor escolhe ONDE criar; o app cria a pasta do projeto com as subpastas.
// Se a pasta escolhida já for de um projeto do ClassAuthor (tem o marcador), ela é reaproveitada.
export async function chooseProjectFolder(courseTitle = "", unitLabel = "aulas") {
  const picked = await window.showDirectoryPicker({ id: "classauthor-projetos", mode: "readwrite", startIn: "documents" });
  let projectDir = picked;
  let reused = false;
  try { await picked.getFileHandle(MARKER); reused = true; } catch { reused = false; }
  if (!reused) {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    projectDir = await picked.getDirectoryHandle(`${slug(courseTitle)}-${date}`, { create: true });
  }
  for (const [name] of SUBFOLDERS) await projectDir.getDirectoryHandle(name, { create: true });
  await writeText(projectDir, MARKER, JSON.stringify({ app: "classauthor", title: courseTitle, createdAt: new Date().toISOString() }, null, 2));
  await writeText(projectDir, "LEIA-ME.txt", `Pasta do projeto "${courseTitle || "planejamento"}" no ClassAuthor.\n\nTudo o que o ClassAuthor salva vem para cá, separado assim:\n\n${SUBFOLDERS.map(([name, description]) => `${name}/  ${description}`).join("\n")}\n\nPara continuar em outro computador, leve esta pasta e use "Restaurar backup" com o arquivo da pasta backup/.\nAs ${unitLabel} e os arquivos do ClassAtelier podem ser abertos direto daqui.\n`);
  current = { handle: projectDir, name: projectDir.name, parentName: reused ? "" : picked.name };
  await idb("readwrite", (store) => store.put(current, KEY));
  return { ...current, reused };
}

// Subpasta de cada arquivo, pelo nome.
export function subfolderFor(filename = "") {
  const name = String(filename).toLowerCase();
  if (/rascunho.*\.json$|backup.*\.json$/.test(name)) return "backup";
  if (/-classatelier\.json$/.test(name)) return "classatelier";
  if (/-classauthor\.json$/.test(name)) return "classauthor";
  if (/\.xml$/.test(name)) return "moodle";
  if (/mediacao.*\.pdf$|\.pdf$/.test(name)) return "professor";
  if (/\.docx$|webpratica|pratica|laboratorio/.test(name)) return "praticas";
  if (/\.xlsx$|roteiros-de-video|producao/.test(name)) return "producao";
  if (/\.zip$/.test(name)) return "pacotes";
  return "textos";
}

// Grava o arquivo na subpasta certa. Devolve o caminho relativo, ou null se não houver pasta/permissão.
export async function saveToProjectFolder(blob, filename, { interactive = true, subfolder = null } = {}) {
  if (!current?.handle) return null;
  if ((await folderPermission(interactive)) !== "granted") return null;
  const folder = subfolder || subfolderFor(filename);
  let dir = current.handle;
  for (const part of folder.split("/")) dir = await dir.getDirectoryHandle(part, { create: true });
  const file = await dir.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
  return `${current.name}/${folder}/${filename}`;
}

export const DRAFT_FILE = "rascunho-atual.json";

// Abre uma pasta de projeto já existente (de outro navegador ou computador) e devolve o rascunho dela.
export async function openExistingProjectFolder() {
  const picked = await window.showDirectoryPicker({ id: "classauthor-projetos", mode: "readwrite", startIn: "documents" });
  try { await picked.getFileHandle(MARKER); } catch { throw new Error(`A pasta "${picked.name}" não é uma pasta de projeto do ClassAuthor. Escolha a pasta que tem as subpastas backup, classatelier, professor…`); }
  for (const [name] of SUBFOLDERS) await picked.getDirectoryHandle(name, { create: true });
  current = { handle: picked, name: picked.name };
  await idb("readwrite", (store) => store.put(current, KEY));
  return { ...current, draft: await readProjectDraft() };
}

// O rascunho mais recente da pasta: rascunho-atual.json ou, na falta dele, o backup mais novo.
export async function readProjectDraft() {
  if (!current?.handle) return null;
  const backup = await current.handle.getDirectoryHandle("backup", { create: true });
  const candidates = [];
  for await (const [name, entry] of backup.entries()) {
    if (entry.kind !== "file" || !/\.json$/i.test(name)) continue;
    const file = await entry.getFile();
    candidates.push({ name, file, current: name === DRAFT_FILE });
  }
  candidates.sort((a, b) => (b.current - a.current) || (b.file.lastModified - a.file.lastModified));
  for (const candidate of candidates) {
    try { const data = JSON.parse(await candidate.file.text()); if (data?.form) return data; } catch { /* tenta o próximo */ }
  }
  return null;
}
