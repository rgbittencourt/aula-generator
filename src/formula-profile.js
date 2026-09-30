export const SALA_EVOLUCAO_FORMULA_PROFILE = Object.freeze({
  id: "sala-evolucao-aplicativo-material",
  version: "2026-09-30",
  source: {
    spreadsheetId: "12kzs-xcGGGz7_nv9nr3cf8Hgpmr_Z6p09ihmspXZnoA",
    sheets: ["Aplicativo", "Material"],
    description: "Regras transcritas das fórmulas de dimensionamento de atividade instrucional e atividade de aprendizagem equivalente."
  },
  constants: {
    wordsPerMinute: 273,
    digitalContentFactor: 5,
    scientificMinutesPerPage: 5,
    popularMinutesPerPage: 3,
    forumMinutesPerPost: 120,
    imageMinutes: 4,
    datasetMinutes: 20,
    quizMinutesPerQuestion: 3,
    quizLearnerMultiplier: 2,
    instructionalToLearnerRatio: 0.5
  },
  categories: {
    digitalContent: "conteudo-digital",
    scientificReading: "leitura-academica",
    popularReading: "leitura-indicada",
    video: "video-aula",
    forum: "forum-discussao",
    webPractice: "webpratica",
    assessment: "avaliacao",
    communication: "comunicacao",
    project: "projeto-pratica",
    image: "imagem-diagrama",
    dataset: "dados"
  }
});

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function resolveFormulaProfile(overrides = null) {
  const raw = overrides && typeof overrides === "object" ? overrides : {};
  return {
    ...SALA_EVOLUCAO_FORMULA_PROFILE,
    ...raw,
    constants: { ...SALA_EVOLUCAO_FORMULA_PROFILE.constants, ...(raw.constants || {}) },
    categories: { ...SALA_EVOLUCAO_FORMULA_PROFILE.categories, ...(raw.categories || {}) }
  };
}

export function digitalContentMinutes(wordCount, profile = SALA_EVOLUCAO_FORMULA_PROFILE) {
  const words = positive(wordCount);
  return words ? words / profile.constants.wordsPerMinute * profile.constants.digitalContentFactor : 0;
}

export function classifyReading(resource = {}) {
  const value = `${resource.type || resource.kind || ""} ${resource.title || ""} ${resource.source || ""}`.toLowerCase();
  return /popular|site|blog|not[ií]cia|divulga[cç][aã]o|texto livre/.test(value) ? "popular" : "scientific";
}

export function readingMinutes(resource = {}, profile = SALA_EVOLUCAO_FORMULA_PROFILE) {
  const kind = classifyReading(resource);
  const pages = positive(resource.pages);
  const words = positive(resource.wordCount || resource.words || resource.numberOfWords);
  const perPage = kind === "popular" ? profile.constants.popularMinutesPerPage : profile.constants.scientificMinutesPerPage;
  const factor = kind === "popular" ? profile.constants.popularMinutesPerPage : profile.constants.scientificMinutesPerPage;
  if (pages) return pages * perPage;
  if (words) return words / profile.constants.wordsPerMinute * factor;
  return 0;
}

export function forumMinutes(posts, profile = SALA_EVOLUCAO_FORMULA_PROFILE) {
  return positive(posts) * profile.constants.forumMinutesPerPost;
}

export function imageMinutes(count, profile = SALA_EVOLUCAO_FORMULA_PROFILE) {
  return positive(count) * profile.constants.imageMinutes;
}

export function datasetMinutes(count, profile = SALA_EVOLUCAO_FORMULA_PROFILE) {
  return positive(count) * profile.constants.datasetMinutes;
}

export function assessmentMinutes({ count = 1, durationMinutes = 0 } = {}, profile = SALA_EVOLUCAO_FORMULA_PROFILE) {
  const units = Math.max(1, positive(count));
  const duration = positive(durationMinutes) || profile.constants.quizMinutesPerQuestion;
  return units * duration;
}

export function synchronousCommunicationMinutes({ count = 1, hoursPerCommunication = 0, durationMinutes = 0 } = {}) {
  const units = Math.max(1, positive(count));
  return positive(durationMinutes) ? units * positive(durationMinutes) : units * positive(hoursPerCommunication) * 60;
}

export function formulaProfileSummary(profile = SALA_EVOLUCAO_FORMULA_PROFILE) {
  return {
    id: profile.id,
    version: profile.version,
    source: profile.source,
    rules: {
      digitalContent: `palavras / ${profile.constants.wordsPerMinute} × ${profile.constants.digitalContentFactor} minutos`,
      scientificReading: `${profile.constants.scientificMinutesPerPage} minutos por página ou palavras / ${profile.constants.wordsPerMinute} × ${profile.constants.scientificMinutesPerPage}`,
      popularReading: `${profile.constants.popularMinutesPerPage} minutos por página ou palavras / ${profile.constants.wordsPerMinute} × ${profile.constants.popularMinutesPerPage}`,
      video: "usa a duração informada; sem duração conferida, fica pendente",
      forum: `${profile.constants.forumMinutesPerPost} minutos por post/fórum`,
      quiz: `${profile.constants.quizMinutesPerQuestion} minutos por questão quando a duração não for informada`,
      instructorLearner: `atividade instrucional equivalente = ${profile.constants.instructionalToLearnerRatio} × atividade de aprendizagem equivalente`
    }
  };
}
