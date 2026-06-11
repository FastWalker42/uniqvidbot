import { mkdir, unlink, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config";

/** Ensure the downloads directory exists, return its path. */
export async function ensureDownloadDir(subdir?: string): Promise<string> {
  const dir = subdir ? join(config.downloadDir, subdir) : config.downloadDir;
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Generate a unique filename in the downloads directory. */
export function uniqueFilename(prefix: string, ext: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${ts}_${rand}.${ext}`;
}

/** Safely delete a file, ignoring errors if it doesn't exist. */
export async function safeDelete(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // ignore
  }
}

/** Get total size of files in a directory */
export async function getDirSize(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir);
    let total = 0;
    for (const entry of entries) {
      const s = await stat(join(dir, entry));
      if (s.isFile()) total += s.size;
    }
    return total;
  } catch {
    return 0;
  }
}
