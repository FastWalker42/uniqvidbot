if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN environment variable is required");
}

export const config = {
  botToken: process.env.BOT_TOKEN,
  mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27017/uniqvidbot",
  adminIds: (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter(Boolean),
  downloadDir: process.env.DOWNLOAD_DIR ?? "./downloads",
  ffmpegPath: process.env.FFMPEG_PATH ?? undefined,
  ffprobePath: process.env.FFPROBE_PATH ?? undefined,
};
