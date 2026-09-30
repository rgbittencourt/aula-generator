const round = (value) => Math.round(Number(value) || 0);

export const PENDING_FORMULA_PROFILE = {
  status: "pending-spreadsheet",
  note: "A distribuição interna será substituída pelas fórmulas da planilha.",
  ratios: null
};

export function calculateWeekWorkload(input, index, formulaConfig = input.formulaConfig || PENDING_FORMULA_PROFILE) {
  const totalMinutes = round(input.hoursPerWeek * 60);
  const ratios = formulaConfig?.ratios;
  let allocation = { contentMinutes: null, practiceMinutes: null, assessmentMinutes: null, reviewMinutes: null };
  let status = "pending-spreadsheet";
  if (ratios && typeof ratios === "object") {
    const keys = ["content", "practice", "assessment", "review"];
    const values = keys.map((key) => Math.max(0, Number(ratios[key]) || 0));
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      const scaled = values.map((value) => value / sum * totalMinutes);
      const contentMinutes = round(scaled[0]);
      const practiceMinutes = round(scaled[1]);
      const assessmentMinutes = round(scaled[2]);
      const reviewMinutes = Math.max(0, totalMinutes - contentMinutes - practiceMinutes - assessmentMinutes);
      allocation = { contentMinutes, practiceMinutes, assessmentMinutes, reviewMinutes };
      status = "configured";
    }
  }
  return {
    weekNumber: index + 1,
    totalMinutes,
    totalHours: input.hoursPerWeek,
    webPracticeEnabled: input.webPractice.enabled,
    allocation,
    formulaStatus: status
  };
}

export function calculateCourseWorkload(input, formulaConfig = input.formulaConfig || PENDING_FORMULA_PROFILE) {
  const weeks = Array.from({ length: input.weeks }, (_, index) => calculateWeekWorkload(input, index, formulaConfig));
  return {
    totalHours: input.hoursPerWeek * input.weeks,
    totalMinutes: weeks.reduce((sum, week) => sum + week.totalMinutes, 0),
    formulaStatus: weeks.every((week) => week.formulaStatus === "configured") ? "configured" : "pending-spreadsheet",
    weeks
  };
}
