import ffmpeg from "fluent-ffmpeg";
import { randomInt, randomUUID } from "node:crypto";
import { join, basename, extname } from "node:path";
import { config } from "../config";
import { ensureDownloadDir, uniqueFilename, safeDelete } from "../utils/file-utils";

// ─── Types ────────────────────────────────────────────────────────

export interface UniqOptions {
  /** Overlay a random emoji/image on the video */
  emoji?: boolean;
  /** Apply blur to edges/background */
  blur?: boolean;
  /** Subtle color correction (brightness, contrast, saturation) */
  colorCorrection?: boolean;
  /** Micro speed change (±0.5–1.5%) */
  speedChange?: boolean;
  /** Strip all metadata */
  metadataStrip?: boolean;
  /** Micro-trim 0.1–0.3s from start or end */
  microTrim?: boolean;
  /** Path to custom overlay image (png/webp) */
  overlayImagePath?: string;
}

export interface UniqResult {
  outputPath: string;
  appliedEffects: string[];
}

// ─── Built-in emoji list ──────────────────────────────────────────

const BUILTIN_EMOJI_IMAGES: string[] = [
  // These are just labels — actual overlay images must be in assets/
  // We'll use Unicode text rendered via FFmpeg drawtext as fallback
];

const OVERLAY_EMOJIS = [
  "🔥", "⭐", "😍", "😂", "💯", "🎉", "❤️", "👍", "😎", "🤩",
  "✨", "🌟", "💪", "🥳", "😇", "🤯", "😈", "👻", "🎃", "🎯",
];

// ─── Helpers ──────────────────────────────────────────────────────

if (config.ffmpegPath) ffmpeg.setFfmpegPath(config.ffmpegPath);
if (config.ffprobePath) ffmpeg.setFfprobePath(config.ffprobePath);

function getVideoDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, meta) => {
      if (err) return reject(err);
      resolve(meta.format?.duration ?? 0);
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

  const duration = await getVideoDuration(inputPath);

  return new Promise<UniqResult>((resolve, reject) => {
    let cmd = ffmpeg(inputPath);

    // ── Video filters (accumulate in -vf chain) ──
    const vFilters: string[] = [];
    const aFilters: string[] = [];

    // 1. Emoji overlay (using drawtext with Unicode emoji)
    if (options.emoji) {
      const emoji = pickRandom(OVERLAY_EMOJIS);
      const posX = randomInt(10, 85); // % from left
      const posY = randomInt(10, 85); // % from top
      const fontSize = randomInt(28, 56);
      // drawtext with emoji — uses fontcolor and a fallback approach
      vFilters.push(
        `drawtext=text='${emoji}':x=${posX}*W/100:y=${posY}*H/100:fontsize=${fontSize}:fontcolor=white:enable='between(t,0,${duration})'`,
      );
      appliedEffects.push(`emoji:${emoji}`);
    }

    // Custom overlay image
    if (options.overlayImagePath) {
      const posX = randomInt(10, 80);
      const posY = randomInt(10, 80);
      // overlay requires two inputs
      cmd = cmd.input(options.overlayImagePath);
      vFilters.push(
        `[0:v][1:v]overlay=${posX}*W/100:${posY}*H/100:enable='between(t,0,${duration})'[v]`,
      );
      appliedEffects.push("custom_overlay");
    }

    // 2. Blur edges
    if (options.blur) {
      const blurWidth = randomInt(15, 40);
      const blurSigma = randomFloat(3, 8, 1);
      // Boxblur on a border region using drawbox + overlay approach
      // Simpler: apply slight boxblur to the whole video (barely noticeable)
      vFilters.push(`boxblur=lr=${blurSigma}:lr=${blurSigma}:cr=${blurSigma}:cr=${blurSigma}`);
      appliedEffects.push(`blur:sigma=${blurSigma}`);
    }

    // 3. Color correction
    if (options.colorCorrection) {
      const brightness = randomFloat(-0.02, 0.02);
      const contrast = randomFloat(0.98, 1.02);
      const saturation = randomFloat(0.98, 1.02);
      vFilters.push(
        `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
      );
      appliedEffects.push(`color:bri=${brightness}:con=${contrast}:sat=${saturation}`);
    }

    // 4. Speed change (±0.5–1.5%)
    if (options.speedChange) {
      const speedFactor = randomFloat(0.985, 1.015);
      const ptsFactor = 1 / speedFactor;
      vFilters.push(`setpts=${ptsFactor}*PTS`);
      aFilters.push(`atempo=${speedFactor}`);
      appliedEffects.push(`speed:${(speedFactor * 100).toFixed(2)}%`);
    }

    // 5. Micro-trim (0.1–0.3s from start or end)
    if (options.microTrim && duration > 1) {
      const trimAmount = randomFloat(0.1, 0.3, 2);
      const trimFromStart = Math.random() > 0.5;
      if (trimFromStart) {
        cmd = cmd.seekInput(trimAmount);
        appliedEffects.push(`trim_start:${trimAmount}s`);
      } else {
        const newDuration = duration - trimAmount;
        cmd = cmd.duration(newDuration);
        appliedEffects.push(`trim_end:${trimAmount}s`);
      }
    }

    // Apply video filters
    if (vFilters.length > 0) {
      if (options.overlayImagePath) {
        // overlay filter already produces [v] label
        cmd = cmd.complexFilter(vFilters, "v");
      } else {
        cmd = cmd.videoFilters(vFilters);
      }
    }

    // Apply audio filters
    if (aFilters.length > 0) {
      cmd = cmd.audioFilters(aFilters);
    }

    // 6. Metadata strip
    if (options.metadataStrip !== false) {
      cmd = cmd.outputOptions("-map_metadata", "-1");
      appliedEffects.push("metadata_strip");
    }

    // General output options for compatibility
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
