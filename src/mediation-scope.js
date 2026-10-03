const allIndexes = (count) => Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => index);

export function releasedWeekIndexes(weekApprovals, count) {
  const total = Math.max(0, Number(count) || 0);
  // Ausência do campo mantém compatibilidade com chamadas antigas da API.
  if (weekApprovals === undefined || weekApprovals === null) return allIndexes(total);
  if (Array.isArray(weekApprovals)) {
    return allIndexes(total).filter((index) => Boolean(weekApprovals[index]));
  }
  if (typeof weekApprovals === "object") {
    return allIndexes(total).filter((index) => Boolean(weekApprovals[index] ?? weekApprovals[String(index)]));
  }
  return [];
}

export function scopeMediationMaterial(weeks = [], teacherGuides = [], weekApprovals) {
  const indexes = releasedWeekIndexes(weekApprovals, weeks.length);
  const allowed = new Set(indexes);
  return {
    explicit: weekApprovals !== undefined && weekApprovals !== null,
    releasedIndexes: indexes,
    releasedWeeks: weeks.filter((_, index) => allowed.has(index)),
    releasedGuides: teacherGuides.filter((_, index) => allowed.has(index))
  };
}

export function scopeGeneralPlan(generalPlan, releasedIndexes, explicit = false) {
  if (!generalPlan || !explicit) return generalPlan;
  const allowed = new Set(releasedIndexes || []);
  const byWeek = (value) => Array.isArray(value)
    ? value.filter((item) => allowed.has(Math.max(0, Number(item?.weekNumber || item?.week) - 1)))
    : value;
  const scoped = { ...generalPlan };
  ["weeks", "progression", "didacticArcs", "pedagogicalChecks", "pedagogicalChecklist"].forEach((key) => {
    if (key in scoped) scoped[key] = byWeek(scoped[key]);
  });
  if (Array.isArray(scoped.webPracticeSchedule)) scoped.webPracticeSchedule = byWeek(scoped.webPracticeSchedule);
  if (Array.isArray(scoped.webPractices)) scoped.webPractices = byWeek(scoped.webPractices);
  scoped.mediationScope = {
    mode: "released-weeks-only",
    releasedWeeks: [...releasedIndexes].map((index) => index + 1),
    pendingWeeks: Math.max(0, Number(generalPlan.course?.weeks || 0) - releasedIndexes.length)
  };
  return scoped;
}
