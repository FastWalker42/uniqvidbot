import ffmpeg from "fluent-ffmpeg";
import { randomInt, randomUUID } from "node:crypto";
import { join, basename, extname } from "node:path";
import { config } from "../config";
import { ensureDownloadDir, uniqueFilename, safeDelete } from "../utils/file-utils";

// ─── Types ────────────────────────────────────────────────────────

export interface UniqOptions {
  /** Overlay a random emoji on the video */
  emoji?: boolean;
  /** Apply edge blur (vignette-like frame around the video) */
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

// ─── Main processing function ─────────────────────────────────────

/**
 * Apply uniquification effects to a video file.
 * Each call produces a visually different output even with the same options,
 * because random parameters are re-rolled each time.
 *
 * Effects applied:
 * 1. Emoji overlay — random emoji at random corner/edge position, random size
 * 2. Edge blur — soft blurred frame around the edges (NOT full-frame blur)
 * 3. Color correction — random brightness ±1-3%, contrast, saturation
 * 4. Metadata strip — always on
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

    // ── Video filters (accumulate in -vf chain) ──
    const vFilters: string[] = [];

    // 1. Emoji overlay — place in a corner/edge so it doesn't cover main content
    if (options.emoji) {
      const emoji = pickRandom(OVERLAY_EMOJIS);
      // Choose a corner/edge position (top-left, top-right, bottom-left, bottom-right)
      const corner = randomInt(0, 4);
      const margin = randomInt(2, 6); // % from edge
      let posX: string, posY: string;
      switch (corner) {
        case 0: // top-left
          posX = `${margin}*W/100`;
          posY = `${margin}*H/100`;
          break;
        case 1: // top-right
          posX = `(W-w-${margin}*W/100)`;
          posY = `${margin}*H/100`;
          break;
        case 2: // bottom-left
          posX = `${margin}*W/100`;
          posY = `(H-h-${margin}*H/100)`;
          break;
        default: // bottom-right
          posX = `(W-w-${margin}*W/100)`;
          posY = `(H-h-${margin}*H/100)`;
          break;
      }
      const fontSize = randomInt(24, 48);
      // Emoji may appear for the whole video or a random time window
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
          `drawtext=text='${emoji}':x=${posX}:y=${posY}:fontsize=${fontSize}:fontcolor=white:enable='between(t,${startT},${endT})'`,
        );
        appliedEffects.push(`emoji:${emoji}(${startT.toFixed(1)}-${endT.toFixed(1)}s)`);
      }
    }

    // 2. Edge blur — soft blurred frame around the edges
    // Uses a split + overlay approach:
    //   - Copy 1: original
    //   - Copy 2: blurred version
    //   - Overlay the original (slightly inset) on top of the blurred version
    // This creates a natural edge-blur effect
    if (options.blur) {
      const borderWidth = randomInt(20, 50); // px of blur on each edge
      const blurStrength = randomFloat(8, 20, 1); // sigma for boxblur
      vFilters.push(
        `split[original][blurred]`,
        `[blurred]boxblur=lr=${blurStrength}:lr=${blurStrength}:cr=${blurStrength}:cr=${blurStrength}[blurred2]`,
        `[blurred2][original]overlay=${borderWidth}:${borderWidth}`,
      );
      appliedEffects.push(`edge_blur:${borderWidth}px:sigma=${blurStrength}`);
    }

    // 3. Color correction — subtle random changes
    if (options.colorCorrection) {
      const brightness = randomFloat(-0.03, 0.03); // ±1-3%
      const contrast = randomFloat(0.97, 1.03);
      const saturation = randomFloat(0.97, 1.03);
      vFilters.push(
        `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
      );
      appliedEffects.push(`color:bri=${brightness.toFixed(3)}:con=${contrast.toFixed(3)}:sat=${saturation.toFixed(3)}`);
    }

    // Apply video filters
    if (vFilters.length > 0) {
      // Check if we need complexFilter (for split/overlay in blur)
      if (options.blur) {
        // Join all filters into one complex filter chain
        const filterChain = vFilters.join(";");
        cmd = cmd.complexFilter(filterChain);
      } else {
        cmd = cmd.videoFilters(vFilters);
      }
    }

    // 4. Metadata strip — always on
    cmd = cmd.outputOptions("-map_metadata", "-1");
    appliedEffects.push("metadata_strip");

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
