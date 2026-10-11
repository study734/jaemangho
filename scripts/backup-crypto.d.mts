export function encryptBackup(options: { file: string; output: string; key: string }): Promise<{ version: number; keyId: string }>;
export function decryptBackup(options: { file: string; output: string; key: string }): Promise<{ version: number }>;

export function validateBackupKey(value: string): Uint8Array;
