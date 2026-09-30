export const DEFAULT_LICENSE = "https://creativecommons.org/licenses/by-nc-sa/4.0/deed.pt-br";

export const KNOWN_BLOCK_TYPES = new Set([
  "hero", "topic", "topic-collapsible", "topic-slider", "divider", "pagebreak",
  "titulo", "sintese", "referencias", "prose", "citacao", "eyebrow", "destaque",
  "atencao", "reflexao", "pitaco", "imagem", "parallax", "video", "audio", "cases",
  "feature", "textoimagem", "filmstrip", "tabela", "flashcards", "slider", "accordion",
  "columns", "externalembed", "linhadotempo", "quiz", "materiais", "collapsebreak"
]);

const ROOT_TYPES = new Set(["hero", "pagebreak", "sintese", "referencias", "parallax", "topic", "topic-collapsible", "topic-slider", "divider"]);
const NESTED_KEYS = ["children", "items", "columns", "eras", "events", "cards", "steps", "questions", "features"];

const text = (value, fallback = "") => String(value ?? fallback).trim();
const integer = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};
const number = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function splitLines(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  return text(value).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function slugify(value, fallback = "aula") {
  const slug = text(value, fallback).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizePractice(value = {}, index = 0) {
  const practice = value && typeof value === "object" ? value : {};
  return {
    id: text(practice.id, `webpractice-${index + 1}`),
    title: text(practice.title, `Webprática ${index + 1}`),
    type: text(practice.type, "Pesquisa orientada"),
    moments: splitLines(practice.moments || practice.moment),
    objective: text(practice.objective),
    instructions: text(practice.instructions),
    product: text(practice.product),
    assessment: text(practice.assessment),
    durationMinutes: Math.max(0, number(practice.durationMinutes, 45))
  };
}

function normalizeMaterial(value = {}, index = 0) {
  const material = value && typeof value === "object" ? value : {};
  return {
    id: text(material.id, `material-${index + 1}`),
    type: text(material.type, "Texto-base"),
    title: text(material.title),
    link: text(material.link || material.href),
    moment: text(material.moment),
    objective: text(material.objective),
    alignment: text(material.alignment || material.contentAlignment),
    use: text(material.use || material.howToUse),
    notes: text(material.notes)
  };
}

export function normalizeCourseInput(raw = {}) {
  const calendarMode = raw.calendarMode === "calendar" ? "calendar" : "week-number";
  const weeks = Math.min(52, Math.max(1, integer(raw.weeks, 1)));
  const hoursPerWeek = Math.min(80, Math.max(0, number(raw.hoursPerWeek, 4)));
  const practice = raw.webPractice && typeof raw.webPractice === "object" ? raw.webPractice : {};
  const enabled = Boolean(raw.webPracticeEnabled ?? practice.enabled ?? (Array.isArray(raw.webPractices) && raw.webPractices.length));
  const rawPractices = Array.isArray(raw.webPractices) ? raw.webPractices : [];
  const webPractices = enabled ? (rawPractices.length ? rawPractices.map(normalizePractice) : [normalizePractice(practice, 0)]) : [];
  const legacyMoments = webPractices.flatMap((item) => item.moments);
  const legacyInstructions = webPractices.map((item) => `${item.title}: ${item.instructions}`).filter(Boolean).join("\n");
  const materials = Array.isArray(raw.materials) ? raw.materials.map(normalizeMaterial).filter((material) => material.title || material.objective || material.alignment || material.link || material.use) : [];
  return {
    title: text(raw.title || raw.generalTheme, "Curso sem título"),
    audience: text(raw.audience, "Adultos em formação"),
    level: text(raw.level, "Intermediário"),
    objectives: splitLines(raw.objectives),
    content: text(raw.content),
    references: splitLines(raw.references),
    videoLinks: splitLines(raw.videoLinks),
    videoSearchSuggestions: splitLines(raw.videoSearchSuggestions),
    materials,
    weeks,
    hoursPerWeek,
    calendarMode,
    startDate: calendarMode === "calendar" && validDate(raw.startDate) ? raw.startDate : null,
    webPractices,
    webPractice: {
      enabled,
      moments: legacyMoments.length ? legacyMoments : splitLines(practice.moments || raw.practiceMoments),
      instructions: legacyInstructions || text(practice.instructions || raw.practiceInstructions),
      durationMinutes: webPractices.reduce((sum, item) => sum + item.durationMinutes, 0)
    },
    author: text(raw.author),
    role: text(raw.role),
    institution: text(raw.institution),
    year: text(raw.year, String(new Date().getFullYear())),
    language: text(raw.language, "pt-BR"),
    license: text(raw.license, DEFAULT_LICENSE),
    formulaConfig: raw.formulaConfig && typeof raw.formulaConfig === "object" ? raw.formulaConfig : null
  };
}

function addDays(dateString, days) {
  if (!dateString) return null;
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekCalendar(input, index) {
  const weekNumber = index + 1;
  if (input.calendarMode !== "calendar" || !input.startDate) {
    return { weekNumber, label: `Semana ${weekNumber}`, startDate: null, endDate: null };
  }
  const startDate = addDays(input.startDate, index * 7);
  const endDate = addDays(startDate, 6);
  return {
    weekNumber,
    label: `Semana ${weekNumber} · ${startDate.split("-").reverse().join("/")}`,
    startDate,
    endDate
  };
}

function newId(prefix, weekNumber, index) {
  return `${prefix}${weekNumber}-${String(index + 1).padStart(3, "0")}`;
}

function safeProps(props) {
  return props && typeof props === "object" && !Array.isArray(props) ? { ...props } : {};
}

function normalizeNested(value, weekNumber, path, seen) {
  if (!Array.isArray(value)) return value;
  return value.map((item, index) => {
    if (!item || typeof item !== "object") return item;
    if (typeof item.type === "string") return sanitizeBlock(item, weekNumber, `${path}-${index}`, seen);
    const copy = { ...item };
    for (const key of NESTED_KEYS) {
      if (Array.isArray(copy[key])) copy[key] = normalizeNested(copy[key], weekNumber, `${path}-${key}-${index}`, seen);
    }
    return copy;
  });
}

export function sanitizeBlock(raw, weekNumber = 1, path = "block", seen = new Set()) {
  if (!raw || typeof raw !== "object") return null;
  const type = text(raw.type);
  if (!KNOWN_BLOCK_TYPES.has(type)) return null;
  let id = text(raw.id, `b${weekNumber}-${path}`);
  if (seen.has(id)) id = `${id}-${seen.size + 1}`;
  seen.add(id);
  const props = safeProps(raw.props);
  for (const key of NESTED_KEYS) {
    if (Array.isArray(props[key])) props[key] = normalizeNested(props[key], weekNumber, `${id}-${key}`, seen);
  }
  if (type === "topic" || type === "topic-collapsible" || type === "topic-slider") {
    props.children = Array.isArray(props.children) ? props.children.filter(Boolean) : [];
  }
  return {
    id,
    type,
    ...(ROOT_TYPES.has(type) ? { bg: text(raw.bg, "neutral-default"), pad: text(raw.pad, "normal") } : {}),
    props
  };
}

export function weekMeta(input, index) {
  const calendar = weekCalendar(input, index);
  return {
    title: `${input.title} — ${calendar.label}`,
    courseTitle: input.title,
    weekNumber: calendar.weekNumber,
    weekLabel: calendar.label,
    calendarStartDate: calendar.startDate,
    calendarEndDate: calendar.endDate,
    studyHours: input.hoursPerWeek,
    author: input.author,
    role: input.role,
    institution: input.institution,
    year: input.year,
    aiTool: "",
    aiUse: "",
    license: input.license
  };
}

function fallbackBlocks(input, index) {
  const week = index + 1;
  const calendar = weekCalendar(input, index);
  const objective = input.objectives[index % Math.max(1, input.objectives.length)] || `Compreender os fundamentos de ${input.title}.`;
  const content = input.content || `Estude os conceitos centrais de ${input.title} e relacione-os a exemplos práticos.`;
  const blocks = [
    { id: newId("b-hero-", week, 0), type: "hero", bg: "neutral-default", pad: "normal", props: {
      eyebrow: calendar.label.toUpperCase(), title: `${input.title}: ${calendar.label}`, lead: objective,
      author: input.author || "Autor", authorImage: "", readTime: `${input.hoursPerWeek} h de estudo`, date: input.year
    }},
    { id: newId("b-topic-", week, 1), type: "topic", bg: "neutral-default", pad: "normal", props: { children: [
      { id: newId("c-title-", week, 2), type: "titulo", props: { text: "Conteúdo da semana", level: "h2" } },
      { id: newId("c-prose-", week, 3), type: "prose", props: { body: `<p>${content}</p>`, dropcap: false, dropcapTone: "terracotta" } }
    ] }}
  ];
  const practices = Array.isArray(input.webPractices) && input.webPractices.length ? input.webPractices : (input.webPractice.enabled ? [input.webPractice] : []);
  practices.forEach((practice, practiceIndex) => {
    const title = practice.title || `Webprática ${practiceIndex + 1}`;
    const details = [practice.objective, practice.instructions, practice.product].filter(Boolean).join(" ") || "Aplique o conteúdo em uma atividade orientada na web.";
    blocks.push({ id: newId("b-practice-", week, 4 + practiceIndex), type: "destaque", bg: "neutral-default", pad: "tight", props: {
      title, body: `<p>${details}</p>`, tone: "ocean", icon: ""
    }});
  });
  if (input.videoLinks.length) {
    const first = input.videoLinks[0];
    const match = first.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&#/]+)/i);
    if (match) blocks.push({ id: newId("b-video-", week, 5), type: "video", bg: "neutral-default", pad: "normal", props: { id: match[1], title: "Vídeo recomendado", caption: "Material complementar.", credit: "", start: "" } });
  }
  const materialItems = [
    ...input.materials.map((material) => ({ type: material.type, title: material.title || "Material de apoio", source: material.alignment || material.objective || material.use, href: material.link })),
    ...input.references.map((href, i) => ({ type: "artigo", title: `Referência ${i + 1}`, source: "Material indicado", href }))
  ].filter((item) => item.title || item.href);
  if (materialItems.length) blocks.push({ id: newId("b-materials-", week, 20), type: "materiais", bg: "neutral-default", pad: "normal", props: { title: "Materiais de apoio", items: materialItems } });
  return blocks;
}

export function buildFallbackLesson(input, index) {
  return { meta: weekMeta(input, index), blocks: fallbackBlocks(input, index) };
}

export function normalizeLesson(raw, input, index) {
  const fallback = buildFallbackLesson(input, index);
  const source = raw && typeof raw === "object" ? raw : {};
  const seen = new Set();
  const blocks = Array.isArray(source.blocks) ? source.blocks.map((block, i) => sanitizeBlock(block, index + 1, `block-${i}`, seen)).filter(Boolean) : [];
  return {
    meta: { ...fallback.meta, ...(source.meta && typeof source.meta === "object" ? source.meta : {}), ...weekMeta(input, index) },
    blocks: blocks.length ? blocks : fallback.blocks
  };
}

export function normalizeWeeklyOutput(raw, input) {
  const candidates = Array.isArray(raw) ? raw : (Array.isArray(raw?.weeks) ? raw.weeks : []);
  return Array.from({ length: input.weeks }, (_, index) => normalizeLesson(candidates[index], input, index));
}

export function validateLesson(lesson) {
  return Boolean(lesson && lesson.meta && Array.isArray(lesson.blocks) && lesson.blocks.length > 0 && lesson.blocks.every((block) => KNOWN_BLOCK_TYPES.has(block.type)));
}
