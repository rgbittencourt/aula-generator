import { selectResourcesWithAI } from "./ai.js";

const text = (value) => String(value ?? "").trim();
const positive = (value) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; };
const cleanHtml = (value) => text(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function baseQuery(input, lesson) {
  const plan = lesson?.lessonPlan || {};
  const sectionTitles = (plan.contentSections || []).slice(0, 4).map((section) => section.title).filter(Boolean).join("; ");
  return [plan.theme || input.title, sectionTitles, input.language === "pt-BR" ? "português" : input.language].filter(Boolean).join(" — ").slice(0, 240);
}

function requestsFor(type, input, lesson) {
  const resources = lesson?.lessonPlan?.resources || {};
  const source = type === "video" ? resources.videos : type === "image" ? resources.images : [...(resources.readingsRequired || []), ...(resources.readingsExtra || [])];
  const fallback = baseQuery(input, lesson);
  const items = Array.isArray(source) ? source : [];
  const requests = items.filter((resource) => !resource.href).map((resource, index) => ({
    requestId: text(resource.id, `${type}-request-${index + 1}`),
    type,
    query: text(resource.searchQuery || [resource.title, resource.objective, fallback].filter(Boolean).join(" ")).slice(0, 260),
    title: resource.title,
    objective: resource.objective,
    moment: resource.moment,
    required: Boolean(resource.required),
    kind: resource.kind || resource.type
  }));
  if (!requests.length && !items.some((resource) => resource.href)) requests.push({ requestId: `${type}-generated-1`, type, query: fallback, title: `${type} para ${lesson?.lessonPlan?.theme || input.title}`, objective: "Enriquecer a unidade com um recurso contextualizado.", moment: "ponto de uso", required: type !== "image" });
  return requests.slice(0, 5);
}

function isoDurationToMinutes(value) {
  const match = text(value).match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return 0;
  return Math.round((Number(match[1] || 0) * 60) + Number(match[2] || 0) + Number(match[3] || 0) / 60);
}

async function searchYouTube(request, input) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { request, provider: "youtube", status: "missing-api-key", candidates: [], note: "Cadastre YOUTUBE_API_KEY para pesquisar vídeos reais." };
  try {
    const params = new URLSearchParams({ part: "snippet", q: request.query, type: "video", maxResults: "5", order: "relevance", regionCode: input.language === "pt-BR" ? "BR" : "US", relevanceLanguage: input.language === "pt-BR" ? "pt" : "en", safeSearch: "strict", videoEmbeddable: "true", key });
    const result = await fetchJson(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const ids = (result.items || []).map((item) => item.id?.videoId).filter(Boolean);
    let details = {};
    if (ids.length) {
      const detailParams = new URLSearchParams({ part: "contentDetails,snippet,statistics", id: ids.join(","), key });
      const detailResult = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`);
      details = Object.fromEntries((detailResult.items || []).map((item) => [item.id, item]));
    }
    const candidates = (result.items || []).map((item, index) => {
      const id = item.id?.videoId;
      const detail = details[id] || {};
      const snippet = detail.snippet || item.snippet || {};
      return {
        candidateId: `youtube:${request.requestId}:${index + 1}`,
        requestId: request.requestId,
        provider: "youtube",
        type: "video",
        title: text(snippet.title, `Vídeo ${index + 1}`),
        href: `https://www.youtube.com/watch?v=${id}`,
        source: text(snippet.channelTitle, "YouTube"),
        author: text(snippet.channelTitle),
        description: cleanHtml(snippet.description),
        durationMinutes: isoDurationToMinutes(detail.contentDetails?.duration),
        publishedAt: text(snippet.publishedAt),
        thumbnail: text(snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url),
        verificationStatus: "provider-retrieved-needs-ai-selection",
        requiresVerification: true
      };
    });
    return { request, provider: "youtube", status: "ok", candidates };
  } catch (error) {
    return { request, provider: "youtube", status: "error", candidates: [], note: error.message };
  }
}

function extMeta(info, key) {
  return cleanHtml(info?.extmetadata?.[key]?.value);
}

async function searchCommons(request) {
  try {
    const params = new URLSearchParams({ action: "query", generator: "search", gsrsearch: request.query, gsrnamespace: "6", gsrlimit: "5", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1400", format: "json", origin: "*" });
    const payload = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`, { "User-Agent": "AulaGenerator/1.0 (educational resource research)" });
    const pages = Object.values(payload.query?.pages || {});
    const candidates = pages.map((page, index) => {
      const info = page.imageinfo?.[0] || {};
      const author = extMeta(info, "Artist") || extMeta(info, "Credit");
      const license = extMeta(info, "LicenseShortName") || extMeta(info, "UsageTerms");
      return {
        candidateId: `commons:${request.requestId}:${index + 1}`,
        requestId: request.requestId,
        provider: "wikimedia-commons",
        type: "image",
        title: text(page.title).replace(/^File:/i, ""),
        href: text(info.thumburl || info.url),
        sourcePage: text(info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`),
        source: "Wikimedia Commons",
        author,
        license,
        licenseUrl: extMeta(info, "LicenseUrl"),
        caption: extMeta(info, "ImageDescription") || text(page.title).replace(/^File:/i, ""),
        altText: extMeta(info, "ObjectName") || extMeta(info, "ImageDescription"),
        thumbnail: text(info.thumburl || info.url),
        verificationStatus: "provider-retrieved-needs-ai-selection",
        requiresVerification: true
      };
    }).filter((candidate) => candidate.href);
    return { request, provider: "wikimedia-commons", status: "ok", candidates };
  } catch (error) {
    return { request, provider: "wikimedia-commons", status: "error", candidates: [], note: error.message };
  }
}

async function searchCrossref(request) {
  try {
    const params = new URLSearchParams({ "query.bibliographic": request.query, rows: "5", mailto: process.env.CROSSREF_MAILTO || "" });
    const payload = await fetchJson(`https://api.crossref.org/works?${params}`, { "User-Agent": "AulaGenerator/1.0 (educational resource research)" });
    const candidates = (payload.message?.items || []).map((item, index) => {
      const title = Array.isArray(item.title) ? item.title[0] : item.title;
      const authors = Array.isArray(item.author) ? item.author.map((author) => [author.given, author.family].filter(Boolean).join(" ")).filter(Boolean).join(", ") : "";
      const year = item.published?.["date-parts"]?.[0]?.[0] || item.issued?.["date-parts"]?.[0]?.[0] || "";
      return {
        candidateId: `crossref:${request.requestId}:${index + 1}`,
        requestId: request.requestId,
        provider: "crossref",
        type: "reading",
        title: text(title, `Leitura ${index + 1}`),
        href: text(item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : "")),
        sourcePage: text(item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : "")),
        source: Array.isArray(item["container-title"]) ? item["container-title"][0] : text(item.publisher),
        author: authors,
        year,
        doi: text(item.DOI),
        license: text(item.license?.[0]?.URL),
        typeLabel: text(item.type),
        verificationStatus: "provider-retrieved-needs-ai-selection",
        requiresVerification: true
      };
    }).filter((candidate) => candidate.href && candidate.title);
    return { request, provider: "crossref", status: "ok", candidates };
  } catch (error) {
    return { request, provider: "crossref", status: "error", candidates: [], note: error.message };
  }
}

async function researchGroup(type, requests, input) {
  const searcher = type === "video" ? searchYouTube : type === "image" ? searchCommons : searchCrossref;
  return Promise.all(requests.map((request) => searcher(request, input)));
}

function compactResearch(research) {
  return {
    status: research.status,
    searchedAt: research.searchedAt,
    providers: research.providers,
    queries: research.queries,
    selections: research.selections,
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
    objective: selection.use || selection.reason,
    guidingQuestion: selection.guidingQuestion,
    altText: candidate.altText,
    caption: candidate.caption,
    credit: [candidate.author, candidate.source, candidate.license].filter(Boolean).join(" · "),
    license: candidate.license,
    licenseUrl: candidate.licenseUrl,
    sourcePage: candidate.sourcePage,
    thumbnail: candidate.thumbnail,
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

function blockKey(value) { return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "recurso"; }
function youtubeId(value) { return text(value).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^?&#/]+)/i)?.[1] || ""; }

function walkBlocks(blocks, callback) {
  (blocks || []).forEach((block) => {
    callback(block);
    if (Array.isArray(block?.props?.children)) walkBlocks(block.props.children, callback);
  });
}

function syncResourceBlocks(lesson, selectedResources) {
  const blocks = Array.isArray(lesson.blocks) ? [...lesson.blocks] : [];
  const existingVideoIds = new Set();
  const existingImages = new Set();
  let materialsBlock = null;
  walkBlocks(blocks, (block) => {
    if (block.type === "video" && block.props?.id) existingVideoIds.add(text(block.props.id));
    if (block.type === "imagem" && block.props?.src) existingImages.add(text(block.props.src));
    if (!materialsBlock && block.type === "materiais") materialsBlock = block;
  });
  const additions = [];
  selectedResources.videos.forEach((resource, index) => {
    const id = youtubeId(resource.href);
    if (!id || existingVideoIds.has(id)) return;
    additions.push({ id: `resource-video-${blockKey(resource.id)}-${index}`, type: "video", bg: "neutral-default", pad: "normal", props: { id, title: resource.title, caption: resource.objective || resource.pedagogicalUse || "Vídeo selecionado para esta semana.", credit: resource.credit || resource.source || "YouTube", start: "", resourceId: resource.id } });
  });
  selectedResources.images.forEach((resource, index) => {
    if (!resource.href || existingImages.has(resource.href)) return;
    additions.push({ id: `resource-image-${blockKey(resource.id)}-${index}`, type: "imagem", bg: "neutral-default", pad: "normal", props: { src: resource.href, slotId: "", caption: resource.caption || resource.title, credit: resource.credit || resource.source || "Wikimedia Commons", ratio: "16/9", resourceId: resource.id } });
  });
  const readingItems = selectedResources.readings.map((resource) => ({ type: resource.type || "artigo", title: resource.title, source: [resource.author, resource.source, resource.year].filter(Boolean).join(" · "), href: resource.href, resourceId: resource.id }));
  if (readingItems.length) {
    if (materialsBlock) {
      const existing = Array.isArray(materialsBlock.props?.items) ? materialsBlock.props.items : [];
      const seen = new Set(existing.map((item) => item.href).filter(Boolean));
      materialsBlock.props = { ...(materialsBlock.props || {}), items: [...existing, ...readingItems.filter((item) => !seen.has(item.href))] };
    } else {
      additions.push({ id: `resource-materials-${blockKey(lesson.meta?.weekNumber || "week")}`, type: "materiais", bg: "neutral-default", pad: "normal", props: { title: "Leituras e materiais selecionados", items: readingItems } });
    }
  }
  if (!additions.length) return blocks;
  const topic = blocks.find((block) => ["topic", "topic-collapsible", "topic-slider"].includes(block.type));
  if (topic) {
    topic.props = { ...(topic.props || {}), children: [...(Array.isArray(topic.props?.children) ? topic.props.children : []), ...additions] };
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
    const videoRequests = requestsFor("video", input, lesson);
    const imageRequests = requestsFor("image", input, lesson);
    const readingRequests = requestsFor("reading", input, lesson);
    const [videos, images, readings] = await Promise.all([researchGroup("video", videoRequests, input), researchGroup("image", imageRequests, input), researchGroup("reading", readingRequests, input)]);
    const research = { status: "searched", searchedAt: new Date().toISOString(), providers: { youtube: videos.map((result) => result.status), wikimediaCommons: images.map((result) => result.status), crossref: readings.map((result) => result.status) }, queries: { videos: videoRequests, images: imageRequests, readings: readingRequests }, videos, images, readings };
    const candidateCount = flattenCandidates(research).length;
    if (!candidateCount) return { ...lesson, lessonPlan: { ...lesson.lessonPlan, resourceResearch: { ...compactResearch({ ...research, status: "no-candidates" }), note: "Não foram encontrados candidatos. Para vídeos, cadastre YOUTUBE_API_KEY na Vercel; imagens e leituras usam provedores públicos." } } };
    let selection;
    let selectionStatus = "ai-selected";
    try {
      selection = await selectResourcesWithAI(input, { videos, images, readings });
    } catch (error) {
      selectionStatus = "fallback-ranking";
      selection = { videos: fallbackSelection(videos), images: fallbackSelection(images), readings: fallbackSelection(readings), error: error.message };
    }
    const chosenVideos = selectedEntries("videos", selection, videos);
    const chosenImages = selectedEntries("images", selection, images);
    const chosenReadings = selectedEntries("readings", selection, readings);
    const selectedResources = { videos: chosenVideos.chosen, images: chosenImages.chosen, readings: chosenReadings.chosen };
    const existingResources = lesson.lessonPlan.resources || {};
    const selectedRequests = new Set([...selectedResources.videos, ...selectedResources.images, ...selectedResources.readings].map((resource) => resource.researchRequestId));
    const withoutPlaceholders = (resources = []) => resources.filter((resource) => resource.href || !selectedRequests.has(resource.id));
    const resources = {
      ...existingResources,
      videos: [...withoutPlaceholders(existingResources.videos), ...selectedResources.videos],
      images: [...withoutPlaceholders(existingResources.images), ...selectedResources.images],
      readingsRequired: withoutPlaceholders(existingResources.readingsRequired),
      readingsExtra: [...withoutPlaceholders(existingResources.readingsExtra), ...selectedResources.readings]
    };
    const alternatives = flattenCandidates(research).filter((candidate) => !selectedResources.videos.concat(selectedResources.images, selectedResources.readings).some((resource) => resource.candidateId === candidate.candidateId)).slice(0, 30);
    const resourceResearch = compactResearch({ ...research, status: selectionStatus, selections: selection, alternatives });
    const enriched = { ...lesson, lessonPlan: { ...lesson.lessonPlan, resources, resourceResearch } };
    enriched.blocks = syncResourceBlocks(enriched, selectedResources);
    return enriched;
  }));
}
