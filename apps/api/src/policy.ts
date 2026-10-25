export function canWrite(role: string) {
  return role === "OWNER" || role === "AGENT";
}
