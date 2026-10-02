const text = (value, fallback = "") => String(value ?? fallback).trim();
const cleanHtml = (value) => text(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const positive = (value) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : 0; };

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(3000, Number(process.env.AULA_RESEARCH_TIMEOUT_MS || 8000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function isoDurationToMinutes(value) {
  const match = text(value).match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return 0;
  return Math.round((Number(match[1] || 0) * 60) + Number(match[2] || 0) + Number(match[3] || 0) / 60);
}

export async function searchYouTube(request, input) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { request, provider: "youtube", status: "missing-api-key", candidates: [], note: "Cadastre YOUTUBE_API_KEY para pesquisar vídeos reais." };
  try {
    const params = new URLSearchParams({ part: "snippet", q: request.query, type: "video", maxResults: "5", order: "relevance", regionCode: input.language === "pt-BR" ? "BR" : "US", relevanceLanguage: input.language === "pt-BR" ? "pt" : "en", safeSearch: "strict", videoEmbeddable: "true", key });
    const result = await fetchJson(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const ids = (result.items || []).map((item) => item.id?.videoId).filter(Boolean);
    let details = {};
    if (ids.length) {
      const detailParams = new URLSearchParams({ part: "contentDetails,snippet,statistics,status", id: ids.join(","), key });
      const detailResult = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`);
      details = Object.fromEntries((detailResult.items || []).map((item) => [item.id, item]));
    }
    const candidates = (result.items || []).map((item, index) => {
      const id = item.id?.videoId;
      const detail = details[id] || {};
      const snippet = detail.snippet || item.snippet || {};
      const embeddable = detail.status?.embeddable !== false;
      return {
        candidateId: `youtube:${request.requestId}:${index + 1}`,
        requestId: request.requestId,
        provider: "youtube",
        type: "video",
        title: text(snippet.title, `Vídeo ${index + 1}`),
        href: `https://www.youtube.com/watch?v=${id}`,
        embedHref: `https://www.youtube.com/embed/${id}`,
        source: text(snippet.channelTitle, "YouTube"),
        author: text(snippet.channelTitle),
        description: cleanHtml(snippet.description),
        durationMinutes: isoDurationToMinutes(detail.contentDetails?.duration),
        publishedAt: text(snippet.publishedAt),
        thumbnail: text(snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url),
        embeddable,
        privacyStatus: text(detail.status?.privacyStatus),
        verificationStatus: embeddable ? "provider-retrieved-needs-ai-selection" : "provider-retrieved-not-embeddable",
        requiresVerification: true
      };
    }).filter((candidate) => candidate.embeddable);
    return { request, provider: "youtube", status: "ok", candidates };
  } catch (error) {
    return { request, provider: "youtube", status: "error", candidates: [], note: error.message };
  }
}

function extMeta(info, key) {
  return cleanHtml(info?.extmetadata?.[key]?.value);
}

export async function searchCommons(request) {
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

export async function searchCrossref(request) {
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

export async function searchOpenAlex(request) {
  try {
    const params = new URLSearchParams({ search: request.query, "per-page": "5" });
    if (process.env.CROSSREF_MAILTO) params.set("mailto", process.env.CROSSREF_MAILTO);
    const payload = await fetchJson(`https://api.openalex.org/works?${params}`, { "User-Agent": "AulaGenerator/1.0 (educational resource research)" });
    const candidates = (payload.results || []).map((item, index) => {
      const authors = (item.authorships || []).map((entry) => entry.author?.display_name).filter(Boolean).join(", ");
      const href = text(item.doi || item.primary_location?.landing_page_url || item.open_access?.oa_url);
      return {
        candidateId: `openalex:${request.requestId}:${index + 1}`,
        requestId: request.requestId,
        provider: "openalex",
        type: "reading",
        title: text(item.title, `Leitura acadêmica ${index + 1}`),
        href,
        sourcePage: href,
        source: text(item.primary_location?.source?.display_name || item.host_venue?.display_name, "OpenAlex"),
        author: authors,
        year: item.publication_year || "",
        doi: text(item.doi).replace(/^https?:\/\/doi\.org\//i, ""),
        openAccess: Boolean(item.open_access?.is_oa),
        verificationStatus: "provider-retrieved-needs-ai-selection",
        requiresVerification: true
      };
    }).filter((candidate) => candidate.href && candidate.title);
    return { request, provider: "openalex", status: "ok", candidates };
  } catch (error) {
    return { request, provider: "openalex", status: "error", candidates: [], note: error.message };
  }
}

async function searchAcademic(request) {
  const crossref = await searchCrossref(request);
  const minimumCandidates = Math.max(3, Number(request.minimumCandidates || 0));
  if (process.env.AULA_OPENALEX_ENABLED === "false" || crossref.candidates.length >= minimumCandidates) return crossref;
  const openalex = await searchOpenAlex(request);
  const candidates = [...crossref.candidates, ...openalex.candidates]
    .filter((candidate, index, list) => list.findIndex((item) => item.doi && candidate.doi ? item.doi === candidate.doi : item.href === candidate.href) === index)
    .slice(0, 5);
  return {
    request,
    provider: "crossref+openalex",
    status: crossref.status === "ok" || openalex.status === "ok" ? "ok" : "error",
    candidates,
    providers: { crossref: crossref.status, openalex: openalex.status },
    note: "OpenAlex foi consultado como fallback porque o Crossref retornou poucos candidatos."
  };
}

export const RESOURCE_PROVIDERS = Object.freeze({
  video: searchYouTube,
  image: searchCommons,
  reading: searchAcademic
});

export async function searchResources(type, requests, input) {
  const searcher = RESOURCE_PROVIDERS[type];
  if (!searcher) throw new Error(`Nenhum provedor configurado para o tipo de recurso: ${type}`);
  return Promise.all(requests.map((request) => searcher(request, input)));
}
