// Leitura de uma semana salva pelo próprio ClassAuthor (SemanaNN-título-ClassAuthor.json).
// Puro (sem DOM), para poder ser testado. public/week-import.js é cópia idêntica deste arquivo.

const MAX_WEEKS = 52;

/**
 * Valida o conteúdo de um arquivo "classauthor-semana" e devolve a semana, o guia do professor
 * e o número da semana (1 a 52). Lança Error com mensagem em português quando não serve.
 */
export function parseSavedWeek(raw, fileName = "") {
  let data;
  try { data = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { throw new Error("Este arquivo não é um JSON válido. Escolha um arquivo SemanaNN-…-ClassAuthor.json baixado do ClassAuthor."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Este arquivo não é uma semana salva do ClassAuthor.");
  if (data.format === "classatelier-project" || data.project || (Array.isArray(data.blocks) && !data.week)) {
    throw new Error("Este parece ser um arquivo do ClassAtelier (a aula sem o quiz). Abra-o no ClassAtelier; aqui só entra o arquivo que termina em “-ClassAuthor.json”.");
  }
  if (data.version === 2 && data.form) throw new Error("Este arquivo é um backup do planejamento inteiro. Use “Restaurar backup”.");
  const own = data.generator === "classauthor" || data.generator === "aula-generator";
  if (!own || data.format !== "classauthor-semana") throw new Error("Este arquivo não é uma semana salva do ClassAuthor (formato “classauthor-semana”).");
  const week = data.week;
  if (!week || typeof week !== "object" || Array.isArray(week) || !(week.meta || week.lessonPlan || Array.isArray(week.blocks))) {
    throw new Error("O arquivo não traz o conteúdo da semana.");
  }
  if (!Array.isArray(week.blocks) || !week.blocks.length) throw new Error("A semana do arquivo está vazia (sem blocos de aula).");
  const number = weekNumberOf(week, fileName);
  if (!number) throw new Error("Não consegui descobrir de qual semana se trata (número ausente no arquivo e no nome). Renomeie para algo como Semana03-…-ClassAuthor.json.");
  const teacherGuide = data.teacherGuide && typeof data.teacherGuide === "object" ? data.teacherGuide : (week.teacherGuide || null);
  return { week, teacherGuide, number, exportedAt: data.exportedAt || null, title: String(week.meta?.title || week.lessonPlan?.theme || `Semana ${number}`) };
}

export function weekNumberOf(week = {}, fileName = "") {
  const candidates = [
    week.lessonPlan?.weekNumber,
    week.meta?.weekNumber,
    String(week.meta?.title || "").match(/(?:semana|aula)\s*0*(\d{1,2})/i)?.[1],
    String(fileName || "").match(/(?:semana|aula)\s*0*(\d{1,2})/i)?.[1]
  ];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 1 && n <= MAX_WEEKS) return n;
  }
  return 0;
}

/**
 * Decide onde a semana entra no planejamento aberto.
 * Devolve { action: "replace" | "append" | "refuse", index, reason }.
 */
export function planPlacement(number, currentLength) {
  const index = number - 1;
  if (index < currentLength) return { action: "replace", index };
  if (index === currentLength) return { action: "append", index };
  return { action: "refuse", index, reason: currentLength
    ? `O planejamento aberto tem ${currentLength} semana(s); esta é a Semana ${number}. Abra antes ${number - 1 === currentLength + 1 ? `a Semana ${currentLength + 1}` : `as semanas ${currentLength + 1} a ${number - 1}`} (ou gere-as) para manter a sequência.`
    : `Não há planejamento aberto e esta é a Semana ${number}. Abra primeiro a Semana 1 (ou restaure o backup do planejamento) para manter a sequência.` };
}
