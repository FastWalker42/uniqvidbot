import ffmpeg from "fluent-ffmpeg";
import { randomInt } from "node:crypto";
import { join } from "node:path";
import { config } from "../config";
import { ensureDownloadDir, uniqueFilename, safeDelete } from "../utils/file-utils";

// ─── Types ────────────────────────────────────────────────────────

export interface UniqOptions {
  /** Overlay a random emoji on the video */
  emoji?: boolean;
  /** Apply edge blur (soft blurred frame around the edges) */
  blur?: boolean;
  /** Subtle color correction (brightness ±1-3%, contrast, saturation) */
  colorCorrection?: boolean;
  /** Strip all metadata — always true */
  metadataStrip?: boolean;
}

export interface UniqResult {
  outputPath: string;
  appliedEffects: string[];
}

// ─── Built-in emoji list ──────────────────────────────────────────

const OVERLAY_EMOJIS = [
  "🔥", "⭐", "😍", "😂", "💯", "🎉", "❤️", "👍", "😎", "🤩",
  "✨", "🌟", "💪", "🥳", "😇", "🤯", "😈", "👻", "🎃", "🎯",
];

// ─── Helpers ──────────────────────────────────────────────────────

if (config.ffmpegPath) ffmpeg.setFfmpegPath(config.ffmpegPath);
if (config.ffprobePath) ffmpeg.setFfprobePath(config.ffprobePath);

function getVideoInfo(inputPath: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, meta) => {
      if (err) return reject(err);
      const videoStream = meta.streams?.find((s) => s.codec_type === "video");
      resolve({
        duration: meta.format?.duration ?? 0,
        width: videoStream?.width ?? 1080,
        height: videoStream?.height ?? 1920,
      });
    });
  });
}

function randomFloat(min: number, max: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return randomInt(Math.round(min * factor), Math.round(max * factor)) / factor;
}

function pickRandom<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length)];
}

/**
 * Build drawtext filter string for emoji overlay.
 */
function buildEmojiFilter(): { filter: string; label: string } {
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
  let filter: string;
  let label: string;
  if (showFull) {
    filter = `drawtext=text='${emoji}':x=${posX}:y=${posY}:fontsize=${fontSize}:fontcolor=white`;
    label = `emoji:${emoji}(full)`;
  } else {
    // We'll fill startT/endT later when duration is known
    filter = `EMOJI_PLACEHOLDER`;
    label = `emoji:${emoji}`;
  }
  return { filter, label };
}

/**
 * Build eq filter string for color correction.
 */
function buildColorFilter(): { filter: string; label: string } {
  const brightness = randomFloat(-0.03, 0.03);
  const contrast = randomFloat(0.97, 1.03);
  const saturation = randomFloat(0.97, 1.03);
  return {
    filter: `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
    label: `color:bri=${brightness.toFixed(3)}:con=${contrast.toFixed(3)}:sat=${saturation.toFixed(3)}`,
  };
}

// ─── Main processing function ─────────────────────────────────────

/**
 * Apply uniquification effects to a video file.
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
  const appliedEffects: string[] = [];

  const { duration, width, height } = await getVideoInfo(inputPath);

  return new Promise<UniqResult>((resolve, reject) => {
    let cmd = ffmpeg(inputPath);

    const hasBlur = !!options.blur;
    const hasEmoji = !!options.emoji;
    const hasColor = !!options.colorCorrection;

    // ── If blur is enabled, we MUST use complexFilter for everything ──
    if (hasBlur) {
      const bw = Math.min(randomInt(15, 40), Math.floor(width * 0.05));
      const bh = Math.min(randomInt(15, 40), Math.floor(height * 0.05));
      const blurStrength = randomFloat(6, 15, 1);

      // Filter graph:
      // [0:v]split=2[base][top]
      // [base]boxblur=...[blurred]
      // [top]drawtext=...,eq=...[processed]
      // [blurred][processed]overlay=bw:bh

      const parts: string[] = [];
      parts.push(`[0:v]split=2[base][top]`);
      parts.push(`[base]boxblur=lr=${blurStrength}:lr=${blurStrength}:cr=${blurStrength}:cr=${blurStrength}[blurred]`);

      // Build top stream filters
      const topFilters: string[] = [];

      if (hasEmoji) {
        const { filter, label } = buildEmojiFilter();
        let emojiFilter = filter;
        if (emojiFilter === "EMOJI_PLACEHOLDER") {
          // Replace with actual timed drawtext
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
          const startT = randomFloat(0, Math.max(duration * 0.3, 0.1), 1);
          const endT = Math.min(duration, startT + randomFloat(1, 4, 1));
          emojiFilter = `drawtext=text='${emoji}':x=${posX}:y=${posY}:fontsize=${fontSize}:fontcolor=white:enable='between(t\\,${startT}\\,${endT})'`;
          appliedEffects.push(`emoji:${emoji}(${startT.toFixed(1)}-${endT.toFixed(1)}s)`);
        } else {
          appliedEffects.push(label);
        }
        topFilters.push(emojiFilter);
      }

      if (hasColor) {
        const { filter, label } = buildColorFilter();
        topFilters.push(filter);
        appliedEffects.push(label);
      }

      // Apply top filters and crop to remove edges (so blurred base shows through)
      if (topFilters.length > 0) {
        parts.push(`[top]${topFilters.join(",")},crop=iw-${2 * bw}:ih-${2 * bh}:${bw}:${bh}[processed]`);
      } else {
        parts.push(`[top]crop=iw-${2 * bw}:ih-${2 * bh}:${bw}:${bh}[processed]`);
      }

      // Overlay cropped center on top of blurred base
      parts.push(`[blurred][processed]overlay=${bw}:${bh}`);

      appliedEffects.push(`edge_blur:${bw}px:sigma=${blurStrength}`);

      const filterGraph = parts.join(";");
      cmd = cmd.complexFilter(filterGraph);

    } else {
      // ── No blur — simple videoFilters chain ──
      const vFilters: string[] = [];

      if (hasEmoji) {
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
          vFilters.push(
            `drawtext=text='${emoji}':x=${posX}:y=${posY}:fontsize=${fontSize}:fontcolor=white`,
          );
          appliedEffects.push(`emoji:${emoji}(full)`);
        } else {
          const startT = randomFloat(0, Math.max(duration * 0.3, 0.1), 1);
          const endT = Math.min(duration, startT + randomFloat(1, 4, 1));
          vFilters.push(
            `drawtext=text='${emoji}':x=${posX}:y=${posY}:fontsize=${fontSize}:fontcolor=white:enable='between(t\\,${startT}\\,${endT})'`,
          );
          appliedEffects.push(`emoji:${emoji}(${startT.toFixed(1)}-${endT.toFixed(1)}s)`);
        }
      }

      if (hasColor) {
        const { filter, label } = buildColorFilter();
        vFilters.push(filter);
        appliedEffects.push(label);
      }

      if (vFilters.length > 0) {
        cmd = cmd.videoFilters(vFilters);
      }
    }

    // Metadata strip — always on
    cmd = cmd.outputOptions("-map_metadata", "-1");
    appliedEffects.push("metadata_strip");

    // General output options
    cmd = cmd
      .outputOptions("-movflags", "+faststart")
      .outputOptions("-preset", "fast")
      .output(outputPath);

    cmd.on("end", () => {
      resolve({ outputPath, appliedEffects });
    });

    cmd.on("error", (err) => {
      safeDelete(outputPath);
      reject(err);
    });

    cmd.run();
  });
}

/**
 * Produce multiple unique copies of a video with random variations.
 * Each copy gets independently randomized effect parameters.
 */
export async function uniquifyVideoBatch(
  inputPath: string,
  count: number,
  options: UniqOptions,
): Promise<UniqResult[]> {
  const results: UniqResult[] = [];
  for (let i = 0; i < count; i++) {
    const result = await uniquifyVideo(inputPath, options);
    results.push(result);
  }
  return results;
}
