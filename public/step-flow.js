// Fluxo semana a semana: estado puro (sem DOM, sem rede) do que foi aprovado,
// dos resumos de ponte e dos avisos de pontas desencaixadas.
//
//   bridges[i]  resumo de ponte mais recente da semana i (índice zero-based)
//   approved[i] o professor aprovou a semana i
//   links[i]    resumo da semana i-1 sobre o qual a semana i foi construída
//   issues[i]   o que precisa de atenção na semana i depois que uma vizinha mudou:
//               { opening, closing, stale, reasons[] }
//
// Os resumos vêm de /api/week-bridge (src/bridge.js) e as comparações também.

export const emptyFlow = () => ({ bridges: {}, approved: {}, links: {}, issues: {} });

const plainObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

export function normalizeFlow(value) {
  const source = plainObject(value);
  return {
    bridges: { ...plainObject(source.bridges) },
    approved: { ...plainObject(source.approved) },
    links: { ...plainObject(source.links) },
    issues: { ...plainObject(source.issues) }
  };
}

// Resumos das duas semanas imediatamente anteriores, para o prompt da semana index.
export function bridgesBefore(flow, index) {
  const list = [];
  for (let position = Math.max(0, index - 2); position < index; position += 1) if (flow.bridges[position]) list.push(flow.bridges[position]);
  return list;
}

// Semana recém-gerada: guarda o resumo e sobre qual ponte ela foi construída.
export function recordGenerated(flow, index, summary) {
  if (summary) flow.bridges[index] = summary;
  delete flow.approved[index];
  delete flow.issues[index];
  if (flow.bridges[index - 1]) flow.links[index] = flow.bridges[index - 1];
  return flow;
}

export function approveWeek(flow, index, summary) {
  if (summary) flow.bridges[index] = summary;
  flow.approved[index] = true;
  return flow;
}

function mergeIssue(flow, index, patch) {
  const current = flow.issues[index] || { opening: false, closing: false, stale: false, reasons: [] };
  flow.issues[index] = {
    opening: current.opening || Boolean(patch.opening),
    closing: current.closing || Boolean(patch.closing),
    stale: current.stale || Boolean(patch.stale),
    reasons: [...new Set([...(current.reasons || []), ...(patch.reasons || [])])]
  };
}

// Depois que o professor refez a semana `index`. `comparison` compara o resumo
// anterior com o novo (detecta mudança de abertura); `linkComparison` compara
// o resumo sobre o qual a semana seguinte foi construída com o novo.
export function applyRewrite(flow, index, summary, { comparison = null, linkComparison = null, totalWeeks = 0 } = {}) {
  const hadPreviousWeek = index > 0 && Boolean(flow.bridges[index - 1]);
  const hasNextWeek = index + 1 < totalWeeks && Boolean(flow.bridges[index + 1]);
  flow.bridges[index] = summary;
  flow.approved[index] = false;
  if (comparison?.needsPreviousClosing && hadPreviousWeek) {
    mergeIssue(flow, index - 1, { closing: true, reasons: [`a abertura da semana ${index + 1} mudou`] });
  }
  if (linkComparison && hasNextWeek && (linkComparison.needsNextOpening || linkComparison.level === "stale")) {
    mergeIssue(flow, index + 1, {
      opening: true,
      stale: linkComparison.level === "stale",
      reasons: (linkComparison.reasons || []).map((reason) => `semana ${index + 1}: ${reason}`)
    });
  }
  return flow;
}

// Depois de ajustar a abertura (kind "opening") ou o fechamento (kind "closing")
// da semana `index` com a ponte da vizinha.
export function applyAdjustment(flow, index, kind, newSummary) {
  if (newSummary) flow.bridges[index] = newSummary;
  const issue = flow.issues[index];
  if (issue) {
    if (kind === "opening") { issue.opening = false; issue.stale = false; }
    if (kind === "closing") issue.closing = false;
    if (!issue.opening && !issue.closing && !issue.stale) delete flow.issues[index];
  }
  if (kind === "opening" && flow.bridges[index - 1]) flow.links[index] = flow.bridges[index - 1];
  if (kind === "closing" && newSummary && flow.bridges[index + 1]) flow.links[index + 1] = newSummary;
  return flow;
}

export function dismissIssue(flow, index) {
  delete flow.issues[index];
  if (flow.bridges[index - 1]) flow.links[index] = flow.bridges[index - 1];
  return flow;
}

// A próxima semana só é liberada quando a anterior foi aprovada (modo passo a passo).
export function canGenerateNext(flow, nextIndex, stepMode) {
  if (!stepMode || nextIndex <= 0) return true;
  return Boolean(flow.approved[nextIndex - 1]);
}

// Estado exibido na prévia e no cartão da semana.
export function weekFlowStatus(flow, index) {
  const issue = flow.issues[index];
  if (issue?.stale) return { key: "stale", label: "Desatualizada: a semana anterior mudou bastante" };
  if (issue?.opening && issue?.closing) return { key: "edges", label: "Abertura e fechamento precisam de ajuste" };
  if (issue?.opening) return { key: "edges", label: "Abertura precisa de ajuste" };
  if (issue?.closing) return { key: "edges", label: "Fechamento precisa de ajuste" };
  if (flow.approved[index]) return { key: "approved", label: "Aprovada" };
  if (flow.bridges[index]) return { key: "draft", label: "Rascunho: aguardando sua aprovação" };
  return { key: "none", label: "" };
}
