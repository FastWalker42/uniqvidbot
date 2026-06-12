import { $ } from "bun";
import { randomInt } from "node:crypto";
import { join } from "node:path";
import { config } from "../config";
import { ensureDownloadDir, uniqueFilename, safeDelete } from "../utils/file-utils";

// ─── Types ────────────────────────────────────────────────────────

export interface UniqOptions {
  /** Overlay a random emoji on the video — always applied if true */
  emoji?: boolean;
  /** Apply edge blur (soft blurred frame around the edges) */
  blur?: boolean;
  /** Subtle color correction (brightness, contrast, saturation) */
  colorCorrection?: boolean;
  /** Glitch effect — horizontal shift / color channel split */
  glitch?: boolean;
  /** Visual noise / grain overlay */
  noise?: boolean;
  /** Mirror/flip the video horizontally */
  mirror?: boolean;
  /** Strip all metadata — always true */
  metadataStrip?: boolean;
}

export interface UniqResult {
  outputPath: string;
  appliedEffects: string[];
}

/** Effect intensity 0-10 for each enabled effect */
export interface EffectIntensities {
  blur: number;          // 0-10
  colorCorrection: number; // 0-10
  glitch: number;        // 0-10
  noise: number;         // 0-10
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
}

// ─── Built-in emoji list ──────────────────────────────────────────

export const OVERLAY_EMOJIS = [
  "🔥", "⭐", "😍", "😂", "💯", "🎉", "❤️", "👍", "😎", "🤩",
  "✨", "🌟", "💪", "🥳", "😇", "🤯", "😈", "👻", "🎃", "🎯",
];

// ─── Helpers ──────────────────────────────────────────────────────

export function randomFloat(min: number, max: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return randomInt(Math.round(min * factor), Math.round(max * factor)) / factor;
}

export function pickRandom<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length)];
}

/**
 * Roll random intensities (0-10) for each enabled effect.
 * Guarantees at least 2 non-zero intensities (among non-emoji effects).
 * Emoji is always applied if enabled (not affected by intensity).
 */
export function rollIntensities(options: UniqOptions): EffectIntensities {
  const enabledKeys: (keyof EffectIntensities)[] = [];
  if (options.blur) enabledKeys.push("blur");
  if (options.colorCorrection) enabledKeys.push("colorCorrection");
  if (options.glitch) enabledKeys.push("glitch");
  if (options.noise) enabledKeys.push("noise");

  // Roll intensities
  const intensities: EffectIntensities = {
    blur: options.blur ? randomInt(0, 11) : 0,          // 0-10
    colorCorrection: options.colorCorrection ? randomInt(0, 11) : 0,
    glitch: options.glitch ? randomInt(0, 11) : 0,
    noise: options.noise ? randomInt(0, 11) : 0,
  };

  // Guarantee at least 2 non-zero among enabled effects
  const nonZeroCount = enabledKeys.filter((k) => intensities[k] > 0).length;
  if (enabledKeys.length >= 2 && nonZeroCount < 2) {
    const zeroKeys = enabledKeys.filter((k) => intensities[k] === 0);
    // Need to bump some to non-zero
    const need = 2 - nonZeroCount;
    const toBump = zeroKeys.sort(() => Math.random() - 0.5).slice(0, need);
    for (const key of toBump) {
      intensities[key] = randomInt(1, 5); // At least 1% to be meaningful
    }
  } else if (enabledKeys.length === 1 && intensities[enabledKeys[0]] === 0) {
    // Only one effect enabled — make it non-zero
    intensities[enabledKeys[0]] = randomInt(1, 5);
  }

  return intensities;
}

// ─── Emoji helper ─────────────────────────────────────────────────

export function buildEmojiFilter(duration: number): { filter: string; label: string } {
  const emoji = pickRandom(OVERLAY_EMOJIS);
  const corner = randomInt(0, 4);
  const margin = randomInt(2, 6);
  let posX: string, posY: string;
  switch (corner) {
    case 0: posX = `${margin}*W/100`; posY = `${margin}*H/100`; break;
    case 1: posX = `(W-w-${margin}*W/100)`; posY = `${margin}*H/100`; break;
    case 2: posX = `${margin}*W/100`; posY = `(H-h-${margin}*H/100)`; break;
    default: posX = `(W-w-${margin}*W/100)`; posY = `(H-h-${margin}*H/100)`; break;
  }
  const fontSize = randomInt(24, 48);
  const showFull = Math.random() > 0.4;
  if (showFull) {
    return {
      filter: `drawtext=text='${emoji}':x=${posX}:y=${posY}:fontsize=${fontSize}:fontcolor=white`,
      label: `emoji:${emoji}(full)`,
    };
  } else {
    const startT = randomFloat(0, Math.max(duration * 0.3, 0.1), 1);
    const endT = Math.min(duration, startT + randomFloat(1, 4, 1));
    return {
      filter: `drawtext=text='${emoji}':x=${posX}:y=${posY}:fontsize=${fontSize}:fontcolor=white:enable='between(t\\,${startT}\\,${endT})'`,
      label: `emoji:${emoji}(${startT.toFixed(1)}-${endT.toFixed(1)}s)`,
    };
  }
}

// ─── Video info via Bun Shell ─────────────────────────────────────

/**
 * Probe video metadata via ffprobe using Bun Shell.
 */
export async function getVideoInfo(inputPath: string): Promise<VideoInfo> {
  const ffprobe = config.ffprobePath || "ffprobe";
  try {
    const output = await $`${ffprobe} -v quiet -print_format json -show_format -show_streams ${inputPath}`.text();
    const meta = JSON.parse(output);
    const videoStream = meta.streams?.find((s: any) => s.codec_type === "video");
    return {
      duration: Number(meta.format?.duration) || 0,
      width: videoStream?.width ?? 1080,
      height: videoStream?.height ?? 1920,
    };
  } catch (err) {
    throw new Error(`ffprobe failed: ${(err as Error).message}`);
  }
}

// ─── Filter builder ───────────────────────────────────────────────

/**
 * Build the FFmpeg filter string and determine filter type.
 * Returns the filter type (complex / simple / none), the filter value,
 * and a list of human-readable applied effect labels.
 */
export function buildFfmpegFilter(
  options: UniqOptions,
  videoInfo: VideoInfo,
): {
  filterType: "complex" | "simple" | "none";
  filterValue: string;
  appliedEffects: string[];
} {
  const { duration } = videoInfo;
  const intensity = rollIntensities(options);
  const appliedEffects: string[] = [];

  const hasEmoji = !!options.emoji;
  const hasBlur = options.blur && intensity.blur > 0;
  const hasColor = options.colorCorrection && intensity.colorCorrection > 0;
  const hasGlitch = options.glitch && intensity.glitch > 0;
  const hasNoise = options.noise && intensity.noise > 0;
  const hasMirror = !!options.mirror;

  // ── If blur is enabled with non-zero intensity, use complexFilter ──
  if (hasBlur) {
    const iFactor = intensity.blur / 10; // 0.0 - 1.0
    const bw = Math.max(5, Math.round(randomInt(10, 35) * iFactor));
    const bh = Math.max(5, Math.round(randomInt(10, 35) * iFactor));
    const blurStrength = randomFloat(4, 15, 1) * iFactor;

    const parts: string[] = [];
    parts.push(`[0:v]split=2[base][top]`);
    parts.push(`[base]boxblur=lr=${blurStrength.toFixed(1)}:lr=${blurStrength.toFixed(1)}:cr=${blurStrength.toFixed(1)}:cr=${blurStrength.toFixed(1)}[blurred]`);

    const topFilters: string[] = [];

    if (hasEmoji) {
      const { filter, label } = buildEmojiFilter(duration);
      topFilters.push(filter);
      appliedEffects.push(label);
    }

    if (hasMirror) {
      topFilters.push("hflip");
      appliedEffects.push("mirror");
    }

    if (hasColor) {
      const cFactor = intensity.colorCorrection / 10;
      const brightness = randomFloat(-0.03, 0.03) * cFactor;
      const contrast = 1 + (randomFloat(-0.03, 0.03) * cFactor);
      const saturation = 1 + (randomFloat(-0.03, 0.03) * cFactor);
      topFilters.push(`eq=brightness=${brightness.toFixed(4)}:contrast=${contrast.toFixed(4)}:saturation=${saturation.toFixed(4)}`);
      appliedEffects.push(`color:bri=${brightness.toFixed(3)}`);
    }

    if (hasGlitch) {
      const gFactor = intensity.glitch / 10;
      const shiftPx = Math.round(randomInt(2, 20) * gFactor);
      // Chroma shift via overlay with slight offset
      topFilters.push(`split=2[gl_a][gl_b]`);
      topFilters.push(`[gl_b]format=rgba,colorchannelmixer=rr=1:rb=${randomFloat(0.01, 0.05) * gFactor}:br=${randomFloat(0.01, 0.05) * gFactor}:bb=1[gl_shifted]`);
      topFilters.push(`[gl_a][gl_shifted]overlay=${shiftPx}:0`);
      appliedEffects.push(`glitch:shift=${shiftPx}px`);
    }

    if (hasNoise) {
      const nFactor = intensity.noise / 10;
      const noiseStrength = Math.round(randomInt(3, 20) * nFactor);
      topFilters.push(`noise=alls=${noiseStrength}:allf=t+u`);
      appliedEffects.push(`noise:str=${noiseStrength}`);
    }

    const cropExpr = `crop=iw-${2 * bw}:ih-${2 * bh}:${bw}:${bh}`;
    if (topFilters.length > 0) {
      parts.push(`[top]${topFilters.join(",")},${cropExpr}[processed]`);
    } else {
      parts.push(`[top]${cropExpr}[processed]`);
    }

    parts.push(`[blurred][processed]overlay=${bw}:${bh}`);
    appliedEffects.push(`edge_blur:${bw}px:sigma=${blurStrength.toFixed(1)}`);

    return {
      filterType: "complex",
      filterValue: parts.join(";"),
      appliedEffects,
    };
  }

  // ── No blur — simple videoFilters chain ──
  const vFilters: string[] = [];

  if (hasEmoji) {
    const { filter, label } = buildEmojiFilter(duration);
    vFilters.push(filter);
    appliedEffects.push(label);
  }

  if (hasMirror) {
    vFilters.push("hflip");
    appliedEffects.push("mirror");
  }

  if (hasColor) {
    const cFactor = intensity.colorCorrection / 10;
    const brightness = randomFloat(-0.03, 0.03) * cFactor;
    const contrast = 1 + (randomFloat(-0.03, 0.03) * cFactor);
    const saturation = 1 + (randomFloat(-0.03, 0.03) * cFactor);
    vFilters.push(`eq=brightness=${brightness.toFixed(4)}:contrast=${contrast.toFixed(4)}:saturation=${saturation.toFixed(4)}`);
    appliedEffects.push(`color:bri=${brightness.toFixed(3)}`);
  }

  if (hasGlitch) {
    // For non-blur path, use simpler glitch: just chroma shift via colorchannelmixer
    const gFactor = intensity.glitch / 10;
    const rbMix = randomFloat(0.01, 0.05) * gFactor;
    const brMix = randomFloat(0.01, 0.05) * gFactor;
    vFilters.push(`colorchannelmixer=rr=1:rb=${rbMix.toFixed(3)}:br=${brMix.toFixed(3)}:bb=1`);
    appliedEffects.push(`glitch:chroma_shift`);
  }

  if (hasNoise) {
    const nFactor = intensity.noise / 10;
    const noiseStrength = Math.round(randomInt(3, 20) * nFactor);
    vFilters.push(`noise=alls=${noiseStrength}:allf=t+u`);
    appliedEffects.push(`noise:str=${noiseStrength}`);
  }

  if (vFilters.length > 0) {
    return {
      filterType: "simple",
      filterValue: vFilters.join(","),
      appliedEffects,
    };
  }

  return {
    filterType: "none",
    filterValue: "",
    appliedEffects,
  };
}

// ─── Single video processing via Bun Shell ────────────────────────

/**
 * Apply uniquification effects to a single video file using Bun Shell.
 * Each call produces a visually different output even with the same options,
 * because random parameters are re-rolled each time.
 */
export async function uniquifyVideo(
  inputPath: string,
  options: UniqOptions,
): Promise<UniqResult> {
  const outDir = await ensureDownloadDir("processed");
  const outName = uniqueFilename("uniq", "mp4");
  const outputPath = join(outDir, outName);

  const videoInfo = await getVideoInfo(inputPath);
  const { filterType, filterValue, appliedEffects } = buildFfmpegFilter(options, videoInfo);

  const ffmpeg = config.ffmpegPath || "ffmpeg";

  try {
    if (filterType === "complex") {
      await $`${ffmpeg} -y -i ${inputPath} -filter_complex ${filterValue} -map 0:a? -c:a copy -map_metadata -1 -movflags +faststart -preset fast ${outputPath}`.quiet();
    } else if (filterType === "simple") {
      await $`${ffmpeg} -y -i ${inputPath} -vf ${filterValue} -map 0:a? -c:a copy -map_metadata -1 -movflags +faststart -preset fast ${outputPath}`.quiet();
    } else {
      await $`${ffmpeg} -y -i ${inputPath} -map_metadata -1 -movflags +faststart -preset fast ${outputPath}`.quiet();
    }
  } catch (err) {
    await safeDelete(outputPath);
    throw new Error(`FFmpeg failed: ${(err as Error).message}`);
  }

  appliedEffects.push("metadata_strip");
  return { outputPath, appliedEffects };
}

// ─── Worker-based parallel batch processing ───────────────────────

/**
 * Wrap a single Worker lifecycle in a Promise.
 * Posts data to the worker, waits for a single response, then terminates.
 */
function runWorker(workerUrl: string, data: {
  id: number;
  inputPath: string;
  outputPath: string;
  options: UniqOptions;
  videoInfo: VideoInfo;
  ffmpegPath?: string;
}): Promise<UniqResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl);

    worker.onmessage = (event) => {
      const { success, appliedEffects, error } = event.data;
      worker.terminate();

      if (success) {
        resolve({ outputPath: data.outputPath, appliedEffects });
      } else {
        reject(new Error(error || "Worker failed"));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(`Worker error: ${err.message || String(err)}`));
    };

    worker.postMessage(data);
  });
}

/**
 * Produce multiple unique copies of a video in FULL PARALLEL using Bun Workers.
 * Each copy is processed in its own Worker thread with its own Bun Shell
 * execution — no sequential blocking, no event loop stall.
 *
 * @param onCopyDone Optional callback fired as each copy finishes,
 *                   allowing the caller to stream results immediately.
 */
export async function uniquifyVideoBatch(
  inputPath: string,
  count: number,
  options: UniqOptions,
  onCopyDone?: (index: number, result: UniqResult) => void | Promise<void>,
): Promise<UniqResult[]> {
  const outDir = await ensureDownloadDir("processed");
  const videoInfo = await getVideoInfo(inputPath);
  const ffmpegPath = config.ffmpegPath || undefined;
  const workerUrl = new URL("../workers/uniquify-worker.ts", import.meta.url).href;

  // Launch all workers in parallel — Promise.all gives true concurrent execution
  const promises = Array.from({ length: count }, async (_, i) => {
    const outName = uniqueFilename("uniq", "mp4");
    const outputPath = join(outDir, outName);

    try {
      const result = await runWorker(workerUrl, {
        id: i,
        inputPath,
        outputPath,
        options,
        videoInfo,
        ffmpegPath,
      });

      // Stream result to caller as soon as this copy finishes
      if (onCopyDone) await onCopyDone(i, result);
      return result;
    } catch (err) {
      await safeDelete(outputPath);
      throw err;
    }
  });

  return Promise.all(promises);
}
