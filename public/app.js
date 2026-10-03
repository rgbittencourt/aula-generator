const $ = (selector) => document.querySelector(selector);
const isGitHubPages = window.location.hostname.endsWith(".github.io");
const createReviewMarks = () => ({ resources: {}, checks: {} });
const state = { input: null, weeks: [], workload: null, generalPlan: null, teacherGuides: [], provider: null, validation: null, previewIndex: null, reviewMarks: createReviewMarks(), weekApprovals: {} };
const blockLabels = { hero: "Abertura", topic: "Tópico", prose: "Texto", titulo: "Título", video: "Vídeo", materiais: "Materiais", quiz: "Quiz", destaque: "Destaque", atencao: "Atenção", reflexao: "Reflexão", imagem: "Imagem", externalembed: "Conteúdo externo", accordion: "FAQ", columns: "Colunas", referencias: "Referências" };
const DRAFT_STORAGE_KEY = "aula-generator:draft:v2";
const DRAFT_MAX_AGE_DAYS = 30;
let saveTimer = null;

function syncRecoveryLayout() {
  const dock = $("#recovery-dock");
  const height = dock && !dock.classList.contains("hidden") ? Math.ceil(dock.getBoundingClientRect().height) : 0;
  document.documentElement.style.setProperty("--recovery-stack-height", `${height}px`);
}

function splitLines(value) { return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function formatDate(value) { return value ? value.split("-").reverse().join("/") : ""; }
function readableText(value) { return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim(); }

function enhanceLayout() {
  const sidebar = document.querySelector(".summary-column");
  const formColumn = document.querySelector(".form-column");
  if (!sidebar || !formColumn || sidebar.dataset.enhanced === "true") return;
  sidebar.dataset.enhanced = "true";
  sidebar.classList.add("project-sidebar");

  const panels = [...formColumn.querySelectorAll(":scope > .panel")];
  const navItems = [];
  panels.forEach((panel, index) => {
    const heading = panel.querySelector(":scope > .panel-heading");
    if (!heading) return;
    const title = heading.querySelector("h2")?.textContent.trim() || `Setor ${String(index + 1).padStart(2, "0")}`;
    const details = document.createElement("details");
    details.className = `${panel.className} briefing-sector`;
    details.id = `sector-${String(index + 1).padStart(2, "0")}`;
    details.open = index === 0;
    const summary = document.createElement("summary");
    summary.className = "sector-summary";
    summary.innerHTML = `${heading.innerHTML}<span class="sector-chevron" aria-hidden="true">⌄</span>`;
    const body = document.createElement("div");
    body.className = "sector-body";
    [...panel.children].filter((child) => child !== heading).forEach((child) => body.appendChild(child));
    details.append(summary, body);
    panel.replaceWith(details);
    summary.addEventListener("click", (event) => {
      if (event.target.closest(".switch")) event.preventDefault();
    });
    navItems.push({ id: details.id, title });
  });

  const summaryCard = sidebar.querySelector(".summary-card");
  const actions = document.createElement("section");
  actions.className = "sidebar-actions";
  actions.innerHTML = '<p class="sidebar-label">AÇÕES DO PROJETO</p>';
  ["assist-button", "generate-button", "recalculate-button", "teacher-pdf-button", "zip-button"].forEach((id) => {
    const button = $("#" + id);
    if (!button) return;
    button.classList.add("sidebar-action");
    if (["recalculate-button", "teacher-pdf-button", "zip-button"].includes(id)) button.disabled = true;
    actions.appendChild(button);
  });
  document.querySelector(".form-actions")?.remove();
  document.querySelector(".results-actions")?.remove();
  summaryCard?.after(actions);

  const navigation = document.createElement("nav");
  navigation.className = "sidebar-navigation";
  navigation.setAttribute("aria-label", "Navegação do planejamento");
  navigation.innerHTML = '<p class="sidebar-label">NAVEGAR PELO PROJETO</p>' + navItems.map((item) => `<a href="#${item.id}" data-scroll-to="${item.id}">${escapeHtml(item.title)}<span>→</span></a>`).join("") + '<a href="#results-load" data-scroll-to="results-load">Carga por atividade<span>→</span></a><a href="#results-review" data-scroll-to="results-review">Checklists e progressão<span>→</span></a><a href="#results-weeks" data-scroll-to="results-weeks">Semanas planejadas<span>→</span></a>';
  actions.after(navigation);
  navigation.querySelectorAll("[data-scroll-to]").forEach((link) => link.addEventListener("click", (event) => {
    const target = document.getElementById(link.dataset.scrollTo);
    if (!target) return;
    event.preventDefault();
    if (target.tagName === "DETAILS") target.open = true;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  const weekGrid = $("#week-grid");
  if (weekGrid && !$("#results-weeks")) {
    const parent = weekGrid.parentElement;
    const weeksSector = document.createElement("details");
    weeksSector.className = "results-sector weeks-sector";
    weeksSector.id = "results-weeks";
    weeksSector.open = true;
    weeksSector.innerHTML = '<summary class="results-sector-summary"><strong>Semanas planejadas</strong><small id="weeks-sector-note">As semanas aparecerão aqui depois da geração.</small></summary>';
    const body = document.createElement("div");
    body.className = "results-sector-body";
    weekGrid.remove();
    body.appendChild(weekGrid);
    weeksSector.appendChild(body);
    parent.appendChild(weeksSector);
  }
}

function paragraphsMarkup(value) { return String(value ?? "").split(/\n\s*\n|\r?\n/).map((part) => readableText(part)).filter(Boolean).map((part) => `<p>${escapeHtml(part)}</p>`).join(""); }
function slugify(value) { return String(value || "curso").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "curso"; }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function addDays(dateString, days) { const date = new Date(`${dateString}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

function formatSavedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function depthFromCourseLevel(value) {
  const level = String(value || "").toLowerCase();
  if (level.includes("avanç") || level.includes("avanc")) return "avançado";
  if (level.includes("inici")) return "básico";
  return "aprofundado";
}

function updateAcademicInheritance() {
  const values = {
    "academic-inherited-discipline": $("#course-title")?.value.trim() || "A definir",
    "academic-inherited-audience": $("#audience")?.value.trim() || "A definir",
    "academic-inherited-level": $("#level")?.value || "A definir",
    "academic-inherited-depth": depthFromCourseLevel($("#level")?.value)
  };
  Object.entries(values).forEach(([id, value]) => { const element = $("#" + id); if (element) element.textContent = value; });
}

function setSaveStatus(title, detail, tone = "") {
  const bar = $("#recovery-bar");
  if (!bar) return;
  if (!document.body.classList.contains("welcome-active")) {
    $("#recovery-dock")?.classList.remove("hidden");
    bar.classList.remove("hidden");
    syncRecoveryLayout();
  }
  $("#save-status-title").textContent = title;
  $("#save-status").textContent = detail;
  bar.classList.toggle("is-warning", tone === "warning");
  bar.classList.toggle("is-success", tone === "success");
}

function safeStorageGet() {
  try { return localStorage.getItem(DRAFT_STORAGE_KEY); } catch { return null; }
}

function safeStorageSet(value) {
  try { localStorage.setItem(DRAFT_STORAGE_KEY, value); return true; } catch { return false; }
}

function safeStorageRemove() {
  try { localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* armazenamento pode estar bloqueado */ }
}

function showRecoveryDock(showBar = true) {
  $("#recovery-dock")?.classList.remove("hidden");
  if (showBar) $("#recovery-bar")?.classList.remove("hidden");
  syncRecoveryLayout();
}

function hideRecoveryDock() {
  $("#recovery-dock")?.classList.add("hidden");
  $("#recovery-bar")?.classList.add("hidden");
  syncRecoveryLayout();
}

function enterWorkspace() {
  $("#welcome-screen")?.classList.add("hidden");
  document.body.classList.remove("welcome-active");
  const draft = readDraft();
  if (draft) showRecoveryDock(true);
  else hideRecoveryDock();
  updateAcademicInheritance();
  updateSummary();
  updateProgress();
}

function initializeWelcome() {
  // A capa é uma entrada limpa. O dock de recuperação só aparece depois que
  // o usuário conclui o cadastro inicial e entra no workspace.
  hideRecoveryDock();
}

function enterFromWelcome(event) {
  event.preventDefault();
  const author = $("#welcome-author")?.value.trim() || "";
  const institution = $("#welcome-institution")?.value.trim() || "";
  const accessCode = $("#welcome-access-code")?.value || "";
  const requiredFields = [[author, "#welcome-author"], [institution, "#welcome-institution"], [accessCode.trim(), "#welcome-access-code"]];
  const missingField = requiredFields.find(([value]) => !value);
  if (missingField) {
    $(missingField[1])?.focus();
    return;
  }
  $("#author").value = author;
  $("#institution").value = institution;
  $("#access-code").value = accessCode;
  enterWorkspace();
}

function persistedInput() {
  const input = formInput();
  const { accessCode, ...safeInput } = input;
  return safeInput;
}

function currentSnapshot() {
  const input = persistedInput();
  const hasWork = Boolean(input.title.trim() || state.weeks.length);
  if (!hasWork) return null;
  return {
    version: 2,
    app: "aula-generator",
    savedAt: new Date().toISOString(),
    form: input,
    results: state.weeks.length ? {
      ok: true,
      provider: state.provider,
      input: state.input || input,
      workload: state.workload,
      generalPlan: state.generalPlan,
      teacherGuides: state.teacherGuides,
      validation: state.validation,
      reviewMarks: state.reviewMarks,
      weekApprovals: state.weekApprovals,
      weeks: state.weeks
    } : null
  };
}

function saveDraft(reason = "") {
  try {
    const snapshot = currentSnapshot();
    if (!snapshot) return;
    if (!safeStorageSet(JSON.stringify(snapshot))) {
      setSaveStatus("Salvamento automático limitado", "O navegador não tem espaço disponível. Baixe um backup manual.", "warning");
      return;
    }
    const resultText = snapshot.results ? ` · ${snapshot.results.weeks.length} semana(s) preservada(s)` : "";
    setSaveStatus("Salvamento local ativo", `Último salvamento: ${formatSavedAt(snapshot.savedAt)}${resultText}`, "success");
  } catch {
    setSaveStatus("Backup manual recomendado", "Não foi possível salvar automaticamente neste navegador. Use Baixar backup.", "warning");
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft("alteração"), 500);
}

function readDraft() {
  const raw = safeStorageGet();
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    const age = draft?.savedAt ? Date.now() - new Date(draft.savedAt).getTime() : Infinity;
    if (draft?.version !== 2 || draft?.app !== "aula-generator" || !draft.form || age > DRAFT_MAX_AGE_DAYS * 86400000) {
      safeStorageRemove();
      return null;
    }
    return draft;
  } catch {
    safeStorageRemove();
    return null;
  }
}

function hideDraftRecovery() { $("#draft-recovery")?.classList.add("hidden"); syncRecoveryLayout(); }

function offerDraftRecovery() {
  const draft = readDraft();
  if (!draft) return;
  showRecoveryDock(true);
  const hasResults = Boolean(draft.results?.weeks?.length);
  $("#draft-recovery-details").textContent = `Salvo em ${formatSavedAt(draft.savedAt)}${hasResults ? ` · ${draft.results.weeks.length} semana(s) gerada(s)` : " · briefing em andamento"}.`;
  $("#draft-recovery").classList.remove("hidden");
  syncRecoveryLayout();
  setSaveStatus("Planejamento recuperável encontrado", "Escolha Retomar planejamento ou descarte este rascunho.", "success");
}

function applyInputToForm(input = {}) {
  const currentAccessCode = $("#access-code")?.value || "";
  const fields = { "course-title": "title", audience: "audience", level: "level", author: "author", institution: "institution", weeks: "weeks", hours: "hoursPerWeek", "calendar-mode": "calendarMode", "start-date": "startDate", objectives: "objectives", content: "content", "didactic-mode": "didacticMode", references: "references", videos: "videoLinks", "video-search-suggestions": "videoSearchSuggestions", "image-links": "imageLinks", "image-search-suggestions": "imageSearchSuggestions" };
  Object.entries(fields).forEach(([elementId, key]) => {
    const element = $("#" + elementId);
    if (!element) return;
    const value = input[key];
    element.value = Array.isArray(value) ? value.join("\n") : (value ?? "");
  });
  const profile = input.academicProfile || {};
  const profileFields = { "academic-target-words": "targetWords", "academic-min-sections": "minimumSections", "academic-min-references": "minimumReferences", "academic-primary-sources": "primarySourcesRequired", "citation-style": "citationStyle", "academic-scope": "historicalScope", "academic-authors": "requiredAuthors", "academic-frameworks": "requiredFrameworks", "academic-avoid": "avoidTopics", "academic-source-policy": "sourcePolicy" };
  Object.entries(profileFields).forEach(([elementId, key]) => { const element = $("#" + elementId); if (element) element.value = Array.isArray(profile[key]) ? profile[key].join("\n") : (profile[key] ?? element.value); });
  [["#require-counterpoints", "requireCounterarguments"], ["#require-comparisons", "requireConceptComparison"], ["#require-case-study", "requireCaseStudy"]].forEach(([selector, key]) => { if (profile[key] !== undefined) $(selector).checked = Boolean(profile[key]); });
  $("#practice-enabled").checked = Boolean(input.webPracticeEnabled || input.webPractice?.enabled);
  $("#practice-list").innerHTML = "";
  practiceSequence = 0;
  const practices = Array.isArray(input.webPractices) && input.webPractices.length ? input.webPractices : [{}];
  practices.forEach((practice) => addPractice(practice));
  if ($("#practice-count")) $("#practice-count").value = practices.length;
  $("#materials-list").innerHTML = "";
  materialSequence = 0;
  const materials = Array.isArray(input.materials) && input.materials.length ? input.materials : [{}];
  materials.forEach((material) => addMaterial(material));
  if ($("#access-code")) $("#access-code").value = currentAccessCode;
  if ($("#welcome-author")) $("#welcome-author").value = input.author || $("#welcome-author").value || "";
  if ($("#welcome-institution")) $("#welcome-institution").value = input.institution || $("#welcome-institution").value || "";
  toggleCalendar();
  togglePractice();
  const resourcePlan = input.resourcePlan || {};
  const resourceDefaults = resourcePlan.default || {};
  if ($("#resource-default-videos")) $("#resource-default-videos").value = Number.isFinite(Number(resourceDefaults.videosPerWeek)) ? resourceDefaults.videosPerWeek : 1;
  if ($("#resource-default-articles")) $("#resource-default-articles").value = Number.isFinite(Number(resourceDefaults.articlesPerWeek)) ? resourceDefaults.articlesPerWeek : 1;
  if ($("#resource-default-required")) $("#resource-default-required").value = Number.isFinite(Number(resourceDefaults.requiredReadingsPerWeek)) ? resourceDefaults.requiredReadingsPerWeek : 1;
  if ($("#resource-default-level")) $("#resource-default-level").value = resourceDefaults.requiredReadingLevel || "essential";
  renderResourcePlanWeeks(resourcePlan);
  renderCompositionPlanWeeks(input.compositionPlan || {});
  updateAcademicInheritance();
  updateSummary();
  updateProgress();
}

function optionalResourceCount(value) {
  const source = String(value ?? "").trim();
  if (!source) return null;
  return Math.min(12, Math.max(0, Number(source) || 0));
}

function collectResourcePlan() {
  const weeks = [...document.querySelectorAll("[data-resource-week]")].map((row) => ({
    weekNumber: Number(row.dataset.resourceWeek),
    videosPerWeek: optionalResourceCount(row.querySelector("[data-resource-videos]")?.value),
    articlesPerWeek: optionalResourceCount(row.querySelector("[data-resource-articles]")?.value),
    requiredReadingsPerWeek: optionalResourceCount(row.querySelector("[data-resource-required]")?.value),
    requiredReadingLevel: row.querySelector("[data-resource-level]")?.value || null
  }));
  return {
    default: {
      videosPerWeek: Math.min(12, Math.max(0, Number($("#resource-default-videos")?.value) || 0)),
      articlesPerWeek: Math.min(12, Math.max(0, Number($("#resource-default-articles")?.value) || 0)),
      requiredReadingsPerWeek: Math.min(12, Math.max(0, Number($("#resource-default-required")?.value) || 0)),
      requiredReadingLevel: $("#resource-default-level")?.value || "essential"
    },
    weeks
  };
}

function renderResourcePlanWeeks(plan = {}) {
  const container = $("#resource-plan-weeks");
  if (!container) return;
  const weeks = Math.min(52, Math.max(1, Number($("#weeks")?.value) || 1));
  const entries = Array.isArray(plan.weeks) ? plan.weeks : [];
  const byWeek = new Map(entries.map((entry) => [Number(entry.weekNumber || entry.week), entry]));
  const field = (label, attribute, value, type = "number") => type === "select"
    ? `<label class="field"><span>${label}</span><select data-resource-${attribute} class="resource-override"><option value="">Padrão</option><option value="none" ${value === "none" ? "selected" : ""}>Nenhuma</option><option value="essential" ${value === "essential" ? "selected" : ""}>Essencial</option><option value="advanced" ${value === "advanced" ? "selected" : ""}>Aprofundada</option><option value="dense" ${value === "dense" ? "selected" : ""}>Densa</option></select></label>`
    : `<label class="field"><span>${label}</span><input data-resource-${attribute} class="resource-override" type="number" min="0" max="12" step="1" value="${value ?? ""}" placeholder="padrão" /></label>`;
  container.innerHTML = Array.from({ length: weeks }, (_, index) => {
    const weekNumber = index + 1;
    const entry = byWeek.get(weekNumber) || {};
    return `<div class="resource-plan-week" data-resource-week="${weekNumber}"><div class="resource-plan-week-label">Semana ${weekNumber}</div>${field("Vídeos", "videos", entry.videosPerWeek)}${field("Artigos", "articles", entry.articlesPerWeek)}${field("Leituras obrigatórias", "required", entry.requiredReadingsPerWeek)}${field("Nível de leitura", "level", entry.requiredReadingLevel, "select")}</div>`;
  }).join("");
}

const compositionCatalog = [
  ["destaque", "Destaque conceitual", "Destaques", 1, 1], ["atencao", "Atenção / erro comum", "Destaques", 1, 1], ["reflexao", "Reflexão", "Destaques", 1, 1], ["citacao", "Citação", "Texto", 0, 1], ["pitaco", "Comentário / pitaco", "Destaques", 0, 1],
  ["imagem", "Imagem com legenda", "Mídia", 1, 1], ["parallax", "Imagem parallax", "Mídia", 0, 1], ["textoimagem", "Texto + imagem", "Mídia", 0, 1], ["cases", "Cards de casos", "Mídia", 0, 3], ["feature", "Destaques com ícones", "Mídia", 0, 3], ["tabela", "Tabela comparativa", "Mídia", 0, 3], ["filmstrip", "Filmstrip / carrossel", "Mídia", 0, 3], ["audio", "Áudio / podcast", "Mídia", 0, 1],
  ["accordion", "Acordeão / FAQ", "Interativos", 1, 3], ["flashcards", "Flashcards", "Interativos", 0, 6], ["slider", "Slider / passo a passo", "Interativos", 0, 3], ["linhadotempo", "Linha do tempo", "Interativos", 0, 4], ["columns", "Colunas comparativas", "Interativos", 0, 2], ["quiz", "Quiz formativo", "Interativos", 1, 5], ["externalembed", "Conteúdo externo", "Mídia", 0, 1]
];

function compositionDefaultRows() {
  return Object.fromEntries(compositionCatalog.map(([key, label, group, count, itemsPerBlock]) => [key, { key, label, group, count, policy: "prefer", itemsPerBlock }]));
}

function compositionRowValue(row, key, fallback = "") {
  const value = row?.[key];
  return value === null || value === undefined ? fallback : value;
}

function collectCompositionPlan() {
  const rows = {};
  compositionCatalog.forEach(([key, label, group, defaultCount, itemsPerBlock]) => {
    rows[key] = { key, label, group, count: Math.min(12, Math.max(0, Number($(`[data-composition-default="${key}"]`)?.value) || 0)), policy: $(`[data-composition-policy="${key}"]`)?.value || "prefer", itemsPerBlock: itemsPerBlock > 1 ? Math.min(12, Math.max(1, Number($(`[data-composition-items="${key}"]`)?.value) || itemsPerBlock)) : 1 };
  });
  const weeks = [...document.querySelectorAll("[data-composition-week]")].map((row) => ({
    weekNumber: Number(row.dataset.compositionWeek),
    rows: Object.fromEntries(compositionCatalog.map(([key, label, group, defaultCount, itemsPerBlock]) => {
      const count = row.querySelector(`[data-composition-week-count="${key}"]`)?.value ?? "";
      const policy = row.querySelector(`[data-composition-week-policy="${key}"]`)?.value ?? "";
      return [key, { count: count === "" ? "" : Math.min(12, Math.max(0, Number(count) || 0)), policy, itemsPerBlock: itemsPerBlock > 1 ? (Number(row.querySelector(`[data-composition-week-items="${key}"]`)?.value) || itemsPerBlock) : 1 }];
    }))
  }));
  return { preset: "balanced", default: { rows }, weeks };
}

function renderCompositionPlanWeeks(plan = {}) {
  const container = $("#composition-plan");
  if (!container) return;
  const weeks = Math.min(52, Math.max(1, Number($("#weeks")?.value) || 1));
  const defaults = plan.default?.rows || {};
  const entries = Array.isArray(plan.weeks) ? plan.weeks : [];
  const byWeek = new Map(entries.map((entry) => [Number(entry.weekNumber || entry.week), entry.rows || entry]));
  const defaultRows = compositionCatalog.map(([key, label, group, defaultCount, itemsPerBlock]) => {
    const row = defaults[key] || {};
    return `<div class="composition-row"><span class="composition-label"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(group)}</small></span><input data-composition-default="${key}" type="number" min="0" max="12" step="1" value="${compositionRowValue(row, "count", defaultCount)}" aria-label="Quantidade padrão de ${escapeHtml(label)}" /><select data-composition-policy="${key}" aria-label="Política de ${escapeHtml(label)}"><option value="prefer" ${compositionRowValue(row, "policy", "prefer") === "prefer" ? "selected" : ""}>Preferir</option><option value="required" ${compositionRowValue(row, "policy", "prefer") === "required" ? "selected" : ""}>Obrigatório</option><option value="none" ${compositionRowValue(row, "policy", "prefer") === "none" ? "selected" : ""}>Não usar</option></select>${itemsPerBlock > 1 ? `<label class="composition-items">itens <input data-composition-items="${key}" type="number" min="1" max="12" value="${compositionRowValue(row, "itemsPerBlock", itemsPerBlock)}" /></label>` : ""}</div>`;
  }).join("");
  const weekMarkup = Array.from({ length: weeks }, (_, index) => {
    const weekNumber = index + 1;
    const rowPlan = byWeek.get(weekNumber) || {};
    return `<details class="composition-week" data-composition-week="${weekNumber}"><summary>Semana ${weekNumber}<small>Deixe vazio para herdar o padrão</small></summary><div class="composition-week-grid">${compositionCatalog.map(([key, label, group, defaultCount, itemsPerBlock]) => { const row = rowPlan[key] || {}; return `<label class="composition-week-cell"><span>${escapeHtml(label)}</span><input data-composition-week-count="${key}" type="number" min="0" max="12" step="1" value="${row.count ?? ""}" placeholder="padrão" />${itemsPerBlock > 1 ? `<input data-composition-week-items="${key}" type="number" min="1" max="12" value="${row.itemsPerBlock || ""}" placeholder="${itemsPerBlock} itens" />` : ""}<select data-composition-week-policy="${key}"><option value="">padrão</option><option value="prefer" ${row.policy === "prefer" ? "selected" : ""}>preferir</option><option value="required" ${row.policy === "required" ? "selected" : ""}>obrigatório</option><option value="none" ${row.policy === "none" ? "selected" : ""}>não usar</option></select></label>`; }).join("")}</div></details>`;
  }).join("");
  container.innerHTML = `<div class="composition-defaults"><div class="composition-table-head"><strong>Bloco do Aula Studio</strong><span>Qtd. padrão</span><span>Política</span><span>Itens/bloco</span></div>${defaultRows}</div><div class="composition-week-heading"><strong>Exceções por semana</strong><small>Use apenas quando uma semana precisar de composição diferente.</small></div><div class="composition-week-list">${weekMarkup}</div>`;
}

function restoreSnapshot(snapshot) {
  if (!snapshot?.form) return;
  applyInputToForm(snapshot.form);
  state.reviewMarks = snapshot.results?.reviewMarks || snapshot.reviewMarks || createReviewMarks();
  state.weekApprovals = snapshot.results?.weekApprovals || snapshot.weekApprovals || {};
  hideDraftRecovery();
  if (snapshot.results?.weeks?.length) {
    renderWeeks({ ...snapshot.results, input: snapshot.results.input || snapshot.form });
    setSaveStatus("Planejamento retomado", `${snapshot.results.weeks.length} semana(s) recuperada(s).`, "success");
  } else {
    setSaveStatus("Briefing retomado", "Continue preenchendo; o salvamento automático está ativo.", "success");
  }
  showAssistantMessage("Planejamento recuperado. Confira o briefing e continue de onde parou.");
}

function downloadBackup() {
  const snapshot = currentSnapshot() || readDraft();
  if (!snapshot) { showAssistantMessage("Preencha ao menos o título do curso antes de salvar um backup.", true); return; }
  downloadBlob(new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" }), `${slugify(snapshot.form.title || "planejamento")}-backup.json`);
  setSaveStatus("Backup baixado", "Guarde este arquivo fora do navegador para uma recuperação adicional.", "success");
}

function restoreBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const snapshot = JSON.parse(String(reader.result || ""));
      if (snapshot?.version !== 2 || snapshot?.app !== "aula-generator" || !snapshot.form) throw new Error("Este arquivo não é um backup válido do Gerador de Aulas.");
      safeStorageSet(JSON.stringify(snapshot));
      restoreSnapshot(snapshot);
      enterWorkspace();
    } catch (error) { showAssistantMessage(error.message || "Não foi possível restaurar o backup.", true); }
  };
  reader.readAsText(file);
}

let practiceSequence = 0;
let materialSequence = 0;
const selectOption = (value, option) => value === option ? "selected" : "";

function practiceCard(data = {}) {
  practiceSequence += 1;
  const id = data.id || `webpractice-${practiceSequence}`;
  return `<article class="item-card practice-card" data-id="${escapeHtml(id)}">
    <div class="item-card-heading"><strong>Sessão prática <span class="item-index">${practiceSequence}</span></strong><button class="remove-item" type="button" data-remove-practice aria-label="Remover webprática">×</button></div>
    <div class="field-grid two">
      <label class="field"><span>Título da sessão</span><input class="practice-title" value="${escapeHtml(data.title || data.sessionTitle || "")}" placeholder="Ex.: Laboratório de prototipagem com IA" /></label>
      <label class="field"><span>Modalidade</span><select class="practice-modality"><option ${selectOption(data.modality, "Aula síncrona / laboratório prático")}>Aula síncrona / laboratório prático</option><option ${selectOption(data.modality, "Aula síncrona")}>Aula síncrona</option><option ${selectOption(data.modality, "Laboratório prático")}>Laboratório prático</option></select></label>
    </div>
    <div class="field-grid three">
      <label class="field"><span>Semana de ocorrência <b>*</b></span><input class="practice-week" type="number" min="1" max="52" value="${Number(data.weekNumber || data.week) || ""}" placeholder="Ex.: 2" /></label>
      <label class="field"><span>Data real (opcional)</span><input class="practice-date" type="date" value="${escapeHtml(data.date || "")}" /></label>
      <label class="field"><span>Duração (minutos)</span><input class="practice-duration" type="number" min="5" step="5" value="${Number(data.durationMinutes) || 90}" /></label>
    </div>
    <div class="field-grid four">
      <label class="field"><span>Dia da semana</span><input class="practice-day" value="${escapeHtml(data.dayOfWeek || "")}" placeholder="Ex.: quarta-feira" /></label>
      <label class="field"><span>Início</span><input class="practice-start" type="time" value="${escapeHtml(data.startTime || "")}" /></label>
      <label class="field"><span>Fim</span><input class="practice-end" type="time" value="${escapeHtml(data.endTime || "")}" /></label>
      <label class="field"><span>Plataforma</span><input class="practice-platform" value="${escapeHtml(data.platform || "")}" placeholder="Meet, Zoom, laboratório" /></label>
    </div>
    <label class="field"><span>Ferramenta principal</span><input class="practice-tool" value="${escapeHtml(data.tool || "")}" placeholder="Ex.: ChatGPT, Scratch, Figma, planilha ou simulador" /></label>
    <label class="field"><span>Objetivo da sessão</span><input class="practice-objective" value="${escapeHtml(data.objective || "")}" placeholder="O que os estudantes aprenderão fazendo?" /></label>
    <label class="field"><span>Contexto/problema/desafio</span><textarea class="practice-context" rows="3" placeholder="Qual situação-problema dará sentido à prática?">${escapeHtml(data.context || data.problem || data.challenge || "")}</textarea></label>
    <div class="field-grid two">
      <label class="field"><span>Pré-requisitos e preparação</span><textarea class="practice-preparation" rows="3" placeholder="Contas, arquivos, leituras ou preparação do professor/estudante.">${escapeHtml((data.prerequisites || data.preparation || []).join ? (data.prerequisites || data.preparation || []).join("\n") : (data.preparation || ""))}</textarea></label>
      <label class="field"><span>Materiais e ferramentas de apoio</span><textarea class="practice-materials" rows="3" placeholder="Links, arquivos, dados, exemplos e materiais necessários.">${escapeHtml((data.materials || []).join ? (data.materials || []).join("\n") : (data.materials || ""))}</textarea></label>
    </div>
    <div class="field-grid two">
      <label class="field"><span>Produto/evidência</span><input class="practice-product" value="${escapeHtml(data.product || data.deliverable || "")}" placeholder="Ex.: protótipo, roteiro, arquivo ou demonstração" /></label>
      <label class="field"><span>Plano B/acessibilidade</span><input class="practice-fallback" value="${escapeHtml(data.fallbackPlan || "")}" placeholder="Alternativa se a ferramenta ou a conexão falhar" /></label>
    </div>
  </article>`;
}

function materialCard(data = {}) {
  materialSequence += 1;
  const id = data.id || `material-${materialSequence}`;
  return `<article class="item-card material-card" data-id="${escapeHtml(id)}">
    <div class="item-card-heading"><strong>Material <span class="item-index">${materialSequence}</span></strong><button class="remove-item" type="button" data-remove-material aria-label="Remover material">×</button></div>
    <div class="field-grid two">
      <label class="field"><span>Título do material</span><input class="material-title" value="${escapeHtml(data.title || "")}" placeholder="Ex.: Texto-base sobre mobilidade urbana" /></label>
      <label class="field"><span>Tipo</span><select class="material-type"><option ${selectOption(data.type, "Texto-base")}>Texto-base</option><option ${selectOption(data.type, "Artigo científico")}>Artigo científico</option><option ${selectOption(data.type, "Livro ou capítulo")}>Livro ou capítulo</option><option ${selectOption(data.type, "Vídeo")}>Vídeo</option><option ${selectOption(data.type, "Relatório ou dados")}>Relatório ou dados</option><option ${selectOption(data.type, "Infográfico")}>Infográfico</option><option ${selectOption(data.type, "Exercício")}>Exercício</option></select></label>
    </div>
    <div class="field-grid two">
      <label class="field"><span>Momento de uso</span><input class="material-moment" value="${escapeHtml(data.moment || "")}" placeholder="Ex.: antes da semana 1; revisão da semana 3" /></label>
      <label class="field"><span>Link real (opcional)</span><input class="material-link" type="url" value="${escapeHtml(data.link || "")}" placeholder="Cole somente um link conferido" /></label>
    </div>
    <div class="field-grid three">
      <label class="field"><span>Páginas</span><input class="material-pages" type="number" min="0" step="1" value="${escapeHtml(data.pages || "")}" placeholder="Ex.: 12" /></label>
      <label class="field"><span>Duração (min)</span><input class="material-duration" type="number" min="0" step="1" value="${Number(data.durationMinutes) || ""}" placeholder="Para vídeo/áudio" /></label>
      <label class="field checkbox-field"><span>Leitura obrigatória</span><input class="material-required" type="checkbox" ${data.required ? "checked" : ""} /></label>
    </div>
    <label class="field"><span>Objetivo do material</span><input class="material-objective" value="${escapeHtml(data.objective || "")}" placeholder="Por que o estudante precisa deste material?" /></label>
    <label class="field"><span>Alinhamento com o conteúdo</span><textarea class="material-alignment" rows="2" placeholder="Que conceito, objetivo ou webprática ele sustenta?">${escapeHtml(data.alignment || "")}</textarea></label>
    <label class="field"><span>Como o estudante vai usar</span><textarea class="material-use" rows="2" placeholder="Ler, comparar, assistir com roteiro, extrair dados…">${escapeHtml(data.use || "")}</textarea></label>
  </article>`;
}

function refreshItemButtons() {
  const practiceCards = document.querySelectorAll("#practice-list .practice-card");
  practiceCards.forEach((card, index) => { card.querySelector(".item-index").textContent = index + 1; card.querySelector("[data-remove-practice]").disabled = practiceCards.length <= 1; });
  const materialCards = document.querySelectorAll("#materials-list .material-card");
  materialCards.forEach((card, index) => { card.querySelector(".item-index").textContent = index + 1; card.querySelector("[data-remove-material]").disabled = materialCards.length <= 1; });
}

function syncPracticeCount() { const count = document.querySelectorAll("#practice-list .practice-card").length; if ($("#practice-count")) $("#practice-count").value = count; return count; }
function addPractice(data = {}) { $("#practice-list").insertAdjacentHTML("beforeend", practiceCard(data)); refreshItemButtons(); syncPracticeCount(); togglePractice(); }
function addMaterial(data = {}) { $("#materials-list").insertAdjacentHTML("beforeend", materialCard(data)); refreshItemButtons(); }

function applyPracticeCount() {
  const requested = Math.min(12, Math.max(1, Number($("#practice-count")?.value) || 1));
  const current = document.querySelectorAll("#practice-list .practice-card").length;
  while (document.querySelectorAll("#practice-list .practice-card").length < requested) addPractice();
  syncPracticeCount();
  if (current > requested) showAssistantMessage(`Já existem ${current} webprática(s) preenchidas. A redução não remove dados automaticamente; use × nos cartões que deseja retirar.`);
  updateSummary(); updateProgress(); scheduleSave();
}

function collectPractices() {
  return [...document.querySelectorAll("#practice-list .practice-card")].map((card, index) => ({
    id: card.dataset.id || `webpractice-${index + 1}`,
    title: card.querySelector(".practice-title").value.trim(),
    sessionTitle: card.querySelector(".practice-title").value.trim(),
    modality: card.querySelector(".practice-modality").value,
    weekNumber: Number(card.querySelector(".practice-week").value) || 0,
    date: card.querySelector(".practice-date").value,
    dayOfWeek: card.querySelector(".practice-day").value.trim(),
    startTime: card.querySelector(".practice-start").value,
    endTime: card.querySelector(".practice-end").value,
    platform: card.querySelector(".practice-platform").value.trim(),
    tool: card.querySelector(".practice-tool").value.trim(),
    objective: card.querySelector(".practice-objective").value.trim(),
    context: card.querySelector(".practice-context").value.trim(),
    problem: card.querySelector(".practice-context").value.trim(),
    preparation: card.querySelector(".practice-preparation").value.trim(),
    prerequisites: splitLines(card.querySelector(".practice-preparation").value),
    materials: splitLines(card.querySelector(".practice-materials").value),
    product: card.querySelector(".practice-product").value.trim(),
    fallbackPlan: card.querySelector(".practice-fallback").value.trim(),
    durationMinutes: Number(card.querySelector(".practice-duration").value) || 90
  }));
}

function collectMaterials() {
  return [...document.querySelectorAll("#materials-list .material-card")].map((card, index) => ({
    id: card.dataset.id || `material-${index + 1}`,
    type: card.querySelector(".material-type").value,
    title: card.querySelector(".material-title").value.trim(),
    link: card.querySelector(".material-link").value.trim(),
    moment: card.querySelector(".material-moment").value.trim(),
    pages: card.querySelector(".material-pages").value.trim(),
    durationMinutes: Number(card.querySelector(".material-duration").value) || 0,
    required: card.querySelector(".material-required").checked,
    objective: card.querySelector(".material-objective").value.trim(),
    alignment: card.querySelector(".material-alignment").value.trim(),
    use: card.querySelector(".material-use").value.trim(),
    notes: ""
  }));
}

function formInput() {
  const calendarMode = $("#calendar-mode").value;
  const webPractices = collectPractices();
  return {
    title: $("#course-title").value,
    audience: $("#audience").value,
    level: $("#level").value,
    author: $("#author").value,
    institution: $("#institution").value,
    weeks: Math.min(52, Math.max(1, Number($("#weeks").value) || 1)),
    hoursPerWeek: Math.max(0, Number($("#hours").value) || 0),
    calendarMode,
    startDate: calendarMode === "calendar" ? $("#start-date").value : null,
    objectives: splitLines($("#objectives").value),
    content: $("#content").value,
    didacticMode: $("#didactic-mode").value,
    academicProfile: {
      discipline: $("#course-title").value.trim(),
      level: $("#level").value,
      depth: depthFromCourseLevel($("#level").value),
      targetWords: Number($("#academic-target-words").value) || 2800,
      minimumSections: Number($("#academic-min-sections").value) || 6,
      minimumReferences: Number($("#academic-min-references").value) || 0,
      primarySourcesRequired: Number($("#academic-primary-sources").value) || 0,
      citationStyle: $("#citation-style").value,
      historicalScope: $("#academic-scope").value.trim(),
      requiredAuthors: splitLines($("#academic-authors").value),
      requiredFrameworks: splitLines($("#academic-frameworks").value),
      avoidTopics: splitLines($("#academic-avoid").value),
      sourcePolicy: $("#academic-source-policy").value.trim(),
      requireCounterarguments: $("#require-counterpoints").checked,
      requireConceptComparison: $("#require-comparisons").checked,
      requireCaseStudy: $("#require-case-study").checked
    },
    references: splitLines($("#references").value),
    videoLinks: splitLines($("#videos").value),
    videoSearchSuggestions: splitLines($("#video-search-suggestions").value),
    imageLinks: splitLines($("#image-links").value),
    imageSearchSuggestions: splitLines($("#image-search-suggestions").value),
    materials: collectMaterials(),
    resourcePlan: collectResourcePlan(),
    compositionPlan: collectCompositionPlan(),
    accessCode: $("#access-code")?.value || "",
    webPracticeEnabled: $("#practice-enabled").checked,
    webPractices,
    webPractice: {
      enabled: $("#practice-enabled").checked,
      weekNumber: webPractices[0]?.weekNumber || 0,
      date: webPractices[0]?.date || "",
      instructions: webPractices.map((practice) => `${practice.title}: ${practice.context || practice.objective}`).filter(Boolean).join("\n"),
      durationMinutes: webPractices.reduce((sum, practice) => sum + practice.durationMinutes, 0)
    }
  };
}

function updateSummary() {
  const weeks = Math.max(1, Number($("#weeks").value) || 1);
  const hours = Math.max(0, Number($("#hours").value) || 0);
  const calendar = $("#calendar-mode").value;
  $("#summary-title").textContent = $("#course-title").value.trim() || "Seu curso ainda não foi definido";
  $("#summary-weeks").textContent = weeks;
  $("#summary-hours").textContent = `${hours} h`;
  $("#summary-total").textContent = `${hours * weeks} h`;
  $("#summary-calendar").textContent = calendar === "calendar" ? (formatDate($("#start-date").value) || "Data pendente") : "Por numeração";
  const resourceDefaults = collectResourcePlan().default;
  $("#summary-resources").textContent = `${resourceDefaults.videosPerWeek} vídeo(s) · ${resourceDefaults.articlesPerWeek} artigo(s) · ${resourceDefaults.requiredReadingsPerWeek} leitura(s)`;
  const compositionRows = collectCompositionPlan().default.rows;
  const compositionCount = Object.values(compositionRows).reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  $("#summary-composition").textContent = `${compositionCount} bloco(s)/semana`;
  const practiceCount = collectPractices().filter((practice) => practice.title || practice.objective || practice.context).length;
  $("#summary-practice").textContent = $("#practice-enabled").checked ? `Sim · ${practiceCount || 1}` : "Não";
  $("#workload-preview strong").textContent = `${hours * weeks} horas totais`;
}

function updateProgress() {
  const fields = [...document.querySelectorAll("#course-form input, #course-form textarea, #course-form select")].filter((item) => !item.disabled && item.type !== "hidden");
  const filled = fields.filter((item) => item.type === "checkbox" ? item.checked : String(item.value || "").trim()).length;
  $("#briefing-progress").style.width = `${Math.round(filled / Math.max(1, fields.length) * 100)}%`;
}

function toggleCalendar() {
  const calendar = $("#calendar-mode").value === "calendar";
  document.querySelectorAll(".calendar-only").forEach((item) => item.classList.toggle("hidden", !calendar));
  $("#start-date").required = calendar;
  updateSummary();
}

function togglePractice() {
  const enabled = $("#practice-enabled").checked;
  $("#practice-fields").classList.toggle("disabled", !enabled);
  $("#practice-note").classList.toggle("hidden", enabled);
  document.querySelectorAll("#practice-fields input, #practice-fields textarea, #practice-fields select, #practice-fields button").forEach((item) => { item.disabled = !enabled; });
  updateSummary();
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.classList.toggle("is-loading", busy);
  const labelNode = button.querySelector(".button-label") || button.querySelector("span:first-child");
  if (labelNode) labelNode.textContent = busy ? label : button.dataset.label;
}

function showError(message) {
  const alert = $("#result-alert");
  alert.textContent = message;
  alert.className = "result-alert error-alert";
  alert.classList.remove("hidden");
  $("#results-section").classList.remove("hidden");
}

async function readApiResponse(response, fallbackMessage = "O servidor não conseguiu concluir a solicitação.") {
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {
    const detail = raw.replace(/\s+/g, " ").trim().slice(0, 360);
    const timeoutHint = /an error occurred|function timed out|timed out|504/i.test(detail)
      ? " A função demorou além do limite da hospedagem; a geração distribuída por semana será usada nas próximas tentativas."
      : "";
    throw new Error(`${fallbackMessage} (HTTP ${response.status}). ${detail || response.statusText || "Resposta vazia."}${timeoutHint}`);
  }
  if (!response.ok || !data?.ok) throw new Error(data?.error || `${fallbackMessage} (HTTP ${response.status}).`);
  return data;
}

function showAssistantMessage(message, error = false) {
  const note = $("#assistant-note");
  note.textContent = message;
  note.classList.toggle("error-note", error);
  note.classList.remove("hidden");
}

function fillPracticeField(card, selector, value) {
  const field = card?.querySelector(selector);
  const textValue = Array.isArray(value) ? value.filter(Boolean).join("\n") : String(value ?? "").trim();
  if (!field || !textValue || String(field.value || "").trim()) return false;
  field.value = textValue;
  return true;
}

function fillPracticeSuggestion(card, suggestion = {}) {
  const values = [
    [".practice-title", suggestion.title || suggestion.sessionTitle],
    [".practice-week", Number(suggestion.weekNumber || suggestion.week) || ""],
    [".practice-date", suggestion.date || suggestion.sessionDate],
    [".practice-day", suggestion.dayOfWeek || suggestion.day],
    [".practice-start", suggestion.startTime || suggestion.start],
    [".practice-end", suggestion.endTime || suggestion.end],
    [".practice-platform", suggestion.platform || suggestion.environment],
    [".practice-tool", suggestion.tool || suggestion.tools],
    [".practice-objective", suggestion.objective],
    [".practice-context", suggestion.context || suggestion.problem || suggestion.challenge],
    [".practice-preparation", suggestion.preparation || suggestion.prerequisites],
    [".practice-materials", suggestion.materials],
    [".practice-product", suggestion.product || suggestion.deliverable],
    [".practice-fallback", suggestion.fallbackPlan || suggestion.planB]
  ];
  return values.reduce((count, [selector, value]) => count + (fillPracticeField(card, selector, value) ? 1 : 0), 0);
}

function mergeBriefingPractices(suggestions = []) {
  if (!suggestions.length) return 0;
  const current = collectPractices();
  const hasMeaningfulPractice = current.some((practice) => practice.title || practice.objective || practice.context || practice.tool || practice.product);
  if (!hasMeaningfulPractice) {
    $("#practice-list").innerHTML = "";
    practiceSequence = 0;
    suggestions.forEach((practice) => addPractice(practice));
    syncPracticeCount();
    return suggestions.length;
  }
  let filledFields = 0;
  suggestions.forEach((suggestion, index) => {
    let cards = [...document.querySelectorAll("#practice-list .practice-card")];
    let card = cards.find((item) => suggestion.id && item.dataset.id === suggestion.id) || cards[index];
    if (!card) {
      addPractice({ id: suggestion.id });
      cards = [...document.querySelectorAll("#practice-list .practice-card")];
      card = cards.at(-1);
    }
    filledFields += fillPracticeSuggestion(card, suggestion);
  });
  refreshItemButtons();
  syncPracticeCount();
  return filledFields;
}

function briefingMissingFields(input) {
  const missing = [];
  const practiceFields = ["title", "weekNumber/date", "startTime/endTime", "platform", "tool", "objective", "context", "preparation", "materials", "product", "fallbackPlan"];
  const meaningfulPractices = input.webPractices.filter((practice) => practice.title || practice.objective || practice.context || practice.tool || practice.product);
  const meaningfulMaterials = input.materials.filter((material) => material.title || material.objective || material.alignment || material.link);
  if (!input.audience.trim()) missing.push("audience");
  if (!input.objectives.length) missing.push("objectives");
  if (!input.content.trim()) missing.push("content");
  if (input.webPractice.enabled && !meaningfulPractices.length) missing.push("webPractices");
  if (input.webPractice.enabled) {
    input.webPractices.forEach((practice, index) => {
      if (!practice.title) missing.push(`webPractices[${index}].title`);
      if (!practice.weekNumber && !practice.date) missing.push(`webPractices[${index}].weekNumber/date`);
      if (!practice.objective) missing.push(`webPractices[${index}].objective`);
      if (!practice.context) missing.push(`webPractices[${index}].context`);
      if (!practice.tool) missing.push(`webPractices[${index}].tool`);
      if (!practice.platform) missing.push(`webPractices[${index}].platform`);
      if (!practice.preparation) missing.push(`webPractices[${index}].preparation`);
      if (!practice.materials?.length) missing.push(`webPractices[${index}].materials`);
      if (!practice.product) missing.push(`webPractices[${index}].product`);
      if (!practice.fallbackPlan) missing.push(`webPractices[${index}].fallbackPlan`);
    });
    if (!input.webPractices.length) missing.push(...practiceFields.map((field) => `webPractices[0].${field}`));
  }
  if (!input.references.length) missing.push("references");
  if (!meaningfulMaterials.length) missing.push("materials");
  if (!input.videoSearchSuggestions.length) missing.push("videoSearchSuggestions");
  if (!input.imageSearchSuggestions.length) missing.push("imageSearchSuggestions");
  return missing;
}

async function assistBriefing() {
  if (isGitHubPages) { showAssistantMessage("O preenchimento por IA fica disponível na versão Vercel protegida.", true); return; }
  const input = formInput();
  const accessCode = input.accessCode;
  delete input.accessCode;
  if (!input.title.trim()) { showAssistantMessage("Informe primeiro o tema geral ou título do curso.", true); $("#course-title").focus(); return; }
  const missingFields = briefingMissingFields(input);
  if (!missingFields.length) { showAssistantMessage("Não há campos vazios prioritários. Você pode revisar o briefing ou gerar as aulas."); return; }
  const button = $("#assist-button");
  button.dataset.label = "Preencher vazios com IA";
  setBusy(button, true, "Preenchendo…");
  showAssistantMessage("A IA está analisando o tema e preparando sugestões pedagógicas…");
  try {
    const headers = { "Content-Type": "application/json" };
    if (accessCode) headers["x-aula-access-code"] = accessCode;
    const response = await fetch("/api/assist-briefing", { method: "POST", headers, body: JSON.stringify({ input, missingFields }) });
    const data = await readApiResponse(response, "Não foi possível preencher o briefing.");
    const briefing = data.briefing || {};
    const filled = [];
    if (!$("#audience").value.trim() && briefing.audience) { $("#audience").value = briefing.audience; filled.push("público"); }
    if (!$("#objectives").value.trim() && Array.isArray(briefing.objectives) && briefing.objectives.length) { $("#objectives").value = briefing.objectives.join("\n"); filled.push("objetivos"); }
    if (!$("#content").value.trim() && briefing.content) { $("#content").value = briefing.content; filled.push("conteúdos"); }
    if ($("#practice-enabled").checked && Array.isArray(briefing.webPractices) && briefing.webPractices.length) {
      const practiceFieldsFilled = mergeBriefingPractices(briefing.webPractices);
      if (practiceFieldsFilled) filled.push(`${briefing.webPractices.length} webprática(s) analisadas (${practiceFieldsFilled} campo(s) completado(s))`);
    }
    if (Array.isArray(briefing.materials) && briefing.materials.length && !collectMaterials().some((material) => material.title || material.objective || material.alignment || material.link)) {
      $("#materials-list").innerHTML = "";
      materialSequence = 0;
      briefing.materials.forEach((material) => addMaterial(material));
      filled.push(`${briefing.materials.length} materiais alinhados`);
    }
    if (!$("#references").value.trim() && Array.isArray(briefing.references) && briefing.references.length) { $("#references").value = briefing.references.map((item) => `[Sugestão para conferir] ${item}`).join("\n"); filled.push("referências sugeridas"); }
    if (!$("#video-search-suggestions").value.trim() && Array.isArray(briefing.videoSearchSuggestions) && briefing.videoSearchSuggestions.length) { $("#video-search-suggestions").value = briefing.videoSearchSuggestions.join("\n"); filled.push("buscas de vídeos"); }
    if (!$("#image-search-suggestions").value.trim() && Array.isArray(briefing.imageSearchSuggestions) && briefing.imageSearchSuggestions.length) { $("#image-search-suggestions").value = briefing.imageSearchSuggestions.join("\n"); filled.push("buscas de imagens"); }
    updateSummary();
    updateProgress();
    scheduleSave();
    const note = briefing.notes?.length ? ` Observações: ${briefing.notes.join(" ")}` : "";
    showAssistantMessage(filled.length ? `Campos preenchidos: ${filled.join(", ")}. Revise as sugestões antes de gerar as aulas.${note}` : "A IA não encontrou campos vazios que pudesse completar com segurança.");
  } catch (error) { showAssistantMessage(error.message, true); }
  finally { setBusy(button, false, ""); }
}

function resourceYoutubeId(value) {
  return String(value || "").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&#/]+)/i)?.[1] || "";
}

function resourcePreview(resource) {
  const title = resource.title || resource.kind || "Recurso";
  const kind = resource.kind || resource.type || "";
  const videoId = kind === "video" ? resourceYoutubeId(resource.href) : "";
  const isImage = kind === "image" && Boolean(resource.href);
  const media = videoId
    ? `<div class="reader-resource-media"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(videoId)}" title="${escapeHtml(title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`
    : isImage
      ? `<div class="reader-resource-media"><img src="${escapeHtml(resource.href)}" alt="${escapeHtml(resource.altText || resource.caption || title)}" loading="lazy" /></div>`
      : "";
  const sourceLink = resource.href ? `<a href="${escapeHtml(resource.href)}" target="_blank" rel="noreferrer">Abrir fonte</a>` : `<span>Busca sugerida: ${escapeHtml(resource.searchQuery || "a confirmar")}</span>`;
  const approval = resource.humanApproval === "approved" || resource.verificationStatus === "verified" ? "Conferido" : resource.href ? "Link localizado · revisão humana pendente" : "Ainda é uma sugestão";
  const detail = [resource.pedagogicalUse || resource.objective, resource.source, resource.license, approval].filter(Boolean).join(" · ");
  const bridge = resource.bridgeParagraph || resource.connectionParagraph || resource.pedagogicalUse || `Use este recurso neste ponto para relacionar ${title} ao conceito explicado na seção e registrar o que ele confirma, exemplifica ou problematiza.`;
  return `<div class="reader-resource reader-resource-inline"><div class="reader-resource-context"><div class="reader-resource-heading"><strong>${escapeHtml(title)}</strong>${sourceLink}</div><p class="reader-resource-bridge">${escapeHtml(bridge)}</p>${media}<small>${escapeHtml(detail || "Recurso contextualizado para esta seção.")}</small></div></div>`;
}

function compositionPreview(entry = {}) {
  const type = String(entry.type || entry.kind || "bloco").toLowerCase();
  const labels = { destaque: "Destaque", atencao: "Atenção", reflexao: "Reflexão", citacao: "Citação", imagem: "Imagem", accordion: "Acordeão", flashcards: "Flashcards", quiz: "Quiz formativo", cases: "Casos", feature: "Pontos-chave", tabela: "Tabela comparativa", slider: "Passo a passo", linhadotempo: "Linha do tempo", columns: "Colunas", externalembed: "Conteúdo externo" };
  const title = entry.title || entry.label || labels[type] || "Bloco editorial";
  const body = entry.body || entry.question || entry.intro || entry.description || entry.quote || "";
  const collection = entry.items || entry.cards || entry.steps || entry.questions || entry.features || entry.eras || entry.columns || entry.rows;
  const rows = Array.isArray(collection) ? collection.slice(0, 6).map((item) => `<li>${escapeHtml(item.title || item.front || item.q || item.label || (Array.isArray(item) ? item.join(" · ") : "Item contextualizado"))}</li>`).join("") : "";
  const media = entry.src || entry.href ? `<img src="${escapeHtml(entry.src || entry.href)}" alt="${escapeHtml(entry.caption || title)}" loading="lazy" />` : "";
  return `<div class="reader-composition reader-composition-${escapeHtml(type)}"><div class="reader-composition-kicker">${escapeHtml(labels[type] || "Bloco Aula Studio")}</div><strong>${escapeHtml(title)}</strong>${paragraphsMarkup(body)}${media}${rows ? `<ul>${rows}</ul>` : ""}</div>`;
}

function renderLessonPreview(lesson, index) {
  const plan = lesson?.lessonPlan || {};
  const quality = lesson?.contentQuality || {};
  const sections = Array.isArray(plan.contentSections) ? plan.contentSections : [];
  const objectives = Array.isArray(plan.learningObjectives) ? plan.learningObjectives : [];
  const allResources = plan.resources || {};
  const guide = state.teacherGuides[index] || {};
  const academicReview = guide.academicReview || {};
  const claimEvidence = Array.isArray(guide.claimEvidence || plan.claimEvidence) ? (guide.claimEvidence || plan.claimEvidence) : [];
  const manuallyApproved = Boolean(state.weekApprovals?.[index]);
  const validationReport = state.validation?.weeks?.[index] || {};
  const automaticStatus = validationReport.status || quality.status || "review";
  const validationIssueList = validationReasons(validationReport, quality);
  const academicLabel = manuallyApproved ? "revisão acadêmica conferida manualmente" : ({ approved: "revisão acadêmica aprovada", "approved-with-review": "revisão acadêmica com pendências", "needs-revision": "revisão acadêmica exige reescrita" }[academicReview.status] || "revisão acadêmica pendente");
  const displayQualityStatus = manuallyApproved ? "complete" : quality.status;
  const statusLabel = manuallyApproved ? "conferida e liberada por você" : ({ complete: "conteúdo completo", "needs-review": "revisão recomendada", insufficient: "conteúdo insuficiente" }[quality.status] || "qualidade não medida");
  const strip = document.querySelector("#lesson-quality-strip");
  strip.innerHTML = `<span class="quality-badge ${escapeHtml(displayQualityStatus || "needs-review")}">${escapeHtml(statusLabel)}</span><span>${Number(quality.wordCount || 0).toLocaleString("pt-BR")} palavras</span><span>${sections.length} seções</span><span>${objectives.length} objetivos</span><span>nota estrutural ${Number(quality.score || 0)}/100</span><span class="academic-review-badge">${escapeHtml(academicLabel)}</span><span>${claimEvidence.length} evidências mapeadas</span>`;
  const issueText = Array.isArray(quality.issues) ? quality.issues.join(" · ") : "";
  const validationIssue = automaticStatus === "blocked" && validationIssueList.length ? `<div class="reader-warning"><strong>Por que esta semana está bloqueada automaticamente:</strong><ul>${validationIssueList.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><small>Depois de conferir ou corrigir esses pontos, use “Liberar após conferência” no cartão da semana. A liberação manual registra sua decisão e mantém o diagnóstico visível para auditoria.</small></div>` : "";
  const issue = issueText ? manuallyApproved
    ? `<div class="reader-callout"><strong>Semana conferida e liberada por você.</strong> As observações automáticas abaixo permanecem informativas: ${escapeHtml(issueText)}</div>`
    : quality.status === "needs-review"
      ? `<div class="reader-warning"><strong>Revisão recomendada:</strong> ${escapeHtml(issueText)}</div>`
      : `<div class="reader-warning"><strong>Atenção antes de liberar:</strong> ${escapeHtml(issueText)}</div>` : "";
  const academicIssue = Array.isArray(academicReview.issues) && academicReview.issues.length ? `<div class="${manuallyApproved ? "reader-callout" : "reader-warning"}"><strong>${manuallyApproved ? "Observações acadêmicas automáticas (já conferidas por você):" : "Revisão acadêmica:"}</strong><ul>${academicReview.issues.slice(0, 8).map((item) => `<li><strong>${escapeHtml(item.severity || "revisão")}</strong> ${escapeHtml(item.description || "Pendência")}${item.suggestedRepair ? ` — ${escapeHtml(item.suggestedRepair)}` : ""}</li>`).join("")}</ul></div>` : "";
  const sectionsMarkup = sections.map((section) => {
    const subs = (section.subsections || []).map((sub) => `<h4>${escapeHtml(`${sub.number || ""} ${sub.title || ""}`.trim())}</h4>${paragraphsMarkup(sub.body)}`).join("");
    const caseMarkup = section.caseStudy ? `<div class="reader-callout"><strong>${escapeHtml(section.caseStudy.title || "Estudo de caso")}</strong>${paragraphsMarkup(section.caseStudy.context || section.caseStudy.data || "")}${(section.caseStudy.questions || []).length ? `<ul>${section.caseStudy.questions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>` : ""}</div>` : "";
    const reflection = section.reflection?.question ? `<div class="reader-callout"><strong>Para refletir</strong><p>${escapeHtml(section.reflection.question)}</p>${paragraphsMarkup(section.reflection.body || "")}</div>` : "";
    const composition = (plan.composition?.entries || []).filter((entry) => Number(entry.sectionNumber) === Number(section.number) || (!entry.sectionNumber && section.number === "1")).map(compositionPreview).join("");
    const resources = [...(section.resources || [])].map(resourcePreview).join("");
    return `<section><h3>${escapeHtml(`${section.number || ""} ${section.title || "Seção"}`.trim())}</h3>${paragraphsMarkup(section.body)}${composition}${resources}${subs}${caseMarkup}${reflection}</section>`;
  }).join("");
  const globalResources = Object.values(allResources).flat().filter((resource) => resource && !sections.some((section) => (section.resources || []).some((item) => item.id && item.id === resource.id))).slice(0, 12).map(resourcePreview).join("");
  const glossary = (plan.glossary || []).length ? `<section><h3>Glossário</h3><ul>${plan.glossary.map((item) => `<li><strong>${escapeHtml(item.term || "Termo")}</strong>: ${escapeHtml(item.definition || "")}</li>`).join("")}</ul></section>` : "";
  const assessment = (plan.assessment?.questions || []).length ? `<section><h3>${escapeHtml(plan.assessment.title || "Atividade avaliativa")}</h3><p>${escapeHtml(plan.assessment.format || "Questões alinhadas aos objetivos")}</p><ol>${plan.assessment.questions.map((q) => `<li>${escapeHtml(q.q || q.question || "")}${q.explanation ? `<small>${escapeHtml(q.explanation)}</small>` : ""}</li>`).join("")}</ol></section>` : "";
  const arc = plan.didacticArc || guide.didacticArc || {};
  const phaseSummary = arc.phasePlan ? Object.entries(arc.phasePlan).filter(([key, value]) => key !== "labels" && key !== "omitted" && value === true).map(([key]) => arc.phasePlan.labels?.[key] || key).join(" · ") : (arc.sequence || []).join(" · ");
  const diagnostic = plan.diagnostic?.prompt ? `<section class="reader-callout"><h3>Antes de começar</h3>${paragraphsMarkup(plan.diagnostic.prompt)}${plan.diagnostic.expectedEvidence ? `<small>O que será observado: ${escapeHtml(plan.diagnostic.expectedEvidence)}</small>` : ""}</section>` : "";
  const formative = (plan.formativeChecks || []).length ? `<section><h3>Paradas de aprendizagem</h3><ul>${plan.formativeChecks.map((check) => `<li><strong>${escapeHtml(check.moment || "Checagem")}</strong>: ${escapeHtml(check.prompt || "")}${check.feedback ? `<small>Feedback: ${escapeHtml(check.feedback)}</small>` : ""}</li>`).join("")}</ul></section>` : "";
  const activities = (plan.activities || []).length ? `<section><h3>Atividades e evidências</h3><ul>${plan.activities.map((activity) => `<li><strong>${escapeHtml(activity.title || "Atividade")}</strong>: ${escapeHtml(activity.instructions || "")}${activity.evidence ? `<small>Evidência: ${escapeHtml(activity.evidence)}</small>` : ""}</li>`).join("")}</ul></section>` : "";
  const differentiation = plan.differentiation && (plan.differentiation.support?.length || plan.differentiation.standard?.length || plan.differentiation.extension?.length) ? `<section><h3>Trilhas de estudo</h3><h4>Essencial</h4><ul>${(plan.differentiation.support || []).map((item) => `<li>${escapeHtml(item.title || item.instructions || item)}</li>`).join("")}</ul><h4>Padrão</h4><ul>${(plan.differentiation.standard || []).map((item) => `<li>${escapeHtml(item.title || item.instructions || item)}</li>`).join("")}</ul><h4>Aprofundamento</h4><ul>${(plan.differentiation.extension || []).map((item) => `<li>${escapeHtml(item.title || item.instructions || item)}</li>`).join("")}</ul></section>` : "";
  const selfAssessment = (plan.selfAssessment?.prompts || []).length ? `<section><h3>Autoavaliação</h3><ul>${plan.selfAssessment.prompts.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : "";
  const workload = plan.timePlan?.workloadAdjustment?.suggestions?.length ? `<section class="reader-warning"><h3>Ajustes de carga sugeridos</h3><ul>${plan.timePlan.workloadAdjustment.suggestions.map((item) => `<li>${escapeHtml(item.rationale || item.action || "Ajuste")}${item.title ? ` — ${escapeHtml(item.title)}` : ""}</li>`).join("")}</ul></section>` : "";
  const timeItems = (plan.timePlan?.items || []).filter((item) => Number(item.minutes || item.learnerMinutes) > 0).map((item) => `<li><strong>${escapeHtml(workloadItemLabel(item))}</strong>: ${escapeHtml(item.title || "")} — ${formatLoad(item.minutes || item.learnerMinutes)}${item.required === false ? " · complementar" : " · obrigatório"}</li>`).join("");
  const timeBreakdown = Object.entries(plan.timePlan?.breakdown || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => `<li><strong>${escapeHtml(breakdownLabels[key] || key)}</strong>: ${formatLoad(value)}</li>`).join("");
  const timeMarkup = timeItems || timeBreakdown ? `<section class="time-breakdown reader-time-breakdown"><h3>Tempo desta semana</h3><p>O cálculo está separado por texto-base, leituras, mídias e atividades. “Obrigatório” indica o que entra na trilha essencial; “complementar” não é obrigatório.</p><ul>${timeItems || timeBreakdown}</ul></section>` : "";
  const alignment = (plan.alignmentMatrix || []).length ? `<section><h3>Alinhamento pedagógico</h3><ul>${plan.alignmentMatrix.map((row) => `<li><strong>${escapeHtml(row.objective || "Objetivo")}</strong>: ${escapeHtml(row.evidence || "evidência a definir")} · avaliação: ${escapeHtml((row.assessmentQuestions || []).join(", ") || "a definir")}</li>`).join("")}</ul></section>` : "";
  $("#lesson-modal-eyebrow").textContent = `PRÉVIA · SEMANA ${String(index + 1).padStart(2, "0")}`;
  $("#lesson-modal-title").textContent = plan.theme || lesson?.meta?.title || `Semana ${index + 1}`;
  $("#lesson-reader").innerHTML = `${validationIssue}${issue}${academicIssue}<div class="reader-callout"><strong>Arco desta semana:</strong> ${escapeHtml(arc.label || "Arco variável")} · ${escapeHtml(phaseSummary || "progressão definida pelo conteúdo")}</div><div class="reader-welcome">${paragraphsMarkup(plan.welcome || "Abertura da semana ainda não foi preenchida.")}</div><section class="reader-objectives"><h3>Objetivos de aprendizagem</h3><ul>${objectives.map((objective) => `<li>${escapeHtml(objective)}</li>`).join("")}</ul></section>${diagnostic}${sectionsMarkup}${activities}${formative}${globalResources ? `<section><h3>Recursos gerais</h3>${globalResources}</section>` : ""}${plan.synthesis ? `<section><h3>Síntese</h3>${paragraphsMarkup(plan.synthesis)}</section>` : ""}${plan.nextWeekConnection ? `<section><h3>Conexão com a próxima semana</h3>${paragraphsMarkup(plan.nextWeekConnection)}</section>` : ""}${differentiation}${selfAssessment}${glossary}${assessment}${alignment}${timeMarkup}${workload}`;
}

function openLessonPreview(index) {
  const lesson = state.weeks[index];
  if (!lesson) return;
  state.previewIndex = index;
  renderLessonPreview(lesson, index);
  $("#week-revision").value = "";
  $("#lesson-modal").classList.remove("hidden");
  $("#lesson-modal").setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeLessonPreview() {
  $("#lesson-modal").classList.add("hidden");
  $("#lesson-modal").setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  state.previewIndex = null;
}

async function regenerateSelectedWeek() {
  const index = state.previewIndex;
  const instruction = $("#week-revision").value.trim();
  if (index == null || !instruction) { $("#regenerate-note").textContent = "Escreva primeiro o que deseja alterar nesta semana."; return; }
  if (isGitHubPages) { $("#regenerate-note").textContent = "A regeneração por IA fica disponível na URL Vercel com backend protegido."; return; }
  const button = $("#regenerate-week-button");
  button.dataset.label = "Refazer esta semana com IA";
  setBusy(button, true, "Refazendo…");
  $("#regenerate-note").textContent = "A IA está reescrevendo somente esta semana e preservando o restante do curso…";
  try {
    const input = { ...state.input };
    const accessCode = $("#access-code")?.value || "";
    const headers = { "Content-Type": "application/json" };
    if (accessCode) headers["x-aula-access-code"] = accessCode;
    const response = await fetch("/api/regenerate-week", { method: "POST", headers, body: JSON.stringify({ input, weekIndex: index, instruction, weeks: state.weeks, teacherGuides: state.teacherGuides }) });
    const data = await readApiResponse(response, "Não foi possível refazer a semana.");
    renderWeeks(data);
    $("#regenerate-note").textContent = "Semana atualizada. Confira a nova versão abaixo antes de exportar.";
    openLessonPreview(index);
  } catch (error) { $("#regenerate-note").textContent = error.message; }
  finally { setBusy(button, false, ""); }
}

function weekCalendar(input, index) {
  const weekNumber = index + 1;
  if (input.calendarMode !== "calendar" || !input.startDate) return { weekNumber, label: `Semana ${weekNumber}`, startDate: null, endDate: null };
  const startDate = addDays(input.startDate, index * 7);
  const endDate = addDays(startDate, 6);
  return { weekNumber, label: `Semana ${weekNumber} · ${formatDate(startDate)}`, startDate, endDate };
}

function fallbackLesson(input, index) {
  const week = index + 1;
  const calendar = weekCalendar(input, index);
  const objective = input.objectives[index % Math.max(1, input.objectives.length)] || `Compreender os fundamentos de ${input.title}.`;
  const content = input.content || `Estude os conceitos centrais de ${input.title} e relacione-os a exemplos práticos.`;
  const id = (prefix, n) => `${prefix}${week}-${String(n).padStart(3, "0")}`;
  const blocks = [
    { id: id("b-hero-", 1), type: "hero", bg: "neutral-default", pad: "normal", props: { eyebrow: calendar.label.toUpperCase(), title: `${input.title}: ${calendar.label}`, lead: objective, author: input.author || "Autor", authorImage: "", readTime: `${input.hoursPerWeek} h de estudo`, date: new Date().getFullYear().toString() } },
    { id: id("b-topic-", 2), type: "topic", bg: "neutral-default", pad: "normal", props: { children: [
      { id: id("c-title-", 3), type: "titulo", props: { text: "Conteúdo da semana", level: "h2" } },
      { id: id("c-prose-", 4), type: "prose", props: { body: `<p>${escapeHtml(content)}</p>`, dropcap: false, dropcapTone: "terracotta" } }
    ] } }
  ];
  if (input.videoLinks.length) {
    const match = input.videoLinks[0].match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&#/]+)/i);
    if (match) blocks.push({ id: id("b-video-", 6), type: "video", bg: "neutral-default", pad: "normal", props: { id: match[1], title: "Vídeo recomendado", caption: "Material complementar.", credit: "", start: "" } });
  }
  const materialItems = [
    ...(input.materials || []).filter((material) => material.title || material.objective || material.alignment || material.link || material.use).map((material) => ({ type: material.type, title: material.title || "Material de apoio", source: material.alignment || material.objective || material.use, href: material.link })),
    ...input.references.map((href, i) => ({ type: "artigo", title: `Referência ${i + 1}`, source: "Material indicado", href }))
  ].filter((item) => item.title || item.href);
  if (materialItems.length) blocks.push({ id: id("b-materials-", 20), type: "materiais", bg: "neutral-default", pad: "normal", props: { title: "Materiais de apoio", items: materialItems } });
  const theme = `${input.title} — Semana ${week}`;
  const objectives = [...input.objectives, `Relacionar ${input.title} a uma situação concreta.`, `Analisar limites e possibilidades do tema.`, `Aplicar o conteúdo em uma produção observável.`, "Sintetizar o que foi aprendido nesta etapa."].filter((item, itemIndex, list) => item && list.indexOf(item) === itemIndex).slice(0, 5);
  const sections = [
    { number: "1", title: "Contexto e pergunta de partida", body: content, resources: [] },
    { number: "2", title: "Conceitos centrais", body: `Nesta seção, organize os conceitos fundamentais de ${input.title}, diferenciando termos próximos e explicando por que eles importam para a realidade do estudante.`, resources: [] },
    { number: "3", title: "Exemplo aplicado", body: "Observe uma situação concreta, identifique o problema, descreva as evidências disponíveis e formule uma primeira interpretação antes de consultar a solução ou o comentário do professor.", resources: [] },
    { number: "4", title: "Análise crítica e atividade guiada", body: "Compare possibilidades, reconheça limites dos dados e registre quais decisões seriam justificáveis. Esta etapa prepara a produção do estudante.", resources: [] },
    { number: "5", title: "Síntese e transferência", body: "Retome os conceitos, conecte-os ao seu contexto e registre uma aplicação possível para continuar o percurso nas próximas semanas.", resources: [] }
  ];
  const lessonPlan = { weekNumber: week, theme, welcome: `Nesta semana, você vai estudar ${input.title} a partir de uma sequência de contexto, conceitos, exemplo, aplicação e reflexão. Use esta prévia para conferir a organização antes de exportar.`, learningObjectives: objectives, didacticArc: { id: "descoberta-conceitual", label: "Descoberta conceitual", sequence: ["opening", "conceptExplanation", "workedExample", "guidedPractice", "reflection", "synthesis"], phasePlan: { opening: true, diagnostic: false, conceptExplanation: true, workedExample: true, guidedPractice: true, independentPractice: false, reflection: true, assessment: true, synthesis: true, labels: {} } }, contentSections: sections, resources: { videos: input.videoLinks.map((href, i) => ({ id: `video-${i + 1}`, title: `Vídeo fornecido ${i + 1}`, href, kind: "video", objective: "Aprofundar o conceito apresentado." })), readingsRequired: [], readingsExtra: input.references.map((href, i) => ({ id: `reading-${i + 1}`, title: `Leitura indicada ${i + 1}`, href, kind: "artigo", objective: "Relacionar a leitura ao conteúdo." })), images: [], podcasts: [], datasets: [] }, webPractices: [], activities: [{ id: "activity-1", title: "Registro de aplicação", type: "produção", instructions: "Descreva como o tema aparece no seu contexto.", evidence: "Texto curto de análise", durationMinutes: 20, required: true }], diagnostic: { prompt: "O que você já sabe sobre este tema?", expectedEvidence: "Hipótese inicial do estudante." }, formativeChecks: [{ id: "check-1", moment: "Após os conceitos", prompt: "Explique um conceito com suas próprias palavras.", feedback: "Compare sua resposta com a síntese da seção." }], differentiation: { support: [{ title: "Trilha essencial", instructions: "Retome o glossário e o exemplo resolvido." }], standard: [{ title: "Trilha padrão", instructions: "Leia todas as seções e entregue a atividade." }], extension: [{ title: "Aprofundamento", instructions: "Compare o exemplo com outro contexto." }] }, selfAssessment: { prompts: ["Consigo explicar o conceito central?", "Consigo aplicá-lo a uma situação real?"] }, synthesis: "O exemplo local e os conceitos centrais devem ser lidos juntos: compreender uma definição não basta; é preciso usá-la para interpretar uma situação e justificar uma decisão.", nextWeekConnection: "Na próxima semana, o conceito será retomado em uma situação mais complexa.", glossary: [], references: input.references, assessment: { title: "Avaliação formativa", format: "Questões de revisão", questions: [] }, alignmentMatrix: objectives.map((objective, i) => ({ objective, contentSections: [String(Math.min(i + 1, 5))], activities: ["activity-1"], evidence: "Registro de aplicação", assessmentQuestions: [] })), timePlan: { targetMinutes: input.hoursPerWeek * 60, calculatedMinutes: 0, workloadAdjustment: { suggestions: [] } } };
  return { meta: { title: theme, courseTitle: input.title, weekNumber: week, weekLabel: calendar.label, calendarStartDate: calendar.startDate, calendarEndDate: calendar.endDate, studyHours: input.hoursPerWeek, author: input.author, role: "", institution: input.institution, year: new Date().getFullYear().toString(), aiTool: "", aiUse: "", license: "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pt-br" }, lessonPlan, contentQuality: { status: "needs-review", score: 68, wordCount: sections.reduce((total, section) => total + section.body.split(/\s+/).length, 0), issues: ["exemplo local: substitua pela geração com IA antes da exportação"], sectionCount: sections.length, objectiveCount: objectives.length }, blocks };
}

function staticTeacherGuides(input, weeks) {
  return weeks.map((_, index) => ({ weekNumber: index + 1, title: `${input.title} - Semana ${index + 1}`, purpose: "Orientar a aprendizagem da semana e revisar a coerência entre objetivos, conteúdo, atividades e avaliação.", didacticArc: { id: "descoberta-conceitual", label: "Descoberta conceitual", rationale: "Arco de exemplo para o modo público.", sequence: ["contexto", "conceito", "exemplo", "reflexao", "sintese"] }, objectives: input.objectives, alignmentMatrix: [], mediationQuestions: [], commonMisconceptions: [], interventions: [], differentiation: { support: [], standard: [], extension: [] }, accessibility: [], assessmentNotes: [], qualityReview: { status: "review", checks: [{ label: "Exemplo local: revise a semana antes de usar.", pass: false }] }, webPractices: [], webPracticeProjects: [], workloadAdvice: [] }));
}

function staticDemo(input) {
  const weeks = Array.from({ length: input.weeks }, (_, index) => fallbackLesson(input, index));
  return { ok: true, provider: "static-demo", model: null, input, teacherGuides: staticTeacherGuides(input, weeks), workload: { totalHours: input.hoursPerWeek * input.weeks, totalMinutes: Math.round(input.hoursPerWeek * input.weeks * 60), formulaStatus: "internal-profile", weeks: weeks.map((_, index) => ({ weekNumber: index + 1, totalHours: input.hoursPerWeek, totalMinutes: Math.round(input.hoursPerWeek * 60), formulaStatus: "internal-profile" })) }, weeks, filePrefix: slugify(input.title) };
}

function renderWorkload(workload) {
  if (!workload) return;
  const suffix = workload.formulaStatus === "configured" ? "configuração personalizada" : "perfil interno de dimensionamento";
  const calculated = workload.calculatedMinutes ?? workload.derivedMinutes ?? workload.totalMinutes ?? 0;
  const target = workload.totalTargetLearnerMinutes ?? workload.totalMinutes ?? 0;
  $("#workload-preview small").textContent = `${suffix} · ${calculated.toFixed ? calculated.toFixed(1) : calculated} min calculados de ${target} min de meta`;
}

function formatMinutes(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return "—";
  return `${(minutes / 60).toFixed(1)} h`;
}

function formatLoad(value) {
  const minutes = Math.round(Number(value) || 0);
  return minutes ? `${minutes} min (${formatMinutes(minutes)})` : "0 min";
}

function validationReasons(report = {}, quality = {}) {
  const reasons = [
    ...(report.blockers || []).map((item) => item.label || item.description || item.message || item.id),
    ...(report.academicBlockers || []).map((item) => [item.description || item.message || item.label, item.suggestedRepair].filter(Boolean).join(" — ")),
    ...(quality.status === "insufficient" ? (quality.issues || []) : [])
  ].filter(Boolean);
  return [...new Set(reasons)].slice(0, 3);
}

function workloadItemLabel(item = {}) {
  if (item.category === "base-text" || item.category === "content") return "Leitura do texto-base da semana";
  if (item.category === "reading") return item.required ? "Artigo/leitura obrigatória" : "Artigo/leitura complementar (não obrigatória)";
  if (item.category === "video") return item.required ? "Vídeo obrigatório" : "Vídeo complementar";
  if (item.category === "assessment") return "Quiz/avaliação";
  if (item.category === "forum") return "Fórum/discussão";
  if (item.category === "practice") return "Webprática síncrona";
  if (item.category === "review") return "Síntese e revisão";
  if (item.category === "image") return "Imagem/diagrama";
  if (item.category === "audio") return "Áudio/podcast";
  if (item.category === "interactive") return "Interativo Aula Studio";
  if (item.category === "project") return "Projeto/produção";
  return "Outra atividade";
}

const breakdownLabels = {
  baseTextMinutes: "Texto-base",
  requiredReadingMinutes: "Leituras obrigatórias",
  extraReadingMinutes: "Leituras complementares",
  requiredVideoMinutes: "Vídeos obrigatórios",
  extraVideoMinutes: "Vídeos complementares",
  imageMinutes: "Imagens/diagramas",
  audioMinutes: "Áudios/podcasts",
  interactiveMinutes: "Interativos Aula Studio",
  quizMinutes: "Quiz/avaliação",
  forumMinutes: "Fórum/discussão",
  practiceMinutes: "Webprática",
  reviewMinutes: "Síntese/revisão",
  projectMinutes: "Projeto/produção",
  otherMinutes: "Outras atividades"
};

function reviewItemKey(item = {}) { return `${item.weekNumber || 0}:${item.id || slugify(item.title || item.label || "item")}`; }

function reviewCheckChecked(item = {}, reviewMarks = state.reviewMarks || createReviewMarks()) {
  const key = reviewItemKey(item);
  return reviewMarks.checks?.[key] === undefined ? Boolean(item.pass) : Boolean(reviewMarks.checks[key]);
}

function toggleReviewMark(kind, key, checked) {
  const pageScroll = window.scrollY;
  const list = document.querySelector(`input[data-review-kind="${CSS.escape(kind)}"]`)?.closest(".review-panel")?.querySelector(".review-list");
  const listScroll = list?.scrollTop || 0;
  state.reviewMarks = state.reviewMarks || createReviewMarks();
  state.reviewMarks[kind] = state.reviewMarks[kind] || {};
  state.reviewMarks[kind][key] = checked;
  saveDraft("conferência manual");
  renderGeneralPlan(state.generalPlan);
  requestAnimationFrame(() => {
    window.scrollTo(0, pageScroll);
    const nextList = document.querySelector(`input[data-review-kind="${CSS.escape(kind)}"]`)?.closest(".review-panel")?.querySelector(".review-list");
    if (nextList) nextList.scrollTop = listScroll;
    const nextInput = document.querySelector(`input[data-review-kind="${CSS.escape(kind)}"][data-review-key="${CSS.escape(key)}"]`);
    nextInput?.focus({ preventScroll: true });
  });
}

function organizeResultSectors(container) {
  if (!container) return;
  const children = [...container.children];
  const breakdown = container.querySelector(":scope > .time-breakdown");
  const splitAt = breakdown ? children.indexOf(breakdown) : -1;
  const loadNodes = splitAt >= 0 ? children.slice(0, splitAt + 1) : [];
  const reviewNodes = splitAt >= 0 ? children.slice(splitAt + 1) : children;

  const loadSector = document.createElement("details");
  loadSector.className = "results-sector";
  loadSector.id = "results-load";
  loadSector.open = true;
  loadSector.innerHTML = '<summary class="results-sector-summary"><strong>Carga por atividade</strong><small>Tempo separado por texto-base, artigos, textos informais, vídeos, interativos e atividades.</small></summary>';
  const loadBody = document.createElement("div");
  loadBody.className = "results-sector-body";
  loadBody.append(...loadNodes);
  loadSector.appendChild(loadBody);

  const reviewSector = document.createElement("details");
  reviewSector.className = "results-sector";
  reviewSector.id = "results-review";
  reviewSector.open = true;
  reviewSector.innerHTML = '<summary class="results-sector-summary"><strong>Checklists e progressão curricular</strong><small>Conferências automáticas, pendências, progressão e sessões práticas independentes.</small></summary>';
  const reviewBody = document.createElement("div");
  reviewBody.className = "results-sector-body";
  reviewBody.append(...reviewNodes);
  reviewSector.appendChild(reviewBody);

  container.replaceChildren(loadSector, reviewSector);
}

function renderGeneralPlan(plan) {
  const container = $("#general-plan");
  if (!container || !plan?.totals) { container?.classList.add("hidden"); return; }
  const totals = plan.totals;
  const labels = { contentMinutes: "Conteúdo", resourcesMinutes: "Materiais e mídia", practiceMinutes: "Webpráticas", assessmentMinutes: "Avaliação", reviewMinutes: "Revisão", communicationMinutes: "Comunicação", projectMinutes: "Projetos", otherMinutes: "Outros" };
  const categoryMarkup = Object.entries(plan.categoryTotals || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => `<span>${escapeHtml(labels[key] || key)}: ${formatMinutes(value)}</span>`).join("");
  const unresolved = Array.isArray(plan.unresolvedResources) ? plan.unresolvedResources : [];
  const arcs = (plan.didacticArcs || []).filter((arc) => arc.label).map((arc) => `<span class="arc-chip">${escapeHtml(arc.label)}</span>`).join("");
  const checklist = Array.isArray(plan.pedagogicalChecklist) ? plan.pedagogicalChecklist : [];
  const passed = checklist.filter((item) => item.pass).length;
  const reviewMarks = state.reviewMarks || createReviewMarks();
  const checkedChecks = checklist.filter((item) => reviewCheckChecked(item, reviewMarks)).length;
  const checklistRows = checklist.map((item) => {
    const key = reviewItemKey(item);
    const override = reviewMarks.checks?.[key];
    const checked = reviewCheckChecked(item, reviewMarks);
    const stateLabel = override === undefined ? (item.pass ? "Atendido automaticamente pela IA" : "Pendente na análise automática") : (override ? "Marcado por você" : "Desmarcado por você para refazer");
    return `<label class="review-row ${checked ? "is-marked" : ""}"><input type="checkbox" data-review-kind="checks" data-review-key="${escapeHtml(key)}" ${checked ? "checked" : ""} /><span><strong>Semana ${escapeHtml(item.weekNumber)} · ${escapeHtml(item.label)}</strong><small>${stateLabel}</small></span></label>`;
  }).join("");
  const checklistMarkup = checklist.length ? `<details class="review-panel" open><summary><strong>Checklist pedagógico: ${passed}/${checklist.length} itens atendidos automaticamente</strong><small>${checkedChecks}/${checklist.length} atualmente marcados. Os itens aprovados pela IA começam marcados; desmarque qualquer item que queira refazer ou revisar novamente.</small></summary><div class="review-list">${checklistRows}</div></details>` : "";
  const progressionMarkup = Array.isArray(plan.progression) && plan.progression.length ? `<div class="general-warning"><strong>Progressão curricular</strong><ul>${plan.progression.map((item) => `<li>Semana ${item.weekNumber}: ${escapeHtml(item.theme || "")} ${item.projectMilestone ? `— ${escapeHtml(item.projectMilestone)}` : ""}</li>`).join("")}</ul></div>` : "";
  const practices = Array.isArray(plan.webPracticeSchedule) ? plan.webPracticeSchedule : [];
  const practiceMarkup = practices.length ? `<section class="webpractice-schedule"><div class="schedule-heading"><div><p class="eyebrow">SESSÕES PRÁTICAS INDEPENDENTES</p><h3>Webpráticas programadas</h3><p>Estas sessões não entram no texto-base nem no JSON do aluno. Cada uma é exportada como roteiro DOCX para o professor.</p></div></div><div class="schedule-list">${practices.map((practice, index) => `<article class="schedule-item"><div><strong>${escapeHtml(practice.title || `Webprática ${index + 1}`)}</strong><span>${escapeHtml([practice.weekNumber ? `Semana ${practice.weekNumber}` : "", practice.date ? formatDate(practice.date) : "", practice.dayOfWeek, [practice.startTime, practice.endTime].filter(Boolean).join("–")].filter(Boolean).join(" · ") || "Agenda a confirmar")}</span><small>${escapeHtml([practice.modality, practice.tool, practice.platform].filter(Boolean).join(" · ") || "Sessão síncrona / laboratório prático")}</small></div><button class="button button-secondary webpractice-download" data-practice-id="${escapeHtml(practice.id || practice.title || "")}" type="button">Baixar DOCX <span>↓</span></button></article>`).join("")}</div></section>` : "";
  const reviewedResources = unresolved.filter((item) => reviewMarks.resources?.[reviewItemKey(item)]).length;
  const resourceRows = unresolved.map((item) => {
    const key = reviewItemKey(item);
    const marked = Boolean(reviewMarks.resources?.[key]);
    return `<label class="review-row ${marked ? "is-marked" : ""}"><input type="checkbox" data-review-kind="resources" data-review-key="${escapeHtml(key)}" ${marked ? "checked" : ""} /><span><strong>Semana ${escapeHtml(item.weekNumber)} · ${escapeHtml(item.title || "Recurso sem título")}</strong><small>${escapeHtml(item.status || "Conferência pendente")}${marked ? " · Conferido por você" : ""}</small></span></label>`;
  }).join("");
  const resourcesMarkup = unresolved.length ? `<details class="review-panel resource-review-panel" open><summary><strong>${unresolved.length} recurso(s) precisam de conferência</strong><small>${reviewedResources}/${unresolved.length} marcados por você. Abra cada link, confirme coerência, duração/páginas, acessibilidade e licença antes de exportar.</small></summary><div class="review-list">${resourceRows}</div></details>` : "";
  const breakdown = plan.timeBreakdown || state.workload?.breakdown || {};
  const breakdownSummary = Object.entries(breakdown).filter(([, value]) => Number(value) > 0).map(([key, value]) => `<span><strong>${escapeHtml(breakdownLabels[key] || key)}</strong> ${formatLoad(value)}</span>`).join("");
  const weeklyLoads = (state.workload?.weeks || plan.weeks || []).map((week) => {
    const items = (week.items || []).filter((item) => Number(item.minutes || item.learnerMinutes) > 0);
    const itemMarkup = items.map((item) => `<li><strong>${escapeHtml(workloadItemLabel(item))}</strong><span>${escapeHtml(item.title || "")}</span><em>${formatLoad(item.minutes || item.learnerMinutes)}</em></li>`).join("");
    return `<details class="load-week"><summary><strong>Semana ${escapeHtml(week.weekNumber)}</strong><span>${formatLoad(week.calculatedMinutes)} calculados · ${formatLoad(week.targetMinutes)} de meta</span></summary><ul>${itemMarkup || "<li>Sem itens calculáveis ainda.</li>"}</ul></details>`;
  }).join("");
  const timeBreakdownMarkup = `<section class="time-breakdown"><p class="eyebrow">CARGA ABERTA POR ATIVIDADE</p><h3>De onde vem o tempo calculado?</h3><p>O texto-base é contado separadamente das leituras, vídeos, quiz, fórum, revisão e webpráticas. Artigos/leitura aparecem como obrigatórios ou complementares conforme a marcação do recurso.</p><div class="breakdown-summary">${breakdownSummary || "<span>A carga será calculada depois da redação.</span>"}</div><div class="load-weeks">${weeklyLoads}</div></section>`;
  container.innerHTML = `<p class="eyebrow">PLANEJAMENTO GERAL</p><h3>${escapeHtml(plan.title || "Curso")}</h3><p>O total considera todas as semanas depois da redação do conteúdo, dos recursos e das atividades. A experiência do aluno e o guia do professor são entregues separadamente.</p><div class="general-plan-grid"><div class="general-metric"><strong>${formatMinutes(totals.targetLearnerMinutes)}</strong><small>meta de estudo do aluno</small></div><div class="general-metric"><strong>${formatMinutes(totals.calculatedLearnerMinutes)}</strong><small>carga calculada</small></div><div class="general-metric"><strong>${formatMinutes(totals.requiredMinutes)}</strong><small>itens obrigatórios</small></div><div class="general-metric"><strong>${formatMinutes(totals.instructionalMinutes)}</strong><small>atividade instrucional eq.</small></div></div><div class="general-category-list">${categoryMarkup || "<span>Itens serão dimensionados após a geração</span>"}</div><div class="arc-list">${arcs}</div>${timeBreakdownMarkup}${resourcesMarkup}${checklistMarkup}${progressionMarkup}${practiceMarkup}`;
  organizeResultSectors(container);
  container.querySelectorAll("[data-review-kind]").forEach((checkbox) => checkbox.addEventListener("change", () => toggleReviewMark(checkbox.dataset.reviewKind, checkbox.dataset.reviewKey, checkbox.checked)));
  container.querySelectorAll(".webpractice-download").forEach((button) => button.addEventListener("click", () => downloadWebPractice(button.dataset.practiceId)));
  container.classList.remove("hidden");
}

function renderWeeks(data) {
  state.input = data.input; state.weeks = data.weeks; state.workload = data.workload; state.generalPlan = data.generalPlan || null; state.teacherGuides = data.teacherGuides || []; state.provider = data.provider; state.validation = data.validation || data.generalPlan?.validation || null; state.reviewMarks = data.reviewMarks || state.reviewMarks || createReviewMarks();
  ["recalculate-button", "teacher-pdf-button", "zip-button"].forEach((id) => { const button = $("#" + id); if (button) button.disabled = false; });
  const approvedWeeks = data.weeks.filter((_, index) => Boolean(state.weekApprovals?.[index])).length;
  const pendingWeeks = data.weeks.length - approvedWeeks;
  $("#results-title").textContent = approvedWeeks ? `${approvedWeeks} liberada(s) · ${pendingWeeks} para revisão` : `${data.weeks.length} semanas prontas para revisão`;
  $("#results-subtitle").textContent = data.provider === "static-demo" ? "Modo público GitHub Pages: exemplo gerado no navegador, sem API." : data.provider === "fallback" ? "Exemplo local gerado sem API; use-o para validar o fluxo." : `Gerado por IA com ${data.model || "o provedor configurado"}. Revise antes de publicar.`;
  $("#results-section").classList.remove("hidden");
  $("#empty-state").classList.add("hidden");
  const alert = $("#result-alert");
  alert.className = "result-alert";
  const automaticSummary = state.validation?.summary ? `Diagnóstico automático: ${state.validation.summary.blockedWeeks || 0} bloqueada(s) e ${state.validation.summary.reviewWeeks || 0} em revisão.` : "";
  alert.textContent = data.provider === "static-demo" ? "Esta versão pública gera exemplos diretamente no navegador. A IA será conectada em uma hospedagem com backend protegido quando você escolher essa opção." : data.provider === "fallback" ? "Este é um exemplo estrutural. A geração por IA será ativada quando OPENAI_API_KEY estiver configurada." : approvedWeeks ? `${approvedWeeks} semana(s) liberada(s) por você; ${pendingWeeks} ainda aguardam sua revisão. ${automaticSummary}` : state.validation?.readyForExport ? "A geração terminou. Faça a revisão humana de cada semana e, depois, baixe os arquivos." : `A geração terminou. ${pendingWeeks} semana(s) ainda aguardam sua revisão. ${automaticSummary}`;
  const cards = data.weeks.map((lesson, index) => {
    const meta = lesson.meta || {};
    const workload = data.workload?.weeks?.[index];
    const types = [...new Set((lesson.blocks || []).map((block) => blockLabels[block.type] || block.type))].slice(0, 5);
    const date = meta.calendarStartDate ? `${formatDate(meta.calendarStartDate)}–${formatDate(meta.calendarEndDate)}` : meta.weekLabel;
    const calculated = workload?.calculatedMinutes != null ? formatMinutes(workload.calculatedMinutes) : `${workload?.totalHours ?? meta.studyHours ?? "—"} h`;
    const target = workload?.targetMinutes != null ? formatMinutes(workload.targetMinutes) : "meta —";
    const guide = state.teacherGuides[index];
    const arc = guide?.didacticArc?.label || lesson.lessonPlan?.didacticArc?.label || "Arco variável";
    const quality = lesson.contentQuality || {};
    const validationReport = state.validation?.weeks?.[index] || {};
    const automaticStatus = validationReport.status || quality.status || "review";
    const reasons = validationReasons(validationReport, quality);
    const manuallyApproved = Boolean(state.weekApprovals?.[index]);
    const qualityLabel = manuallyApproved ? "conferida e liberada por você" : ({ ready: "conteúdo pronto", complete: "conteúdo completo", blocked: "bloqueada: pendência crítica", review: "revisão recomendada", "needs-review": "revisão recomendada", insufficient: "conteúdo insuficiente" }[automaticStatus] || "qualidade não medida");
    const approvalButton = automaticStatus !== "ready" && automaticStatus !== "complete" ? `<button class="week-approve ${manuallyApproved ? "is-approved" : ""}" data-index="${index}" type="button">${manuallyApproved ? "Desfazer liberação" : "Liberar após conferência"}</button>` : "";
    const statusDetail = reasons.length ? `<small class="week-status-detail">${escapeHtml(manuallyApproved ? `Diagnóstico automático: ${reasons.join(" · ")}` : reasons.join(" · "))}</small>` : "";
    return `<article class="week-card"><div class="week-card-top"><span class="week-number">${String(index + 1).padStart(2, "0")}</span><span class="week-date">${escapeHtml(date || `Semana ${index + 1}`)}</span></div><div class="week-arc">${escapeHtml(arc)}</div><h3>${escapeHtml(lesson.lessonPlan?.theme || meta.title || `Semana ${index + 1}`)}</h3><p class="week-objective">${escapeHtml((lesson.blocks?.find((b) => b.type === "hero")?.props?.lead) || lesson.lessonPlan?.welcome || "Conteúdo semanal pronto para revisão.")}</p><div class="week-metrics"><span><strong>${calculated}</strong> calculado</span><span>${target} meta</span><span>${quality.wordCount ? `${quality.wordCount.toLocaleString("pt-BR")} palavras` : `${lesson.blocks?.length || 0} blocos`}</span></div><div class="tag-row">${types.map((type) => `<span>${escapeHtml(type)}</span>`).join("")}</div><span class="quality-badge ${manuallyApproved ? "complete" : escapeHtml(automaticStatus)}">${escapeHtml(qualityLabel)}</span>${statusDetail}<div class="week-actions"><button class="button button-secondary week-preview" data-index="${index}" type="button">Ver aula <span>↗</span></button><button class="button button-secondary week-download" data-index="${index}" type="button">Baixar JSON <span>↓</span></button>${approvalButton}</div></article>`;
  }).join("");
  $("#week-grid").innerHTML = cards;
  const weeksNote = $("#weeks-sector-note");
  if (weeksNote) weeksNote.textContent = `${data.weeks.length} semana(s) gerada(s); abra cada cartão para revisar o conteúdo do aluno.`;
  $("#week-grid").querySelectorAll(".week-preview").forEach((button) => button.addEventListener("click", () => openLessonPreview(Number(button.dataset.index))));
  $("#week-grid").querySelectorAll(".week-download").forEach((button) => button.addEventListener("click", () => downloadWeek(Number(button.dataset.index))));
  $("#week-grid").querySelectorAll(".week-approve").forEach((button) => button.addEventListener("click", () => toggleWeekApproval(Number(button.dataset.index))));
  renderGeneralPlan(data.generalPlan);
  renderWorkload(data.workload);
  saveDraft("resultado");
  $("#results-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function downloadWeek(index) {
  const lesson = state.weeks[index];
  if (!lesson) return;
  const number = String(index + 1).padStart(2, "0");
  downloadBlob(new Blob([JSON.stringify(lesson, null, 2)], { type: "application/json" }), `semana-${number}-${slugify(lesson.meta?.title)}.aula.json`);
}

function apiHeaders() {
  const headers = { "Content-Type": "application/json" };
  const accessCode = $("#access-code")?.value.trim();
  if (accessCode) headers["x-aula-access-code"] = accessCode;
  return headers;
}

async function downloadWebPractice(practiceId) {
  if (!practiceId || !state.weeks.length) return;
  if (isGitHubPages) { showError("O DOCX das webpráticas é gerado na versão Vercel com backend."); return; }
  const button = document.querySelector(`.webpractice-download[data-practice-id="${CSS.escape(practiceId)}"]`);
  if (button) { button.disabled = true; button.classList.add("is-loading"); }
  try {
    const response = await fetch("/api/webpractice-docx", { method: "POST", headers: apiHeaders(), body: JSON.stringify({ input: state.input, weeks: state.weeks, teacherGuides: state.teacherGuides, practiceId }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Não foi possível criar o DOCX da webprática."); }
    const disposition = response.headers.get("Content-Disposition") || "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || `${slugify(practiceId)}-roteiro.docx`;
    downloadBlob(await response.blob(), filename);
  } catch (error) { showError(error.message); }
  finally { if (button) { button.disabled = false; button.classList.remove("is-loading"); } }
}

function toggleWeekApproval(index) {
  state.weekApprovals = state.weekApprovals || {};
  state.weekApprovals[index] = !state.weekApprovals[index];
  saveDraft("liberação manual");
  renderWeeks({ input: state.input, weeks: state.weeks, workload: state.workload, generalPlan: state.generalPlan, teacherGuides: state.teacherGuides, provider: state.provider, validation: state.validation });
}

async function generateDistributed(input, accessCode, button) {
  const weeks = [];
  const teacherGuides = [];
  const headers = { "Content-Type": "application/json" };
  if (accessCode) headers["x-aula-access-code"] = accessCode;

  for (let index = 0; index < input.weeks; index += 1) {
    button.querySelector("span:first-child").textContent = `Gerando semana ${index + 1}/${input.weeks}…`;
    const response = await fetch("/api/generate-week", {
      method: "POST",
      headers,
      body: JSON.stringify({
        input,
        weekIndex: index,
        previousWeeks: weeks.filter(Boolean).map((lesson) => ({
          meta: { weekNumber: lesson.meta?.weekNumber, title: lesson.meta?.title },
          lessonPlan: {
            weekNumber: lesson.lessonPlan?.weekNumber,
            theme: lesson.lessonPlan?.theme,
            learningObjectives: (lesson.lessonPlan?.learningObjectives || []).slice(0, 4),
            contentSections: (lesson.lessonPlan?.contentSections || []).map((section) => ({ title: section.title })).slice(0, 8)
          }
        }))
      })
    });
    const data = await readApiResponse(response, `Não foi possível gerar a semana ${index + 1}.`);
    weeks[index] = data.week;
    teacherGuides[index] = data.teacherGuide;
    state.input = input;
    state.weeks = weeks.filter(Boolean);
    state.teacherGuides = teacherGuides.filter(Boolean);
    saveDraft("resultado-parcial");
    const alert = $("#result-alert");
    alert.className = "result-alert";
    alert.textContent = `Semana ${index + 1} de ${input.weeks} gerada. A consolidação acontece ao final.`;
    alert.classList.remove("hidden");
  }

  button.querySelector("span:first-child").textContent = "Consolidando curso…";
  const response = await fetch("/api/assemble-course", {
    method: "POST",
    headers,
    body: JSON.stringify({ input, weeks, teacherGuides })
  });
  return readApiResponse(response, "Não foi possível consolidar o curso.");
}

async function generate() {
  const input = formInput();
  const accessCode = input.accessCode;
  delete input.accessCode;
  if (!input.title.trim()) { showError("Informe o tema geral ou título do curso."); $("#course-title").focus(); return; }
  if (!input.objectives.length && !input.content.trim()) { showError("Informe ao menos um objetivo ou conteúdo-base para orientar a geração."); $("#objectives").focus(); return; }
  if (input.webPractice.enabled) {
    const incomplete = input.webPractices.find((practice) => !practice.title || (!practice.weekNumber && !practice.date));
    if (incomplete) { showError("Cada webprática precisa de um título e de uma semana ou data de ocorrência. Ela não será alocada automaticamente."); return; }
  }
  state.reviewMarks = createReviewMarks();
  state.weekApprovals = {};
  const button = $("#generate-button");
  button.dataset.label = "Gerar com IA";
  ["recalculate-button", "teacher-pdf-button", "zip-button"].forEach((id) => { const action = $("#" + id); if (action) action.disabled = true; });
  setBusy(button, true, "Gerando material…");
  $("#result-alert").classList.add("hidden");
  try {
    if (isGitHubPages) {
      throw new Error("A IA está disponível na URL Vercel, onde o backend protegido pode ser acessado. Abra o Gerador pela versão publicada com IA.");
    }
    const data = await generateDistributed(input, accessCode, button);
    renderWeeks(data);
  } catch (error) { showError(error.message); }
  finally { setBusy(button, false, ""); }
}

async function downloadZip() {
  if (!state.weeks.length) return;
  const button = $("#zip-button");
  button.disabled = true; button.classList.add("is-loading");
  try {
    if (isGitHubPages) {
      if (!window.JSZip) throw new Error("O componente de ZIP ainda não carregou. Recarregue a página e tente novamente.");
      const zip = new window.JSZip();
      state.weeks.forEach((lesson, index) => { const number = String(index + 1).padStart(2, "0"); zip.file(`semanas/semana-${number}-${slugify(lesson.meta?.title)}.aula.json`, JSON.stringify(lesson, null, 2)); });
      if (state.generalPlan) zip.file("planejamento-geral.json", JSON.stringify(state.generalPlan, null, 2));
      zip.file("professor/LEIA-ME.txt", "O PDF do professor é gerado na versão Vercel com backend. Este modo público contém apenas o exemplo do aluno.");
      downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), `${slugify(state.input.title)}-semanas.zip`);
      return;
    }
    const response = await fetch("/api/zip", { method: "POST", headers: apiHeaders(), body: JSON.stringify({ input: state.input, weeks: state.weeks, teacherGuides: state.teacherGuides }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Não foi possível montar o ZIP."); }
    downloadBlob(await response.blob(), `${slugify(state.input.title)}-semanas.zip`);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; button.classList.remove("is-loading"); }
}

async function downloadTeacherPdf() {
  if (!state.weeks.length) return;
  if (isGitHubPages) { showError("O PDF do professor é gerado na URL Vercel, onde o backend está protegido. Use o pacote completo na versão com IA."); return; }
  const button = $("#teacher-pdf-button");
  button.disabled = true; button.classList.add("is-loading");
  try {
    const response = await fetch("/api/teacher-pdf", { method: "POST", headers: apiHeaders(), body: JSON.stringify({ input: state.input, weeks: state.weeks, teacherGuides: state.teacherGuides }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Não foi possível criar o PDF do professor."); }
    downloadBlob(await response.blob(), `${slugify(state.input.title)}-guia-do-professor.pdf`);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; button.classList.remove("is-loading"); }
}

async function recalculateQuality() {
  if (!state.weeks.length || isGitHubPages) { if (isGitHubPages) showError("O recálculo do curso está disponível na versão Vercel com backend."); return; }
  const button = $("#recalculate-button");
  button.disabled = true; button.classList.add("is-loading");
  try {
    const response = await fetch("/api/assemble-course", { method: "POST", headers: apiHeaders(), body: JSON.stringify({ input: state.input, weeks: state.weeks, teacherGuides: state.teacherGuides }) });
    const data = await readApiResponse(response, "Não foi possível recalcular a qualidade do curso.");
    renderWeeks({ ...data, input: state.input });
    $("#result-alert").className = "result-alert";
    $("#result-alert").textContent = "Qualidade, checklist e carga recalculados sem nova chamada de IA.";
    $("#result-alert").classList.remove("hidden");
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; button.classList.remove("is-loading"); }
}

async function loadHealth() {
  const status = $("#api-status");
  if (isGitHubPages) {
    status.innerHTML = '<span class="status-dot warning"></span>modo público · sem IA';
    document.querySelectorAll(".vercel-access").forEach((item) => item.classList.add("hidden"));
    $("#assist-button").disabled = true;
    $("#assist-button").querySelector("span:first-child").textContent = "IA indisponível nesta URL";
    $("#generate-button").disabled = true;
    $("#generate-button").querySelector("span:first-child").textContent = "IA indisponível nesta URL";
    return;
  }
  try {
    const data = await (await fetch("/api/health")).json();
    status.innerHTML = `<span class="status-dot ${data.aiConfigured ? "online" : "warning"}"></span>${data.aiConfigured ? (data.accessRequired ? "IA configurada · código necessário" : "IA configurada") : "modo exemplo · chave pendente"}${data.aiConfigured && data.resourceResearch && !data.youtubeConfigured ? " · vídeos aguardando chave" : ""}`;
    if (!data.aiConfigured) {
      $("#assist-button").disabled = true;
      $("#assist-button").querySelector("span:first-child").textContent = "IA pendente";
      $("#generate-button").disabled = true;
      $("#generate-button").querySelector("span:first-child").textContent = "IA pendente";
    }
  } catch { status.innerHTML = '<span class="status-dot offline"></span>servidor indisponível'; }
}

$("#add-practice").addEventListener("click", () => { addPractice(); scheduleSave(); });
$("#apply-practice-count").addEventListener("click", applyPracticeCount);
$("#add-material").addEventListener("click", () => { addMaterial(); scheduleSave(); });
$("#practice-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-practice]");
  if (!button) return;
  button.closest(".practice-card").remove();
  if (!document.querySelector("#practice-list .practice-card")) addPractice();
  refreshItemButtons(); syncPracticeCount(); togglePractice(); updateSummary(); scheduleSave();
});
$("#materials-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-material]");
  if (!button) return;
  button.closest(".material-card").remove();
  if (!document.querySelector("#materials-list .material-card")) addMaterial();
  refreshItemButtons(); updateSummary(); scheduleSave();
});
addPractice();
addMaterial();
$("#welcome-form").addEventListener("submit", enterFromWelcome);
$("#course-form").addEventListener("submit", (event) => { event.preventDefault(); generate(); });
$("#assist-button").addEventListener("click", assistBriefing);
$("#zip-button").addEventListener("click", downloadZip);
$("#teacher-pdf-button").addEventListener("click", downloadTeacherPdf);
$("#recalculate-button").addEventListener("click", recalculateQuality);
$("#close-lesson-modal").addEventListener("click", closeLessonPreview);
$("#close-lesson-modal-secondary").addEventListener("click", closeLessonPreview);
$("#regenerate-week-button").addEventListener("click", regenerateSelectedWeek);
$("#lesson-modal").addEventListener("click", (event) => { if (event.target.id === "lesson-modal") closeLessonPreview(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.previewIndex != null) closeLessonPreview(); });
window.addEventListener("resize", syncRecoveryLayout);
$("#calendar-mode").addEventListener("change", () => { toggleCalendar(); scheduleSave(); });
$("#weeks").addEventListener("input", () => { const resourcePlan = collectResourcePlan(); const compositionPlan = collectCompositionPlan(); renderResourcePlanWeeks(resourcePlan); renderCompositionPlanWeeks(compositionPlan); updateSummary(); updateProgress(); scheduleSave(); });
$("#practice-enabled").addEventListener("change", () => { togglePractice(); scheduleSave(); });
$("#course-form").addEventListener("input", () => { updateAcademicInheritance(); updateSummary(); updateProgress(); scheduleSave(); });
$("#save-backup-button").addEventListener("click", downloadBackup);
$("#restore-backup-button").addEventListener("click", () => $("#backup-file-input").click());
$("#backup-file-input").addEventListener("change", (event) => { restoreBackupFile(event.target.files?.[0]); event.target.value = ""; });
$("#restore-draft-button").addEventListener("click", () => { const draft = readDraft(); restoreSnapshot(draft); enterWorkspace(); });
$("#discard-draft-button").addEventListener("click", () => { safeStorageRemove(); hideDraftRecovery(); if (document.body.classList.contains("welcome-active")) hideRecoveryDock(); else setSaveStatus("Salvamento local ativo", "O próximo briefing será salvo automaticamente neste navegador."); });
window.addEventListener("beforeunload", () => saveDraft("fechamento"));
$("#generate-button").dataset.label = "Gerar com IA";
$("#assist-button").dataset.label = "Preencher vazios com IA";
initializeWelcome();
enhanceLayout();
renderResourcePlanWeeks(); renderCompositionPlanWeeks(); toggleCalendar(); togglePractice(); updateAcademicInheritance(); updateSummary(); updateProgress(); offerDraftRecovery(); loadHealth();
