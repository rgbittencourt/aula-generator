// Materiais do professor (PDF/DOCX) como fonte da geração.
//
// O arquivo é lido NO NAVEGADOR: o texto é extraído por página (pdf.js) ou por parte (DOCX) e
// guardado no IndexedDB deste navegador. O arquivo nunca sobe para o servidor. Em cada pedido
// de geração, só os trechos mais ligados àquela semana vão junto (sourceExcerpts), com a página.

const DB_NAME = "classauthor-sources";
const STORE = "docs";
const PDFJS_URL = new URL("./vendor/pdfjs/pdf.min.mjs", import.meta.url).href;
const PDFJS_WORKER = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
const DOCX_PART_CHARS = 3000;

export const SOURCE_USAGES = Object.freeze([
  { id: "", label: "Não usar o conteúdo" },
  { id: "base", label: "Base do conteúdo (seguir de perto)" },
  { id: "apoio", label: "Referência de apoio (consultar e citar)" },
  { id: "pratica", label: "Roteiro de prática/laboratório" }
]);

// Limites por semana (caracteres), para o pedido caber com folga no modelo.
const LIMITS = { total: 30000, perChunk: 3200, base: 9, apoio: 4, pratica: 5 };

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Este navegador não permite guardar o material (IndexedDB indisponível).")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Não foi possível abrir o armazenamento do navegador."));
  });
}

async function tx(mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let result;
    Promise.resolve(run(store)).then((value) => { result = value; }).catch(reject);
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

const reqPromise = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });

export async function saveSourceDoc(doc) { return tx("readwrite", (store) => reqPromise(store.put(doc))); }
export async function loadSourceDoc(id) { if (!id) return null; try { return await tx("readonly", (store) => reqPromise(store.get(id))); } catch { return null; } }
export async function deleteSourceDoc(id) { if (!id) return; try { await tx("readwrite", (store) => reqPromise(store.delete(id))); } catch { /* nada a apagar */ } }

const cleanText = (value) => String(value || "").replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();

async function extractPdf(file, onProgress) {
  const pdfjs = await import(PDFJS_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) { text += item.str || ""; text += item.hasEOL ? "\n" : " "; }
    pages.push({ page: String(number), text: cleanText(text) });
    if (onProgress && number % 5 === 0) onProgress(number, pdf.numPages);
  }
  return { kind: "pdf", unit: "p.", pages };
}

async function extractDocx(file) {
  const JSZip = window.JSZip;
  if (!JSZip) throw new Error("O leitor de DOCX ainda não carregou. Tente de novo em alguns segundos.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const xml = await zip.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("Este DOCX não tem o texto no formato esperado.");
  const paragraphs = xml.split(/<\/w:p>/).map((part) => part.replace(/<w:tab\/>/g, "\t").replace(/<w:br[^>]*\/>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim()).filter(Boolean);
  const pages = [];
  let buffer = "";
  for (const paragraph of paragraphs) {
    if (buffer.length + paragraph.length > DOCX_PART_CHARS && buffer) { pages.push({ page: String(pages.length + 1), text: cleanText(buffer) }); buffer = ""; }
    buffer += `${paragraph}\n`;
  }
  if (buffer.trim()) pages.push({ page: String(pages.length + 1), text: cleanText(buffer) });
  return { kind: "docx", unit: "parte", pages };
}

// Lê o arquivo, guarda o texto e devolve o resumo que fica no cartão do material.
export async function importSourceFile(file, materialId, onProgress) {
  const name = file?.name || "material";
  const isPdf = /\.pdf$/i.test(name) || file?.type === "application/pdf";
  const isDocx = /\.docx$/i.test(name);
  if (!isPdf && !isDocx) throw new Error("Anexe um arquivo PDF ou DOCX.");
  const extracted = isPdf ? await extractPdf(file, onProgress) : await extractDocx(file);
  const chars = extracted.pages.reduce((sum, page) => sum + page.text.length, 0);
  const id = `src-${materialId}`;
  await saveSourceDoc({ id, name, savedAt: new Date().toISOString(), ...extracted });
  const perPage = chars / Math.max(1, extracted.pages.length);
  return {
    id, name, kind: extracted.kind, unit: extracted.unit, pageCount: extracted.pages.length, chars,
    warning: isPdf && perPage < 150 ? "Pouco texto encontrado: o PDF parece escaneado (imagem). Sem OCR, a IA não consegue ler o conteúdo." : ""
  };
}

// "1: 1-30" · "Semana 2: 31-45, 50" → { 1: Set([...]), 2: Set([...]) }
export function parseWeekPages(value) {
  const map = {};
  String(value || "").split(/\n|;/).forEach((line) => {
    const match = line.match(/^\s*(?:semana\s*)?(\d+)\s*[:=\-–]\s*(.+)$/i);
    if (!match) return;
    const pages = new Set();
    match[2].split(",").forEach((part) => {
      const range = part.trim().match(/^(\d+)\s*(?:[-–a]\s*(\d+))?$/i);
      if (!range) return;
      const start = Number(range[1]), end = Number(range[2] || range[1]);
      for (let page = Math.min(start, end); page <= Math.max(start, end) && page - start < 400; page += 1) pages.add(String(page));
    });
    if (pages.size) map[Number(match[1])] = pages;
  });
  return map;
}

const STOP = new Set("para pela pelo pelas pelos como mais menos entre sobre sem com uma umas uns dos das nos nas que qual quais quando onde porque este esta estes estas esse essa esses essas isso isto aquele aquela seu sua seus suas nosso nossa ser estar ter haver fazer pode podem deve devem cada todo toda todos todas muito muita muitos muitas tambem também ainda apenas outro outra outros outras semana semanas aula aulas estudante estudantes aluno alunos curso objetivo objetivos capaz final será serão".split(" "));
const normalizeWord = (word) => word.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function terms(value) {
  return String(value || "").split(/[^\p{L}\p{N}]+/u).map(normalizeWord).filter((word) => word.length >= 4 && !STOP.has(word) && !/^\d+$/.test(word));
}

function scoreText(text, queryCounts) {
  const counts = new Map();
  terms(text).forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  let score = 0;
  queryCounts.forEach((weight, word) => { const found = counts.get(word); if (found) score += weight * (1 + Math.log(found)); });
  return score;
}

// Parte do campo "Conteúdos" que fala desta semana ("Semana 2 – …" até a próxima "Semana N").
export function weekSlice(content, weekNumber) {
  const textValue = String(content || "");
  const pattern = new RegExp(`semana\\s*${weekNumber}\\b[\\s\\S]*?(?=\\n\\s*semana\\s*\\d+\\b|$)`, "i");
  const match = textValue.match(pattern);
  return match ? match[0] : "";
}

// Trechos para a semana `index`. `week` (opcional) é a semana já escrita: o tema e as seções dela
// ajudam a achar os trechos certos nas etapas seguintes (atividades, guia, refação).
export async function sourceExcerptsForWeek(input, index, week = null) {
  const materials = (input?.materials || []).filter((material) => material.sourceFile?.id && material.sourceUsage);
  if (!materials.length) return [];
  const weekNumber = index + 1;
  const plan = week?.lessonPlan || {};
  const weekQuery = [plan.theme, ...(plan.learningObjectives || []), ...(plan.contentSections || []).map((section) => section.title), weekSlice(input.content, weekNumber)].filter(Boolean).join(" ");
  const generalQuery = [input.title, ...(input.objectives || [])].join(" ");
  const queryCounts = new Map();
  terms(weekQuery).forEach((word) => queryCounts.set(word, (queryCounts.get(word) || 0) + 3));
  terms(generalQuery).forEach((word) => queryCounts.set(word, (queryCounts.get(word) || 0) + 1));
  const practiceThisWeek = (input.webPractices || []).some((practice) => Number(practice.weekNumber) === weekNumber);
  const out = [];
  for (const material of materials) {
    if (material.sourceUsage === "pratica" && !practiceThisWeek) continue;
    const doc = await loadSourceDoc(material.sourceFile.id);
    if (!doc?.pages?.length) continue;
    const chosen = parseWeekPages(material.sourceWeekPages)[weekNumber];
    const limit = LIMITS[material.sourceUsage] || 4;
    let pages = doc.pages.filter((page) => page.text.length > 40);
    if (chosen) pages = pages.filter((page) => chosen.has(page.page)).slice(0, limit * 2);
    else pages = pages.map((page) => ({ ...page, score: scoreText(page.text, queryCounts) })).filter((page) => page.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).sort((a, b) => Number(a.page) - Number(b.page));
    pages.forEach((page) => out.push({
      materialId: material.id, title: material.title || doc.name, reference: material.source || [material.author, material.title].filter(Boolean).join(". "),
      usage: material.sourceUsage, unit: doc.unit || "p.", page: page.page, chosenByTeacher: Boolean(chosen),
      text: page.text.slice(0, LIMITS.perChunk)
    }));
  }
  // Limite total: base primeiro, depois prática e apoio.
  const order = { base: 0, pratica: 1, apoio: 2 };
  out.sort((a, b) => (order[a.usage] ?? 3) - (order[b.usage] ?? 3));
  const kept = [];
  let used = 0;
  for (const excerpt of out) { if (used + excerpt.text.length > LIMITS.total) break; kept.push(excerpt); used += excerpt.text.length; }
  return kept;
}
