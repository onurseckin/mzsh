import { gatewayRedactionRegistry } from '../infrastructure/gateway-redaction-registry';

const credentialName =
  /token|secret|password|credential|api_?key|access_?key|private_?key|auth_?key/i;
const plainAssignment = /^(?:(?:export|typeset(?:\s+-[A-Za-z]+)+)\s+)?([A-Za-z_][A-Za-z0-9_]*)=/;

export function classifySensitiveAssignment(line: string): boolean {
  const match = plainAssignment.exec(line.trim());
  const name = match?.[1];
  return (
    name !== undefined && (gatewayRedactionRegistry.matches(name) || credentialName.test(name))
  );
}

export function containsSensitiveAssignment(content: string): boolean {
  return content.split(/\r?\n/).some((line) => classifySensitiveAssignment(line));
}
