import { type Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../context";
import { Account, Proxy, VideoTask, User } from "../../models/index";
import {
  mainMenuKeyboard, backKeyboard, accountListKeyboard,
  channelSettingsKeyboard, proxyListKeyboard,
} from "../../utils/keyboard";
import { e, iconId } from "../../utils/emoji";
import { showMainMenu, showAccountList, showProxyList, showTaskStatus } from "../helpers/show-views";
import { showToggleKeyboard } from "../conversations/uniquify";
import { type UniqOptions } from "../../services/video-processor";
import { processAndSendResults } from "../helpers/process-results";
import { safeDelete } from "../../utils/file-utils";

/**
 * Register all inline menu callback handlers.
 * These handle button presses from the main menu and sub-menus.
 */
export function registerMenuHandler(bot: Composer<BotContext>) {
  // ── Back to main menu ──
  bot.callbackQuery("menu:back", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showMainMenu(ctx);
  });

  // ── My Accounts (list + add button) ──
  bot.callbackQuery("menu:my_accounts", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showAccountList(ctx);
  });

  // ── Add Account (from inside account list) ──
  bot.callbackQuery("menu:add_account", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `${e("plus")} <b>Добавить аккаунт</b>\n\n` +
      `Отправь данные Google-аккаунта в формате:\n` +
      `<code>Логин:Пароль:Резервная_почта</code>\n\n` +
      `Или отправь текстовый файл (.txt) с аккаунтами (один на строку).\n\n` +
      `<blockquote>${e("key")} Данные хранятся только для тебя. Другие пользователи их не видят.</blockquote>\n\n` +
      `Для этого просто напиши сообщение в чат.`,
      { reply_markup: new InlineKeyboard().text("Назад", "menu:my_accounts").icon(iconId("back")) },
    );
    await ctx.conversation.enter("addAccountConv");
  });

  // ── My Proxies (list + add button) ──
  bot.callbackQuery("menu:my_proxies", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showProxyList(ctx);
  });

  // ── Add Proxy (from inside proxy list) ──
  bot.callbackQuery("menu:add_proxy", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `${e("globe")} <b>Добавить прокси</b>\n\n` +
      `Отправь прокси в одном из форматов:\n` +
      `• <code>IP:PORT:USER:PASS</code>\n` +
      `• <code>USER:PASS@IP:PORT</code>\n` +
      `• <code>IP:PORT</code> (без авторизации)\n\n` +
      `Можно отправить несколько — по одному на строку.\n\n` +
      `<blockquote>${e("lock")} Прокси автоматически привязывается к загружаемому аккаунту.</blockquote>\n\n` +
      `Напиши сообщение в чат.`,
      { reply_markup: new InlineKeyboard().text("Назад", "menu:my_proxies").icon(iconId("back")) },
    );
    await ctx.conversation.enter("addProxyConv");
  });

  // ── Channel Settings ──
  bot.callbackQuery("menu:channel_settings", async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from!.id;
    const accounts = await Account.find({ userId, active: true }).lean();

    if (accounts.length === 0) {
      await ctx.editMessageText(
        `${e("settings")} <b>Настройка канала</b>\n\n` +
        `У тебя пока нет аккаунтов. Сначала добавь аккаунт в разделе «Мои аккаунты».`,
        { reply_markup: backKeyboard() },
      );
      return;
    }

    await ctx.editMessageText(
      `${e("settings")} <b>Настройка канала</b>\n\nВыбери аккаунт для настройки:`,
      { reply_markup: accountListKeyboard(accounts.map((a) => ({ _id: String(a._id), login: a.login }))) },
    );
  });

  // ── Account selected for channel settings ──
  bot.callbackQuery(/^account:select:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const accountId = ctx.callbackQuery.data!.split(":")[2];
    const account = await Account.findById(accountId).lean();
    if (!account) {
      await ctx.answerCallbackQuery("Аккаунт не найден");
      return;
    }
    await ctx.editMessageText(
      `${e("settings")} <b>Настройка канала: ${account.login}</b>\n\nЧто хочешь настроить?`,
      { reply_markup: channelSettingsKeyboard(accountId) },
    );
  });

  // ── Channel avatar ──
  bot.callbackQuery(/^chset:avatar:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `${e("image")} <b>Аватарка</b>\n\nОтправь картинку для аватарки канала прямо в чат.\n\n` +
      `<blockquote>Картинка будет установлена как аватар YouTube-канала через браузерную автоматизацию.</blockquote>`,
      { reply_markup: backKeyboard() },
    );
    await ctx.conversation.enter("channelAvatarConv");
  });

  // ── Channel description ──
  bot.callbackQuery(/^chset:description:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `${e("pencil")} <b>Описание канала</b>\n\nОтправь текст для описания канала (раздел «О канале»).\n\n` +
      `<blockquote>Текст будет скопирован в раздел «О канале» на YouTube.</blockquote>`,
      { reply_markup: backKeyboard() },
    );
    await ctx.conversation.enter("channelDescriptionConv");
  });

  // ── Channel tags ──
  bot.callbackQuery(/^chset:tags:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `${e("label")} <b>Теги канала</b>\n\nОтправь ключевые слова через запятую.\n` +
      `Пример: <code>гейминг, обзоры, стрим</code>\n\n` +
      `<blockquote>Теги будут применены в настройках канала на YouTube.</blockquote>`,
      { reply_markup: backKeyboard() },
    );
    await ctx.conversation.enter("channelTagsConv");
  });

  // ── Channel AI setup (stub) ──
  bot.callbackQuery(/^chset:ai_setup:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const accountId = ctx.callbackQuery.data!.split(":")[2];
    await ctx.editMessageText(
      `${e("robot")} <b>ИИ-настройка по примеру</b>\n\n` +
      `Эта функция пока в разработке. Она позволит автоматически настроить канал по примеру другого канала.\n\n` +
      `<blockquote>ИИ проанализирует канал-образец и сгенерирует описание, теги и стиль.</blockquote>`,
      { reply_markup: channelSettingsKeyboard(accountId) },
    );
  });

  // ── Upload Shorts (stub) ──
  bot.callbackQuery("menu:upload_shorts", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `${e("video")} <b>Загрузить Shorts</b>\n\n` +
      `Эта функция пока в разработке.\n` +
      `Она позволит загружать видео на YouTube через браузерную автоматизацию.\n\n` +
      `<blockquote>${e("art")} Пока ты можешь использовать кнопку «Уникализация» для обработки видео перед загрузкой.</blockquote>`,
      { reply_markup: backKeyboard() },
    );
  });

  // ── Uniquify ──
  bot.callbackQuery("menu:uniquify", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `${e("art")} <b>Уникализация видео</b>\n\n` +
      `Отправь видеофайл (MP4, до 60 секунд) в чат.\n` +
      `Бот создаст уникальные копии и отправит их тебе файлами.\n\n` +
      `<blockquote>${e("sparkles")} Доступные эффекты: смайлики, размытие, цветокоррекция, глитч, шум, отзеркаливание\n` +
      `Каждая копия — уникальна для анти-спам фильтров YouTube</blockquote>`,
      { reply_markup: backKeyboard() },
    );
    await ctx.conversation.enter("uniquifyConv");
  });

  // ── Uniquify: toggle effect ──
  // Format: uniq:toggle:<flag>:<taskId>:<count>
  bot.callbackQuery(/^uniq:toggle:/, async (ctx) => {
    const data = ctx.callbackQuery.data!;
    const parts = data.split(":");
    // parts: ["uniq", "toggle", flag, taskId, count]
    const flag = parts[2];
    const taskId = parts[3];
    const count = parseInt(parts[4], 10);

    const userId = ctx.from!.id;
    const user = await User.findOne({ telegramId: userId });
    if (!user) {
      await ctx.answerCallbackQuery("Ошибка: пользователь не найден");
      return;
    }

    // Toggle the flag in user settings
    const settings = user.uniqSettings as Record<string, boolean>;
    if (flag in settings) {
      (settings as any)[flag] = !(settings as any)[flag];
    }
    await user.save();

    await ctx.answerCallbackQuery();
    await showToggleKeyboard(ctx, taskId, count);
  });

  // ── Uniquify: start processing ──
  // Format: uniq:start:<taskId>:<count>
  bot.callbackQuery(/^uniq:start:/, async (ctx) => {
    const data = ctx.callbackQuery.data!;
    const parts = data.split(":");
    const taskId = parts[2];
    const count = parseInt(parts[3], 10);
    const userId = ctx.from!.id;

    await ctx.answerCallbackQuery();

    const task = await VideoTask.findOne({ _id: taskId, userId, status: "pending" });
    if (!task) {
      await ctx.editMessageText(`${e("cross")} Задача не найдена или уже запущена.`);
      return;
    }

    // Read latest settings from DB (user may have toggled)
    const user = await User.findOne({ telegramId: userId });
    const savedSettings = user?.uniqSettings;
    const options: UniqOptions = {
      emoji: savedSettings?.emoji ?? true,
      blur: savedSettings?.blur ?? true,
      colorCorrection: savedSettings?.colorCorrection ?? true,
      glitch: savedSettings?.glitch ?? true,
      noise: savedSettings?.noise ?? true,
      mirror: savedSettings?.mirror ?? false,
      metadataStrip: true,
    };

    // Update task with final options and set processing
    task.uniqOptions = options as any;
    task.status = "processing";
    await task.save();

    // Build label
    const labelParts: string[] = [];
    if (options.emoji) labelParts.push("Смайлики");
    if (options.blur) labelParts.push("Размытие краёв");
    if (options.colorCorrection) labelParts.push("Цветокоррекция");
    if (options.glitch) labelParts.push("Глитч");
    if (options.noise) labelParts.push("Шум");
    if (options.mirror) labelParts.push("Отзеркалить");
    const modeLabel = labelParts.length > 0 ? labelParts.join(", ") : "Нет эффектов";

    await ctx.editMessageText(
      `${e("clock")} Обработка 0/${count} копий...\n\n` +
      `<blockquote>${e("art")} Эффекты: ${modeLabel}</blockquote>`,
    );

    const processingMsgId = ctx.callbackQuery?.message?.message_id!;

    // Fire-and-forget background processing
    processAndSendResults(
      ctx.api,
      userId,
      task.originalPath,
      count,
      options,
      processingMsgId,
      task,
      modeLabel,
    ).catch((err) => {
      console.error("Background processing error:", err);
    });
  });

  // ── Uniquify: cancel ──
  // Format: uniq:cancel:<taskId>
  bot.callbackQuery(/^uniq:cancel:/, async (ctx) => {
    const data = ctx.callbackQuery.data!;
    const taskId = data.split(":")[2];
    const userId = ctx.from!.id;

    await ctx.answerCallbackQuery();

    const task = await VideoTask.findOne({ _id: taskId, userId, status: "pending" });
    if (task) {
      await safeDelete(task.originalPath);
      await task.deleteOne();
    }

    await ctx.editMessageText(`${e("cross")} Отменено.`);
  });

  // ── Task Status ──
  bot.callbackQuery("menu:task_status", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showTaskStatus(ctx);
  });

  bot.callbackQuery("tasks:refresh", async (ctx) => {
    await ctx.answerCallbackQuery("Обновлено");
    await showTaskStatus(ctx);
  });

  // ── Proxy selected ──
  bot.callbackQuery(/^proxy:select:/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const proxyId = ctx.callbackQuery.data!.split(":")[2];
    const proxy = await Proxy.findById(proxyId).lean();
    if (!proxy) {
      await ctx.answerCallbackQuery("Прокси не найден");
      return;
    }
    const status = proxy.verified ? `${e("check")} Проверен` : `${e("warning")} Не проверен`;
    await ctx.editMessageText(
      `${e("globe")} <b>Прокси: ${proxy.host}:${proxy.port}</b>\n\n` +
      `${e("person")} Пользователь: <code>${proxy.username || "—"}</code>\n` +
      `${e("eye")} Статус: ${status}\n` +
      `${e("clipboard")} Добавлен: ${proxy.createdAt?.toLocaleString("ru")}`,
      { reply_markup: new InlineKeyboard().text("Назад", "menu:my_proxies").icon(iconId("back")) },
    );
  });
}
