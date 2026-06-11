import ffmpeg from "fluent-ffmpeg";
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
  /** Strip all metadata — always true */
  metadataStrip?: boolean;
}

export interface UniqResult {
  outputPath: string;
  appliedEffects: string[];
}

/** Effect intensity 0-10% for each enabled effect */
export interface EffectIntensities {
  blur: number;          // 0-10
  colorCorrection: number; // 0-10
  glitch: number;        // 0-10
  noise: number;         // 0-10
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
 * Roll random intensities (0-10) for each enabled effect.
 * Guarantees at least 2 non-zero intensities (among non-emoji effects).
 * Emoji is always applied if enabled (not affected by intensity).
 */
function rollIntensities(options: UniqOptions): EffectIntensities {
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

function buildEmojiFilter(duration: number): { filter: string; label: string } {
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

// ─── Main processing function ─────────────────────────────────────

/**
 * Apply uniquification effects to a video file.
 * Each call produces a visually different output even with the same options,
 * because random parameters are re-rolled each time.
 *
 * Effects and their intensity-based ranges:
 * - Emoji: always applied if enabled (not intensity-based)
 * - Blur: edge blur width/strength scales 0-10% intensity
 * - Color correction: brightness/contrast/saturation scales 0-10% intensity
 * - Glitch: horizontal shift + color channel split scales 0-10% intensity
 * - Noise: grain strength scales 0-10% intensity
 * - Metadata strip: always on
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

  // Roll intensities for this copy
  const intensity = rollIntensities(options);

  return new Promise<UniqResult>((resolve, reject) => {
    let cmd = ffmpeg(inputPath);

    const hasEmoji = !!options.emoji;
    const hasBlur = options.blur && intensity.blur > 0;
    const hasColor = options.colorCorrection && intensity.colorCorrection > 0;
    const hasGlitch = options.glitch && intensity.glitch > 0;
    const hasNoise = options.noise && intensity.noise > 0;

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

      if (hasColor) {
        const cFactor = intensity.colorCorrection / 10;
        const brightness = randomFloat(-0.03, 0.03) * cFactor;
        const contrast = 1 + (randomFloat(-0.03, 0.03) * cFactor);
        const saturation = 1 + (randomFloat(-0.03, 0.03) * cFactor);
        topFilters.push(`eq=brightness=${brightness.toFixed(4)}:contrast=${contrast.toFixed(4)}:saturation=${saturation.toFixed(4)}`);
        appliedEffects.push(`color:${intensity.colorCorrection}%:bri=${brightness.toFixed(3)}`);
      }

      if (hasGlitch) {
        const gFactor = intensity.glitch / 10;
        const shiftPx = Math.round(randomInt(2, 20) * gFactor);
        // Chroma shift via overlay with slight offset
        topFilters.push(`split=2[gl_a][gl_b]`);
        topFilters.push(`[gl_b]format=rgba,colorchannelmixer=rr=1:rb=${randomFloat(0.01, 0.05) * gFactor}:br=${randomFloat(0.01, 0.05) * gFactor}:bb=1[gl_shifted]`);
        topFilters.push(`[gl_a][gl_shifted]overlay=${shiftPx}:0`);
        appliedEffects.push(`glitch:${intensity.glitch}%:shift=${shiftPx}px`);
      }

      if (hasNoise) {
        const nFactor = intensity.noise / 10;
        const noiseStrength = Math.round(randomInt(3, 20) * nFactor);
        topFilters.push(`noise=alls=${noiseStrength}:allf=t+u`);
        appliedEffects.push(`noise:${intensity.noise}%:str=${noiseStrength}`);
      }

      const cropExpr = `crop=iw-${2 * bw}:ih-${2 * bh}:${bw}:${bh}`;
      if (topFilters.length > 0) {
        parts.push(`[top]${topFilters.join(",")},${cropExpr}[processed]`);
      } else {
        parts.push(`[top]${cropExpr}[processed]`);
      }

      parts.push(`[blurred][processed]overlay=${bw}:${bh}`);
      appliedEffects.push(`edge_blur:${intensity.blur}%:${bw}px:sigma=${blurStrength.toFixed(1)}`);

      const filterGraph = parts.join(";");
      cmd = cmd.complexFilter(filterGraph);

    } else {
      // ── No blur — simple videoFilters chain ──
      const vFilters: string[] = [];

      if (hasEmoji) {
        const { filter, label } = buildEmojiFilter(duration);
        vFilters.push(filter);
        appliedEffects.push(label);
      }

      if (hasColor) {
        const cFactor = intensity.colorCorrection / 10;
        const brightness = randomFloat(-0.03, 0.03) * cFactor;
        const contrast = 1 + (randomFloat(-0.03, 0.03) * cFactor);
        const saturation = 1 + (randomFloat(-0.03, 0.03) * cFactor);
        vFilters.push(`eq=brightness=${brightness.toFixed(4)}:contrast=${contrast.toFixed(4)}:saturation=${saturation.toFixed(4)}`);
        appliedEffects.push(`color:${intensity.colorCorrection}%:bri=${brightness.toFixed(3)}`);
      }

      if (hasGlitch) {
        // For non-blur path, use simpler glitch: just chroma shift via colorchannelmixer
        // (can't use split/overlay in -vf without complexFilter, so use a simpler approach)
        const gFactor = intensity.glitch / 10;
        const rbMix = randomFloat(0.01, 0.05) * gFactor;
        const brMix = randomFloat(0.01, 0.05) * gFactor;
        vFilters.push(`colorchannelmixer=rr=1:rb=${rbMix.toFixed(3)}:br=${brMix.toFixed(3)}:bb=1`);
        appliedEffects.push(`glitch:${intensity.glitch}%:chroma_shift`);
      }

      if (hasNoise) {
        const nFactor = intensity.noise / 10;
        const noiseStrength = Math.round(randomInt(3, 20) * nFactor);
        vFilters.push(`noise=alls=${noiseStrength}:allf=t+u`);
        appliedEffects.push(`noise:${intensity.noise}%:str=${noiseStrength}`);
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
 * Each copy gets independently randomized effect parameters and intensities.
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
