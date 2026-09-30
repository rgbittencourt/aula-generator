export function accessRequired() {
  return Boolean(process.env.AULA_ACCESS_CODE);
}

export function hasValidAccess(request) {
  const expected = process.env.AULA_ACCESS_CODE;
  if (!expected) return true;
  const supplied = request.headers["x-aula-access-code"] || request.headers["x-aula-access-code".toLowerCase()];
  return typeof supplied === "string" && supplied.length > 0 && supplied === expected;
}
