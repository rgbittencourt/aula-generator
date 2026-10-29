import { toStudentLesson, toGeneratorWeek } from "./student-export.js";
import { createMoodleXml, quizQuestions } from "./moodle-xml.js";
import { createProductionWorkbook, hasProduction, productionMarkdown, productionVideos, formatDuration } from "./production-xlsx.js";
import { applyAdjustment, applyRewrite, approveWeek, bridgesBefore, canGenerateNext, dismissIssue, emptyFlow, normalizeFlow, recordGenerated, weekFlowStatus } from "./step-flow.js";

const $ = (selector) => document.querySelector(selector);
const isGitHubPages = window.location.hostname.endsWith(".github.io");
const createReviewMarks = () => ({ resources: {}, checks: {}, academic: {}, quality: {} });
const state = { input: null, weeks: [], workload: null, generalPlan: null, teacherGuides: [], provider: null, validation: null, previewIndex: null, reviewMarks: createReviewMarks(), weekApprovals: {}, studioEdits: {}, activeReviewGuidance: null, generation: null, flow: emptyFlow(), production: emptyProduction() };
const blockLabels = { hero: "Abertura", topic: "Tópico", prose: "Texto", titulo: "Título", video: "Vídeo", materiais: "Materiais", quiz: "Quiz", destaque: "Destaque", atencao: "Atenção", reflexao: "Reflexão", imagem: "Imagem", externalembed: "Conteúdo externo", accordion: "FAQ", columns: "Colunas", referencias: "Referências" };
const DRAFT_STORAGE_KEY = "aula-generator:draft:v2";
const DRAFT_MAX_AGE_DAYS = 30;
const RIGHT_NAV_STORAGE_KEY = "aula-generator:right-navigation-collapsed:v1";
let saveTimer = null;
let aiActivityHideTimer = null;
let aiActionBusy = false;
let aiConfigured = !isGitHubPages;
const AI_ACTION_IDS = ["assist-button", "generate-button", "recalculate-button", "regenerate-week-button"];

function syncRecoveryLayout() {
  const header = $(".site-header");
  const dock = $("#recovery-dock");
  const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) : 72;
  const dockHeight = dock && !dock.classList.contains("hidden") ? Math.ceil(dock.getBoundingClientRect().height) : 0;
  const summaryCard = $(".project-sidebar .summary-card");
  if (dock?.parentElement?.classList.contains("navigation-column") && summaryCard) {
    const summaryWidth = Math.ceil(summaryCard.getBoundingClientRect().width);
    if (summaryWidth > 0) dock.style.width = `${summaryWidth}px`;
  }
  document.documentElement.style.setProperty("--site-header-height", `${headerHeight}px`);
  document.documentElement.style.setProperty("--recovery-dock-height", `${dockHeight}px`);
}

function readRightNavigationCollapsed() {
  try { return localStorage.getItem(RIGHT_NAV_STORAGE_KEY) === "true"; } catch { return false; }
}

function setRightNavigationCollapsed(collapsed, persist = true) {
  const column = $(".navigation-column");
  const toggle = $("#right-navigation-toggle");
  if (!column || !toggle) return;
  column.classList.toggle("is-collapsed", collapsed);
  column.parentElement?.classList.toggle("right-nav-collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.setAttribute("aria-label", collapsed ? "Expandir navegação do projeto" : "Recolher navegação do projeto");
  toggle.title = collapsed ? "Expandir navegação do projeto" : "Recolher navegação do projeto";
  const label = toggle.querySelector(".drawer-toggle-label");
  const icon = toggle.querySelector(".drawer-toggle-icon");
  if (label) label.textContent = collapsed ? "Navegar" : "Recolher";
  if (icon) icon.textContent = collapsed ? "←" : "→";
  if (persist) {
    try { localStorage.setItem(RIGHT_NAV_STORAGE_KEY, String(collapsed)); } catch { /* preferência visual não é essencial */ }
  }
}

function keepWorkspaceAtTop() {
  if (document.body.classList.contains("workspace-active") && window.innerWidth >= 901 && window.scrollY) window.scrollTo(0, 0);
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
  const workspaceGrid = formColumn.parentElement;
  const intro = $(".intro");
  if (intro && intro.parentElement !== formColumn) formColumn.prepend(intro);
  const resultsSection = $("#results-section");
  if (resultsSection && resultsSection.parentElement !== formColumn) formColumn.appendChild(resultsSection);

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
    while (heading.firstChild) summary.appendChild(heading.firstChild);
    summary.insertAdjacentHTML("beforeend", '<span class="sector-chevron" aria-hidden="true">⌄</span>');
    const body = document.createElement("div");
    body.className = "sector-body";
    [...panel.children].filter((child) => child !== heading).forEach((child) => body.appendChild(child));
    details.append(summary, body);
    panel.replaceWith(details);
    summary.addEventListener("click", (event) => {
      const switchControl = event.target.closest(".switch");
      if (!switchControl) return;
      const input = switchControl.querySelector("input");
      if (!input) return;
      if (event.target === input) {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      input.click();
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
    // O seletor do fluxo semana a semana fica logo acima do botão de gerar.
    if (id === "generate-button") { const stepToggle = $(".step-mode-toggle"); if (stepToggle) actions.appendChild(stepToggle); }
    button.classList.add("sidebar-action");
    if (["recalculate-button", "teacher-pdf-button", "zip-button"].includes(id)) button.disabled = true;
    actions.appendChild(button);
  });
  document.querySelector(".form-actions")?.remove();
  document.querySelector(".results-actions")?.remove();
  summaryCard?.after(actions);

  const navigation = document.createElement("nav");
  navigation.className = "sidebar-navigation";
  navigation.id = "project-navigation";
  navigation.setAttribute("aria-label", "Navegação do planejamento");
  navigation.innerHTML = '<p class="sidebar-label">NAVEGAR PELO PROJETO</p>' + navItems.map((item) => `<a href="#${item.id}" data-scroll-to="${item.id}">${escapeHtml(item.title)}<span>→</span></a>`).join("") + '<a href="#results-load" data-scroll-to="results-load">Carga por atividade<span>→</span></a><a href="#results-breakdown" data-scroll-to="results-breakdown">Carga aberta por atividade<span>→</span></a><a href="#results-review" data-scroll-to="results-review">Checklists<span>→</span></a><a href="#results-weeks" data-scroll-to="results-weeks">Semanas planejadas<span>→</span></a>';
  const navigationColumn = document.createElement("aside");
  navigationColumn.className = "navigation-column";
  navigationColumn.setAttribute("aria-label", "Navegação do planejamento");
  const navigationToggle = document.createElement("button");
  navigationToggle.type = "button";
  navigationToggle.id = "right-navigation-toggle";
  navigationToggle.className = "navigation-drawer-toggle";
  navigationToggle.setAttribute("aria-controls", navigation.id);
  navigationToggle.innerHTML = '<span class="drawer-toggle-label">Recolher</span><span class="drawer-toggle-icon" aria-hidden="true">→</span>';
  navigationToggle.addEventListener("click", () => setRightNavigationCollapsed(!navigationColumn.classList.contains("is-collapsed")));
  navigationColumn.append(navigationToggle, navigation);
  const recoveryDock = $("#recovery-dock");
  if (recoveryDock && recoveryDock.parentElement !== navigationColumn) {
    recoveryDock.classList.remove("workspace-dock");
    recoveryDock.classList.add("navigation-recovery-dock");
    navigationColumn.appendChild(recoveryDock);
  }
  workspaceGrid?.appendChild(navigationColumn);
  setRightNavigationCollapsed(readRightNavigationCollapsed(), false);
  navigation.querySelectorAll("[data-scroll-to]").forEach((link) => link.addEventListener("click", (event) => {
    const target = document.getElementById(link.dataset.scrollTo);
    if (!target) return;
    event.preventDefault();
    for (let ancestor = target; ancestor; ancestor = ancestor.parentElement) if (ancestor.tagName === "DETAILS") ancestor.open = true;
    const scrollContainer = target.closest(".form-column");
    if (scrollContainer) {
      const top = scrollContainer.scrollTop + target.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top - 12;
      scrollContainer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else target.scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  const weekGrid = $("#week-grid");
  if (weekGrid && !$("#results-weeks")) {
    const parent = weekGrid.parentElement;
    const weeksSector = document.createElement("details");
    weeksSector.className = "results-sector weeks-sector";
    weeksSector.id = "results-weeks";
    weeksSector.open = false;
    weeksSector.innerHTML = '<summary class="results-sector-summary"><div class="results-sector-copy"><strong>Semanas planejadas</strong><small id="weeks-sector-note">As semanas aparecerão aqui depois da geração.</small></div><span class="sector-chevron results-sector-chevron" aria-hidden="true">⌄</span></summary>';
    const body = document.createElement("div");
    body.className = "results-sector-body";
    weekGrid.remove();
    body.appendChild(weekGrid);
    weeksSector.appendChild(body);
    parent.appendChild(weeksSector);
  }
  resetWorkspaceScroll();
}

function resetWorkspaceScroll() {
  document.querySelectorAll(".summary-column, .form-column, .navigation-column").forEach((column) => { column.scrollTop = 0; column.scrollLeft = 0; });
}

function scrollFormTo(selector, behavior = "smooth") {
  const target = typeof selector === "string" ? $(selector) : selector;
  const container = target?.closest(".form-column");
  if (!target || !container) {
    target?.scrollIntoView({ behavior, block: "start" });
    return;
  }
  const top = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 12;
  container.scrollTo({ top: Math.max(0, top), behavior });
}

function stabilizeWorkspaceLayout() {
  const apply = () => { document.activeElement?.blur?.(); window.scrollTo(0, 0); resetWorkspaceScroll(); syncRecoveryLayout(); };
  apply();
  requestAnimationFrame(apply);
}

// Textos do modo de prosa chegam como HTML simples (<p>, <strong>, <em>): mantém
// parágrafos e ênfase, descarta qualquer outra tag e escapa o resto.
function inlineMarkup(html) {
  const parts = String(html ?? "").replace(/<(?!\/?(?:strong|em|b|i)\b)[^>]*>/gi, " ").split(/(<\/?(?:strong|em|b|i)>)/gi);
  return parts.map((part) => /^<\/?(?:strong|em|b|i)>$/i.test(part) ? part.toLowerCase() : part.replace(/&(?!(?:amp|lt|gt|quot|#039|#39);)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")).join("").replace(/\s+/g, " ").trim();
}
function paragraphsMarkup(value) {
  const source = String(value ?? "");
  if (/<(?:p|ul|li|strong|em|br)\b/i.test(source)) return source.split(/<\/p>|<\/li>|<br\s*\/?>/i).map(inlineMarkup).filter(Boolean).map((part) => `<p>${part}</p>`).join("");
  return source.split(/\n\s*\n|\r?\n/).map((part) => readableText(part)).filter(Boolean).map((part) => `<p>${escapeHtml(part)}</p>`).join("");
}
function slugify(value) { return String(value || "curso").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "curso"; }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function addDays(dateString, days) { const date = new Date(`${dateString}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

function formatSavedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function releasedWeekCount() {
  return Object.values(state.weekApprovals || {}).filter(Boolean).length;
}

function updateMediationExportHint() {
  const button = $("#teacher-pdf-button");
  if (!button) return;
  const count = releasedWeekCount();
  const generated = state.weeks?.length || 0;
  button.title = generated
    ? `Baixar o Material de Mediação com as ${generated} semana(s) geradas (${count} liberada(s); as demais aparecem como rascunho) e as que ainda faltam`
    : "Baixar Material de Mediação inicial; nenhuma semana foi gerada ainda";
  button.dataset.releasedWeeks = String(count);
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
  document.body.classList.add("workspace-active");
  document.documentElement.classList.add("workspace-active");
  window.scrollTo(0, 0);
  resetWorkspaceScroll();
  const draft = readDraft();
  if (draft) {
    showRecoveryDock(true);
    updateDraftRecoveryCard(draft);
  }
  else {
    showRecoveryDock(true);
    setSaveStatus("Backup e recuperação", "Nenhum rascunho automático foi encontrado. Use Restaurar backup para importar um arquivo salvo.", "success");
  }
  updateAcademicInheritance();
  updateSummary();
  updateProgress();
  stabilizeWorkspaceLayout();
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

function resetDisciplineForm(preserveSession = true) {
  const session = {
    author: $("#author")?.value || "",
    institution: $("#institution")?.value || "",
    accessCode: $("#access-code")?.value || ""
  };
  $("#course-form")?.reset();
  practiceSequence = 0;
  materialSequence = 0;
  $("#practice-list").innerHTML = "";
  $("#materials-list").innerHTML = "";
  addPractice();
  addMaterial();
  renderResourcePlanWeeks();
  renderCompositionPlanWeeks();
  toggleCalendar();
  togglePractice();
  if (preserveSession) {
    $("#author").value = session.author;
    $("#institution").value = session.institution;
    $("#access-code").value = session.accessCode;
  } else {
    $("#author").value = "";
    $("#institution").value = "";
    $("#access-code").value = "";
  }
  state.input = null;
  state.weeks = []; refreshStudioWeekSelect();
  state.workload = null;
  state.generalPlan = null;
  state.teacherGuides = [];
  state.provider = null;
  state.validation = null;
  state.reviewMarks = createReviewMarks();
  state.weekApprovals = {};
  state.studioEdits = {};
  state.production = emptyProduction();
  state.flow = emptyFlow();
  state.activeReviewGuidance = null;
  state.generation = null;
  state.previewIndex = null;
  $("#results-section")?.classList.add("hidden");
  $("#results-section") && ($("#results-section").open = false);
  $("#general-plan").innerHTML = "";
  $("#general-plan").classList.add("hidden");
  $("#week-grid").innerHTML = "";
  $("#result-alert").className = "result-alert hidden";
  $("#result-alert").textContent = "";
  $("#results-title").textContent = "Semanas geradas";
  $("#results-subtitle").textContent = "";
  $("#empty-state")?.classList.remove("hidden");
  document.querySelectorAll(".briefing-sector").forEach((sector, index) => { sector.open = index === 0; });
  document.querySelectorAll(".results-sector").forEach((sector) => { sector.open = false; });
  closeLessonPreview();
  updateAcademicInheritance();
  updateSummary();
  updateProgress();
  resetWorkspaceScroll();
}

function startNewProject(event) {
  event?.preventDefault();
  if (currentSnapshot() && !window.confirm("Iniciar um novo projeto de disciplina? Os formulários serão limpos, mas o planejamento salvo continuará disponível para recuperação.")) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  resetDisciplineForm(true);
  document.body.classList.remove("welcome-active");
  document.body.classList.add("workspace-active");
  document.documentElement.classList.add("workspace-active");
  stabilizeWorkspaceLayout();
  if (readDraft()) {
    offerDraftRecovery();
  } else {
    showRecoveryDock(true);
    setSaveStatus("Novo projeto iniciado", "Nenhum rascunho automático foi encontrado nesta sessão. Use Restaurar backup para importar um arquivo salvo.", "success");
  }
  $("#course-title")?.focus({ preventScroll: true });
}

function exitSession() {
  if (currentSnapshot() && !window.confirm("Voltar à capa e trocar o usuário, a instituição ou o código? O planejamento atual será removido deste navegador.")) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  safeStorageRemove();
  resetDisciplineForm(false);
  $("#welcome-author").value = "";
  $("#welcome-institution").value = "";
  $("#welcome-access-code").value = "";
  hideRecoveryDock();
  document.body.classList.remove("workspace-active");
  document.body.classList.add("welcome-active");
  document.documentElement.classList.remove("workspace-active");
  $("#welcome-screen")?.classList.remove("hidden");
  window.scrollTo(0, 0);
  requestAnimationFrame(() => $("#welcome-author")?.focus({ preventScroll: true }));
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
    results: state.weeks.length || state.generation ? {
      ok: true,
      provider: state.provider,
      input: state.input || input,
      workload: state.workload,
      generalPlan: state.generalPlan,
      teacherGuides: state.teacherGuides,
      validation: state.validation,
      reviewMarks: state.reviewMarks,
      weekApprovals: state.weekApprovals,
      studioEdits: state.studioEdits,
      production: state.production,
      stepFlow: state.flow,
      generation: state.generation,
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
    if (document.body.classList.contains("workspace-active")) updateDraftRecoveryCard(snapshot);
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

function updateDraftRecoveryCard(draft = readDraft()) {
  const section = $("#draft-recovery");
  if (!section) return;
  if (!draft) {
    section.classList.add("hidden");
    syncRecoveryLayout();
    return;
  }
  const hasResults = Boolean(draft.results?.weeks?.length);
  const partialGeneration = ["partial", "running", "consolidating"].includes(draft.results?.generation?.status);
  const title = section.querySelector("strong");
  if (title) title.textContent = document.body.classList.contains("workspace-active") ? "Rascunho disponível neste navegador." : "Encontramos um planejamento salvo neste navegador.";
  const savedDetail = hasResults ? ` · ${draft.results.weeks.length} semana(s) preservada(s)` : " · briefing em andamento";
  const nextWeekIndex = Number(draft.results?.generation?.nextWeekIndex) || 0;
  const generationDetail = partialGeneration ? ` · geração interrompida${nextWeekIndex < Number(draft.results?.generation?.total || 0) ? ` na semana ${nextWeekIndex + 1}` : " durante a consolidação"}` : "";
  $("#draft-recovery-details").textContent = `Salvo em ${formatSavedAt(draft.savedAt)}${savedDetail}${generationDetail}.`;
  section.classList.remove("hidden");
  syncRecoveryLayout();
}

function offerDraftRecovery() {
  const draft = readDraft();
  if (!draft) return;
  showRecoveryDock(true);
  updateDraftRecoveryCard(draft);
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
  const defaults = plan.default || {};
  const byWeek = new Map(entries.map((entry) => [Number(entry.weekNumber || entry.week), entry]));
  const inheritedPlaceholder = (attribute) => {
    const defaultValue = attribute === "videos" ? defaults.videosPerWeek : attribute === "articles" ? defaults.articlesPerWeek : defaults.requiredReadingsPerWeek;
    return Number.isFinite(Number(defaultValue)) ? `padrão (${Number(defaultValue)})` : "padrão";
  };
  const field = (label, attribute, value, type = "number") => type === "select"
    ? `<label class="field"><span>${label}</span><select data-resource-${attribute} class="resource-override"><option value="">Padrão</option><option value="none" ${value === "none" ? "selected" : ""}>Nenhuma</option><option value="essential" ${value === "essential" ? "selected" : ""}>Essencial</option><option value="advanced" ${value === "advanced" ? "selected" : ""}>Aprofundada</option><option value="dense" ${value === "dense" ? "selected" : ""}>Densa</option></select></label>`
    : `<label class="field"><span>${label}</span><input data-resource-${attribute} class="resource-override" type="number" min="0" max="12" step="1" value="${value ?? ""}" placeholder="${value === null || value === undefined || value === "" ? inheritedPlaceholder(attribute) : "padrão"}" /></label>`;
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
  container.innerHTML = `<div class="composition-defaults"><div class="composition-table-head"><strong>Bloco do ClassAtelier</strong><span>Qtd. padrão</span><span>Política</span><span>Itens/bloco</span></div>${defaultRows}</div><div class="composition-week-heading"><strong>Exceções por semana</strong><small>Use apenas quando uma semana precisar de composição diferente.</small></div><div class="composition-week-list">${weekMarkup}</div>`;
}

function restoreSnapshot(snapshot) {
  if (!snapshot?.form) return;
  document.activeElement?.blur?.();
  applyInputToForm(snapshot.form);
  state.reviewMarks = snapshot.results?.reviewMarks || snapshot.reviewMarks || createReviewMarks();
  state.weekApprovals = snapshot.results?.weekApprovals || snapshot.weekApprovals || {};
  state.studioEdits = snapshot.results?.studioEdits || {};
  state.production = normalizeProductionState(snapshot.results?.production);
  state.flow = normalizeFlow(snapshot.results?.stepFlow);
  state.generation = snapshot.results?.generation || snapshot.generation || null;
  if (["running", "consolidating"].includes(state.generation?.status)) state.generation = { ...state.generation, status: "partial" };
  if (state.generation?.status === "partial") {
    const nextWeekIndex = Number(state.generation.nextWeekIndex) || 0;
    const resumeLabel = nextWeekIndex < Number(state.generation.total || 0) ? `Continuar da semana ${nextWeekIndex + 1}` : "Tentar consolidar novamente";
    const generateButton = $("#generate-button");
    if (generateButton) { generateButton.dataset.label = resumeLabel; setButtonLabel(generateButton, resumeLabel); }
  }
  hideDraftRecovery();
  if (snapshot.results?.weeks?.length) {
    renderWeeks({ ...snapshot.results, partial: state.generation?.status === "partial", input: snapshot.results.input || snapshot.form }, { scrollToResults: false });
    const nextWeekIndex = Number(state.generation?.nextWeekIndex) || 0;
    const generationMessage = state.generation?.status === "partial" ? ` A geração foi interrompida; use Gerar com IA para continuar${nextWeekIndex < Number(state.generation.total || 0) ? ` pela semana ${nextWeekIndex + 1}` : " a consolidação"}.` : "";
    setSaveStatus("Planejamento retomado", `${snapshot.results.weeks.length} semana(s) recuperada(s).${generationMessage}`, "success");
    if (state.generation?.status === "partial") $("#results-section").open = true;
  } else if (state.generation?.status === "partial") {
    const nextWeekIndex = Number(state.generation.nextWeekIndex) || 0;
    setSaveStatus("Geração parcial retomada", `A geração foi interrompida${nextWeekIndex < Number(state.generation.total || 0) ? ` na semana ${nextWeekIndex + 1}` : " durante a consolidação"}. Use Gerar com IA para tentar novamente.`, "warning");
  } else {
    setSaveStatus("Briefing retomado", "Continue preenchendo; o salvamento automático está ativo.", "success");
  }
  showAssistantMessage("Planejamento recuperado. Confira o briefing e continue de onde parou.");
  stabilizeWorkspaceLayout();
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
      if (snapshot?.version !== 2 || snapshot?.app !== "aula-generator" || !snapshot.form) throw new Error("Este arquivo não é um backup válido do ClassAuthor.");
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

function buttonLabelNode(button) { return button?.querySelector(".button-label") || button?.querySelector("span:first-child"); }

function setButtonLabel(button, label) {
  const labelNode = buttonLabelNode(button);
  if (labelNode) labelNode.textContent = label;
}

function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("is-loading", busy);
  button.setAttribute("aria-busy", busy ? "true" : "false");
  const labelNode = buttonLabelNode(button);
  if (labelNode) labelNode.textContent = busy ? label : (button.dataset.label || label);
}

function refreshAiButtonAvailability() {
  if (aiActionBusy) return;
  const assist = $("#assist-button");
  const generateButton = $("#generate-button");
  const recalculate = $("#recalculate-button");
  if (assist) assist.disabled = isGitHubPages || !aiConfigured;
  if (generateButton) generateButton.disabled = isGitHubPages || !aiConfigured;
  if (recalculate) {
    recalculate.disabled = isGitHubPages || !aiConfigured || !state.weeks.length;
    recalculate.title = state.generation?.status === "partial" && state.input?.weeks > state.weeks.length
      ? `Recalcular a qualidade das ${state.weeks.length} semanas disponíveis de ${state.input.weeks}`
      : "Recalcular qualidade sem gerar novas semanas";
  }
}

function beginAiAction(button) {
  if (aiActionBusy) return false;
  aiActionBusy = true;
  AI_ACTION_IDS.forEach((id) => {
    const action = $("#" + id);
    if (action && action !== button) {
      action.dataset.aiLocked = "true";
      action.disabled = true;
    }
  });
  return true;
}

function endAiAction() {
  aiActionBusy = false;
  AI_ACTION_IDS.forEach((id) => {
    const action = $("#" + id);
    if (action) delete action.dataset.aiLocked;
  });
  refreshAiButtonAvailability();
  const teacherPdf = $("#teacher-pdf-button");
  if (teacherPdf && state.weeks.length) teacherPdf.disabled = false;
  const zip = $("#zip-button");
  if (zip && state.weeks.length >= Number(state.input?.weeks || 0)) zip.disabled = false;
  const regenerate = $("#regenerate-week-button");
  if (regenerate && !isGitHubPages) regenerate.disabled = false;
}

function hideAiActivity() {
  clearTimeout(aiActivityHideTimer);
  $("#ai-activity")?.classList.add("hidden");
}

function setAiActivity(title, detail, { progress = null, tone = "working" } = {}) {
  const activity = $("#ai-activity");
  if (!activity) return;
  clearTimeout(aiActivityHideTimer);
  activity.classList.remove("hidden", "is-success", "is-error", "is-indeterminate");
  if (tone === "success") activity.classList.add("is-success");
  if (tone === "error") activity.classList.add("is-error");
  if (progress == null) activity.classList.add("is-indeterminate");
  activity.setAttribute("aria-busy", tone === "working" ? "true" : "false");
  $("#ai-activity-title").textContent = title;
  $("#ai-activity-detail").textContent = detail;
  const progressBar = $("#ai-activity-progress");
  if (progressBar) progressBar.style.width = progress == null ? "36%" : `${Math.max(0, Math.min(100, progress))}%`;
}

function finishAiActivity(title, detail, tone = "success", delay = tone === "error" ? 9000 : 2600) {
  setAiActivity(title, detail, { tone, progress: tone === "success" ? 100 : null });
  aiActivityHideTimer = setTimeout(hideAiActivity, delay);
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
    const error = new Error(`${fallbackMessage} (HTTP ${response.status}). ${detail || response.statusText || "Resposta vazia."}${timeoutHint}`);
    error.status = response.status;
    error.retryable = [408, 425, 429, 500, 502, 503, 504].includes(response.status) || Boolean(timeoutHint);
    throw error;
  }
  if (!response.ok || !data?.ok) {
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterMs = Number(data?.retryAfterMs || (retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0)) || 0;
    const codeHint = data?.code === "AI_TPM_LIMIT"
      ? " O limite de tokens por minuto do provedor foi atingido; aguarde a janela indicada antes de tentar novamente."
      : data?.code === "AI_REQUEST_TOO_LARGE"
        ? " O contexto enviado ficou grande demais para esta chamada; reduza o briefing ou gere uma semana por vez."
        : data?.code === "AI_KEY_MISSING"
          ? " A chave do provedor ativo não está configurada na Vercel."
          : "";
    const error = new Error(`${data?.error || `${fallbackMessage} (HTTP ${response.status}).`}${codeHint}`);
    error.status = response.status;
    error.code = data?.code || "API_REQUEST_ERROR";
    error.retryAfterMs = retryAfterMs;
    error.retryable = Boolean(data?.retryable) || [408, 425, 429, 500, 502, 503, 504].includes(response.status);
    throw error;
  }
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
  if (aiActionBusy) return;
  const input = formInput();
  const accessCode = input.accessCode;
  delete input.accessCode;
  if (!input.title.trim()) {
    const message = "Informe primeiro o tema geral ou título do curso para a IA saber o que completar.";
    showAssistantMessage(message, true);
    finishAiActivity("Preenchimento não iniciado", message, "error", 6500);
    $("#course-title").focus();
    return;
  }
  const missingFields = briefingMissingFields(input);
  if (!missingFields.length) {
    const message = "Não há campos vazios prioritários. Você pode revisar o briefing ou gerar as aulas.";
    showAssistantMessage(message);
    finishAiActivity("Nada a preencher", message, "success");
    return;
  }
  const button = $("#assist-button");
  if (!beginAiAction(button)) return;
  button.dataset.label = "Preencher vazios com IA";
  setBusy(button, true, "Preenchendo…");
  setAiActivity("Preenchendo vazios com IA", `A IA está analisando ${missingFields.length} campo(s) do briefing…`);
  showAssistantMessage("A IA está analisando o tema e preparando sugestões pedagógicas…");
  try {
    const headers = { "Content-Type": "application/json" };
    if (accessCode) headers["x-aula-access-code"] = accessCode;
    const response = await fetch("/api/assist-briefing", { method: "POST", headers, body: JSON.stringify({ input, missingFields }) });
    const data = await readApiResponse(response, "Não foi possível preencher o briefing.");
    setAiActivity("Aplicando sugestões da IA", "Organizando objetivos, materiais e campos de webpráticas…", { progress: 82 });
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
    const message = filled.length ? `Campos preenchidos: ${filled.join(", ")}. Revise as sugestões antes de gerar as aulas.${note}` : "A IA não encontrou campos vazios que pudesse completar com segurança.";
    showAssistantMessage(message);
    finishAiActivity("Preenchimento concluído", filled.length ? `${filled.length} grupo(s) de campo(s) atualizado(s). Revise antes de gerar.` : message, "success");
  } catch (error) {
    showAssistantMessage(error.message, true);
    finishAiActivity("Preenchimento não concluído", error.message, "error");
  } finally {
    setBusy(button, false, "");
    endAiAction();
  }
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
  const sourceLink = resource.href ? `<a href="${escapeHtml(resource.href)}" target="_blank" rel="noreferrer">Abrir fonte</a>` : `<span class="reader-resource-pending">Curadoria pendente: ${escapeHtml(resource.searchQuery || "a confirmar")} · somente Material de Mediação</span>`;
  const approval = resource.humanApproval === "approved" || resource.verificationStatus === "verified" ? "Conferido" : resource.href ? "Link localizado · revisão humana pendente" : "Não exportado ao aluno até haver URL real";
  const detail = [resource.pedagogicalUse || resource.objective, resource.source, resource.license, approval].filter(Boolean).join(" · ");
  const bridge = resource.bridgeParagraph || resource.connectionParagraph || resource.pedagogicalUse || `Use este recurso neste ponto para relacionar ${title} ao conceito explicado na seção e registrar o que ele confirma, exemplifica ou problematiza.`;
  return `<div class="reader-resource reader-resource-inline"><div class="reader-resource-context"><div class="reader-resource-heading"><strong>${escapeHtml(title)}</strong>${sourceLink}</div><p class="reader-resource-bridge">${escapeHtml(bridge)}</p>${media}<small>${escapeHtml(detail || "Recurso contextualizado para esta seção.")}</small></div></div>`;
}

function compositionPreview(entry = {}) {
  const type = String(entry.type || entry.kind || "bloco").toLowerCase();
  const labels = { destaque: "Destaque", atencao: "Atenção", reflexao: "Reflexão", citacao: "Citação", imagem: "Imagem", accordion: "Acordeão", flashcards: "Flashcards", quiz: "Quiz formativo", cases: "Casos", feature: "Pontos-chave", tabela: "Tabela comparativa", slider: "Passo a passo", linhadotempo: "Linha do tempo", columns: "Colunas", externalembed: "Conteúdo externo", pitaco: "Comentário (pitaco)", audio: "Áudio / podcast", parallax: "Imagem parallax", textoimagem: "Texto + imagem", filmstrip: "Carrossel" };
  const title = entry.title || entry.label || labels[type] || "Bloco do ClassAtelier";
  const body = entry.body || entry.question || entry.intro || entry.description || entry.quote || "";
  const collection = entry.items || entry.cards || entry.steps || entry.questions || entry.features || entry.eras || entry.columns || entry.rows;
  const itemLabel = (item) => Array.isArray(item)
    ? item.join(" · ")
    : item.title || item.front || item.q || item.question || item.prompt || item.text || item.body || item.answer || item.definition || item.label || "Conteúdo específico da seção";
  const rows = Array.isArray(collection) ? collection.slice(0, 6).map((item) => `<li>${escapeHtml(itemLabel(item))}</li>`).join("") : "";
  const hasMedia = Boolean(entry.src || entry.href);
  const media = hasMedia ? `<img src="${escapeHtml(entry.src || entry.href)}" alt="${escapeHtml(entry.caption || title)}" loading="lazy" />` : (["imagem", "parallax", "textoimagem"].includes(type) ? `<p class="reader-resource-pending">Espaço reservado para a imagem: ainda não há arquivo. Este bloco só entra no material do aluno quando tiver imagem.</p>` : "");
  return `<div class="reader-composition reader-composition-${escapeHtml(type)}"><div class="reader-composition-kicker">${escapeHtml(labels[type] || "Bloco ClassAtelier")}</div><strong>${escapeHtml(title)}</strong>${paragraphsMarkup(body)}${media}${rows ? `<ul>${rows}</ul>` : ""}</div>`;
}

const compositionCardLabels = { destaque: "Destaque", atencao: "Atenção", reflexao: "Reflexão", citacao: "Citação", imagem: "Imagem", parallax: "Parallax", textoimagem: "Texto + imagem", cases: "Casos", feature: "Pontos-chave", tabela: "Tabela", filmstrip: "Carrossel", audio: "Áudio", accordion: "Acordeão", flashcards: "Flashcards", slider: "Passo a passo", linhadotempo: "Linha do tempo", columns: "Colunas", quiz: "Quiz formativo", externalembed: "Conteúdo externo" };

function compositionSummaryForLesson(lesson = {}) {
  const entries = Array.isArray(lesson.lessonPlan?.composition?.entries) ? lesson.lessonPlan.composition.entries : [];
  const counts = new Map();
  entries.forEach((entry) => {
    const type = String(entry?.type || "").toLowerCase();
    if (type) counts.set(type, (counts.get(type) || 0) + 1);
  });
  return [...counts.entries()].map(([type, count]) => `${count} ${compositionCardLabels[type] || type}`).join(" · ");
}

function resourceCoverageSummary(coverage = {}) {
  const labels = { videos: "Vídeos", images: "Imagens", readings: "Leituras" };
  return Object.entries(labels).map(([key, label]) => {
    const item = coverage[key];
    if (!item || Number(item.requested || 0) <= 0) return "";
    const selected = Number(item.selected || 0);
    const candidates = Number(item.candidates || 0);
    const suffix = candidates && candidates !== selected ? ` · ${candidates} candidatos` : "";
    return `${label}: ${item.requested} solicitados · ${selected} encontrados${suffix}`;
  }).filter(Boolean).join(" | ");
}

function collectNestedBlockTypes(blocks = [], output = []) {
  (blocks || []).forEach((block) => {
    if (block?.type) output.push(block.type);
    if (Array.isArray(block?.props?.children)) collectNestedBlockTypes(block.props.children, output);
  });
  return output;
}

function mediationMessagesMarkup(messages = {}, theme = "a semana", weekNumber = 1) {
  const hasMessages = (Array.isArray(messages.whatsapp) && messages.whatsapp.length) || (Array.isArray(messages.moodle) && messages.moodle.length);
  const resolved = hasMessages ? messages : {
    whatsapp: [
      { timing: "Abertura", text: `Oi, pessoal! Nesta semana vamos estudar “${theme}”. Comecem pela abertura e tragam uma pergunta para a conversa.` },
      { timing: "Acompanhamento", text: "Um pouco por dia já ajuda bastante. Anotem uma dúvida ou uma conexão com a prática; o cérebro agradece e o prazo também." },
      { timing: "Fechamento", text: "Antes de encerrar, revisem a síntese e registrem a principal descoberta da semana." }
    ],
    moodle: [
      { timing: "Abertura da semana", text: `Olá, turma! A semana ${weekNumber} organiza o estudo de “${theme}” em uma sequência de leitura, aplicação e reflexão.` },
      { timing: "Acompanhamento", text: "Reserve um horário para o texto-base e participe do espaço de discussão com uma conexão, pergunta ou exemplo." },
      { timing: "Fechamento", text: "Conclua a atividade prevista, revise a síntese e envie a evidência solicitada." }
    ]
  };
  const channel = (label, channelKey, items) => {
    const rows = Array.isArray(items) ? items : [];
    return `<div class="mediation-channel"><h4>${escapeHtml(label)}</h4>${rows.length ? rows.map((item, messageIndex) => `<article class="mediation-message-card" data-message-channel="${escapeHtml(channelKey)}" data-message-index="${messageIndex}"><div class="mediation-message-heading"><strong>${escapeHtml(item.timing || item.when || "Momento da semana")}</strong><span>${escapeHtml(item.relatedType || "mediação")}</span></div>${item.purpose ? `<small class="mediation-message-purpose">${escapeHtml(item.purpose)}</small>` : ""}<label><span>Tom desta mensagem</span><input class="mediation-message-tone" type="text" value="${escapeHtml(item.tone || (channelKey === "whatsapp" ? "próximo, acolhedor e com humor leve" : "acolhedor, claro e organizado"))}" placeholder="Ex.: mais direto, empático e informal" /></label><label><span>Informações específicas para a IA</span><textarea class="mediation-message-instructions" rows="2" placeholder="Ex.: mencione a dúvida recorrente sobre o conceito 2; lembre que a atividade vale como fórum.">${escapeHtml(item.instructions || "")}</textarea></label><label><span>Mensagem pronta para revisar</span><textarea class="mediation-message-text" rows="5">${escapeHtml(item.text || item.message || item.body || "Mensagem a revisar.")}</textarea></label><div class="mediation-message-actions"><button class="button button-secondary mediation-regenerate" type="button" data-message-channel="${escapeHtml(channelKey)}" data-message-index="${messageIndex}">Refazer esta mensagem com IA <span>↻</span></button><small>Você pode editar o texto diretamente antes de enviar.</small></div></article>`).join("") : "<p>Mensagem ainda não detalhada.</p>"}</div>`;
  };
  return `<section class="reader-mediation"><div class="reader-mediation-label">MATERIAL DE MEDIAÇÃO · USO DO PROFESSOR</div><h3>Mensagens de acompanhamento</h3><p>Estas mensagens não entram no JSON do aluno. Cada cartão pode ser editado, receber um tom próprio e ser refeito pela IA com informações específicas.</p>${channel("WhatsApp", "whatsapp", resolved.whatsapp)}${channel("Mensagens do Moodle", "moodle", resolved.moodle)}</section>`;
}

async function regenerateMediationMessage(button) {
  const index = state.previewIndex;
  const channel = button?.dataset.messageChannel;
  const messageIndex = Number(button?.dataset.messageIndex);
  const guide = index == null ? null : state.teacherGuides?.[index];
  const message = guide?.mediationMessages?.[channel]?.[messageIndex];
  const card = button?.closest(".mediation-message-card");
  if (!message || !card || !Number.isInteger(messageIndex)) return;
  if (isGitHubPages) { showError("A refação de mensagens fica disponível na versão Vercel com IA."); return; }
  if (aiActionBusy || !beginAiAction(button)) return;
  const dialog = $(".lesson-dialog");
  const dialogScroll = dialog?.scrollTop || 0;
  const tone = card.querySelector(".mediation-message-tone")?.value.trim() || "";
  const instructions = card.querySelector(".mediation-message-instructions")?.value.trim() || "";
  const currentText = card.querySelector(".mediation-message-text")?.value.trim() || message.text || "";
  message.tone = tone;
  message.instructions = instructions;
  message.text = currentText;
  setBusy(button, true, "Refazendo…");
  setAiActivity("Refazendo mensagem", `A IA está reescrevendo a mensagem de ${channel === "moodle" ? "Moodle" : "WhatsApp"} para ${message.timing || "este momento"}…`);
  try {
    const stop = (guide.mediationStops || []).find((item) => item.id === message.relatedId) || {};
    const response = await fetch("/api/regenerate-message", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ input: state.input, weekNumber: index + 1, theme: state.weeks[index]?.lessonPlan?.theme, channel, timing: message.timing, purpose: message.purpose, studentNeed: message.studentNeed, teacherIntent: message.teacherIntent, currentText, tone, instructions, relatedContext: stop })
    });
    const data = await readApiResponse(response, "Não foi possível refazer esta mensagem.");
    Object.assign(message, data.message || {});
    saveDraft("mensagem de mediação");
    renderLessonPreview(state.weeks[index], index);
    if (dialog) dialog.scrollTop = dialogScroll;
    finishAiActivity("Mensagem refeita", `A mensagem de ${channel === "moodle" ? "Moodle" : "WhatsApp"} foi atualizada. Revise antes de enviar.`, "success");
  } catch (error) {
    showError(error.message);
    finishAiActivity("Mensagem não refeita", error.message, "error");
  } finally {
    endAiAction();
  }
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
    const figures = (section.figures || []).map((figure) => figure.src ? `<figure class="reader-figure"><img src="${escapeHtml(figure.src)}" alt="${escapeHtml(figure.description || figure.caption || "Figura")}" loading="lazy" /><figcaption>${escapeHtml((figure.caption || figure.description || "").replace(/[.\s]+$/, ""))}. <em>Ilustração criada por IA · revisar antes de publicar.</em></figcaption></figure>` : `<p class="reader-resource-pending">Figura prevista (ainda sem ilustração): ${escapeHtml(figure.description)}</p>`).join("");
    return `<section><h3>${escapeHtml(`${section.number || ""} ${section.title || "Seção"}`.trim())}</h3>${paragraphsMarkup(section.body)}${figures}${composition}${resources}${subs}${caseMarkup}${reflection}</section>`;
  }).join("");
  const globalResources = Object.values(allResources).flat().filter((resource) => resource && !sections.some((section) => (section.resources || []).some((item) => item.id && item.id === resource.id))).slice(0, 12).map(resourcePreview).join("");
  const glossary = (plan.glossary || []).length ? `<section><h3>Glossário</h3><ul>${plan.glossary.map((item) => `<li><strong>${escapeHtml(item.term || "Termo")}</strong>: ${escapeHtml(item.definition || "")}</li>`).join("")}</ul></section>` : "";
  const referenceStatus = { verified: "conferida", "provided-needs-review": "link informado · conferir", "needs-human-review": "conferir antes de publicar", "suggested-no-url": "sem link · conferir" };
  const references = (plan.references || []).length
    ? `<section class="reader-references"><h3>Referências bibliográficas (${plan.references.length})</h3><p><small>No padrão ABNT NBR 6023, em ordem alfabética. Escritas pelo modelo a partir do que ele conhece: confira cada uma (autor, ano, edição, link, data de acesso) antes de liberar a semana.</small></p><ol>${plan.references.map((item) => { const citation = item.citation || item.title || item.href || "Referência"; const status = referenceStatus[item.verificationStatus] || "conferir antes de publicar"; const link = item.href ? ` <a href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">abrir</a>` : ""; return `<li>${escapeHtml(citation).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")}${link} <small>· ${escapeHtml(status)}</small></li>`; }).join("")}</ol></section>`
    : `<section class="reader-warning"><h3>Referências bibliográficas</h3><p>Esta semana ainda não tem referências. Escolha “Refazer a semana inteira” na prévia para gerá-las.</p></section>`;
  const letters = ["A", "B", "C", "D", "E", "F"];
  const questionMarkup = (q, position) => {
    const options = Array.isArray(q.options) ? q.options : [];
    const feedback = Array.isArray(q.feedbackByOption) ? q.feedbackByOption : [];
    const correct = Number.isInteger(q.answer) ? q.answer : -1;
    const optionsMarkup = options.length ? `<ul class="reader-quiz-options">${options.map((option, optionIndex) => `<li class="${optionIndex === correct ? "is-correct" : ""}"><strong>${letters[optionIndex] || optionIndex + 1})</strong> ${escapeHtml(option)}${optionIndex === correct ? " <em>(correta)</em>" : ""}${feedback[optionIndex] ? `<small>Feedback: ${escapeHtml(feedback[optionIndex])}</small>` : ""}</li>`).join("")}</ul>` : "";
    return `<li><strong>${escapeHtml(q.q || q.question || "")}</strong>${optionsMarkup}${q.explanation ? `<small>${escapeHtml(q.explanation)}</small>` : ""}</li>`;
  };
  const assessment = (plan.assessment?.questions || []).length
    ? `<section class="reader-assessment"><h3>${escapeHtml(plan.assessment.title || "Atividade avaliativa")} (${plan.assessment.questions.length} questões)</h3><p>${escapeHtml(plan.assessment.format || "Questões alinhadas aos objetivos")}</p><ol>${plan.assessment.questions.map(questionMarkup).join("")}</ol></section>`
    : `<section class="reader-warning reader-assessment"><h3>Atividade avaliativa (questões)</h3><p>${lesson?.generationMeta?.derivativesPending ? "As questões, as atividades e o Material de Mediação ainda não foram gerados para esta semana (o texto está salvo)." : "Esta semana ainda não tem questões."}</p><button type="button" class="secondary" id="retry-derivatives-button">Gerar questões, atividades e mediação agora</button></section>`;
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
  const mediation = mediationMessagesMarkup(guide.mediationMessages, plan.theme || lesson?.meta?.title || `a semana ${index + 1}`, index + 1)
    + (guide.weekSummary && guide.studentFAQ?.length ? "" : `<section class="reader-warning"><h3>Explicações para o professor</h3><p>Esta semana ainda não tem o resumo, as perguntas prováveis dos alunos, os equívocos comuns e os sinais de alerta que entram no Material de Mediação. O texto da semana não é alterado.</p><button type="button" class="secondary" id="retry-explain-button">Completar explicações do Material de Mediação</button></section>`);
  $("#lesson-modal-eyebrow").textContent = `PRÉVIA · SEMANA ${String(index + 1).padStart(2, "0")}`;
  $("#lesson-modal-title").textContent = plan.theme || lesson?.meta?.title || `Semana ${index + 1}`;
  $("#lesson-reader").innerHTML = `${validationIssue}${issue}${academicIssue}<div class="reader-callout"><strong>Arco desta semana:</strong> ${escapeHtml(arc.label || "Arco variável")} · ${escapeHtml(phaseSummary || "progressão definida pelo conteúdo")}</div><div class="reader-welcome">${paragraphsMarkup(plan.welcome || "Abertura da semana ainda não foi preenchida.")}</div><section class="reader-objectives"><h3>Objetivos de aprendizagem</h3><ul>${objectives.map((objective) => `<li>${escapeHtml(objective)}</li>`).join("")}</ul></section>${diagnostic}${sectionsMarkup}${activities}${formative}${globalResources ? `<section><h3>Recursos gerais</h3>${globalResources}</section>` : ""}${plan.synthesis ? `<section><h3>Síntese</h3>${paragraphsMarkup(plan.synthesis)}</section>` : ""}${plan.nextWeekConnection ? `<section><h3>Conexão com a próxima semana</h3>${paragraphsMarkup(plan.nextWeekConnection)}</section>` : ""}${differentiation}${selfAssessment}${glossary}${references}${assessment}${alignment}${timeMarkup}${workload}${mediation}${productionMarkup(index, weekReleased(index) || manuallyApproved || ["ready", "complete"].includes(automaticStatus))}`;
  renderFlowPanel(index);
  $("#retry-derivatives-button")?.addEventListener("click", () => retryDerivatives(index));
  $("#retry-explain-button")?.addEventListener("click", (event) => retryDerivatives(index, { parts: ["explain"], button: event.currentTarget }));
  $("#production-week-button")?.addEventListener("click", () => generateProductionWeek(index));
  $("#production-sheet-button-card")?.addEventListener("click", downloadProductionSheet);
  $("#production-md-button")?.addEventListener("click", downloadProductionMarkdown);
  $("#lesson-reader").querySelectorAll(".mediation-regenerate").forEach((button) => button.addEventListener("click", () => regenerateMediationMessage(button)));
  $("#lesson-reader").querySelectorAll(".mediation-message-card").forEach((card) => {
    const channel = card.dataset.messageChannel;
    const messageIndex = Number(card.dataset.messageIndex);
    const currentGuide = state.teacherGuides[index] || (state.teacherGuides[index] = {});
    const guideMessages = currentGuide.mediationMessages || (currentGuide.mediationMessages = { whatsapp: [], moodle: [] });
    guideMessages[channel] ||= [];
    const message = guideMessages[channel][messageIndex] || (guideMessages[channel][messageIndex] = {
      timing: card.querySelector(".mediation-message-heading strong")?.textContent || `Momento ${messageIndex + 1}`,
      relatedType: card.querySelector(".mediation-message-heading span")?.textContent || "mediação",
      tone: card.querySelector(".mediation-message-tone")?.value || "",
      instructions: card.querySelector(".mediation-message-instructions")?.value || "",
      text: card.querySelector(".mediation-message-text")?.value || ""
    });
    if (!message) return;
    [[".mediation-message-tone", "tone"], [".mediation-message-instructions", "instructions"], [".mediation-message-text", "text"]].forEach(([selector, key]) => card.querySelector(selector)?.addEventListener("input", (event) => {
      message[key] = event.target.value;
      scheduleSave();
    }));
  });
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

// Depois de uma alteração pontual, atualiza no checklist pedagógico só os itens desta semana
// (a própria semana já traz a revisão recalculada), sem refazer o curso inteiro.
function refreshChecklistFromWeek(index) {
  const plan = state.generalPlan;
  const checks = state.weeks?.[index]?.lessonPlan?.pedagogicalReview?.checks;
  if (!plan || !Array.isArray(checks)) return;
  const weekNumber = index + 1;
  const others = (plan.pedagogicalChecklist || []).filter((item) => Number(item.weekNumber) !== weekNumber);
  const fresh = checks.map((check) => ({ ...check, weekNumber }));
  plan.pedagogicalChecklist = [...others, ...fresh].sort((a, b) => Number(a.weekNumber) - Number(b.weekNumber));
  renderGeneralPlan(plan);
}

// Gera só a avaliação, as atividades e a mediação de uma semana cujo texto já está salvo.
async function retryDerivatives(index, options = {}) {
  if (aiActionBusy) return;
  const parts = Array.isArray(options.parts) && options.parts.length ? options.parts : null;
  const button = options.button || $("#retry-derivatives-button");
  if (!beginAiAction(button)) return;
  setBusy(button, true, "Gerando…");
  const partsText = parts ? parts.map((part) => PARTS_LABEL[part] || part).join(" e ") : "as questões (com feedback por alternativa), as atividades e as mensagens";
  setAiActivity("Questões e mediação", `Gerando de novo ${partsText} da semana ${index + 1} a partir do texto salvo; o texto não é alterado…`);
  try {
    const input = formInput();
    const accessCode = input.accessCode || $("#access-code")?.value || "";
    delete input.accessCode;
    const headers = { "Content-Type": "application/json" };
    if (accessCode) headers["x-aula-access-code"] = accessCode;
    const response = await fetch("/api/derivatives", { method: "POST", headers, body: JSON.stringify({ action: "derivatives", input, weekIndex: index, week: state.weeks[index], teacherGuide: state.teacherGuides[index], ...(parts ? { parts } : {}) }) });
    const done = await readApiResponse(response, `Não foi possível gerar ${partsText} da semana ${index + 1}.`);
    state.weeks[index] = done.week; if (state.studioEdits) delete state.studioEdits[index];
    state.teacherGuides[index] = done.teacherGuide || state.teacherGuides[index];
    saveDraft("derivados-gerados");
    refreshChecklistFromWeek(index);
    if (parts) renderWeeks({ input: state.input, weeks: state.weeks, workload: state.workload, generalPlan: state.generalPlan, teacherGuides: state.teacherGuides, provider: state.provider, validation: state.validation }, { scrollToResults: false });
    else openLessonPreview(index);
    finishAiActivity("Gerado", parts ? `Foram geradas de novo ${partsText} da semana ${index + 1}; o texto ficou como estava. Confira na prévia.` : `A semana ${index + 1} agora tem questões, atividades e mediação. Revise e aprove.`, "success");
  } catch (error) {
    finishAiActivity("Questões não geradas", error.message, "error");
    const note = $("#regenerate-note");
    if (note) note.textContent = `As questões NÃO foram geradas: ${error.message}`;
  } finally {
    setBusy(button, false, "");
    endAiAction();
  }
}

// Alteração pontual (só o título, ou só os trechos pedidos): não reescreve a semana,
// preserva questões, recursos, figuras e mediação já conferidos.
async function applyTargetedEdit(index, instruction, scope) {
  const button = $("#regenerate-week-button");
  if (!beginAiAction(button)) return;
  button.dataset.label = "Aplicar alteração com IA";
  setBusy(button, true, "Alterando…");
  const label = scope === "title" ? "o título" : "os trechos pedidos";
  setAiActivity("Alterando a semana", `A IA está ajustando ${label} da semana ${index + 1}, sem reescrever o resto…`);
  $("#regenerate-note").textContent = `Alterando ${label}; o restante da semana não será tocado…`;
  try {
    const input = formInput();
    const accessCode = input.accessCode || $("#access-code")?.value || "";
    delete input.accessCode;
    const headers = { "Content-Type": "application/json" };
    if (accessCode) headers["x-aula-access-code"] = accessCode;
    const theme = (week) => week?.lessonPlan?.theme || week?.meta?.title || "";
    const response = await fetch("/api/regenerate-week", { method: "POST", headers, signal: AbortSignal.timeout(280000), body: JSON.stringify({ action: "edit", scope, input, weekIndex: index, instruction, week: { ...state.weeks[index], teacherGuide: state.teacherGuides[index] }, previousTheme: index > 0 ? theme(state.weeks[index - 1]) : "", nextTheme: theme(state.weeks[index + 1]) }) });
    const done = await readApiResponse(response, "Não foi possível alterar a semana.");
    state.weeks[index] = done.week; if (state.studioEdits) delete state.studioEdits[index];
    saveDraft("semana-alterada");
    refreshChecklistFromWeek(index);
    renderWeeks({ input: state.input, weeks: state.weeks, workload: state.workload, generalPlan: state.generalPlan, teacherGuides: state.teacherGuides, provider: state.provider, validation: state.validation }, { scrollToResults: false });
    openLessonPreview(index);
    const skipped = done.skipped?.length ? ` (${done.skipped.length} alteração(ões) não aplicada(s) por apontarem para um trecho que não existe)` : "";
    $("#regenerate-note").textContent = `${done.summary || "Alteração aplicada."}${skipped} O resto da semana ficou como estava.`;
    finishAiActivity("Semana alterada", done.summary || "Alteração aplicada.", "success");
  } catch (error) {
    $("#regenerate-note").textContent = `A semana NÃO foi alterada: ${error.message}`;
    finishAiActivity("Semana não alterada", error.message, "error");
  } finally {
    setBusy(button, false, "");
    endAiAction();
  }
}

async function regenerateSelectedWeek() {
  const index = state.previewIndex;
  const instruction = $("#week-revision").value.trim();
  if (index == null || !instruction) { $("#regenerate-note").textContent = "Escreva primeiro o que deseja alterar nesta semana."; return; }
  if (isGitHubPages) { $("#regenerate-note").textContent = "A regeneração por IA fica disponível na URL Vercel com backend protegido."; return; }
  if (aiActionBusy) return;
  const scope = $("#week-revision-scope")?.value || "edit";
  if (scope !== "full") return applyTargetedEdit(index, instruction, scope);
  const button = $("#regenerate-week-button");
  if (!beginAiAction(button)) return;
  button.dataset.label = "Aplicar alteração com IA";
  setBusy(button, true, "Refazendo…");
  setAiActivity("Refazendo semana", `A IA está lendo a semana ${index + 1} e preparando uma nova versão…`);
  $("#regenerate-note").textContent = "A IA está reescrevendo somente esta semana e preservando o restante do curso…";
  try {
    const input = formInput();
    const accessCode = input.accessCode || $("#access-code")?.value || "";
    delete input.accessCode;
    state.input = input;
    const headers = { "Content-Type": "application/json" };
    if (accessCode) headers["x-aula-access-code"] = accessCode;
    const response = await fetch("/api/regenerate-week", { method: "POST", headers, body: JSON.stringify({ input, weekIndex: index, instruction, weeks: state.weeks, teacherGuides: state.teacherGuides }) });
    const data = await readApiResponse(response, "Não foi possível refazer a semana.");
    state.weeks = data.weeks || state.weeks;
    state.teacherGuides = data.teacherGuides || state.teacherGuides;
    saveDraft("semana-refeita");
    const completed = await completeDerivativesStep({ ...data, week: data.weeks?.[index], teacherGuide: data.teacherGuides?.[index], resourcesDeferred: true }, input, index, headers, button);
    const enriched = await illustrateGeneratedWeek(await enrichGeneratedWeek(completed, input, index, headers, button), input, index, headers, button);
    if (enriched.week) data.weeks[index] = enriched.week;
    if (enriched.teacherGuide) data.teacherGuides[index] = enriched.teacherGuide;
    data.resourcesPending = enriched.resourcesPending;
    await afterWeekRewritten(index);
    setAiActivity("Validando a nova semana", "Atualizando qualidade, carga e prévia sem alterar as outras semanas…", { progress: 86 });
    renderWeeks(data);
    $("#regenerate-note").textContent = "Semana atualizada. Confira a nova versão abaixo antes de exportar.";
    openLessonPreview(index);
    finishAiActivity("Semana refeita", `A semana ${index + 1} foi atualizada. Revise a nova versão antes de exportar.`, "success");
  } catch (error) {
    $("#regenerate-note").textContent = `A semana NÃO foi alterada: ${error.message}`;
    $("#regenerate-note").scrollIntoView({ block: "center", behavior: "smooth" });
    finishAiActivity("Semana não refeita", error.message, "error");
  } finally {
    setBusy(button, false, "");
    endAiAction();
  }
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
  return weeks.map((_, index) => ({ weekNumber: index + 1, title: `${input.title} - Semana ${index + 1}`, purpose: "Orientar a aprendizagem da semana e revisar a coerência entre objetivos, conteúdo, atividades e avaliação.", didacticArc: { id: "descoberta-conceitual", label: "Descoberta conceitual", rationale: "Arco de exemplo para o modo público.", sequence: ["contexto", "conceito", "exemplo", "reflexao", "sintese"] }, objectives: input.objectives, alignmentMatrix: [], mediationQuestions: [], commonMisconceptions: [], interventions: [], differentiation: { support: [], standard: [], extension: [] }, accessibility: [], assessmentNotes: [], qualityReview: { status: "review", checks: [{ label: "Exemplo local: revise a semana antes de usar.", pass: false }] }, mediationMessages: { whatsapp: [{ timing: "Abertura", text: `Oi, pessoal! Nesta semana vamos estudar ${input.title}. Comecem pela abertura e tragam uma pergunta para a conversa.` }, { timing: "Acompanhamento", text: "Um pouco por dia já ajuda bastante. O texto não precisa ser encarado como uma montanha de uma vez." }, { timing: "Fechamento", text: "Antes de encerrar, revisem a síntese e registrem a principal descoberta da semana." }], moodle: [{ timing: "Abertura", text: `Olá, turma! A semana ${index + 1} organiza o estudo de ${input.title} em uma sequência de leitura, aplicação e reflexão.` }, { timing: "Acompanhamento", text: "Reserve um horário para o texto-base e participe do espaço de discussão com uma conexão ou dúvida." }, { timing: "Fechamento", text: "Conclua a atividade prevista, revise a síntese e envie a evidência solicitada." }] }, webPractices: [], webPracticeProjects: [], workloadAdvice: [] }));
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
  if (item.category === "interactive") return "Interativo ClassAtelier";
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
  interactiveMinutes: "Interativos ClassAtelier",
  quizMinutes: "Quiz/avaliação",
  forumMinutes: "Fórum/discussão",
  practiceMinutes: "Webprática",
  reviewMinutes: "Síntese/revisão",
  projectMinutes: "Projeto/produção",
  otherMinutes: "Outras atividades"
};

function reviewItemKey(item = {}) { return `${item.weekNumber || 0}:${item.id || slugify(item.title || item.label || "item")}`; }

function reviewMarkChecked(kind, item = {}, reviewMarks = state.reviewMarks || createReviewMarks()) {
  const key = reviewItemKey(item);
  const marks = reviewMarks[kind] || {};
  return marks[key] === undefined ? Boolean(item.pass) : Boolean(marks[key]);
}

function reviewCheckChecked(item = {}, reviewMarks = state.reviewMarks || createReviewMarks()) {
  return reviewMarkChecked("checks", item, reviewMarks);
}

// Cada item do checklist tem a sua própria ação, restrita ao que ele aponta:
//   scope "title" | "edit"  -> alteração pontual do texto (o resto da semana não é tocado)
//   scope "derivatives"     -> gera de novo só a(s) parte(s) indicada(s): questões, atividades, mediação
//   scope "full"            -> reescrita da semana (só quando o próprio item exige texto novo em grande parte)
//   scope "manual"          -> conferência humana; não há o que a IA refazer sozinha
const REVIEW_LIMITS_EDIT = "Altere SOMENTE o que este item exige. Preserve todo o resto da semana: título, objetivos, seções, recursos, figuras, questões e atividades que não estejam envolvidos. Não reordene nem reescreva por estilo. Não invente autores, dados, referências, DOI ou URLs; onde faltar base, marque como “a conferir”.";
const PARTS_LABEL = { explain: "as explicações para o professor", assessment: "as questões", activities: "o diagnóstico, as paradas e as atividades", mediation: "o Material de Mediação", webpractice: "a webprática" };

function reviewActionFor(kind, item, lesson) {
  const id = String(item.id || "");
  const sections = lesson?.lessonPlan?.contentSections || [];
  const detail = item.detail || item.status || "";
  const scheduledPractice = (state.generalPlan?.webPracticeSchedule || []).some((practice) => Number(practice.weekNumber) === Number(item.weekNumber));
  const pedagogical = {
    "title-present": { scope: "edit", title: "Como verificar título e abertura", checks: ["O título nomeia o problema, o conceito ou o caso central da semana (e não só o assunto geral).", "A abertura contextualiza a semana e retoma a anterior em um ou dois parágrafos."], ask: "Verifique o título e a abertura (boas-vindas). Se o título for genérico, troque por um específico, que nomeie o problema, o conceito ou o caso central da semana, sem “Semana N” e com até 90 caracteres. Se a abertura estiver ausente ou genérica, escreva-a em um ou dois parágrafos que contextualizem a semana e retomem a anterior. Mude só o título e a abertura.", accept: "Título específico e abertura contextualizada; nenhuma outra parte alterada." },
    "objective-present": { scope: "edit", title: "Como verificar os objetivos", checks: ["Há de 4 a 6 objetivos, cada um com verbo observável (comparar, aplicar, justificar…).", "Cada objetivo é coberto por pelo menos uma seção do texto."], ask: "Reescreva SOMENTE a lista de objetivos de aprendizagem: de 4 a 6 objetivos observáveis (verbo mensurável + objeto + contexto), cada um coberto por uma seção do texto atual. Não altere o texto das seções.", accept: "Lista de objetivos observáveis, coerente com as seções existentes." },
    "content-present": { scope: sections.length < 5 ? "full" : "edit", title: "Como verificar o desenvolvimento do conteúdo", checks: ["Há pelo menos 5 seções e quatro delas com desenvolvimento real (conceito, exemplo, aplicação).", "Nenhuma seção é só uma introdução de duas linhas."], ask: sections.length < 5 ? "O texto tem menos de 5 seções. Acrescente as seções que faltam para cobrir os objetivos, mantendo as existentes exatamente como estão." : "Desenvolva SOMENTE as seções curtas (menos de 120 caracteres de corpo), inserindo parágrafos de aprofundamento: o conceito, um exemplo concreto e, se couber, um contraponto. Não mexa nas seções que já estão desenvolvidas.", accept: "Todas as seções com desenvolvimento real; as já boas permanecem iguais." },
    "alignment-complete": { scope: "derivatives", parts: ["assessment", "activities"], title: "Como verificar o alinhamento", checks: ["Cada objetivo aparece no texto, em uma atividade com evidência e em pelo menos uma questão."], ask: "Gerar de novo apenas as questões e as atividades, de modo que cada objetivo tenha conteúdo, atividade, evidência e questão relacionados.", accept: "Matriz de alinhamento completa; o texto da semana não é tocado." },
    "activity-present": { scope: "derivatives", parts: ["activities"], title: "Como verificar as atividades", checks: ["Existe ao menos uma atividade ativa ou produto observável, com critérios."], ask: "Gerar de novo apenas o diagnóstico, as paradas formativas, as atividades e a autoavaliação.", accept: "Pelo menos uma atividade com evidência e critérios." },
    "diagnostic-present": { scope: "derivatives", parts: ["activities"], title: "Como verificar o diagnóstico", checks: ["Há uma pergunta de entrada ligada ao dia a dia do estudante, ou a ausência está justificada."], ask: "Gerar de novo apenas o diagnóstico, as paradas formativas, as atividades e a autoavaliação.", accept: "Diagnóstico de entrada presente." },
    "formative-present": { scope: "derivatives", parts: ["activities"], title: "Como verificar as paradas formativas", checks: ["Há de 2 a 4 checagens ao longo das seções, cada uma com o que fazer se o estudante errar."], ask: "Gerar de novo apenas o diagnóstico, as paradas formativas, as atividades e a autoavaliação.", accept: "De 2 a 4 paradas formativas com ação de correção." },
    "summative-alignment": { scope: "derivatives", parts: ["assessment"], title: "Como verificar a avaliação final", checks: ["As 6 questões cobrem todos os objetivos, têm 5 alternativas e feedback em todas.", "A explicação da correta cita o texto da semana."], ask: "Gerar de novo apenas as questões da atividade avaliativa (6 questões, 5 alternativas, feedback em todas).", accept: "Questões alinhadas aos objetivos, com feedback por alternativa." },
    "practice-complete": { scope: "derivatives", parts: [scheduledPractice ? "webpractice" : "mediation"], title: "Como verificar a webprática", checks: ["A webprática tem produto, etapas, critérios e plano B."], ask: scheduledPractice ? "Gerar de novo apenas o projeto da webprática (produto, etapas, critérios e plano B)." : "Gerar de novo apenas o Material de Mediação.", accept: "Webprática com produto, etapas, critérios e plano B." },
    "self-assessment": { scope: "derivatives", parts: ["activities"], title: "Como verificar a autoavaliação", checks: ["O estudante recebe perguntas de autoavaliação com escala, ou uma reflexão final."], ask: "Gerar de novo apenas o diagnóstico, as paradas formativas, as atividades e a autoavaliação.", accept: "Autoavaliação presente." },
    "resource-context": { scope: "edit", title: "Como verificar a função dos recursos", checks: ["Em cada recurso “Veja mais aqui”, o parágrafo diz o que observar e por que vale abrir.", "A função pedagógica cabe em uma frase e aponta o objetivo atendido."], ask: "Para os recursos que estão sem parágrafo de ligação ou sem função pedagógica, escreva a ligação (o que observar e por que vale abrir, em duas ou três frases, no ponto do texto em que o recurso aparece) e a função pedagógica (uma frase). Mude somente esses dois campos, só nos recursos que estiverem vazios ou genéricos; não troque links nem mexa no texto das seções.", accept: "Todo recurso com ligação e função pedagógica específicas; links e texto inalterados." },
    accessibility: { scope: "edit", title: "Como verificar a acessibilidade", checks: ["Imagens e figuras têm texto alternativo que descreve o que importa, em uma frase.", "Vídeos e áudios: legenda ou transcrição é conferência humana na fonte; a IA não consegue garantir isso."], ask: "Escreva o texto alternativo (uma frase descritiva, sem “imagem de”) SOMENTE das imagens, figuras e recursos visuais que estão sem ele. Não altere links, títulos nem o texto das seções. Para vídeos e áudios, não invente informação sobre legenda ou transcrição.", accept: "Todo recurso visual com texto alternativo; o restante inalterado." },
    differentiation: { scope: "edit", title: "Como verificar as trilhas", checks: ["Há trilha essencial, padrão e de aprofundamento, cada uma com 2 a 3 ações curtas.", "As ações apontam para seções, atividades ou recursos que existem na semana."], ask: "Escreva SOMENTE as três trilhas de estudo — essencial, padrão e aprofundamento —, com 2 a 3 ações curtas cada, ligadas às seções, atividades e recursos que já existem nesta semana. Não altere mais nada.", accept: "Três trilhas preenchidas e coerentes com o conteúdo; o resto igual." }
  };
  if (kind === "checks" && pedagogical[id]) return pedagogical[id];
  if (kind === "academic") {
    if (id.startsWith("academic-issue")) return { scope: "edit", title: "Como verificar esta pendência acadêmica", checks: ["Localize o trecho citado e confirme se a pendência procede.", "Confirme que a correção não introduziu fato, número ou fonte novos sem base."], ask: `Corrija SOMENTE esta pendência: “${item.label || ""}”. ${detail}. Altere apenas as frases envolvidas.`, accept: "A pendência deixa de existir; o resto do texto igual." };
    return { scope: "edit", title: "Como verificar o rigor acadêmico", checks: ["Identifique as afirmações centrais e confirme se cada uma tem fonte adequada e verificável.", "Confira autores, datas, números e generalizações; onde faltar base, qualifique a frase."], ask: "Revise SOMENTE as afirmações centrais que a revisão acadêmica sinalizou: onde faltar base, qualifique a frase (“segundo…”, “em geral…”) ou retire a precisão indevida. Não invente fonte, número nem caso; não mexa no restante.", accept: "Afirmações sem base qualificadas ou retiradas; o restante inalterado." };
  }
  if (kind === "resources") {
    const title = item.label || item.title || "recurso";
    if (id === "resources-ok") return { scope: "edit", title: "Como verificar os recursos", checks: ["Abra cada link e confirme que funciona, corresponde ao título e é adequado ao público.", "Confira duração/páginas, classificação obrigatória ou complementar, idioma e atualidade.", "Confirme legenda, transcrição, crédito e licença na fonte, antes de publicar."], ask: "Revise SOMENTE os parágrafos de ligação dos recursos: onde o parágrafo não disser o que observar e por que vale abrir, reescreva-o em duas ou três frases. Não troque links nem mexa no texto das seções.", accept: "Todo recurso com ligação clara; links e texto inalterados." };
    return { scope: "edit", title: "Como verificar este recurso", checks: ["Abra o link e confirme que funciona, corresponde ao título e é adequado ao público.", "Confira duração/páginas, classificação obrigatória ou complementar, idioma e atualidade.", "Confirme legenda, transcrição, crédito e licença na fonte, antes de publicar."], ask: `O recurso “${title}” está pendente (${detail || "sem verificação"}). Link para usar no lugar: [COLE AQUI O LINK QUE VOCÊ ESCOLHEU — ou apague esta linha para manter o recurso atual]. Se houver link acima, troque SOMENTE o link desse recurso por ele (exatamente como escrito); em qualquer caso, reescreva só o parágrafo de ligação e a função pedagógica desse recurso para o ponto do texto em que ele aparece. Não invente nem complete links.`, accept: "Recurso com o link que você escolheu (se informado), ligação e função pedagógica claras; nada mais alterado." };
  }
  if (kind === "quality") {
    const insufficient = /insuficiente/i.test(detail);
    return { scope: insufficient ? "full" : "edit", title: "Como verificar qualidade e liberação", checks: ["Leia a semana e confirme se cada pendência listada procede.", "Só libere depois de resolver as pendências críticas."], ask: insufficient ? `O conteúdo está insuficiente (${detail}). Amplie e aprofunde o texto, mantendo o que já está bom.` : `Resolva SOMENTE as pendências apontadas: ${detail || "as indicadas no diagnóstico"}.`, accept: "Pendências apontadas resolvidas; o resto igual." };
  }
  return { scope: "edit", title: "Como verificar este item", checks: ["Leia a semana e identifique o ponto exato ligado ao item."], ask: `Resolva SOMENTE o que este item aponta: ${detail || item.label || "item sinalizado"}.`, accept: "Item resolvido; o restante inalterado." };
}

function reviewGuidanceFor(kind, item = {}) {
  const weekNumber = Number(item.weekNumber) || 0;
  const lesson = weekNumber ? state.weeks?.[weekNumber - 1] : null;
  const theme = lesson?.lessonPlan?.theme || lesson?.meta?.title || "tema da semana";
  const courseTitle = state.input?.title || state.generalPlan?.title || "curso";
  const target = weekNumber ? `Semana ${weekNumber} — ${theme}` : "a semana correspondente ao item";
  const issue = item.detail || item.status || (item.pass ? "atendido pela análise automática, mas marcado por você para refazer" : "não atendido na análise automática");
  const action = reviewActionFor(kind, item, lesson);
  const limits = action.scope === "full" ? "Mantenha o que já está bom e não altere as outras semanas. Não invente autores, dados, referências, DOI ou URLs; onde faltar base, marque como “a conferir”." : REVIEW_LIMITS_EDIT;
  const prompt = action.scope === "manual" || action.scope === "derivatives" ? "" : [`Curso: ${courseTitle}.`, `Alvo: ${target}.`, `Item do checklist: ${String(item.label || item.title || "item de revisão").replace(/[.\s]+$/, "")}.`, `Diagnóstico atual: ${String(issue).replace(/[.\s]+$/, "")}.`, ``, `O que fazer: ${action.ask}`, ``, `Limites: ${limits}`, ``, `Critério de aceite: ${action.accept}`].join("\n");
  const scopeNote = { title: "Aplica só ao título.", edit: "Modo “Ajuste pontual”: só os trechos envolvidos mudam.", full: "Este item exige reescrever boa parte do texto; o prompt pede que se mantenha o que já está bom.", derivatives: "Gera de novo só a parte indicada; o texto da semana não é tocado.", manual: "Conferência humana: não há o que a IA refazer sozinha." }[action.scope] || "";
  return { ...action, focus: action.ask, prompt, weekNumber, scopeNote };
}

function reviewGuidanceMarkup(kind, item, key, active) {
  if (!active) return "";
  const guidance = reviewGuidanceFor(kind, item);
  const promptAttribute = escapeHtml(guidance.prompt);
  let buttons = "";
  if (guidance.scope === "derivatives" && guidance.weekNumber) {
    const names = guidance.parts.map((part) => PARTS_LABEL[part]).join(" e ");
    buttons = `<button class="button button-secondary review-regenerate-parts" type="button" data-review-week="${guidance.weekNumber}" data-review-parts="${escapeHtml(guidance.parts.join(","))}">Gerar de novo só ${escapeHtml(names)}</button>`;
  } else if (guidance.prompt) {
    const open = guidance.weekNumber ? `<button class="button button-secondary review-use-prompt" type="button" data-review-week="${guidance.weekNumber}" data-review-scope="${escapeHtml(guidance.scope)}" data-review-prompt="${promptAttribute}">Abrir alteração da semana</button>` : "";
    buttons = `<button class="button button-secondary review-copy-prompt" type="button" data-review-prompt="${promptAttribute}">Copiar prompt</button>${open}`;
  }
  const promptField = guidance.prompt ? `<label class="review-prompt-field"><span>Prompt para solicitar só esta correção</span><textarea readonly rows="9">${escapeHtml(guidance.prompt)}</textarea></label>` : "";
  const derivativesAsk = guidance.scope === "derivatives" ? `<p class="review-guidance-ask">${escapeHtml(guidance.ask)}</p>` : "";
  return `<div class="review-guidance"><div class="review-guidance-header"><strong>${escapeHtml(guidance.title)}</strong><div class="review-guidance-actions">${buttons}</div></div><ul>${guidance.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join("")}</ul>${derivativesAsk}${promptField}<small class="review-guidance-note">${escapeHtml(guidance.scopeNote)} Revise a nova resposta antes de liberar a semana.</small></div>`;
}

function reviewRowsMarkup(kind, items, reviewMarks) {
  return items.map((item) => {
    const key = reviewItemKey(item);
    const override = reviewMarks[kind]?.[key];
    const checked = reviewMarkChecked(kind, item, reviewMarks);
    const stateLabel = override === undefined ? (item.pass ? "Atendido automaticamente pela IA" : "Pendente na análise automática") : (override ? "Marcado por você" : "Desmarcado por você para refazer");
    const scope = item.weekNumber ? `Semana ${item.weekNumber}` : "Curso";
    const active = state.activeReviewGuidance?.kind === kind && state.activeReviewGuidance.key === key;
    const label = item.label || item.title || "Item de revisão";
    return `<div class="review-item"><label class="review-row ${checked ? "is-marked" : ""}"><input type="checkbox" data-review-kind="${escapeHtml(kind)}" data-review-key="${escapeHtml(key)}" ${checked ? "checked" : ""} /><span class="review-row-copy" role="button" tabindex="0" data-review-guidance-kind="${escapeHtml(kind)}" data-review-guidance-key="${escapeHtml(key)}" aria-expanded="${active ? "true" : "false"}"><strong>${escapeHtml(scope)} · ${escapeHtml(label)}</strong><small>${escapeHtml(item.detail || item.status || stateLabel)}${override !== undefined ? ` · ${stateLabel}` : ""}</small></span></label>${reviewGuidanceMarkup(kind, item, key, active)}</div>`;
  }).join("");
}

function reviewPanelMarkup(kind, title, items, summary, emptyText = "Nenhum item registrado.", open = true) {
  const reviewMarks = state.reviewMarks || createReviewMarks();
  const checked = items.filter((item) => reviewMarkChecked(kind, item, reviewMarks)).length;
  const rows = items.length ? reviewRowsMarkup(kind, items, reviewMarks) : `<div class="review-empty">${escapeHtml(emptyText)}</div>`;
  return `<details class="review-panel checklist-${escapeHtml(kind)}" ${open ? "open" : ""}><summary><strong>${escapeHtml(title)}: ${checked}/${items.length || 0} itens atualmente marcados</strong><small>${escapeHtml(summary)}</small></summary><div class="review-list">${rows}</div></details>`;
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

function toggleReviewGuidance(kind, key) {
  const active = state.activeReviewGuidance?.kind === kind && state.activeReviewGuidance.key === key;
  const pageScroll = window.scrollY;
  state.activeReviewGuidance = active ? null : { kind, key };
  renderGeneralPlan(state.generalPlan);
  requestAnimationFrame(() => {
    window.scrollTo(0, pageScroll);
    document.querySelector(`[data-review-guidance-kind="${CSS.escape(kind)}"][data-review-guidance-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  });
}

async function copyReviewPrompt(prompt, button) {
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(prompt);
    else throw new Error("clipboard unavailable");
  } catch {
    const helper = document.createElement("textarea");
    helper.value = prompt;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
  }
  const original = button.textContent;
  button.textContent = "Prompt copiado";
  window.setTimeout(() => { button.textContent = original; }, 1800);
}

function useReviewPrompt(weekNumber, prompt, scopeName = "edit") {
  const index = Number(weekNumber) - 1;
  if (!Number.isInteger(index) || !state.weeks?.[index]) return;
  openLessonPreview(index);
  const field = $("#week-revision");
  if (field) field.value = prompt;
  const scope = $("#week-revision-scope");
  if (scope) scope.value = ["title", "edit", "full"].includes(scopeName) ? scopeName : "edit";
  const modeLabel = { title: "“Só o título da semana”", edit: "“Ajuste pontual” (mantém o resto da semana)", full: "“Refazer a semana inteira”" }[scope?.value] || "“Ajuste pontual”";
  const note = $("#regenerate-note");
  if (note) note.textContent = `Prompt carregado no modo ${modeLabel}. Revise-o e clique em Aplicar alteração com IA.`;
  field?.focus({ preventScroll: true });
}

function organizeResultSectors(container, previousOpenStates = null) {
  if (!container) return;
  const openStates = previousOpenStates || new Map([...container.querySelectorAll(":scope > .results-sector")].map((sector) => [sector.id, sector.open]));
  const overview = container.querySelector(":scope > .plan-overview");
  const breakdown = container.querySelector(":scope > .time-breakdown");
  const checklists = container.querySelector(":scope > .results-checklists");
  const makeSector = (id, title, description, node) => {
    const sector = document.createElement("details");
    sector.className = "results-sector";
    sector.id = id;
    sector.open = openStates.get(id) ?? false;
    sector.innerHTML = `<summary class="results-sector-summary"><div class="results-sector-copy"><strong>${title}</strong><small>${description}</small></div><span class="sector-chevron results-sector-chevron" aria-hidden="true">⌄</span></summary>`;
    const body = document.createElement("div");
    body.className = "results-sector-body";
    if (node) body.appendChild(node);
    sector.appendChild(body);
    return sector;
  };
  container.replaceChildren(
    makeSector("results-load", "Carga por atividade", "Resumo da meta, carga calculada, categorias e arco didático do curso.", overview),
    makeSector("results-breakdown", "Carga aberta por atividade", "Tempo separado por texto-base, leituras, vídeos, interativos, avaliação e demais atividades.", breakdown),
    makeSector("results-review", "Checklists", "Conferências pedagógicas, acadêmicas, de recursos, qualidade e liberação manual.", checklists)
  );
}

function renderGeneralPlan(plan) {
  const container = $("#general-plan");
  if (!container || !plan?.totals) { container?.classList.add("hidden"); return; }
  const resultOpenStates = new Map([...container.querySelectorAll(":scope > .results-sector")].map((sector) => [sector.id, sector.open]));
  const reviewOpenStates = new Map([...container.querySelectorAll(".review-panel")].flatMap((panel) => { const kind = [...panel.classList].find((name) => name.startsWith("checklist-"))?.replace("checklist-", ""); return kind ? [[kind, panel.open]] : []; }));
  const totals = plan.totals;
  const labels = { contentMinutes: "Conteúdo", resourcesMinutes: "Materiais e mídia", practiceMinutes: "Webpráticas", assessmentMinutes: "Avaliação", reviewMinutes: "Revisão", communicationMinutes: "Comunicação", projectMinutes: "Projetos", otherMinutes: "Outros" };
  const categoryMarkup = Object.entries(plan.categoryTotals || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => `<span>${escapeHtml(labels[key] || key)}: ${formatMinutes(value)}</span>`).join("");
  const unresolved = Array.isArray(plan.unresolvedResources) ? plan.unresolvedResources : [];
  const arcs = (plan.didacticArcs || []).filter((arc) => arc.label).map((arc) => `<span class="arc-chip">${escapeHtml(arc.label)}</span>`).join("");
  const checklist = Array.isArray(plan.pedagogicalChecklist) ? plan.pedagogicalChecklist : [];
  const passed = checklist.filter((item) => item.pass).length;
  const reviewMarks = state.reviewMarks || createReviewMarks();
  const checkedChecks = checklist.filter((item) => reviewCheckChecked(item, reviewMarks)).length;
  const checklistMarkup = reviewPanelMarkup("checks", "Checklist pedagógico", checklist, `${passed}/${checklist.length} itens atendidos automaticamente; ${checkedChecks}/${checklist.length} atualmente marcados. Desmarque qualquer item que queira refazer ou revisar novamente.`, "Nenhum item pedagógico foi retornado.", reviewOpenStates.get("checks") ?? true);
  const progressionMarkup = Array.isArray(plan.progression) && plan.progression.length ? `<div class="general-warning"><strong>Progressão curricular</strong><ul>${plan.progression.map((item) => `<li>Semana ${item.weekNumber}: ${escapeHtml(item.theme || "")} ${item.projectMilestone ? `— ${escapeHtml(item.projectMilestone)}` : ""}</li>`).join("")}</ul></div>` : "";
  const practices = Array.isArray(plan.webPracticeSchedule) ? plan.webPracticeSchedule : [];
  const practiceMarkup = practices.length ? `<section class="webpractice-schedule"><div class="schedule-heading"><div><p class="eyebrow">SESSÕES PRÁTICAS INDEPENDENTES</p><h3>Webpráticas programadas</h3><p>Estas sessões não entram no texto-base nem no JSON do aluno. Cada uma é exportada como roteiro DOCX para o professor.</p></div></div><div class="schedule-list">${practices.map((practice, index) => `<article class="schedule-item"><div><strong>${escapeHtml(practice.title || `Webprática ${index + 1}`)}</strong><span>${escapeHtml([practice.weekNumber ? `Semana ${practice.weekNumber}` : "", practice.date ? formatDate(practice.date) : "", practice.dayOfWeek, [practice.startTime, practice.endTime].filter(Boolean).join("–")].filter(Boolean).join(" · ") || "Agenda a confirmar")}</span><small>${escapeHtml([practice.modality, practice.tool, practice.platform].filter(Boolean).join(" · ") || "Sessão síncrona / laboratório prático")}</small></div><button class="button button-secondary webpractice-download" data-practice-id="${escapeHtml(practice.id || practice.title || "")}" type="button">Baixar DOCX <span>↓</span></button></article>`).join("")}</div></section>` : "";
  const resourceItems = unresolved.length ? unresolved.map((item, index) => ({ ...item, id: item.id || `resource-${item.weekNumber || 0}-${index + 1}`, label: item.title || "Recurso sem título", pass: false, detail: item.status || "Conferência pendente" })) : [{ id: "resources-ok", weekNumber: 0, label: "Recursos sem pendências automáticas", pass: true, detail: "Ainda assim, confirme coerência, duração/páginas, acessibilidade e licença antes de exportar." }];
  const reviewedResources = resourceItems.filter((item) => reviewMarkChecked("resources", item, reviewMarks)).length;
  const resourcesMarkup = reviewPanelMarkup("resources", "Checklist de recursos e acessibilidade", resourceItems, `${reviewedResources}/${resourceItems.length} itens atualmente marcados. Os recursos devem ser abertos e conferidos antes da publicação.`, "Nenhum recurso foi localizado para conferência.", reviewOpenStates.get("resources") ?? true);
  const academicStatusLabels = { approved: "revisão acadêmica aprovada", "approved-with-review": "aprovada com pendências", "needs-revision": "exige reescrita", "needs-human-review": "aguarda revisão humana", "not-run": "ainda não executada" };
  const academicItems = (state.teacherGuides || []).flatMap((guide, index) => {
    const report = state.validation?.weeks?.[index] || {};
    const review = guide?.academicReview || report.academicReview || {};
    const status = review.status || "not-run";
    const issues = Array.isArray(review.issues) ? review.issues : [];
    const statusItem = { id: `academic-status-${index + 1}`, weekNumber: index + 1, label: "Revisão acadêmica", pass: status === "approved" && issues.length === 0, detail: `${academicStatusLabels[status] || status}${issues.length ? ` · ${issues.length} pendência(s)` : ""}` };
    const issueItems = issues.map((issue, issueIndex) => ({ id: `academic-issue-${index + 1}-${issueIndex + 1}`, weekNumber: index + 1, label: issue.description || "Pendência acadêmica", pass: false, detail: issue.suggestedRepair ? `Reparo sugerido: ${issue.suggestedRepair}` : String(issue.severity || "Revisão necessária") }));
    return [statusItem, ...issueItems];
  });
  const academicMarkup = reviewPanelMarkup("academic", "Checklist acadêmico", academicItems, "Verifica rigor, evidências, coerência conceitual e pendências da revisão acadêmica automática.", "A revisão acadêmica automática não retornou relatórios.", reviewOpenStates.get("academic") ?? true);
  const qualityLabels = { ready: "pronta para revisão", complete: "conteúdo completo", blocked: "bloqueada por pendência crítica", review: "em revisão", "needs-review": "revisão recomendada", insufficient: "conteúdo insuficiente" };
  const qualityItems = (state.weeks || []).map((lesson, index) => {
    const report = state.validation?.weeks?.[index] || {};
    const quality = lesson.contentQuality || {};
    const status = report.status || quality.status || "review";
    const reasons = validationReasons(report, quality);
    return { id: `quality-week-${index + 1}`, weekNumber: index + 1, label: "Qualidade e liberação", pass: status === "ready" || status === "complete", detail: `${qualityLabels[status] || status}${quality.score ? ` · nota ${quality.score}/100` : ""}${reasons.length ? ` · ${reasons.join("; ")}` : ""}` };
  });
  const qualityMarkup = reviewPanelMarkup("quality", "Checklist de qualidade e liberação", qualityItems, "Resume suficiência textual, pendências críticas, revisão recomendada e situação de liberação de cada semana.", "A qualidade será calculada depois da geração.", reviewOpenStates.get("quality") ?? true);
  const breakdown = plan.timeBreakdown || state.workload?.breakdown || {};
  const breakdownSummary = Object.entries(breakdown).filter(([, value]) => Number(value) > 0).map(([key, value]) => `<span><strong>${escapeHtml(breakdownLabels[key] || key)}</strong> ${formatLoad(value)}</span>`).join("");
  const weeklyLoads = (state.workload?.weeks || plan.weeks || []).map((week) => {
    const items = (week.items || []).filter((item) => Number(item.minutes || item.learnerMinutes) > 0);
    const itemMarkup = items.map((item) => `<li><strong>${escapeHtml(workloadItemLabel(item))}</strong><span>${escapeHtml(item.title || "")}</span><em>${formatLoad(item.minutes || item.learnerMinutes)}</em></li>`).join("");
    return `<details class="load-week"><summary><strong>Semana ${escapeHtml(week.weekNumber)}</strong><span>${formatLoad(week.calculatedMinutes)} calculados · ${formatLoad(week.targetMinutes)} de meta</span></summary><ul>${itemMarkup || "<li>Sem itens calculáveis ainda.</li>"}</ul></details>`;
  }).join("");
  const timeBreakdownMarkup = `<section class="time-breakdown"><p class="eyebrow">CARGA ABERTA POR ATIVIDADE</p><h3>De onde vem o tempo calculado?</h3><p>O texto-base é contado separadamente das leituras, vídeos, quiz, fórum, revisão e webpráticas. Artigos/leitura aparecem como obrigatórios ou complementares conforme a marcação do recurso.</p><div class="breakdown-summary">${breakdownSummary || "<span>A carga será calculada depois da redação.</span>"}</div><div class="load-weeks">${weeklyLoads}</div></section>`;
  const overviewMarkup = `<div class="plan-overview"><p class="eyebrow">PLANEJAMENTO GERAL</p><h3>${escapeHtml(plan.title || "Curso")}</h3><p>O total considera todas as semanas depois da redação do conteúdo, dos recursos e das atividades. A experiência do aluno e o Material de Mediação são entregues separadamente.</p><div class="general-plan-grid"><div class="general-metric"><strong>${formatMinutes(totals.targetLearnerMinutes)}</strong><small>meta de estudo do aluno</small></div><div class="general-metric"><strong>${formatMinutes(totals.calculatedLearnerMinutes)}</strong><small>carga calculada</small></div><div class="general-metric"><strong>${formatMinutes(totals.requiredMinutes)}</strong><small>itens obrigatórios</small></div><div class="general-metric"><strong>${formatMinutes(totals.instructionalMinutes)}</strong><small>atividade instrucional eq.</small></div></div><div class="general-category-list">${categoryMarkup || "<span>Itens serão dimensionados após a geração</span>"}</div><div class="arc-list">${arcs}</div></div>`;
  const checklistsMarkup = `<div class="results-checklists">${resourcesMarkup}${checklistMarkup}${academicMarkup}${qualityMarkup}${progressionMarkup}${practiceMarkup}</div>`;
  container.innerHTML = `${overviewMarkup}${timeBreakdownMarkup}${checklistsMarkup}`;
  organizeResultSectors(container, resultOpenStates);
  container.querySelectorAll("[data-review-kind]").forEach((checkbox) => checkbox.addEventListener("change", () => toggleReviewMark(checkbox.dataset.reviewKind, checkbox.dataset.reviewKey, checkbox.checked)));
  container.querySelectorAll("[data-review-guidance-kind]").forEach((copy) => {
    const openGuidance = (event) => { event.preventDefault(); event.stopPropagation(); toggleReviewGuidance(copy.dataset.reviewGuidanceKind, copy.dataset.reviewGuidanceKey); };
    copy.addEventListener("click", openGuidance);
    copy.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") openGuidance(event); });
  });
  container.querySelectorAll(".review-copy-prompt").forEach((button) => button.addEventListener("click", () => copyReviewPrompt(button.dataset.reviewPrompt || "", button)));
  container.querySelectorAll(".review-use-prompt").forEach((button) => button.addEventListener("click", () => useReviewPrompt(button.dataset.reviewWeek, button.dataset.reviewPrompt || "", button.dataset.reviewScope || "edit")));
  container.querySelectorAll(".review-regenerate-parts").forEach((button) => button.addEventListener("click", () => retryDerivatives(Number(button.dataset.reviewWeek) - 1, { parts: String(button.dataset.reviewParts || "").split(",").filter(Boolean), button })));
  container.querySelectorAll(".webpractice-download").forEach((button) => button.addEventListener("click", () => downloadWebPractice(button.dataset.practiceId)));
  container.classList.remove("hidden");
}

function renderWeeks(data, { scrollToResults = true } = {}) {
  const partial = Boolean(data.partial);
  const totalWeeks = Number(data.input?.weeks || state.input?.weeks || data.weeks.length) || data.weeks.length;
  const complete = !partial && data.weeks.length >= totalWeeks;
  const partialQualityAvailable = data.weeks.length > 0 && (partial || data.weeks.length < totalWeeks);
  state.input = data.input; state.weeks = data.weeks; state.workload = data.workload; state.generalPlan = data.generalPlan || null; state.teacherGuides = data.teacherGuides || []; state.provider = data.provider; state.validation = data.validation || data.generalPlan?.validation || null; state.generation = data.generation ?? state.generation; state.reviewMarks = data.reviewMarks || state.reviewMarks || createReviewMarks();
  state.activeReviewGuidance = null;
  const generationInProgress = ["running", "consolidating"].includes(data.generation?.status || state.generation?.status);
  const recalculateButton = $("#recalculate-button");
  if (recalculateButton) recalculateButton.disabled = aiActionBusy || !(complete || partialQualityAvailable);
  const teacherPdfButton = $("#teacher-pdf-button");
  if (teacherPdfButton) teacherPdfButton.disabled = aiActionBusy || !data.weeks.length;
  const zipButton = $("#zip-button");
  if (zipButton) zipButton.disabled = !complete;
  updateProductionSheetButton();
  renderProductionUcCard();
  updateMediationExportHint();
  refreshAiButtonAvailability();
  const approvedWeeks = data.weeks.filter((_, index) => Boolean(state.weekApprovals?.[index])).length;
  const pendingWeeks = Math.max(0, totalWeeks - approvedWeeks);
  $("#results-title").textContent = partial ? `${data.weeks.length}/${totalWeeks} semanas preservadas` : approvedWeeks ? `${approvedWeeks} liberada(s) · ${pendingWeeks} para revisão` : `${data.weeks.length} semanas prontas para revisão`;
  $("#results-subtitle").textContent = partial ? (generationInProgress ? "A geração ainda está em andamento; as semanas concluídas ficam disponíveis enquanto a próxima é processada." : `${data.weeks.length} de ${totalWeeks} semana(s) disponíveis. Você já pode recalcular a qualidade e retomar a geração depois.`) : data.provider === "static-demo" ? "Modo público GitHub Pages: exemplo gerado no navegador, sem API." : data.provider === "fallback" ? "Exemplo local gerado sem API; use-o para validar o fluxo." : `Gerado por IA com ${data.model || "o provedor configurado"}. Revise antes de publicar.`;
  $("#results-section").classList.remove("hidden");
  $("#empty-state").classList.add("hidden");
  const alert = $("#result-alert");
  alert.className = "result-alert";
  const automaticSummary = state.validation?.summary ? `Diagnóstico automático: ${state.validation.summary.blockedWeeks || 0} bloqueada(s) e ${state.validation.summary.reviewWeeks || 0} em revisão.` : "";
  alert.textContent = partial ? (generationInProgress ? "Semana(s) concluída(s) preservada(s). A próxima semana está sendo processada; se houver falha, você poderá continuar a partir dela sem perder este material." : `Qualidade recalculada provisoriamente para ${data.weeks.length} de ${totalWeeks} semana(s). As semanas ausentes continuam pendentes e podem ser geradas depois.`) : data.provider === "static-demo" ? "Esta versão pública gera exemplos diretamente no navegador. A IA será conectada em uma hospedagem com backend protegido quando você escolher essa opção." : data.provider === "fallback" ? "Este é um exemplo estrutural. A geração por IA será ativada quando OPENAI_API_KEY estiver configurada." : approvedWeeks ? `${approvedWeeks} semana(s) liberada(s) por você; ${pendingWeeks} ainda aguardam sua revisão. ${automaticSummary}` : state.validation?.readyForExport ? "A geração terminou. Faça a revisão humana de cada semana e, depois, baixe os arquivos." : `A geração terminou. ${pendingWeeks} semana(s) ainda aguardam sua revisão. ${automaticSummary}`;
  const cards = data.weeks.map((lesson, index) => {
    const meta = lesson.meta || {};
    const workload = data.workload?.weeks?.[index];
    const types = [...new Set(collectNestedBlockTypes(lesson.blocks).map((type) => blockLabels[type] || type))].slice(0, 6);
    const compositionSummary = compositionSummaryForLesson(lesson);
    const resourceCoverage = resourceCoverageSummary(lesson.lessonPlan?.resourceResearch?.coverage || {});
    const pendingGeneration = lesson.generationMeta?.repairPending ? "Reparo textual pendente — rascunho preservado" : "";
    const pendingResources = lesson.generationMeta?.resourcesPending ? "Curadoria de recursos pendente" : "";
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
    return `<article class="week-card"><div class="week-card-top"><span class="week-number">${String(index + 1).padStart(2, "0")}</span><span class="week-date">${escapeHtml(date || `Semana ${index + 1}`)}</span></div><div class="week-arc">${escapeHtml(arc)}</div>${flowBadge(index)}<h3>${escapeHtml(lesson.lessonPlan?.theme || meta.title || `Semana ${index + 1}`)}</h3><p class="week-objective">${escapeHtml((lesson.blocks?.find((b) => b.type === "hero")?.props?.lead) || lesson.lessonPlan?.welcome || "Conteúdo semanal pronto para revisão.")}</p><div class="week-metrics"><span><strong>${calculated}</strong> calculado</span><span>${target} meta</span><span>${quality.wordCount ? `${quality.wordCount.toLocaleString("pt-BR")} palavras` : `${lesson.blocks?.length || 0} blocos`}</span></div><div class="tag-row">${types.map((type) => `<span>${escapeHtml(type)}</span>`).join("")}</div>${compositionSummary ? `<small class="week-composition-summary"><strong>Composição materializada:</strong> ${escapeHtml(compositionSummary)}</small>` : ""}${resourceCoverage ? `<small class="week-resource-coverage"><strong>Cobertura:</strong> ${escapeHtml(resourceCoverage)}</small>` : pendingResources ? `<small class="week-resource-coverage is-pending"><strong>Cobertura:</strong> ${escapeHtml(pendingResources)}</small>` : ""}${pendingGeneration ? `<small class="week-generation-pending">${escapeHtml(pendingGeneration)}</small>` : ""}<span class="quality-badge ${manuallyApproved ? "complete" : escapeHtml(automaticStatus)}">${escapeHtml(qualityLabel)}</span>${statusDetail}<div class="week-actions"><button class="button button-secondary week-preview" data-index="${index}" type="button">Ver aula <span>↗</span></button><button class="button button-secondary week-download" data-index="${index}" type="button" title="Arquivo para abrir no ClassAtelier (sem o quiz)">JSON ClassAtelier <span>↓</span></button><button class="button button-secondary week-download-full" data-index="${index}" type="button" title="Semana completa do ClassAuthor, com quiz, feedbacks e guia do professor">JSON ClassAuthor <span>↓</span></button><button class="button button-secondary week-download-quiz" data-index="${index}" type="button" ${quizQuestions(lesson).length ? "" : "disabled"} title="Quiz da semana em Moodle XML, com feedback em todas as alternativas">Quiz XML <span>↓</span></button><button class="button button-secondary week-open-studio" data-index="${index}" type="button" title="Abre o ClassAtelier em outra aba já com esta semana carregada">Abrir esta semana no <strong class="wordmark"><b>Class</b><i>Atelier</i></strong> <span>↗</span></button>${approvalButton}</div>${studioEditMarkup(index)}</article>`;
  }).join("");
  $("#week-grid").innerHTML = cards;
  const weeksNote = $("#weeks-sector-note");
  if (weeksNote) weeksNote.textContent = partial ? `${data.weeks.length} de ${totalWeeks} semana(s) preservada(s); a geração pode ser retomada pela próxima semana.` : `${data.weeks.length} semana(s) gerada(s); abra cada cartão para revisar o conteúdo do aluno.`;
  $("#week-grid").querySelectorAll(".week-preview").forEach((button) => button.addEventListener("click", () => openLessonPreview(Number(button.dataset.index))));
  $("#week-grid").querySelectorAll(".week-download").forEach((button) => button.addEventListener("click", () => downloadWeek(Number(button.dataset.index))));
  $("#week-grid").querySelectorAll(".week-download-full").forEach((button) => button.addEventListener("click", () => downloadWeekFull(Number(button.dataset.index))));
  $("#week-grid").querySelectorAll(".week-open-studio").forEach((button) => button.addEventListener("click", () => openInStudio(Number(button.dataset.index))));
  $("#week-grid").querySelectorAll(".week-download-quiz").forEach((button) => button.addEventListener("click", () => downloadWeekQuiz(Number(button.dataset.index))));
  $("#week-grid").querySelectorAll(".studio-edit").forEach((box) => wireStudioEdit(box));
  $("#week-grid").querySelectorAll(".week-approve").forEach((button) => button.addEventListener("click", () => toggleWeekApproval(Number(button.dataset.index))));
  renderGeneralPlan(data.generalPlan);
  renderWorkload(data.workload);
  refreshStudioWeekSelect();
  saveDraft("resultado");
  if (partial) $("#results-section").open = true;
  if (scrollToResults) scrollFormTo("#results-section");
}

// Três arquivos por semana, com o destino no nome:
//  - SemanaNN-titulo-ClassAtelier.json: o que abre no ClassAtelier (sem o quiz);
//  - SemanaNN-titulo-ClassAuthor.json: a semana completa, com quiz, feedbacks e guia do professor;
//  - SemanaNN-titulo-Quiz.xml: o quiz em Moodle XML, com feedback em todas as alternativas.
// Mesmo padrão dos projetos do ClassAtelier (título sem acento, até 60 letras, sem palavra solta no fim).
function weekFileName(lesson, index, suffix) {
  let slug = slugify(lesson.meta?.title || "aula").replace(/^semana-0*\d+-?/, "");
  if (slug.length > 60) slug = slug.slice(0, 60).replace(/-[^-]*$/, "") || slug.slice(0, 60);
  slug = slug.replace(/(-(de|da|do|das|dos|em|na|no|nas|nos|e|a|o|as|os|para|com|por|que|um|uma))+$/, "").replace(/-$/, "") || "aula";
  return `Semana${String(index + 1).padStart(2, "0")}-${slug}-${suffix}`;
}

function downloadWeek(index) {
  const lesson = state.weeks[index];
  if (!lesson) return;
  downloadBlob(new Blob([JSON.stringify(studentProjectFor(index), null, 2)], { type: "application/json" }), weekFileName(lesson, index, "ClassAtelier.json"));
}

function downloadWeekFull(index) {
  const lesson = state.weeks[index];
  if (!lesson) return;
  downloadBlob(new Blob([JSON.stringify(toGeneratorWeek(lesson, state.teacherGuides?.[index]), null, 2)], { type: "application/json" }), weekFileName(lesson, index, "ClassAuthor.json"));
}

// ClassAtelier (o editor, hoje ainda publicado como ClassAtelier) recebe a semana por postMessage.
const STUDIO_URL = "https://rgbittencourt.github.io/aula-studio/";
const STUDIO_ORIGIN = new URL(STUDIO_URL).origin;
let studioToastTimer = null;

function showStudioToast(message) {
  let toast = $("#studio-toast");
  if (!toast) { toast = document.createElement("div"); toast.id = "studio-toast"; toast.className = "studio-toast hidden"; toast.setAttribute("role", "status"); document.body.appendChild(toast); }
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(studioToastTimer);
  studioToastTimer = setTimeout(() => toast.classList.add("hidden"), 9000);
}

function refreshStudioWeekSelect() {
  const pick = $("#studio-week-pick");
  const select = $("#studio-week-select");
  if (!pick || !select) return;
  const weeks = state.weeks || [];
  pick.classList.toggle("hidden", !weeks.length);
  if (!weeks.length) { select.innerHTML = ""; return; }
  const chosen = select.value;
  select.innerHTML = [`<option value="">editor em branco</option>`, ...weeks.map((lesson, index) => `<option value="${index}">Semana ${index + 1} · ${escapeHtml(String(lesson.lessonPlan?.theme || lesson.meta?.title || "").slice(0, 38))}</option>`)].join("");
  select.value = chosen !== "" && Number(chosen) < weeks.length ? chosen : String(weeks.length - 1);
}

// ── Volta do ClassAtelier: a semana editada lá chega por postMessage e passa a ser a versão do aluno ──
// A semana gerada continua intacta em state.weeks (quiz, guia do professor, carga horária); a edição
// fica em state.studioEdits[index] e vale para "Abrir no ClassAtelier", "JSON ClassAtelier" e o ZIP.
function studentProjectFor(index) {
  const edit = state.studioEdits?.[index];
  if (edit?.project?.blocks?.length) return edit.project;
  return toStudentLesson(state.weeks[index]);
}

function studioEditMarkup(index) {
  const edit = state.studioEdits?.[index];
  if (!edit) return "";
  const when = new Date(edit.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const words = edit.text ? edit.text.split(/\s+/).filter(Boolean).length : 0;
  return `<div class="studio-edit" data-index="${index}"><strong>Versão editada no ClassAtelier</strong> · ${escapeHtml(when)}${words ? ` · ${words.toLocaleString("pt-BR")} palavras` : ""}<small>Esta é a versão usada em «Abrir no ClassAtelier», «JSON ClassAtelier» e no ZIP. O quiz, o guia do professor e a carga horária continuam os da geração.</small><span class="studio-edit-actions"><button type="button" class="link-button studio-edit-text" data-index="${index}">Baixar o texto (.txt)</button><button type="button" class="link-button studio-edit-drop" data-index="${index}">Voltar à versão gerada</button></span></div>`;
}

function wireStudioEdit(box) {
  const index = Number(box.dataset.index);
  box.querySelector(".studio-edit-text")?.addEventListener("click", () => {
    const edit = state.studioEdits?.[index];
    if (!edit?.text) return;
    downloadBlob(new Blob([edit.text], { type: "text/plain;charset=utf-8" }), weekFileName(state.weeks[index], index, "Texto-editado.txt"));
  });
  box.querySelector(".studio-edit-drop")?.addEventListener("click", () => {
    if (!window.confirm("Descartar a versão editada no ClassAtelier e voltar à versão gerada desta semana?\n\nA aula continua guardada na Biblioteca do ClassAtelier.")) return;
    delete state.studioEdits[index];
    refreshStudioEditNote(index);
    saveDraft("edição do ClassAtelier descartada");
  });
}

function refreshStudioEditNote(index) {
  const card = $("#week-grid")?.querySelectorAll(".week-card")[index];
  if (!card) return;
  card.querySelector(".studio-edit")?.remove();
  const html = studioEditMarkup(index);
  if (html) { card.insertAdjacentHTML("beforeend", html); wireStudioEdit(card.querySelector(".studio-edit")); }
}

// Descobre a semana da aula devolvida: pelo nome do arquivo com que ela foi aberta e, se não achar, pelo título.
function weekIndexForStudioLesson(fileName, title) {
  const weeks = state.weeks || [];
  let index = fileName ? weeks.findIndex((lesson, i) => weekFileName(lesson, i, "ClassAtelier.json") === fileName) : -1;
  if (index < 0 && fileName) { const m = /^semana-?(\d{1,2})-/i.exec(fileName); if (m && weeks[Number(m[1]) - 1]) index = Number(m[1]) - 1; }
  if (index < 0 && title) { const norm = (s) => String(s || "").trim().toLowerCase(); const hits = weeks.map((lesson, i) => (norm(lesson.meta?.title) === norm(title) ? i : -1)).filter((i) => i >= 0); if (hits.length === 1) index = hits[0]; }
  return index;
}

window.addEventListener("message", (event) => {
  if (event.origin !== STUDIO_ORIGIN || !event.data || event.data.type !== "classatelier:lesson") return;
  const reply = (message) => { try { event.source?.postMessage(message, STUDIO_ORIGIN); } catch { /* a aba do editor pode ter sido fechada */ } };
  const { lesson, text, fileName, title } = event.data;
  if (!Array.isArray(lesson?.blocks) || !lesson.blocks.length) { reply({ type: "classauthor:error", message: "a aula veio sem blocos." }); return; }
  const index = weekIndexForStudioLesson(fileName, title || lesson.meta?.title);
  if (index < 0) { reply({ type: "classauthor:error", message: "não encontrei a semana de origem. Abra a aula pelo botão «Abrir esta semana no ClassAtelier» deste painel." }); return; }
  state.studioEdits = state.studioEdits || {};
  state.studioEdits[index] = { project: { meta: lesson.meta || {}, blocks: lesson.blocks }, text: String(text || ""), fileName: fileName || "", at: new Date().toISOString() };
  refreshStudioEditNote(index);
  saveDraft("semana devolvida pelo ClassAtelier");
  showStudioToast(`A semana ${index + 1} voltou editada do ClassAtelier. Ela agora é a versão usada ao abrir e ao baixar o JSON ClassAtelier.`);
  reply({ type: "classauthor:received", week: index + 1, title: state.weeks[index]?.meta?.title || "" });
});

function openInStudio(index) {
  const lesson = Number.isInteger(index) ? state.weeks[index] : null;
  const win = window.open(STUDIO_URL, "aula-studio-editor");
  if (!win) { showStudioToast("O navegador bloqueou a nova aba. Libere pop-ups para este site e tente de novo."); return; }
  if (!lesson) return;
  const payload = studentProjectFor(index);
  const fileName = weekFileName(lesson, index, "ClassAtelier.json");
  let settled = false;
  const finish = () => { settled = true; window.removeEventListener("message", onMessage); clearTimeout(fallbackTimer); };
  const onMessage = (event) => {
    if (event.source !== win || event.origin !== STUDIO_ORIGIN || !event.data) return;
    if (event.data.type === "aulastudio:ready") { win.postMessage({ type: "classauthor:lesson", lesson: payload, fileName }, STUDIO_ORIGIN); return; }
    if (event.data.type === "aulastudio:loaded") { finish(); showStudioToast(`Semana ${index + 1} aberta no ClassAtelier.${event.data.savedPrevious ? " A aula que estava aberta lá ficou na Biblioteca." : ""}`); }
    else if (event.data.type === "aulastudio:declined") { finish(); showStudioToast("Você manteve a versão que já estava na Biblioteca do ClassAtelier."); }
    else if (event.data.type === "aulastudio:error") { finish(); showStudioToast(`O editor não conseguiu abrir a semana: ${event.data.message || "arquivo inválido"}. Baixe o JSON Studio e use "Abrir projeto".`); }
  };
  window.addEventListener("message", onMessage);
  const fallbackTimer = setTimeout(() => {
    if (settled) return;
    finish();
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), fileName);
    showStudioToast("O editor não respondeu a tempo. Baixei o arquivo da semana: use \"Abrir projeto\" lá dentro.");
  }, 25000);
}

function downloadWeekQuiz(index) {
  const lesson = state.weeks[index];
  if (!lesson) return;
  const xml = createMoodleXml(lesson, { courseTitle: state.input?.title || formInput().title, weekNumber: index + 1 });
  if (!xml) { showError(`A semana ${index + 1} ainda não tem questões para exportar. Gere as questões primeiro.`); return; }
  downloadBlob(new Blob([xml], { type: "application/xml;charset=utf-8" }), weekFileName(lesson, index, "Quiz.xml"));
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
  updateMediationExportHint();
  renderWeeks({ input: state.input, weeks: state.weeks, workload: state.workload, generalPlan: state.generalPlan, teacherGuides: state.teacherGuides, provider: state.provider, validation: state.validation }, { scrollToResults: false });
}

function generationErrorIsRetryable(error) {
  if (!error) return false;
  if (["AI_INVALID_JSON", "AI_OUTPUT_TRUNCATED"].includes(error.code)) return false;
  if (error.retryable) return true;
  if ([408, 425, 429, 500, 502, 503, 504].includes(Number(error.status))) return true;
  return /temporar|timeout|timed out|rate limit|limite.*token|resposta vazia|não respondeu|failed to fetch|networkerror|erro de rede/i.test(String(error.message || ""));
}

function generationRetryDelay(attempt) {
  return Math.min(8000, 1200 * (2 ** attempt) + Math.round(Math.random() * 400));
}

async function requestGeneratedWeek(input, index, headers, previousWeeks, button, bridges = []) {
  // O backend já faz retries controlados para respostas transitórias e JSON
  // inválido. Duas tentativas no navegador evitam multiplicar uma chamada
  // pesada depois de um timeout da hospedagem.
  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch("/api/generate-week", {
        method: "POST",
        headers,
        body: JSON.stringify({ input, weekIndex: index, previousWeeks, bridges })
      });
      const data = await readApiResponse(response, `Não foi possível gerar a semana ${index + 1}.`);
      if (!data.week) {
        const error = new Error(`A semana ${index + 1} foi retornada sem conteúdo.`);
        error.retryable = true;
        throw error;
      }
      return data;
    } catch (error) {
      if (attempt >= maxAttempts - 1 || !generationErrorIsRetryable(error)) throw error;
      const nextAttempt = attempt + 2;
      const delay = generationRetryDelay(attempt);
      setButtonLabel(button, `Tentando semana ${index + 1} novamente…`);
      setAiActivity("Tentando novamente", `A semana ${index + 1} não respondeu na primeira tentativa. Nova tentativa ${nextAttempt}/${maxAttempts} em instantes…`, { progress: Math.round(((index + 0.35) / (input.weeks + 1)) * 100) });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Não foi possível gerar a semana ${index + 1}.`);
}

// Modo de prosa: a avaliação e o Material de Mediação saem numa segunda requisição,
// com o próprio limite de tempo. Se falhar, o texto já está salvo e a semana fica
// marcada; "Refazer esta semana" também refaz essas peças.
async function completeDerivativesStep(data, input, index, headers, button) {
  const pending = data?.generation?.derivativesPending ?? data?.week?.generationMeta?.derivativesPending;
  if (!pending || !data.week) return data;
  setButtonLabel(button, `Gerando avaliação e mediação da semana ${index + 1}…`);
  setAiActivity("Avaliação e mediação", `O texto da semana ${index + 1} já está salvo. Escrevendo as questões (com feedback por alternativa), as atividades e as mensagens de acompanhamento a partir dele…`, { progress: Math.round(((index + 0.6) / (input.weeks + 1)) * 100) });
  try {
    const response = await fetch("/api/derivatives", { method: "POST", headers, body: JSON.stringify({ action: "derivatives", input, weekIndex: index, week: data.week, teacherGuide: data.teacherGuide }) });
    const done = await readApiResponse(response, `Não foi possível gerar a avaliação da semana ${index + 1}.`);
    return { ...data, week: done.week, teacherGuide: done.teacherGuide, generation: done.generation };
  } catch (error) {
    console.warn(`Avaliação e mediação da semana ${index + 1} adiadas:`, error);
    const reason = error.message || "A avaliação não foi concluída.";
    return { ...data, derivativesError: reason, week: { ...data.week, generationMeta: { ...(data.week.generationMeta || {}), derivativesPending: true, repairPending: true, repairReason: [...new Set([...(data.week.generationMeta?.repairReason || []), "a avaliação e o Material de Mediação ainda não foram gerados; refaça a semana"])] } } };
  }
}

// Figuras (diagramas SVG) criadas por IA: etapa própria, depois do texto e dos recursos.
function weekHasPendingFigures(week) {
  return (week?.lessonPlan?.contentSections || []).some((section) => (section.figures || []).some((figure) => !figure.src));
}

async function illustrateGeneratedWeek(data, input, index, headers, button) {
  if (!data?.week || !weekHasPendingFigures(data.week)) return data;
  setButtonLabel(button, `Criando as figuras da semana ${index + 1}…`);
  setAiActivity("Criando figuras", `Desenhando os diagramas da semana ${index + 1} (SVG, com legenda “criada por IA”)…`, { progress: Math.round(((index + 0.85) / (input.weeks + 1)) * 100) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 170000);
  try {
    const response = await fetch("/api/illustrate", { method: "POST", headers, signal: controller.signal, body: JSON.stringify({ action: "illustrate", input, weekIndex: index, week: data.week }) });
    const done = await readApiResponse(response, `Não foi possível criar as figuras da semana ${index + 1}.`);
    return { ...data, week: done.week, figuresFailed: done.failed || 0 };
  } catch (error) {
    console.warn(`Figuras da semana ${index + 1} adiadas:`, error);
    return { ...data, figuresError: error.message || "As figuras não foram concluídas." };
  } finally {
    clearTimeout(timer);
  }
}

async function enrichGeneratedWeek(data, input, index, headers, button) {
  if (!data?.resourcesDeferred || !data.week) return data;
  setButtonLabel(button, `Pesquisando recursos da semana ${index + 1}…`);
  setAiActivity("Localizando recursos", `A semana ${index + 1} já foi escrita. Pesquisando vídeos, imagens e leituras em uma etapa separada…`, { progress: Math.round(((index + 0.7) / (input.weeks + 1)) * 100) });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150000);
  try {
    const response = await fetch("/api/enrich-week", {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({ input, weekIndex: index, week: data.week, teacherGuide: data.teacherGuide })
    });
    const enriched = await readApiResponse(response, `Não foi possível pesquisar os recursos da semana ${index + 1}.`);
    return { ...data, ...enriched, resourcesDeferred: false };
  } catch (error) {
    console.warn(`Curadoria da semana ${index + 1} adiada:`, error);
    const resourceError = error.message || "A curadoria não foi concluída.";
    return {
      ...data,
      resourcesPending: true,
      resourcesError: resourceError,
      week: { ...data.week, generationMeta: { ...(data.week.generationMeta || {}), resourcesPending: true, resourceError } }
    };
  } finally {
    clearTimeout(timer);
  }
}

// ───────── Fluxo semana a semana: aprovar, refazer e ajustar pontas ─────────
const STEP_MODE_KEY = "aula-generator:step-mode:v1";

function stepModeEnabled() {
  return Boolean($("#step-mode")?.checked);
}

function initStepMode() {
  const checkbox = $("#step-mode");
  if (!checkbox) return;
  try { const saved = localStorage.getItem(STEP_MODE_KEY); if (saved !== null) checkbox.checked = saved === "true"; } catch { /* preferência não é essencial */ }
  checkbox.addEventListener("change", () => {
    try { localStorage.setItem(STEP_MODE_KEY, String(checkbox.checked)); } catch { /* preferência não é essencial */ }
    if (state.previewIndex != null) renderFlowPanel(state.previewIndex);
  });
}

async function postJson(url, body, fallbackMessage) {
  const response = await fetch(url, { method: "POST", headers: apiHeaders(), body: JSON.stringify(body) });
  return readApiResponse(response, fallbackMessage);
}

function rerenderWeeks() {
  renderWeeks({ input: state.input, weeks: state.weeks, workload: state.workload, generalPlan: state.generalPlan, teacherGuides: state.teacherGuides, provider: state.provider, validation: state.validation, partial: state.generation?.status === "partial", generation: state.generation }, { scrollToResults: false });
}

// Resumo de ponte da semana recém-escrita. Não usa IA; se falhar, a geração segue
// e a semana apenas fica sem resumo (a próxima recebe o contexto compacto de sempre).
async function captureWeekBridge(index) {
  try {
    const data = await postJson("/api/bridge", { action: "summary", weekIndex: index, week: state.weeks[index] }, "Não foi possível resumir a ponte desta semana.");
    recordGenerated(state.flow, index, data.summary);
  } catch (error) {
    console.warn(`Resumo de ponte da semana ${index + 1} indisponível:`, error);
  }
}

function flowBadge(index) {
  const status = weekFlowStatus(state.flow, index);
  return status.key === "none" ? "" : `<div class="week-flow flow-${status.key}">${escapeHtml(status.label)}</div>`;
}

function flowIssueMarkup(index) {
  const issue = state.flow.issues[index];
  if (!issue) return "";
  const reasons = issue.reasons?.length ? ` <small>(${escapeHtml(issue.reasons.join("; "))})</small>` : "";
  const actions = [];
  if (issue.opening && state.flow.bridges[index - 1]) actions.push(`<button class="button button-secondary flow-adjust" type="button" data-kind="opening" data-index="${index}">Ajustar a abertura para cumprir o gancho da semana ${index}</button>`);
  if (issue.closing && state.flow.bridges[index + 1]) actions.push(`<button class="button button-secondary flow-adjust" type="button" data-kind="closing" data-index="${index}">Ajustar o fechamento para encaixar na semana ${index + 2}</button>`);
  actions.push(`<button class="button button-secondary flow-dismiss" type="button" data-index="${index}">Manter como está</button>`);
  const title = issue.stale ? `A semana anterior mudou bastante: esta semana pode estar desatualizada.` : `A ponte com a semana vizinha ficou desencaixada.`;
  const hint = issue.stale ? "Ajustar só a abertura é barato; se o conteúdo central também mudou, considere refazer a semana abaixo." : "O ajuste reescreve somente o trecho de ponta, sem tocar no corpo da aula.";
  return `<div class="flow-issue"><p><strong>${title}</strong>${reasons}</p><p class="flow-hint">${hint}</p><div class="flow-actions">${actions.join("")}</div></div>`;
}

function renderFlowPanel(index) {
  const panel = $("#reader-flow");
  if (!panel) return;
  if (!state.weeks[index] || isGitHubPages) { panel.classList.add("hidden"); panel.innerHTML = ""; return; }
  const flow = state.flow;
  const total = Number(state.input?.weeks || state.generation?.total || state.weeks.length);
  const status = weekFlowStatus(flow, index);
  const nextPending = index + 1 < total && state.weeks.length === index + 1;
  const step = stepModeEnabled();
  let main = "";
  if (!flow.approved[index]) {
    main = nextPending
      ? `<button class="button button-primary flow-approve" type="button" data-index="${index}" data-next="true"><span class="button-label">Aprovar e gerar a semana ${index + 2}</span><span class="button-arrow">→</span></button><button class="button button-secondary flow-approve" type="button" data-index="${index}" data-next="false">Só aprovar</button>`
      : `<button class="button button-primary flow-approve" type="button" data-index="${index}" data-next="false"><span class="button-label">Aprovar esta semana</span></button>`;
  } else if (nextPending) {
    main = `<button class="button button-primary flow-next" type="button" data-index="${index}"><span class="button-label">Gerar a semana ${index + 2}</span><span class="button-arrow">→</span></button>`;
  }
  const lead = status.key === "approved"
    ? "Você aprovou esta semana. Se refizer o texto, o sistema compara a ponte e só pede ajuste nas pontas que realmente mudaram."
    : step
      ? "Leia a semana. Se estiver boa, aprove: a próxima será escrita retomando o gancho exato do fechamento desta. Se não, refaça abaixo quantas vezes precisar."
      : "Aprove para registrar o gancho desta semana; ele orienta as semanas seguintes.";
  panel.innerHTML = `<h3>Fluxo semana a semana</h3>${status.label ? `<p class="flow-status flow-${status.key}">${escapeHtml(status.label)}</p>` : ""}<p>${lead}</p>${flowIssueMarkup(index)}<div class="flow-actions">${main}</div><p class="flow-note" id="flow-note" role="status"></p>`;
  panel.classList.remove("hidden");
  panel.querySelectorAll(".flow-approve").forEach((button) => button.addEventListener("click", () => approveSelectedWeek(Number(button.dataset.index), { generateNext: button.dataset.next === "true" }, button)));
  panel.querySelectorAll(".flow-next").forEach((button) => button.addEventListener("click", () => { closeLessonPreview(); generate(); }));
  panel.querySelectorAll(".flow-adjust").forEach((button) => button.addEventListener("click", () => adjustBridge(Number(button.dataset.index), button.dataset.kind, button)));
  panel.querySelectorAll(".flow-dismiss").forEach((button) => button.addEventListener("click", () => { dismissIssue(state.flow, Number(button.dataset.index)); saveDraft("ponte-mantida"); rerenderWeeks(); renderFlowPanel(index); }));
}

function setFlowNote(message) {
  const note = $("#flow-note");
  if (note) note.textContent = message || "";
}

async function approveSelectedWeek(index, { generateNext = false } = {}, button = null) {
  if (aiActionBusy || !state.weeks[index]) return;
  if (button) button.disabled = true;
  try {
    const data = await postJson("/api/bridge", { action: "summary", weekIndex: index, week: state.weeks[index], previousSummary: state.flow.bridges[index] }, "Não foi possível registrar a aprovação desta semana.");
    approveWeek(state.flow, index, data.summary);
    saveDraft("semana-aprovada");
    rerenderWeeks();
    renderFlowPanel(index);
  } catch (error) {
    setFlowNote(error.message);
    if (button) button.disabled = false;
    return;
  }
  if (generateNext) {
    closeLessonPreview();
    await generate();
  }
}

// Reescreve somente a abertura ou o fechamento, com a ponte da semana vizinha.
async function adjustBridge(index, kind, button = null) {
  if (aiActionBusy || !state.weeks[index]) return;
  const neighbor = kind === "opening" ? state.flow.bridges[index - 1] : state.flow.bridges[index + 1];
  if (!neighbor) { setFlowNote("Não encontrei o resumo da semana vizinha para ajustar esta ponta."); return; }
  if (!beginAiAction(button)) return;
  if (button) { button.dataset.label = button.textContent; setBusy(button, true, "Ajustando…"); }
  setAiActivity("Ajustando a ponte", `Reescrevendo só ${kind === "opening" ? "a abertura" : "o fechamento"} da semana ${index + 1}…`);
  try {
    const input = state.input || formInput();
    const body = { input, weekIndex: index, week: state.weeks[index], ...(kind === "opening" ? { previousBridge: neighbor } : { nextBridge: neighbor }) };
    const data = await postJson("/api/bridge", { ...body, action: "adjust" }, "Não foi possível ajustar a ponte.");
    state.weeks[index] = data.week; if (state.studioEdits) delete state.studioEdits[index];
    applyAdjustment(state.flow, index, kind, data.summary);
    saveDraft("pontas-ajustadas");
    rerenderWeeks();
    renderLessonPreview(state.weeks[index], index);
    finishAiActivity("Ponte ajustada", `Somente ${kind === "opening" ? "a abertura" : "o fechamento"} da semana ${index + 1} foi reescrito.`, "success");
  } catch (error) {
    setFlowNote(error.message);
    finishAiActivity("Ponte não ajustada", error.message, "error");
  } finally {
    if (button) setBusy(button, false, "");
    endAiAction();
  }
}

// Depois de refazer uma semana: compara a ponte nova com a anterior e com aquela
// sobre a qual a semana seguinte foi construída. Não usa IA.
async function afterWeekRewritten(index) {
  try {
    const data = await postJson("/api/bridge", { action: "summary", weekIndex: index, week: state.weeks[index], previousSummary: state.flow.bridges[index], linkedSummary: state.flow.links[index + 1] }, "Não foi possível comparar a ponte desta semana.");
    applyRewrite(state.flow, index, data.summary, { comparison: data.comparison, linkComparison: data.linkComparison, totalWeeks: state.weeks.length });
    saveDraft("ponte-comparada");
  } catch (error) {
    console.warn("Comparação de ponte indisponível:", error);
  }
}

async function generateDistributed(input, accessCode, button, options = {}) {
  const startIndex = Math.max(0, Math.min(input.weeks, Number(options.startIndex) || 0));
  const weeks = Array.isArray(options.initialWeeks) ? options.initialWeeks.slice() : [];
  const teacherGuides = Array.isArray(options.initialTeacherGuides) ? options.initialTeacherGuides.slice() : [];
  const formSignature = options.formSignature || JSON.stringify(input);
  const headers = { "Content-Type": "application/json" };
  if (accessCode) headers["x-aula-access-code"] = accessCode;
  const annotateFailure = (error, failedWeekIndex) => {
    error.completedWeeks = weeks.filter(Boolean);
    error.completedTeacherGuides = teacherGuides.filter(Boolean);
    error.failedWeekIndex = failedWeekIndex;
    error.generationInput = input;
    return error;
  };

  state.input = input;
  state.provider = "ai-distributed-partial";
  state.generation = { status: "running", nextWeekIndex: startIndex, total: input.weeks, formSignature };
  saveDraft("geração-em-andamento");

  for (let index = startIndex; index < input.weeks; index += 1) {
    state.generation = { status: "running", nextWeekIndex: index, total: input.weeks, formSignature };
    saveDraft("geração-em-andamento");
    setButtonLabel(button, `Gerando semana ${index + 1}/${input.weeks}…`);
    setAiActivity("Gerando material com IA", `Escrevendo a semana ${index + 1} de ${input.weeks}…`, { progress: Math.round((index / (input.weeks + 1)) * 100) });
    const previousWeeks = weeks.filter(Boolean).map((lesson) => ({
      meta: { weekNumber: lesson.meta?.weekNumber, title: lesson.meta?.title },
      lessonPlan: {
        weekNumber: lesson.lessonPlan?.weekNumber,
        theme: lesson.lessonPlan?.theme,
        learningObjectives: (lesson.lessonPlan?.learningObjectives || []).slice(0, 4),
        contentSections: (lesson.lessonPlan?.contentSections || []).map((section) => ({ title: section.title })).slice(0, 8)
      }
    }));
    let data;
    try {
      data = await requestGeneratedWeek(input, index, headers, previousWeeks, button, bridgesBefore(state.flow, index));
    } catch (error) {
      throw annotateFailure(error, index);
    }
    weeks[index] = data.week;
    teacherGuides[index] = data.teacherGuide;
    state.input = input;
    state.weeks = weeks.filter(Boolean);
    state.teacherGuides = teacherGuides.filter(Boolean);
    state.generation = { status: "running", nextWeekIndex: index + 1, total: input.weeks, formSignature };
    saveDraft("semana-gerada");
    renderWeeks({ ok: true, partial: true, provider: "ai-distributed-partial", model: data.model, input, weeks: state.weeks, teacherGuides: state.teacherGuides, generation: state.generation }, { scrollToResults: false });
    data = await completeDerivativesStep(data, input, index, headers, button);
    data = await enrichGeneratedWeek(data, input, index, headers, button);
    data = await illustrateGeneratedWeek(data, input, index, headers, button);
    weeks[index] = data.week;
    teacherGuides[index] = data.teacherGuide;
    state.weeks = weeks.filter(Boolean);
    state.teacherGuides = teacherGuides.filter(Boolean);
    await captureWeekBridge(index);
    saveDraft(data.resourcesPending ? "semana-gerada-recursos-pendentes" : "recursos-da-semana");
    renderWeeks({ ok: true, partial: true, provider: "ai-distributed-partial", model: data.model, input, weeks: state.weeks, teacherGuides: state.teacherGuides, generation: state.generation }, { scrollToResults: false });
    const alert = $("#result-alert");
    alert.className = "result-alert";
    const resourceNote = data.resourcesPending ? " A aula foi preservada; a curadoria de recursos desta semana ficou pendente." : "";
    const pauseForApproval = Boolean(options.stepMode) && index + 1 < input.weeks;
    alert.textContent = pauseForApproval
      ? `Semana ${index + 1} de ${input.weeks} gerada e preservada. Revise, refaça se quiser e aprove para gerar a semana ${index + 2}.${resourceNote}`
      : `Semana ${index + 1} de ${input.weeks} gerada e preservada. A consolidação acontece ao final.${resourceNote}`;
    alert.classList.remove("hidden");
    if (pauseForApproval) {
      state.generation = { status: "partial", nextWeekIndex: index + 1, total: input.weeks, formSignature, awaitingApproval: true };
      saveDraft("aguardando-aprovação");
      return { stepPaused: true, index };
    }
  }

  state.generation = { status: "consolidating", nextWeekIndex: input.weeks, total: input.weeks, formSignature };
  saveDraft("consolidação-em-andamento");
  setButtonLabel(button, "Consolidando curso…");
  setAiActivity("Consolidando curso", "Recalculando carga, qualidade, checklists e materiais finais…", { progress: Math.round((input.weeks / (input.weeks + 1)) * 100) });
  try {
    const response = await fetch("/api/assemble-course", {
      method: "POST",
      headers,
      body: JSON.stringify({ input, weeks, teacherGuides })
    });
    return await readApiResponse(response, "Não foi possível consolidar o curso.");
  } catch (error) {
    throw annotateFailure(error, input.weeks);
  }
}

async function generate() {
  if (aiActionBusy) return;
  const input = formInput();
  const accessCode = input.accessCode;
  delete input.accessCode;
  const formSignature = JSON.stringify(input);
  if (!input.title.trim()) { showError("Informe o tema geral ou título do curso."); $("#course-title").focus(); return; }
  if (!input.objectives.length && !input.content.trim()) { showError("Informe ao menos um objetivo ou conteúdo-base para orientar a geração."); $("#objectives").focus(); return; }
  if (input.webPractice.enabled) {
    const incomplete = input.webPractices.find((practice) => !practice.title || (!practice.weekNumber && !practice.date));
    if (incomplete) { showError("Cada webprática precisa de um título e de uma semana ou data de ocorrência. Ela não será alocada automaticamente."); return; }
  }
  const generation = state.generation;
  const continuable = generation?.status === "partial"
    && Number(generation.total) === input.weeks
    && Number(generation.nextWeekIndex) === state.weeks.length
    && state.weeks.length < input.weeks;
  let resumeGeneration = continuable && generation.formSignature === formSignature;
  // O briefing mudou (por exemplo, "Preencher vazios com IA" ou um ajuste de objetivos) depois
  // das semanas geradas: o padrão é MANTER as semanas e seguir para a próxima; apagar tudo
  // só acontece se o professor escolher recomeçar.
  if (!resumeGeneration && continuable && window.confirm(`O briefing mudou desde a última semana gerada.\n\nOK = manter as ${state.weeks.length} semana(s) já geradas e gerar a semana ${state.weeks.length + 1} com o briefing atual.\nCancelar = mais opções (recomeçar do zero ou não fazer nada).`)) resumeGeneration = true;
  const startIndex = resumeGeneration ? state.weeks.length : 0;
  // Semanas já escritas não são apagadas em silêncio: se o briefing mudou depois delas,
  // recomeçar exige confirmação explícita.
  if (!resumeGeneration && state.weeks.length && !window.confirm(`Recomeçar do zero vai APAGAR as ${state.weeks.length} semana(s) já geradas deste planejamento. Apagar e recomeçar mesmo assim?\n\n(Cancelar mantém tudo como está.)`)) return;
  if (resumeGeneration && !canGenerateNext(state.flow, startIndex, stepModeEnabled())) {
    showError(`Aprove a semana ${startIndex} (ou refaça-a) antes de gerar a próxima. Desative “Aprovar cada semana antes de gerar a próxima” para gerar em sequência.`);
    openLessonPreview(startIndex - 1);
    return;
  }
  if (!resumeGeneration) {
    state.flow = emptyFlow();
    state.weeks = []; refreshStudioWeekSelect();
    state.teacherGuides = [];
    state.workload = null;
    state.generalPlan = null;
    state.validation = null;
    state.generation = null;
    $("#results-section")?.classList.add("hidden");
    $("#general-plan") && $("#general-plan").classList.add("hidden");
    $("#week-grid") && ($("#week-grid").innerHTML = "");
  }
  state.reviewMarks = resumeGeneration ? state.reviewMarks : createReviewMarks();
  state.weekApprovals = resumeGeneration ? state.weekApprovals : {};
  state.studioEdits = resumeGeneration ? (state.studioEdits || {}) : {};
  if (!resumeGeneration) state.production = emptyProduction();
  const button = $("#generate-button");
  if (!beginAiAction(button)) return;
  button.dataset.label = resumeGeneration ? `Continuar da semana ${startIndex + 1}` : "Gerar com IA";
  ["recalculate-button", "teacher-pdf-button", "zip-button"].forEach((id) => { const action = $("#" + id); if (action) action.disabled = true; });
  setBusy(button, true, "Gerando material…");
  setAiActivity(resumeGeneration ? "Retomando geração" : "Preparando geração", resumeGeneration ? `As semanas anteriores foram preservadas. Continuando pela semana ${startIndex + 1} de ${input.weeks}…` : `A IA vai construir ${input.weeks} semana(s), uma por vez, e depois consolidar o curso…`, { progress: resumeGeneration ? Math.round((startIndex / (input.weeks + 1)) * 100) : 0 });
  $("#result-alert").classList.add("hidden");
  try {
    if (isGitHubPages) {
      throw new Error("A IA está disponível na URL Vercel, onde o backend protegido pode ser acessado. Abra o ClassAuthor pela versão publicada com IA.");
    }
    const data = await generateDistributed(input, accessCode, button, { startIndex, initialWeeks: resumeGeneration ? state.weeks : [], initialTeacherGuides: resumeGeneration ? state.teacherGuides : [], formSignature, stepMode: stepModeEnabled() });
    if (data?.stepPaused) {
      button.dataset.label = `Gerar a semana ${data.index + 2}`;
      finishAiActivity("Semana pronta para revisão", `Revise a semana ${data.index + 1}, refaça se quiser e aprove para gerar a próxima.`, "success");
      openLessonPreview(data.index);
      return;
    }
    state.generation = null;
    button.dataset.label = "Gerar com IA";
    renderWeeks(data);
    finishAiActivity("Geração concluída", `${input.weeks} semana(s) foram geradas e consolidadas. Revise o resultado antes de exportar.`, "success");
  } catch (error) {
    const completedWeeks = Array.isArray(error.completedWeeks) ? error.completedWeeks : state.weeks;
    const completedTeacherGuides = Array.isArray(error.completedTeacherGuides) ? error.completedTeacherGuides : state.teacherGuides;
    const failedWeekIndex = Number.isInteger(error.failedWeekIndex) ? error.failedWeekIndex : completedWeeks.length;
    state.input = input;
    state.weeks = completedWeeks.filter(Boolean);
    state.teacherGuides = completedTeacherGuides.filter(Boolean);
    state.provider = "ai-distributed-partial";
    state.generation = { status: "partial", nextWeekIndex: Math.min(input.weeks, failedWeekIndex), total: input.weeks, formSignature, error: error.message };
    if (state.weeks.length) {
      renderWeeks({ ok: true, partial: true, provider: "ai-distributed-partial", input, weeks: state.weeks, teacherGuides: state.teacherGuides, generation: state.generation }, { scrollToResults: false });
      $("#results-section").open = true;
    } else saveDraft("geração-parcial");
    const resumeLabel = failedWeekIndex < input.weeks ? `Continuar da semana ${failedWeekIndex + 1}` : "Tentar consolidar novamente";
    button.dataset.label = resumeLabel;
    const preserved = state.weeks.length ? ` ${state.weeks.length} semana(s) concluída(s) permanecem preservada(s).` : "";
    const resumeHint = failedWeekIndex < input.weeks ? ` Clique em “${resumeLabel}” para tentar novamente sem reiniciar as semanas concluídas.` : " Clique novamente em Gerar com IA para tentar a consolidação.";
    showError(`A geração parou na semana ${Math.min(input.weeks, failedWeekIndex + 1)}. ${error.message}.${preserved}${resumeHint}`);
    finishAiActivity("Geração interrompida", `A semana ${Math.min(input.weeks, failedWeekIndex + 1)} falhou, mas o progresso foi preservado.${resumeHint}`, "error");
  } finally {
    setBusy(button, false, "");
    endAiAction();
  }
}

// ---------- Produção audiovisual: roteiros, slides, narração e planilha ----------

function emptyProduction() { return { course: null, weeks: {} }; }
function normalizeProductionState(value) {
  const data = value && typeof value === "object" ? value : {};
  return { course: data.course && typeof data.course === "object" ? data.course : null, weeks: data.weeks && typeof data.weeks === "object" ? data.weeks : {} };
}

function updateProductionSheetButton() {
  const button = $("#production-sheet-button");
  if (button) button.disabled = !hasProduction(state.production);
}

function productionMarkup(index, released) {
  const production = state.production?.weeks?.[index];
  const videos = productionVideos({ course: null, weeks: { [index]: production || {} } });
  const summary = production ? `<ul>${videos.map((video) => `<li><strong>${escapeHtml(video.kind)}</strong> · ${escapeHtml(video.title || "")} — ${formatDuration(video.seconds)} · ${escapeHtml(video.mode)}</li>`).join("")}</ul>${production.slides?.slides?.length ? `<small>Apresentação: ${production.slides.slides.length} slides · narração de ${production.slides.wordCount} palavras (~${production.slides.estimatedMinutes} min).</small>` : ""}${(production.missing || []).length ? `<p class="reader-note"><strong>Faltou gerar:</strong> ${escapeHtml(production.missing.join(", "))}. Clique em “Gerar de novo”.</p>` : ""}` : "";
  const gate = released ? "" : `<p class="reader-note">Disponível depois que a semana for conferida e liberada (botão “Liberar após conferência”, na grade das semanas): o roteiro parte do texto aprovado.</p>`;
  const any = hasProduction(state.production);
  return `<section class="reader-production"><h3>Produção audiovisual (roteiros, slides e narração)</h3><p>A partir do texto desta semana, gera o vídeo de abertura do Moodle, o vídeo curto de WhatsApp e a apresentação de slides com a narração para a sua voz clonada. Tudo entra na planilha de produção.</p>${summary}${gate}<div class="reader-actions"><button type="button" class="secondary" id="production-week-button" ${released ? "" : "disabled"}>${production ? "Gerar de novo os roteiros desta semana" : "Gerar roteiros e slides desta semana"}</button><button type="button" class="secondary" id="production-sheet-button-card" ${any ? "" : "disabled"}>Baixar planilha de produção (.xlsx)</button><button type="button" class="secondary" id="production-md-button" ${any ? "" : "disabled"}>Roteiros (.md)</button></div><small>Os vídeos da UC (abertura da sala, aviso no WhatsApp e encerramento) ficam no quadro “Vídeos da UC”, no fim dos resultados, e só são liberados depois da última semana.</small><p id="production-note" class="reader-note" aria-live="polite"></p></section>`;
}

function productionHeaders() {
  const input = formInput();
  const accessCode = input.accessCode || $("#access-code")?.value || "";
  delete input.accessCode;
  const headers = { "Content-Type": "application/json" };
  if (accessCode) headers["x-aula-access-code"] = accessCode;
  return { input, headers };
}

async function generateProductionWeek(index) {
  if (aiActionBusy) return;
  const button = $("#production-week-button");
  if (!beginAiAction(button)) return;
  setBusy(button, true, "Gerando…");
  setAiActivity("Roteiros e slides", `Escrevendo os roteiros de vídeo e a apresentação com narração da semana ${index + 1}…`);
  try {
    const { input, headers } = productionHeaders();
    const theme = (week) => week?.lessonPlan?.theme || week?.meta?.title || "";
    const response = await fetch("/api/production", { method: "POST", headers, signal: AbortSignal.timeout(280000), body: JSON.stringify({ action: "production", scope: "week", input, weekIndex: index, week: state.weeks[index], previousTheme: index > 0 ? theme(state.weeks[index - 1]) : "", nextTheme: theme(state.weeks[index + 1]) }) });
    const done = await readApiResponse(response, `Não foi possível gerar os roteiros da semana ${index + 1}.`);
    state.production = normalizeProductionState(state.production);
    state.production.weeks[index] = done.production;
    saveDraft("producao-gerada");
    updateProductionSheetButton();
    renderProductionUcCard();
    openLessonPreview(index);
    const missing = done.production.missing?.length ? ` Faltou: ${done.production.missing.join(", ")}.` : "";
    finishAiActivity("Roteiros gerados", `A semana ${index + 1} entrou na planilha de produção.${missing}`, done.production.missing?.length ? "error" : "success");
  } catch (error) {
    finishAiActivity("Roteiros não gerados", error.message, "error");
    const note = $("#production-note");
    if (note) note.textContent = `Os roteiros NÃO foram gerados: ${error.message}`;
  } finally {
    setBusy(button, false, "");
    endAiAction();
  }
}

// Semana liberada = aprovada no fluxo semana a semana, liberada por você após conferência ou aprovada pela análise automática.
function weekReleased(index) {
  if (state.weekApprovals?.[index] || state.flow?.approved?.[index]) return true;
  const status = state.validation?.weeks?.[index]?.status || state.weeks?.[index]?.contentQuality?.status || "review";
  return ["ready", "complete"].includes(status);
}

function productionCourseGate() {
  const total = Number(state.input?.weeks) || state.weeks.length;
  const missing = Math.max(0, total - state.weeks.length);
  const pending = state.weeks.map((_, index) => index).filter((index) => !weekReleased(index)).map((index) => index + 1);
  return { total, missing, pending, ready: Boolean(total) && !missing && !pending.length };
}

function renderProductionUcCard() {
  const card = $("#production-uc-card");
  if (!card) return;
  if (!state.weeks.length) { card.classList.add("hidden"); card.innerHTML = ""; return; }
  const gate = productionCourseGate();
  const course = state.production?.course;
  const status = gate.ready ? "Todas as semanas estão liberadas: já dá para gerar." : gate.missing ? `Ainda faltam ${gate.missing} semana(s) para serem geradas.` : `Falta liberar a(s) semana(s) ${gate.pending.join(", ")}.`;
  const videos = course?.videos?.length ? `<ul>${course.videos.map((video) => `<li><strong>${escapeHtml(video.title || "")}</strong> · ${escapeHtml(video.platform || "")} — ${formatDuration(video.durationSeconds)}</li>`).join("")}</ul>` : "";
  card.classList.remove("hidden");
  card.innerHTML = `<p class="eyebrow">PRODUÇÃO AUDIOVISUAL</p><h3>Vídeos da UC</h3><p>Abertura da sala no Moodle, aviso no WhatsApp de que a UC já está no ar e encerramento. São gerados só depois que a última semana estiver planejada, revisada e liberada, porque os roteiros apresentam o percurso inteiro.</p><p class="production-uc-status ${gate.ready ? "is-ready" : ""}">${escapeHtml(status)}</p>${videos}<div class="reader-actions"><button type="button" class="button button-secondary" id="production-course-button" ${gate.ready ? "" : "disabled"}>${course?.videos?.length ? "Gerar de novo os vídeos da UC" : "Gerar vídeos da UC"}</button><button type="button" class="button button-secondary" id="production-uc-sheet-button" ${hasProduction(state.production) ? "" : "disabled"}>Baixar planilha de produção (.xlsx)</button><button type="button" class="button button-secondary" id="production-uc-md-button" ${hasProduction(state.production) ? "" : "disabled"}>Roteiros (.md)</button></div><p id="production-uc-note" class="reader-note" aria-live="polite"></p>`;
  $("#production-course-button")?.addEventListener("click", generateProductionCourse);
  $("#production-uc-sheet-button")?.addEventListener("click", downloadProductionSheet);
  $("#production-uc-md-button")?.addEventListener("click", downloadProductionMarkdown);
}

async function generateProductionCourse() {
  if (aiActionBusy) return;
  const gate = productionCourseGate();
  const note = $("#production-uc-note");
  if (!gate.ready) { if (note) note.textContent = "Gere e libere todas as semanas antes de gerar os vídeos da UC."; return; }
  const button = $("#production-course-button");
  if (!beginAiAction(button)) return;
  setBusy(button, true, "Gerando…");
  setAiActivity("Vídeos da UC", "Escrevendo a abertura da sala, o aviso de WhatsApp e o encerramento da UC a partir das semanas liberadas…");
  try {
    const { input, headers } = productionHeaders();
    const response = await fetch("/api/production", { method: "POST", headers, signal: AbortSignal.timeout(280000), body: JSON.stringify({ action: "production", scope: "course", input, weeks: state.weeks }) });
    const done = await readApiResponse(response, "Não foi possível gerar os vídeos da UC.");
    state.production = normalizeProductionState(state.production);
    state.production.course = done.production;
    saveDraft("producao-uc-gerada");
    updateProductionSheetButton();
    renderProductionUcCard();
    finishAiActivity("Vídeos da UC gerados", "Abertura, WhatsApp e encerramento da UC entraram na planilha de produção.", "success");
  } catch (error) {
    finishAiActivity("Vídeos da UC não gerados", error.message, "error");
    const failure = $("#production-uc-note");
    if (failure) failure.textContent = `Os vídeos da UC NÃO foram gerados: ${error.message}`;
  } finally {
    setBusy($("#production-course-button"), false, "");
    endAiAction();
  }
}

async function downloadProductionSheet() {
  if (!hasProduction(state.production)) { showError("Gere primeiro os roteiros de pelo menos uma semana (ou da UC) para montar a planilha."); return; }
  try {
    if (!window.JSZip) throw new Error("O componente de ZIP ainda não carregou. Recarregue a página e tente novamente.");
    const title = state.input?.title || formInput().title;
    const blob = await createProductionWorkbook(window.JSZip, state.production, { title }, "blob");
    downloadBlob(blob, `${slugify(title)}-planilha-de-producao.xlsx`);
  } catch (error) { showError(error.message); }
}

function downloadProductionMarkdown() {
  if (!hasProduction(state.production)) return;
  const title = state.input?.title || formInput().title;
  downloadBlob(new Blob([productionMarkdown(state.production, { title })], { type: "text/markdown;charset=utf-8" }), `${slugify(title)}-roteiros-de-video.md`);
}

async function downloadZip() {
  if (!state.weeks.length) return;
  const button = $("#zip-button");
  button.disabled = true; button.classList.add("is-loading");
  try {
    const currentInput = formInput();
    if (isGitHubPages) {
      if (!window.JSZip) throw new Error("O componente de ZIP ainda não carregou. Recarregue a página e tente novamente.");
      const zip = new window.JSZip();
      state.weeks.forEach((lesson, index) => { zip.file(`classatelier/${weekFileName(lesson, index, "ClassAtelier.json")}`, JSON.stringify(studentProjectFor(index), null, 2)); zip.file(`classauthor/${weekFileName(lesson, index, "ClassAuthor.json")}`, JSON.stringify(toGeneratorWeek(lesson, state.teacherGuides?.[index]), null, 2)); const xml = createMoodleXml(lesson, { courseTitle: currentInput.title, weekNumber: index + 1 }); if (xml) zip.file(`moodle/${weekFileName(lesson, index, "Quiz.xml")}`, xml); });
      if (state.generalPlan) zip.file("planejamento-geral.json", JSON.stringify(state.generalPlan, null, 2));
      zip.file("professor/LEIA-ME.txt", "O Material de Mediação em PDF é gerado na versão Vercel com backend. Este modo público contém apenas o exemplo do aluno.");
      downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), `${slugify(currentInput.title)}-semanas.zip`);
      return;
    }
    const response = await fetch("/api/zip", { method: "POST", headers: apiHeaders(), body: JSON.stringify({ input: currentInput, weeks: state.weeks, teacherGuides: state.teacherGuides, weekApprovals: state.weekApprovals, production: state.production }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Não foi possível montar o ZIP."); }
    downloadBlob(await response.blob(), `${slugify(currentInput.title)}-semanas.zip`);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; button.classList.remove("is-loading"); }
}

async function downloadTeacherPdf() {
  if (!state.weeks.length) return;
  if (isGitHubPages) { showError("O Material de Mediação em PDF é gerado na URL Vercel, onde o backend está protegido. Use o pacote completo na versão com IA."); return; }
  const button = $("#teacher-pdf-button");
  button.disabled = true; button.classList.add("is-loading");
  try {
    const currentInput = formInput();
    const response = await fetch("/api/teacher-pdf", { method: "POST", headers: apiHeaders(), body: JSON.stringify({ input: currentInput, weeks: state.weeks, teacherGuides: state.teacherGuides, weekApprovals: state.weekApprovals, production: state.production }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Não foi possível criar o Material de Mediação em PDF."); }
    downloadBlob(await response.blob(), `${slugify(currentInput.title)}-material-de-mediacao.pdf`);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; button.classList.remove("is-loading"); }
}

async function recalculateQuality() {
  if (!state.weeks.length || isGitHubPages) { if (isGitHubPages) showError("O recálculo do curso está disponível na versão Vercel com backend."); return; }
  if (aiActionBusy) return;
  const button = $("#recalculate-button");
  if (!beginAiAction(button)) return;
  button.dataset.label = "Recalcular qualidade";
  setBusy(button, true, "Recalculando…");
  setAiActivity("Recalculando qualidade", "A IA está conferindo conteúdo, referências, carga e checklists…");
  try {
    const totalWeeks = Number(state.input?.weeks || state.weeks.length);
    const allowPartial = state.weeks.length < totalWeeks;
    const response = await fetch("/api/assemble-course", { method: "POST", headers: apiHeaders(), body: JSON.stringify({ input: state.input, weeks: state.weeks, teacherGuides: state.teacherGuides, allowPartial }) });
    const data = await readApiResponse(response, "Não foi possível recalcular a qualidade do curso.");
    renderWeeks({ ...data, input: state.input, partial: Boolean(data.partial), generation: state.generation }, { scrollToResults: false });
    $("#result-alert").className = "result-alert";
    $("#result-alert").textContent = data.partial
      ? `Qualidade, checklist e carga recalculados para ${data.availableWeeks} de ${data.requestedWeeks} semana(s), sem nova chamada de IA. As demais continuam pendentes.`
      : "Qualidade, checklist e carga recalculados sem nova chamada de IA.";
    $("#result-alert").classList.remove("hidden");
    finishAiActivity("Qualidade recalculada", "Checklists, carga e diagnóstico foram atualizados sem gerar novas semanas.", "success");
  } catch (error) {
    showError(error.message);
    finishAiActivity("Recálculo não concluído", error.message, "error");
  } finally {
    setBusy(button, false, "");
    endAiAction();
  }
}

async function loadHealth() {
  const status = $("#api-status");
  if (isGitHubPages) {
    aiConfigured = false;
    status.innerHTML = '<span class="status-dot warning"></span>modo público · sem IA';
    document.querySelectorAll(".vercel-access").forEach((item) => item.classList.add("hidden"));
    setButtonLabel($("#assist-button"), "IA indisponível nesta URL");
    setButtonLabel($("#generate-button"), "IA indisponível nesta URL");
    refreshAiButtonAvailability();
    return;
  }
  status.innerHTML = '<span class="status-dot warning"></span>verificando servidor…';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`/api/health?check=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`health HTTP ${response.status}`);
      const data = await response.json();
      if (!data || data.ok === false) throw new Error("health inválido");
      aiConfigured = Boolean(data.aiConfigured);
      status.innerHTML = `<span class="status-dot ${data.aiConfigured ? "online" : "warning"}"></span>${data.aiConfigured ? (data.accessRequired ? "IA configurada · acesso protegido" : "IA configurada") : `modo exemplo · chave pendente${data.missingKey ? ` (${data.missingKey}${data.environment ? ` não definida no ambiente ${data.environment}` : ""})` : ""}`}${data.aiConfigured && data.resourceResearch && !data.youtubeConfigured ? " · vídeos aguardando chave" : ""}`;
      if (!data.aiConfigured) {
        setButtonLabel($("#assist-button"), "IA pendente");
        setButtonLabel($("#generate-button"), "IA pendente");
      }
      refreshAiButtonAvailability();
      return;
    } catch {
      if (attempt < 2) {
        status.innerHTML = '<span class="status-dot warning"></span>reconectando ao servidor…';
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
  }
  aiConfigured = false;
  status.innerHTML = '<span class="status-dot offline"></span>servidor indisponível · tente recarregar';
  refreshAiButtonAvailability();
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
$("#new-project-link").addEventListener("click", startNewProject);
$("#exit-session-button").addEventListener("click", exitSession);
$("#studio-open-button").addEventListener("click", () => { const chosen = $("#studio-week-select").value; openInStudio(chosen === "" ? null : Number(chosen)); });
$("#course-form").addEventListener("submit", (event) => { event.preventDefault(); generate(); });
initStepMode();
$("#assist-button").addEventListener("click", assistBriefing);
$("#zip-button").addEventListener("click", downloadZip);
$("#production-sheet-button")?.addEventListener("click", downloadProductionSheet);
$("#teacher-pdf-button").addEventListener("click", downloadTeacherPdf);
$("#recalculate-button").addEventListener("click", recalculateQuality);
$("#close-lesson-modal").addEventListener("click", closeLessonPreview);
$("#close-lesson-modal-secondary").addEventListener("click", closeLessonPreview);
$("#regenerate-week-button").addEventListener("click", regenerateSelectedWeek);
$("#lesson-modal").addEventListener("click", (event) => { if (event.target.id === "lesson-modal") closeLessonPreview(); });
$("#ai-activity-dismiss").addEventListener("click", hideAiActivity);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && state.previewIndex != null) closeLessonPreview(); });
window.addEventListener("resize", syncRecoveryLayout);
window.addEventListener("scroll", keepWorkspaceAtTop, { passive: true });
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
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
$("#generate-button").dataset.label = "Gerar com IA";
$("#assist-button").dataset.label = "Preencher vazios com IA";
$("#recalculate-button").dataset.label = "Recalcular qualidade";
initializeWelcome();
enhanceLayout();
renderResourcePlanWeeks(); renderCompositionPlanWeeks(); toggleCalendar(); togglePractice(); updateAcademicInheritance(); updateSummary(); updateProgress(); offerDraftRecovery(); loadHealth();
