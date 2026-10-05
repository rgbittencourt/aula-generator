import { selectResourcesWithAI } from "./resource-curator.js";
import { searchResources } from "./resource-providers.js";

const text = (value) => String(value ?? "").trim();
const positive = (value) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; };
const cleanHtml = (value) => text(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const html = (value) => cleanHtml(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function baseQuery(input, lesson) {
  const plan = lesson?.lessonPlan || {};
  const sectionTitles = (plan.contentSections || []).slice(0, 4).map((section) => section.title).filter(Boolean).join("; ");
  return [plan.theme || input.title, sectionTitles, input.language === "pt-BR" ? "português" : input.language].filter(Boolean).join(" — ").slice(0, 240);
}

function resourceTargetsFor(input, lesson) {
  const weekNumber = Number(lesson?.meta?.weekNumber || 1);
  const plan = input.resourcePlan || {};
  const defaults = plan.default || { videosPerWeek: 1, articlesPerWeek: 1, requiredReadingsPerWeek: 1, requiredReadingLevel: "essential" };
  const override = (plan.weeks || []).find((entry) => Number(entry.weekNumber) === weekNumber) || {};
  return {
    videosPerWeek: override.videosPerWeek ?? defaults.videosPerWeek ?? 1,
    articlesPerWeek: override.articlesPerWeek ?? defaults.articlesPerWeek ?? 1,
    requiredReadingsPerWeek: override.requiredReadingsPerWeek ?? defaults.requiredReadingsPerWeek ?? 1,
    requiredReadingLevel: override.requiredReadingLevel || defaults.requiredReadingLevel || "essential"
  };
}

function requestsFor(type, input, lesson) {
  const resources = lesson?.lessonPlan?.resources || {};
  const source = type === "video" ? resources.videos : type === "image" ? resources.images : [...(resources.readingsRequired || []), ...(resources.readingsExtra || [])];
  const fallback = baseQuery(input, lesson);
  const items = Array.isArray(source) ? source : [];
  const targets = resourceTargetsFor(input, lesson);
  const target = type === "video" ? Number(targets.videosPerWeek || 0) : type === "reading" ? Math.max(Number(targets.articlesPerWeek || 0), Number(targets.requiredReadingsPerWeek || 0)) : 1;
  const requests = items.filter((resource) => !resource.href).map((resource, index) => ({
    requestId: text(resource.id, `${type}-request-${index + 1}`),
    type,
    query: text(resource.searchQuery || [resource.title, resource.objective, fallback].filter(Boolean).join(" ")).slice(0, 260),
    title: resource.title,
    objective: resource.objective,
    moment: resource.moment,
    required: Boolean(resource.required),
    kind: resource.kind || resource.type,
    readingLevel: type === "reading" ? targets.requiredReadingLevel : ""
  }));
  const providedCount = items.filter((resource) => resource.href).length;
  for (let index = providedCount + requests.length; index < target; index += 1) {
    requests.push({ requestId: `${type}-generated-${index + 1}`, type, query: `${fallback} ${type === "reading" ? "artigo acadêmico" : "recurso educacional"}`, title: `${type === "reading" ? "Artigo acadêmico" : "Vídeo"} ${index + 1} para ${lesson?.lessonPlan?.theme || input.title}`, objective: "Enriquecer a unidade com um recurso contextualizado.", moment: "ponto de uso", required: type === "reading" && index < Number(targets.requiredReadingsPerWeek || 0), readingLevel: type === "reading" ? targets.requiredReadingLevel : "" });
  }
  const limit = target > 0 ? Math.max(1, target) : requests.length;
  return requests.slice(0, limit);
}

function isoDurationToMinutes(value) {
  const match = text(value).match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return 0;
  return Math.round((Number(match[1] || 0) * 60) + Number(match[2] || 0) + Number(match[3] || 0) / 60);
}

function compactResearch(research) {
  return {
    status: research.status,
    searchedAt: research.searchedAt,
    providers: research.providers,
    queries: research.queries,
    targets: research.targets || research.resourceTargets,
    selections: research.selections,
    selectionFallbacks: research.selectionFallbacks || [],
    alternatives: research.alternatives
  };
}

function flattenCandidates(research) {
  return [
    ...(research.videos || []).flatMap((result) => result.candidates || []),
    ...(research.images || []).flatMap((result) => result.candidates || []),
    ...(research.readings || []).flatMap((result) => result.candidates || [])
  ];
}

function resourceFromCandidate(candidate, selection) {
  const type = candidate.type;
  return {
    id: candidate.candidateId,
    kind: type === "reading" ? "artigo" : type,
    type,
    title: candidate.title,
    href: candidate.href,
    source: candidate.source,
    author: candidate.author,
    year: candidate.year,
    doi: candidate.doi,
    durationMinutes: positive(candidate.durationMinutes),
    required: Boolean(selection.required),
    moment: selection.moment || "ponto de uso",
    sectionNumber: text(selection.sectionNumber || selection.section || candidate.sectionNumber),
    objective: selection.use || selection.reason,
    guidingQuestion: selection.guidingQuestion,
    bridgeParagraph: text(selection.bridgeParagraph || selection.connectionParagraph || selection.use || selection.reason),
    altText: candidate.altText,
    caption: candidate.caption,
    credit: [candidate.author, candidate.source, candidate.license].filter(Boolean).join(" · "),
    license: candidate.license,
    licenseUrl: candidate.licenseUrl,
    sourcePage: candidate.sourcePage,
    thumbnail: candidate.thumbnail,
    embedHref: candidate.embedHref,
    embeddable: candidate.embeddable,
    privacyStatus: candidate.privacyStatus,
    openAccess: candidate.openAccess,
    searchQuery: selection.query,
    provider: candidate.provider,
    candidateId: candidate.candidateId,
    researchRequestId: candidate.requestId,
    selectionReason: selection.reason,
    pedagogicalUse: selection.use,
    researchStatus: "selected-by-ai",
    humanApproval: "pending",
    curation: {
      alignment: selection.alignment || selection.reason || "selecionado para um objetivo da semana",
      quality: selection.quality || "revisar fonte e autoria",
      currency: selection.currency || "revisar atualidade",
      accessibility: selection.accessibility || "revisar legenda, transcrição ou alternativa",
      durationFit: selection.durationFit || "comparar com a carga calculada",
      license: selection.license || candidate.license || "revisar licença",
      language: selection.language || "adequar ao público",
      moment: selection.moment || "ponto de uso",
      score: Number(selection.score || 0)
    },
    accessibility: {
      hasCaptions: Boolean(selection.hasCaptions),
      hasTranscript: Boolean(selection.hasTranscript),
      summary: text(selection.accessibilitySummary),
      lowBandwidthAlternative: text(selection.lowBandwidthAlternative),
      altText: candidate.altText || candidate.caption || "",
      diagramAlternative: text(selection.diagramAlternative)
    },
    videoAccessibility: type === "video" ? { hasCaptions: Boolean(selection.hasCaptions), hasTranscript: Boolean(selection.hasTranscript), summary: text(selection.accessibilitySummary), lowBandwidthAlternative: text(selection.lowBandwidthAlternative) } : null,
    verificationStatus: "ai-selected-from-provider-needs-human-review",
    requiresVerification: true,
    notes: "Recurso localizado por provedor e selecionado pela IA; confira disponibilidade, licença e adequação antes da publicação."
  };
}

function selectedEntries(type, rawSelection, results) {
  const candidates = results.flatMap((result) => result.candidates || []);
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const raw = Array.isArray(rawSelection?.[type]) ? rawSelection[type] : [];
  const chosen = raw.filter((selection) => selection && selection.keep !== false && byId.has(selection.candidateId)).map((selection) => resourceFromCandidate(byId.get(selection.candidateId), selection));
  return { chosen, raw, candidates };
}

function fallbackSelection(results) {
  return results.flatMap((result) => {
    const candidate = result.candidates?.[0];
    return candidate ? [{ candidateId: candidate.candidateId, keep: true, reason: "Primeiro candidato retornado pelo provedor; revisar manualmente.", use: result.request.objective || "Recurso contextualizado para a semana.", required: result.request.required, moment: result.request.moment, query: result.request.query }] : [];
  });
}

function ensureSelectionCoverage(selection, type, results, limit) {
  const raw = Array.isArray(selection?.[type]) ? selection[type] : null;
  if (limit <= 0) return { items: [], fallback: "" };
  const candidateIds = new Set(results.flatMap((result) => result.candidates || []).map((candidate) => candidate.candidateId));
  const hasCandidates = candidateIds.size > 0;
  const hasInvalidPositiveSelection = Array.isArray(raw) && raw.some((item) => item?.keep !== false && !candidateIds.has(item?.candidateId));
  // Uma resposta vazia ou com IDs inexistentes é falha de formato, não uma
  // decisão pedagógica. Usa-se o primeiro candidato apenas como fallback
  // rastreável e ainda pendente de aprovação humana.
  if (hasCandidates && (raw === null || raw.length === 0 || hasInvalidPositiveSelection)) {
    return { items: fallbackSelection(results).slice(0, limit), fallback: `${type}: resposta da curadoria sem seleção utilizável; primeiro candidato inserido para revisão humana.` };
  }
  if (hasCandidates && limit > 0) {
    const selectedIds = new Set((raw || []).filter((item) => item?.keep !== false && candidateIds.has(item?.candidateId)).map((item) => item.candidateId));
    const additions = fallbackSelection(results).filter((item) => !selectedIds.has(item.candidateId));
    if (selectedIds.size < limit && additions.length) return { items: [...(raw || []), ...additions].slice(0, limit), fallback: `${type}: a curadoria foi completada com candidatos adicionais para atingir a quantidade solicitada.` };
  }
  return { items: raw || [], fallback: "" };
}

function blockKey(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "recurso"; }
function youtubeId(value) { return text(value).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&#/]+)/i)?.[1] || ""; }

function walkBlocks(blocks, callback) {
  (blocks || []).forEach((block) => {
    callback(block);
    if (Array.isArray(block?.props?.children)) walkBlocks(block.props.children, callback);
  });
}

function attachResourcesToSections(lesson, selectedResources) {
  const sections = Array.isArray(lesson?.lessonPlan?.contentSections) ? lesson.lessonPlan.contentSections : [];
  if (!sections.length) return lesson;
  const all = [...selectedResources.videos, ...selectedResources.images, ...selectedResources.readings];
  const used = new Set();
  const nextSections = sections.map((section) => ({ ...section, resources: Array.isArray(section.resources) ? [...section.resources] : [] }));
  all.forEach((resource, index) => {
    const explicit = Number.parseInt(resource.sectionNumber, 10);
    let sectionIndex = Number.isInteger(explicit) && explicit >= 1 && explicit <= nextSections.length ? explicit - 1 : -1;
    if (sectionIndex < 0) sectionIndex = nextSections.findIndex((section) => section.resources.some((item) => item.id === resource.researchRequestId || item.id === resource.id || (resource.searchQuery && item.searchQuery === resource.searchQuery)));
    if (sectionIndex < 0) sectionIndex = index % nextSections.length;
    const section = nextSections[sectionIndex];
    if (used.has(resource.id) || section.resources.some((item) => item.id === resource.id || (resource.href && item.href === resource.href))) return;
    section.resources.push(resource);
    used.add(resource.id);
  });
  return { ...lesson, lessonPlan: { ...lesson.lessonPlan, contentSections: nextSections } };
}

function removeSelectedPlaceholders(blocks, selectedResources) {
  const selectedRequestIds = new Set([...selectedResources.videos, ...selectedResources.images, ...selectedResources.readings].map((resource) => resource.researchRequestId).filter(Boolean));
  if (!selectedRequestIds.size) return blocks;
  return (blocks || []).map((block) => {
    const props = { ...(block.props || {}) };
    if (block.type === "materiais" && Array.isArray(props.items)) props.items = props.items.filter((item) => !selectedRequestIds.has(item.resourceId));
    if (Array.isArray(props.children)) props.children = removeSelectedPlaceholders(props.children, selectedResources);
    return { ...block, props };
  }).filter((block) => !(block.type === "materiais" && Array.isArray(block.props?.items) && block.props.items.length === 0));
}

function syncResourceBlocks(lesson, selectedResources) {
  const blocks = removeSelectedPlaceholders(Array.isArray(lesson.blocks) ? lesson.blocks : [], selectedResources);
  const existingVideoIds = new Set();
  const existingImages = new Set();
  walkBlocks(blocks, (block) => {
    if (block.type === "video" && block.props?.id) existingVideoIds.add(text(block.props.id));
    if (block.type === "prose" && block.props?.inlineVideo?.id) existingVideoIds.add(text(block.props.inlineVideo.id));
    if (block.type === "imagem" && block.props?.src) existingImages.add(text(block.props.src));
  });
  const sections = Array.isArray(lesson.lessonPlan?.contentSections) ? lesson.lessonPlan.contentSections : [];
  const additionsBySection = new Map();
  const queue = (resource, block, index) => {
    const explicit = Number.parseInt(resource.sectionNumber, 10);
    const sectionIndex = Number.isInteger(explicit) && explicit >= 1 && explicit <= Math.max(1, sections.length) ? explicit - 1 : index % Math.max(1, sections.length);
    const additions = additionsBySection.get(sectionIndex) || [];
    const bridge = resource.bridgeParagraph || resource.pedagogicalUse || resource.objective || `Use este recurso neste ponto para relacionar ${resource.title || "o material"} ao conceito estudado na seção.`;
    if (block.type === "prose" && block.props?.inlineVideo?.id) additions.push(block);
    else additions.push({ id: `resource-bridge-${blockKey(resource.id)}-${index}`, type: "prose", bg: "neutral-default", pad: "normal", props: { body: `<p>${html(bridge)}</p>`, dropcap: false, dropcapTone: "terracotta", resourceId: resource.id } }, block);
    additionsBySection.set(sectionIndex, additions);
  };
  selectedResources.videos.forEach((resource, index) => {
    const id = youtubeId(resource.href);
    if (!id || existingVideoIds.has(id)) return;
    const bridge = resource.bridgeParagraph || resource.pedagogicalUse || resource.objective || `Use este vídeo neste ponto para relacionar ${resource.title || "o material"} ao conceito estudado nesta seção.`;
    queue(resource, { id: `resource-video-inline-${blockKey(resource.id)}-${index}`, type: "prose", bg: "neutral-default", pad: "normal", props: { body: `<p>${html(bridge)}</p>`, dropcap: false, dropcapTone: "terracotta", resourceId: resource.id, inlineVideo: { id, title: resource.title, caption: resource.objective || resource.pedagogicalUse || "Vídeo selecionado para esta semana.", credit: resource.credit || resource.source || "YouTube", start: "", resourceId: resource.id } } }, index);
  });
  selectedResources.images.forEach((resource, index) => {
    if (!resource.href || existingImages.has(resource.href)) return;
    queue(resource, { id: `resource-image-${blockKey(resource.id)}-${index}`, type: "imagem", bg: "neutral-default", pad: "normal", props: { src: resource.href, slotId: "", caption: resource.caption || resource.title, credit: resource.credit || resource.source || "Wikimedia Commons", ratio: "16/9", resourceId: resource.id } }, index);
  });
  selectedResources.readings.forEach((resource, index) => queue(resource, { id: `resource-material-${blockKey(resource.id)}-${index}`, type: "materiais", bg: "neutral-default", pad: "normal", props: { title: resource.required ? "Leitura obrigatória neste ponto" : "Leitura complementar neste ponto", items: [{ type: resource.type || "artigo", title: resource.title, source: [resource.author, resource.source, resource.year].filter(Boolean).join(" · "), href: resource.href, resourceId: resource.id, required: resource.required }], resourceId: resource.id } }, index));
  const additions = [...additionsBySection.values()].flat();
  if (!additions.length) return blocks;
  const topic = blocks.find((block) => ["topic", "topic-collapsible", "topic-slider"].includes(block.type));
  if (topic) {
    const children = [...(Array.isArray(topic.props?.children) ? topic.props.children : [])];
    const anchors = children.map((child, index) => ({ index, number: Number.parseInt(text(child.props?.text).match(/^\s*(\d+)/)?.[1], 10) })).filter((anchor) => Number.isInteger(anchor.number));
    let offset = 0;
    [...additionsBySection.entries()].sort(([left], [right]) => left - right).forEach(([sectionIndex, sectionAdditions]) => {
      const anchor = anchors.find((entry) => entry.number === sectionIndex + 1);
      const next = anchors.find((entry) => entry.number > sectionIndex + 1);
      const start = anchor?.index ?? -1;
      const end = next?.index ?? children.length;
      const body = children.findIndex((child, childIndex) => childIndex > start && childIndex < end && child.type === "prose" && !child.props?.resourceId);
      const insertAt = (body >= 0 ? body + 1 : start + 1) + offset;
      children.splice(insertAt, 0, ...sectionAdditions);
      offset += sectionAdditions.length;
    });
    topic.props = { ...(topic.props || {}), children };
    return blocks;
  }
  const anchor = blocks.findIndex((block) => ["quiz", "sintese", "referencias"].includes(block.type));
  const insertAt = anchor >= 0 ? anchor : blocks.length;
  blocks.splice(insertAt, 0, ...additions);
  return blocks;
}

export async function enrichLessonsWithResources(input, lessons) {
  if (process.env.AULA_RESOURCE_RESEARCH === "false") return lessons;
  return Promise.all(lessons.map(async (lesson) => {
    const targets = resourceTargetsFor(input, lesson);
    const videoRequests = requestsFor("video", input, lesson);
    const imageRequests = requestsFor("image", input, lesson);
    const readingRequests = requestsFor("reading", input, lesson);
    const [videos, images, readings] = await Promise.all([searchResources("video", videoRequests, input), searchResources("image", imageRequests, input), searchResources("reading", readingRequests, input)]);
    const research = { status: "searched", searchedAt: new Date().toISOString(), targets, providers: { youtube: videos.map((result) => result.status), wikimediaCommons: images.map((result) => result.status), crossref: readings.map((result) => result.providers?.crossref || (result.provider === "crossref" ? result.status : "not-used")), openAlex: readings.map((result) => result.providers?.openalex || "not-used") }, queries: { videos: videoRequests, images: imageRequests, readings: readingRequests }, videos, images, readings };
    const candidateCount = flattenCandidates(research).length;
    if (!candidateCount) return { ...lesson, lessonPlan: { ...lesson.lessonPlan, resourceResearch: { ...compactResearch({ ...research, status: "no-candidates" }), note: "Não foram encontrados candidatos. Para vídeos, cadastre YOUTUBE_API_KEY na Vercel; imagens e leituras usam provedores públicos." } } };
    let selection;
    let selectionStatus = "ai-selected";
    try {
      selection = await selectResourcesWithAI(input, { videos, images, readings, resourceTargets: targets });
    } catch (error) {
      selectionStatus = "fallback-ranking";
      selection = { videos: fallbackSelection(videos), images: fallbackSelection(images), readings: fallbackSelection(readings), error: error.message };
    }
    const videoSelection = ensureSelectionCoverage(selection, "videos", videos, Number(targets.videosPerWeek || 0));
    const imageSelection = ensureSelectionCoverage(selection, "images", images, 3);
    const readingSelection = ensureSelectionCoverage(selection, "readings", readings, Math.max(Number(targets.articlesPerWeek || 0), Number(targets.requiredReadingsPerWeek || 0)));
    const selectionFallbacks = [videoSelection.fallback, imageSelection.fallback, readingSelection.fallback].filter(Boolean);
    if (selectionFallbacks.length && selectionStatus === "ai-selected") selectionStatus = "ai-selected-with-provider-fallback";
    selection = { ...selection, videos: videoSelection.items, images: imageSelection.items, readings: readingSelection.items, fallbacks: selectionFallbacks };
    const chosenVideos = selectedEntries("videos", selection, videos);
    const chosenImages = selectedEntries("images", selection, images);
    const chosenReadings = selectedEntries("readings", selection, readings);
    const selectedResources = {
      videos: chosenVideos.chosen,
      images: chosenImages.chosen,
      readings: chosenReadings.chosen.map((resource, index) => ({ ...resource, required: resource.required || index < Number(targets.requiredReadingsPerWeek || 0) }))
    };
    const existingResources = lesson.lessonPlan.resources || {};
    const selectedRequests = new Set([...selectedResources.videos, ...selectedResources.images, ...selectedResources.readings].map((resource) => resource.researchRequestId));
    const withoutPlaceholders = (resources = []) => resources.filter((resource) => resource.href || !selectedRequests.has(resource.id));
    const resources = {
      ...existingResources,
      videos: [...withoutPlaceholders(existingResources.videos), ...selectedResources.videos],
      images: [...withoutPlaceholders(existingResources.images), ...selectedResources.images],
      readingsRequired: [...withoutPlaceholders(existingResources.readingsRequired), ...selectedResources.readings.filter((resource) => resource.required)],
      readingsExtra: [...withoutPlaceholders(existingResources.readingsExtra), ...selectedResources.readings.filter((resource) => !resource.required)]
    };
    const alternatives = flattenCandidates(research).filter((candidate) => !selectedResources.videos.concat(selectedResources.images, selectedResources.readings).some((resource) => resource.candidateId === candidate.candidateId)).slice(0, 30);
    const resourceResearch = compactResearch({ ...research, status: selectionStatus, selections: selection, selectionFallbacks, alternatives });
    const enriched = attachResourcesToSections({ ...lesson, lessonPlan: { ...lesson.lessonPlan, resources, resourceResearch } }, selectedResources);
    enriched.blocks = syncResourceBlocks(enriched, selectedResources);
    return enriched;
  }));
}
