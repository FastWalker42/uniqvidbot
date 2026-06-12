import { type Composer } from "grammy";
import type { BotContext } from "../context";
import { User } from "../../models/index";
import { mainMenuKeyboard } from "../../utils/keyboard";
import { e } from "../../utils/emoji";

export function registerStartHandler(bot: Composer<BotContext>) {
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const from = ctx.from!;
    let user = await User.findOne({ telegramId: userId });

    if (!user) {
      user = await User.create({
        telegramId: userId,
        username: from.username ?? "",
        firstName: from.first_name ?? "",
        lastName: from.last_name ?? "",
        isPremium: from.is_premium ?? false,
      });
    } else {
      user.username = from.username ?? "";
      user.firstName = from.first_name ?? "";
      user.lastName = from.last_name ?? "";
      user.isPremium = from.is_premium ?? false;
      await user.save();
    }

    await ctx.reply(
      `${e("logo")} <b>UniqVid Bot</b>\n\n` +
      `Привет, ${from.first_name}!\n` +
      `Я помогу тебе загружать уникальные Shorts на YouTube.\n\n` +
      `<blockquote>${e("sparkles")} Уникализация видео через FFmpeg ${e("sparkles")}\n` +
      `${e("globe")} Прокси для каждого аккаунта\n` +
      `${e("control")} Настройка каналов</blockquote>\n\n` +
      `Выбери действие:`,
      { reply_markup: mainMenuKeyboard() },
    );
  });
}
