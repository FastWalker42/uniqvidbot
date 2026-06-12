import mongoose from "mongoose";
import { connectDB } from "./db";
import { createBot } from "./bot/index";
import { ensureDownloadDir } from "./utils/file-utils";

async function main() {
  await connectDB();

  // Ensure download directories exist
  await ensureDownloadDir("originals");
  await ensureDownloadDir("processed");

  const bot = createBot();

  const PORT = Number(process.env.PORT) || 3000;

  Bun.serve({
    port: PORT,
    routes: {
      "/health": () => Response.json({ status: "ok", uptime: process.uptime() }),
    },
    fetch() {
      return Response.json({ error: "not found" }, { status: 404 });
    },
  });

  const shutdown = async (signal: string) => {
    console.log(`${signal} received, shutting down…`);
    await bot.stop();
    await mongoose.disconnect();
    console.log("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await bot.start({
    drop_pending_updates: true,
    onStart: () => console.log("UniqVid Bot started"),
  });
}

main().catch(console.error);
