import { Bot, type Api, type RawApi } from "grammy";
import { conversations } from "@grammyjs/conversations";
import type { BotContext } from "./context";
import { config } from "../config";
import { registerConversations } from "./conversations/index";
import { registerStartHandler } from "./handlers/start";
import { registerMenuHandler } from "./handlers/menu";

const HTML_METHODS = new Set([
  "sendMessage", "editMessageText", "sendPhoto", "sendVideo",
  "sendAnimation", "sendDocument", "sendAudio", "sendVoice", "copyMessage",
]);

function applyHtmlParseMode(api: Api<RawApi>): void {
  api.config.use((prev, method, payload, signal) => {
    if (HTML_METHODS.has(method)) {
      const p = payload as Record<string, unknown>;
      if (!("parse_mode" in p)) p.parse_mode = "HTML";
    }
    return prev(method, payload as any, signal);
  });
}

export function createBot() {
  const bot = new Bot<BotContext>(config.botToken);
  applyHtmlParseMode(bot.api);

  bot.use(conversations({
    plugins: [async (ctx, next) => {
      applyHtmlParseMode(ctx.api);
      await next();
    }],
  }));

  registerConversations(bot);
  registerStartHandler(bot);
  registerMenuHandler(bot);

  // Handle all other callback queries that don't match
  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  return bot;
}
