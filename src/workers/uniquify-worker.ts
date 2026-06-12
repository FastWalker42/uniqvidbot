/**
 * Bun Worker: processes a single video copy with uniquification effects.
 *
 * Receives processing parameters via postMessage, builds FFmpeg filter
 * independently (own random rolls = unique output), and executes FFmpeg
 * via Bun Shell. Posts result back and terminates.
 */
import { $ } from "bun";
import {
  buildFfmpegFilter,
  type UniqOptions,
  type VideoInfo,
} from "../services/video-processor";

// ─── Message types ────────────────────────────────────────────────

interface WorkerInput {
  id: number;
  inputPath: string;
  outputPath: string;
  options: UniqOptions;
  videoInfo: VideoInfo;
  ffmpegPath?: string;
}

interface WorkerOutput {
  id: number;
  success: boolean;
  appliedEffects: string[];
  error?: string;
}

// ─── Worker entry point ───────────────────────────────────────────

self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  const { id, inputPath, outputPath, options, videoInfo, ffmpegPath } = event.data;
  const ffmpeg = ffmpegPath || "ffmpeg";

  try {
    // Build filters with independent random rolls — each worker is unique
    const { filterType, filterValue, appliedEffects } = buildFfmpegFilter(options, videoInfo);

    // Execute FFmpeg via Bun Shell — full parallelism, no blocking
    if (filterType === "complex") {
      await $`${ffmpeg} -y -i ${inputPath} -filter_complex ${filterValue} -map 0:a? -c:a copy -map_metadata -1 -movflags +faststart -preset fast ${outputPath}`.quiet();
    } else if (filterType === "simple") {
      await $`${ffmpeg} -y -i ${inputPath} -vf ${filterValue} -map 0:a? -c:a copy -map_metadata -1 -movflags +faststart -preset fast ${outputPath}`.quiet();
    } else {
      await $`${ffmpeg} -y -i ${inputPath} -map_metadata -1 -movflags +faststart -preset fast ${outputPath}`.quiet();
    }

    appliedEffects.push("metadata_strip");

    self.postMessage({
      id,
      success: true,
      appliedEffects,
    } satisfies WorkerOutput);
  } catch (err) {
    self.postMessage({
      id,
      success: false,
      appliedEffects: [],
      error: (err as Error).message || String(err),
    } satisfies WorkerOutput);
  }
};
