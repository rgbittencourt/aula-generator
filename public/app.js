const $ = (selector) => document.querySelector(selector);
const isGitHubPages = window.location.hostname.endsWith(".github.io");
const state = { input: null, weeks: [], workload: null, provider: null };
const blockLabels = { hero: "Abertura", topic: "Tópico", prose: "Texto", titulo: "Título", video: "Vídeo", materiais: "Materiais", quiz: "Quiz", destaque: "Destaque", atencao: "Atenção", reflexao: "Reflexão", imagem: "Imagem", externalembed: "Conteúdo externo", accordion: "FAQ", columns: "Colunas", referencias: "Referências" };

function splitLines(value) { return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function formatDate(value) { return value ? value.split("-").reverse().join("/") : ""; }
function slugify(value) { return String(value || "curso").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "curso"; }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function addDays(dateString, days) { const date = new Date(`${dateString}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

function formInput() {
  const calendarMode = $("#calendar-mode").value;
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
    references: splitLines($("#references").value),
    videoLinks: splitLines($("#videos").value),
    accessCode: $("#access-code")?.value || "",
    webPracticeEnabled: $("#practice-enabled").checked,
    webPractice: {
      enabled: $("#practice-enabled").checked,
      moments: splitLines($("#practice-moments").value),
      instructions: `${$("#practice-type").value}. ${$("#practice-instructions").value}`.trim(),
      durationMinutes: Number($("#practice-duration").value) || 0
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
  $("#summary-practice").textContent = $("#practice-enabled").checked ? "Sim" : "Não";
  $("#workload-preview strong").textContent = `${hours * weeks} horas totais`;
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
  document.querySelectorAll("#practice-fields input, #practice-fields textarea, #practice-fields select").forEach((item) => { item.disabled = !enabled; });
  updateSummary();
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.classList.toggle("is-loading", busy);
  button.querySelector("span:first-child").textContent = busy ? label : button.dataset.label;
}

function showError(message) {
  const alert = $("#result-alert");
  alert.textContent = message;
  alert.className = "result-alert error-alert";
  alert.classList.remove("hidden");
  $("#results-section").classList.remove("hidden");
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
  if (input.webPractice.enabled) blocks.push({ id: id("b-practice-", 5), type: "destaque", bg: "neutral-default", pad: "tight", props: { title: "Webprática", body: `<p>${escapeHtml(input.webPractice.instructions || "Aplique o conteúdo em uma atividade orientada na web.")}</p>`, tone: "ocean", icon: "" } });
  if (input.videoLinks.length) {
    const match = input.videoLinks[0].match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&#/]+)/i);
    if (match) blocks.push({ id: id("b-video-", 6), type: "video", bg: "neutral-default", pad: "normal", props: { id: match[1], title: "Vídeo recomendado", caption: "Material complementar.", credit: "", start: "" } });
  }
  if (input.references.length) blocks.push({ id: id("b-materials-", 7), type: "materiais", bg: "neutral-default", pad: "normal", props: { title: "Referências e materiais", items: input.references.map((href, i) => ({ type: "artigo", title: `Referência ${i + 1}`, source: "Material indicado", href })) } });
  return { meta: { title: `${input.title} — ${calendar.label}`, courseTitle: input.title, weekNumber: week, weekLabel: calendar.label, calendarStartDate: calendar.startDate, calendarEndDate: calendar.endDate, studyHours: input.hoursPerWeek, author: input.author, role: "", institution: input.institution, year: new Date().getFullYear().toString(), aiTool: "", aiUse: "", license: "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pt-br" }, blocks };
}

function staticDemo(input) {
  const weeks = Array.from({ length: input.weeks }, (_, index) => fallbackLesson(input, index));
  return { ok: true, provider: "static-demo", model: null, input, workload: { totalHours: input.hoursPerWeek * input.weeks, totalMinutes: Math.round(input.hoursPerWeek * input.weeks * 60), formulaStatus: "pending-spreadsheet", weeks: weeks.map((_, index) => ({ weekNumber: index + 1, totalHours: input.hoursPerWeek, totalMinutes: Math.round(input.hoursPerWeek * 60), formulaStatus: "pending-spreadsheet" })) }, weeks, filePrefix: slugify(input.title) };
}

function renderWorkload(workload) {
  if (!workload) return;
  const suffix = workload.formulaStatus === "configured" ? "fórmula configurada" : "fórmulas da planilha pendentes";
  $("#workload-preview small").textContent = `${suffix} · ${workload.totalMinutes} minutos totais`;
}

function renderWeeks(data) {
  state.input = data.input; state.weeks = data.weeks; state.workload = data.workload; state.provider = data.provider;
  $("#results-title").textContent = `${data.weeks.length} semanas prontas para revisão`;
  $("#results-subtitle").textContent = data.provider === "static-demo" ? "Modo público GitHub Pages: exemplo gerado no navegador, sem API." : data.provider === "fallback" ? "Exemplo local gerado sem API; use-o para validar o fluxo." : `Gerado por IA com ${data.model || "o provedor configurado"}. Revise antes de publicar.`;
  $("#results-section").classList.remove("hidden");
  $("#empty-state").classList.add("hidden");
  const alert = $("#result-alert");
  alert.className = "result-alert";
  alert.textContent = data.provider === "static-demo" ? "Esta versão pública gera exemplos diretamente no navegador. A IA será conectada em uma hospedagem com backend protegido quando você escolher essa opção." : data.provider === "fallback" ? "Este é um exemplo estrutural. A geração por IA será ativada quando OPENAI_API_KEY estiver configurada." : "A geração terminou. Baixe cada semana ou o ZIP para abrir e revisar no Aula Studio.";
  const cards = data.weeks.map((lesson, index) => {
    const meta = lesson.meta || {};
    const workload = data.workload?.weeks?.[index];
    const types = [...new Set((lesson.blocks || []).map((block) => blockLabels[block.type] || block.type))].slice(0, 5);
    const date = meta.calendarStartDate ? `${formatDate(meta.calendarStartDate)}–${formatDate(meta.calendarEndDate)}` : meta.weekLabel;
    return `<article class="week-card"><div class="week-card-top"><span class="week-number">${String(index + 1).padStart(2, "0")}</span><span class="week-date">${escapeHtml(date || `Semana ${index + 1}`)}</span></div><h3>${escapeHtml(meta.title || `Semana ${index + 1}`)}</h3><p class="week-objective">${escapeHtml((lesson.blocks?.find((b) => b.type === "hero")?.props?.lead) || "Conteúdo semanal pronto para revisão.")}</p><div class="week-metrics"><span>${workload?.totalHours ?? meta.studyHours ?? "—"} h</span><span>${lesson.blocks?.length || 0} blocos</span></div><div class="tag-row">${types.map((type) => `<span>${escapeHtml(type)}</span>`).join("")}</div><button class="week-download" data-index="${index}" type="button">Baixar .aula.json <span>↓</span></button></article>`;
  }).join("");
  $("#week-grid").innerHTML = cards;
  $("#week-grid").querySelectorAll(".week-download").forEach((button) => button.addEventListener("click", () => downloadWeek(Number(button.dataset.index))));
  renderWorkload(data.workload);
  $("#results-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function downloadWeek(index) {
  const lesson = state.weeks[index];
  if (!lesson) return;
  const number = String(index + 1).padStart(2, "0");
  downloadBlob(new Blob([JSON.stringify(lesson, null, 2)], { type: "application/json" }), `semana-${number}-${slugify(lesson.meta?.title)}.aula.json`);
}

async function generate(fallback = false) {
  const input = formInput();
  const accessCode = input.accessCode;
  delete input.accessCode;
  if (!input.title.trim()) { showError("Informe o tema geral ou título do curso."); $("#course-title").focus(); return; }
  if (!input.objectives.length && !input.content.trim()) { showError("Informe ao menos um objetivo ou conteúdo-base para orientar a geração."); $("#objectives").focus(); return; }
  const button = fallback ? $("#fallback-button") : $("#generate-button");
  button.dataset.label = fallback ? "Gerar exemplo local" : "Gerar com IA";
  setBusy(button, true, fallback ? "Montando exemplo…" : "Gerando material…");
  $("#result-alert").classList.add("hidden");
  try {
    if (isGitHubPages) {
      if (!fallback) throw new Error("A IA está desativada nesta versão pública. Use 'Gerar exemplo local' ou solicite a publicação do backend protegido.");
      renderWeeks(staticDemo(input));
      return;
    }
    const headers = { "Content-Type": "application/json" };
    if (accessCode) headers["x-aula-access-code"] = accessCode;
    const response = await fetch("/api/generate", { method: "POST", headers, body: JSON.stringify({ input, fallback }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Não foi possível gerar o curso.");
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
      downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), `${slugify(state.input.title)}-semanas.zip`);
      return;
    }
    const response = await fetch("/api/zip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: state.input, weeks: state.weeks }) });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Não foi possível montar o ZIP."); }
    downloadBlob(await response.blob(), `${slugify(state.input.title)}-semanas.zip`);
  } catch (error) { showError(error.message); }
  finally { button.disabled = false; button.classList.remove("is-loading"); }
}

async function loadHealth() {
  const status = $("#api-status");
  if (isGitHubPages) {
    status.innerHTML = '<span class="status-dot warning"></span>modo público · sem IA';
    document.querySelectorAll(".vercel-access").forEach((item) => item.classList.add("hidden"));
    $("#generate-button").disabled = true;
    $("#generate-button").querySelector("span:first-child").textContent = "IA indisponível nesta URL";
    return;
  }
  try {
    const data = await (await fetch("/api/health")).json();
    status.innerHTML = `<span class="status-dot ${data.aiConfigured ? "online" : "warning"}"></span>${data.aiConfigured ? (data.accessRequired ? "IA configurada · código necessário" : "IA configurada") : "modo exemplo · chave pendente"}`;
  } catch { status.innerHTML = '<span class="status-dot offline"></span>servidor indisponível'; }
}

$("#course-form").addEventListener("submit", (event) => { event.preventDefault(); generate(false); });
$("#fallback-button").addEventListener("click", () => generate(true));
$("#zip-button").addEventListener("click", downloadZip);
$("#calendar-mode").addEventListener("change", toggleCalendar);
$("#practice-enabled").addEventListener("change", togglePractice);
document.querySelectorAll("#course-form input, #course-form textarea, #course-form select").forEach((field) => field.addEventListener("input", updateSummary));
$("#generate-button").dataset.label = "Gerar com IA";
$("#fallback-button").dataset.label = "Gerar exemplo local";
toggleCalendar(); togglePractice(); updateSummary(); loadHealth();
