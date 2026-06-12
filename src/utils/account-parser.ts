/**
 * Account parser — accepts format: Login:Password:BackupEmail
 * Supports both single line and multi-line (one account per line).
 */

export interface ParsedAccount {
  login: string;
  password: string;
  backupEmail: string;
}

/**
 * Parse a single account line.
 * Returns null if format is invalid.
 */
export function parseAccount(line: string): ParsedAccount | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(":");
  if (parts.length < 2) return null;

  const login = parts[0].trim();
  const password = parts[1].trim();
  const backupEmail = parts.length >= 3 ? parts.slice(2).join(":").trim() : "";

  if (!login || !password) return null;

  return { login, password, backupEmail };
}

/**
 * Parse multiple account lines.
 * Returns { valid: ParsedAccount[], invalid: string[] }
 */
export function parseAccountBatch(text: string): { valid: ParsedAccount[]; invalid: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const valid: ParsedAccount[] = [];
  const invalid: string[] = [];

  for (const line of lines) {
    const parsed = parseAccount(line);
    if (parsed) {
      valid.push(parsed);
    } else {
      invalid.push(line);
    }
  }

  return { valid, invalid };
}
