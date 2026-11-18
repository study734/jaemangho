export interface AuditException { id: string; expires: string; reason: string }
export interface Advisory { id: string; name: string; severity: string; title: string; range: string }
export const EXCEPTIONS: AuditException[];
export function evaluate(report: unknown, exceptions?: AuditException[], now?: Date): {
  blocking: Advisory[]; excepted: Advisory[]; expired: string[]; unused: string[];
};
