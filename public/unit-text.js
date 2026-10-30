// Troca "semana" por "aula" em textos (usado no navegador e no servidor).
// Protege o que fala do calendário de verdade: "dia da semana", "fim de semana" e nomes de eventos
// ("Semana Nacional de…"). "semanal/semanais" vira "por aula".

const PROTECT = [
  /\bdias?\s+da\s+semana\b/gi,
  /\b(?:fim|fins)\s+de\s+semana\b/gi,
  /\bSemana\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç])(?!Planejada)[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ú]+/g
];

function matchCase(source, target) {
  if (source === source.toUpperCase() && source !== source.toLowerCase()) return target.toUpperCase();
  if (source[0] === source[0].toUpperCase()) return target[0].toUpperCase() + target.slice(1);
  return target;
}

export function localizeUnitText(value, unit = "semana") {
  if (unit !== "aula" || typeof value !== "string" || !/semana/i.test(value)) return value;
  const kept = [];
  let text = value;
  PROTECT.forEach((pattern) => { text = text.replace(pattern, (match) => { kept.push(match); return `\u0000${kept.length - 1}\u0000`; }); });
  text = text
    .replace(/\b(semanais|semanal)\b/gi, (match) => matchCase(match, "por aula"))
    .replace(/\bsemanas\b/gi, (match) => matchCase(match, "aulas"))
    .replace(/\bsemana\b/gi, (match) => matchCase(match, "aula"));
  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => kept[Number(index)]);
}

export function deepLocalizeUnit(value, unit = "semana", depth = 0) {
  if (unit !== "aula" || depth > 40) return value;
  if (typeof value === "string") return /^(?:data:|https?:\/\/|blob:)/i.test(value) ? value : localizeUnitText(value, unit);
  if (Array.isArray(value)) return value.map((item) => deepLocalizeUnit(item, unit, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /^(src|href|url|link|svg|image|dataUri)$/i.test(key) ? item : deepLocalizeUnit(item, unit, depth + 1)]));
  return value;
}
