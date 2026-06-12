/**
 * Proxy parser — supports multiple formats:
 *
 * 1. IP:PORT:USER:PASS
 * 2. USER:PASS@IP:PORT
 * 3. IP:PORT (no auth)
 * 4. http://USER:PASS@IP:PORT
 * 5. socks5://USER:PASS@IP:PORT
 */

export interface ParsedProxy {
  host: string;
  port: number;
  username: string;
  password: string;
}

const IP_REGEX = /^\d{1,3}(\.\d{1,3}){3}$/;

function isValidIp(ip: string): boolean {
  return IP_REGEX.test(ip);
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/** Strip protocol prefix (http://, https://, socks5://, etc.) */
function stripProtocol(raw: string): string {
  return raw.replace(/^(https?|socks[45]):\/\//i, "");
}

/**
 * Parse a single proxy line into structured data.
 * Returns null if the format is invalid.
 */
export function parseProxy(line: string): ParsedProxy | null {
  const trimmed = stripProtocol(line.trim());
  if (!trimmed) return null;

  // Format: USER:PASS@IP:PORT
  const atMatch = trimmed.match(/^(.+?):(.+?)@(.+?):(\d+)$/);
  if (atMatch) {
    const [, username, password, host, portStr] = atMatch;
    const port = parseInt(portStr, 10);
    if (!isValidPort(port)) return null;
    return { host, port, username, password };
  }

  // Format: IP:PORT:USER:PASS
  const parts = trimmed.split(":");
  if (parts.length === 4) {
    const [host, portStr, username, password] = parts;
    const port = parseInt(portStr, 10);
    if (!isValidIp(host) || !isValidPort(port)) return null;
    return { host, port, username, password };
  }

  // Format: IP:PORT (no auth)
  if (parts.length === 2) {
    const [host, portStr] = parts;
    const port = parseInt(portStr, 10);
    if (!isValidIp(host) || !isValidPort(port)) return null;
    return { host, port, username: "", password: "" };
  }

  return null;
}

/**
 * Parse multiple proxy lines (one per line).
 * Returns { valid: ParsedProxy[], invalid: string[] }
 */
export function parseProxyBatch(text: string): { valid: ParsedProxy[]; invalid: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const valid: ParsedProxy[] = [];
  const invalid: string[] = [];

  for (const line of lines) {
    const parsed = parseProxy(line);
    if (parsed) {
      valid.push(parsed);
    } else {
      invalid.push(line);
    }
  }

  return { valid, invalid };
}
