const credentialName = /(token|secret|password|credential|api_?key|access_?key|private_?key|auth_?key)/i;
const plainAssignment = /^(?:(?:export|typeset(?:\s+-[A-Za-z]+)+)\s+)?([A-Za-z_][A-Za-z0-9_]*)=/;

export function classifySensitiveAssignment(line: string): boolean {
  const match = plainAssignment.exec(line.trim());
  return match !== null && credentialName.test(match[1] ?? "");
}

export function containsSensitiveAssignment(content: string): boolean {
  return content.split(/\r?\n/).some((line) => classifySensitiveAssignment(line));
}
