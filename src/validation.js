const criticalCheckIds = new Set(["title-present", "objective-present", "content-present", "alignment-complete", "summative-alignment"]);

export function validateCourse(input = {}, weeks = [], workload = null, teacherGuides = []) {
  const weekReports = weeks.map((lesson, index) => {
    const review = lesson?.lessonPlan?.pedagogicalReview || { checks: [] };
    const quality = lesson?.contentQuality || {};
    const failedChecks = (review.checks || []).filter((check) => !check.pass);
    const blockers = failedChecks.filter((check) => criticalCheckIds.has(check.id));
    const resources = Object.values(lesson?.lessonPlan?.resources || {}).flatMap((items) => Array.isArray(items) ? items : []);
    const pendingResources = resources.filter((resource) => resource.humanApproval !== "approved" || resource.requiresVerification);
    const academicReview = teacherGuides[index]?.academicReview || {};
    const academicIssues = Array.isArray(academicReview.issues) ? academicReview.issues : [];
    const academicBlockers = academicIssues.filter((issue) => issue.severity === "high");
    return {
      weekNumber: index + 1,
      title: lesson?.lessonPlan?.theme || lesson?.meta?.title || `Semana ${index + 1}`,
      status: quality.status === "insufficient" || blockers.length || academicBlockers.length || academicReview.status === "needs-revision" ? "blocked" : failedChecks.length || pendingResources.length || academicIssues.length || academicReview.status === "approved-with-review" ? "review" : "ready",
      contentQuality: quality,
      failedChecks,
      blockers,
      academicReview,
      academicIssues,
      academicBlockers,
      pendingResources: pendingResources.map((resource) => ({ id: resource.id, title: resource.title, status: resource.researchStatus || resource.verificationStatus, humanApproval: resource.humanApproval })),
      workload: workload?.weeks?.[index] || lesson?.lessonPlan?.timePlan || null
    };
  });
  const blockers = weekReports.flatMap((report) => [
    ...report.blockers.map((item) => ({ weekNumber: report.weekNumber, ...item })),
    ...report.academicBlockers.map((item) => ({ weekNumber: report.weekNumber, type: "academic", ...item }))
  ]);
  const warnings = weekReports.flatMap((report) => [
    ...report.failedChecks.filter((check) => !criticalCheckIds.has(check.id)).map((item) => ({ weekNumber: report.weekNumber, type: "pedagogy", ...item })),
    ...report.pendingResources.map((item) => ({ weekNumber: report.weekNumber, type: "resource", ...item })),
    ...report.academicIssues.filter((item) => item.severity !== "high").map((item) => ({ weekNumber: report.weekNumber, type: "academic", ...item }))
  ]);
  const unresolved = (workload?.weeks || []).flatMap((week) => (week.unresolved || []).map((item) => ({ weekNumber: week.weekNumber, ...item })));
  return {
    status: blockers.length ? "blocked" : warnings.length || unresolved.length ? "review" : "ready",
    readyForExport: blockers.length === 0,
    requiresHumanReview: warnings.length > 0 || unresolved.length > 0,
    blockers,
    warnings,
    unresolved,
    weeks: weekReports,
    summary: { totalWeeks: weekReports.length, readyWeeks: weekReports.filter((week) => week.status === "ready").length, reviewWeeks: weekReports.filter((week) => week.status === "review").length, blockedWeeks: weekReports.filter((week) => week.status === "blocked").length }
  };
}
