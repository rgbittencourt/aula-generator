// Trechos dos materiais do professor (PDF/DOCX anexados nos Materiais de apoio).
// O navegador escolhe os trechos de cada semana e os envia em input.sourceExcerpts; aqui eles
// são limpos, limitados e transformados nas instruções para a IA.

const text = (value) => String(value ?? "").trim();
const USAGES = ["base", "apoio", "pratica"];
const MAX_EXCERPTS = 40;
const MAX_CHUNK = 3500;
const MAX_TOTAL = 32000;

export function normalizeSourceExcerpts(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  let total = 0;
  for (const item of list.slice(0, MAX_EXCERPTS)) {
    const usage = text(item?.usage);
    const body = text(item?.text).slice(0, MAX_CHUNK);
    if (!USAGES.includes(usage) || body.length < 20) continue;
    if (total + body.length > MAX_TOTAL) break;
    total += body.length;
    out.push({ materialId: text(item?.materialId), title: text(item?.title).slice(0, 200), reference: text(item?.reference).slice(0, 400), usage, unit: text(item?.unit) === "parte" ? "parte" : "p.", page: text(item?.page).slice(0, 12), chosenByTeacher: Boolean(item?.chosenByTeacher), text: body });
  }
  return out;
}

// Resumo do que foi usado (para a prévia da semana): material, uso e páginas.
export function sourceUsedSummary(excerpts = []) {
  const byMaterial = new Map();
  for (const excerpt of excerpts) {
    const key = excerpt.materialId || excerpt.title;
    if (!byMaterial.has(key)) byMaterial.set(key, { title: excerpt.title, reference: excerpt.reference, usage: excerpt.usage, unit: excerpt.unit, pages: [], chosenByTeacher: excerpt.chosenByTeacher });
    byMaterial.get(key).pages.push(excerpt.page);
  }
  return [...byMaterial.values()];
}

const citationOf = (excerpt) => excerpt.reference || excerpt.title;
const block = (excerpt) => `[${excerpt.title}${excerpt.reference ? ` | ${excerpt.reference}` : ""} | ${excerpt.unit === "parte" ? "parte" : "p."} ${excerpt.page}]\n${excerpt.text}`;

// mode: "writer" (texto do estudante), "derivatives" (atividades, questões, guia), "practice" (webpráticas/laboratório).
export function sourceMaterialBlock(input = {}, mode = "writer") {
  const excerpts = Array.isArray(input.sourceExcerpts) ? input.sourceExcerpts : [];
  const wanted = mode === "practice" ? ["pratica", "base"] : mode === "writer" ? ["base", "apoio"] : ["base", "apoio", "pratica"];
  const chosen = excerpts.filter((excerpt) => wanted.includes(excerpt.usage));
  if (!chosen.length) return "";
  const has = (usage) => chosen.some((excerpt) => excerpt.usage === usage);
  const rules = [
    has("base") && `- Material marcado como BASE DO CONTEÚDO: siga-o de perto: a mesma terminologia, a mesma ordem lógica dos assuntos e os mesmos exemplos, explicados com a sua voz. Não contradiga o material; se algo dele parecer desatualizado ou impreciso, mantenha a explicação do material e registre a dúvida em "Pontos a conferir".`,
    has("apoio") && `- Material marcado como REFERÊNCIA DE APOIO: consulte para dar precisão e exemplos, mas escreva com voz própria.`,
    has("pratica") && `- Material marcado como ROTEIRO DE PRÁTICA: nas sessões práticas, siga o procedimento dele (passos, materiais, equipamentos, tempos e cuidados de segurança); não invente etapas que contradigam o roteiro.`,
    `- Cite o material sempre que usar uma ideia, um exemplo ou um dado específico dele, com a página: (${citationOf(chosen[0])}, p. N). Inclua a obra completa nas referências. Citação direta só curta (até 3 linhas), entre aspas e com página; o resto, com suas palavras. Nunca copie parágrafos inteiros.`,
    mode === "derivatives" && `- Nas atividades e no guia do professor, aponte as páginas do material quando indicar leitura ou consulta (por exemplo, "leia as p. 12–18 da apostila"). As questões continuam respondíveis pelo texto da semana.`
  ].filter(Boolean);
  return `MATERIAL DO PROFESSOR (trechos selecionados para esta semana; use-os como fonte)
${rules.join("\n")}

${chosen.map(block).join("\n\n---\n\n")}`;
}
