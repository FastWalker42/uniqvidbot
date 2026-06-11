import { type Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../context";
import { Account, Proxy, VideoTask } from "../../models/index";
import {
  mainMenuKeyboard, backKeyboard, accountListKeyboard,
  channelSettingsKeyboard, taskStatusKeyboard, proxyListKeyboard,
} from "../../utils/keyboard";
import { e, pe, iconId } from "../../utils/emoji";

/**
 * Register all inline menu callback handlers.
 * These handle button presses from the main menu and sub-menus.
 */
export function registerMenuHandler(bot: Composer<BotContext>) {
  // ── Back to main menu ──
  bot.callbackQuery("menu:back", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `${e("video")} <b>UniqVid Bot</b>\n\nВыбери действие:`,
      { reply_markup: mainMenuKeyboard() },
    );
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
      `<blockquote>${e("sparkles")} Доступные эффекты: смайлики, размытие, цветокоррекция, микро-скорость, обрезка метаданных\n` +
      `${e("zap")} Каждая копия — уникальна для анти-спам фильтров YouTube</blockquote>`,
      { reply_markup: backKeyboard() },
    );
    await ctx.conversation.enter("uniquifyConv");
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

/** Helper: show account list with add button */
async function showAccountList(ctx: BotContext) {
  const userId = ctx.from!.id;
  const accounts = await Account.find({ userId, active: true }).lean();

  if (accounts.length === 0) {
    await ctx.editMessageText(
      `${e("person")} <b>Мои аккаунты</b>\n\nСписок пуст. Добавь первый аккаунт!`,
      { reply_markup: accountListKeyboard([]) },
    );
    return;
  }

  const lines = accounts.map((a) => {
    const proxy = a.proxyId ? e("globe") : e("cross");
    return `${proxy} <b>${a.login}</b>${a.backupEmail ? ` (${a.backupEmail})` : ""}`;
  });

  await ctx.editMessageText(
    `${e("person")} <b>Мои аккаунты</b>\n\n${lines.join("\n")}\n\n` +
    `<blockquote>${e("globe")} = прокси привязан, ${e("cross")} = без прокси</blockquote>`,
    { reply_markup: accountListKeyboard(accounts.map((a) => ({ _id: String(a._id), login: a.login }))) },
  );
}

/** Helper: show proxy list with add button */
async function showProxyList(ctx: BotContext) {
  const userId = ctx.from!.id;
  const proxies = await Proxy.find({ userId, active: true }).lean();

  if (proxies.length === 0) {
    await ctx.editMessageText(
      `${e("globe")} <b>Мои прокси</b>\n\nСписок пуст. Добавь первый прокси!`,
      { reply_markup: proxyListKeyboard([]) },
    );
    return;
  }

  const lines = proxies.map((p) => {
    const status = p.verified ? e("check") : e("warning");
    return `${status} <code>${p.host}:${p.port}</code>${p.username ? ` (${p.username})` : ""}`;
  });

  await ctx.editMessageText(
    `${e("globe")} <b>Мои прокси</b>\n\n${lines.join("\n")}\n\n` +
    `<blockquote>${e("check")} = проверен, ${e("warning")} = не проверен</blockquote>`,
    { reply_markup: proxyListKeyboard(proxies.map((p) => ({ _id: String(p._id), host: p.host, port: p.port }))) },
  );
}

/** Helper: show task status for the current user */
async function showTaskStatus(ctx: BotContext) {
  const userId = ctx.from!.id;
  const tasks = await VideoTask.find({ userId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  if (tasks.length === 0) {
    await ctx.editMessageText(
      `${e("stats")} <b>Статус задач</b>\n\nУ тебя пока нет задач.`,
      { reply_markup: backKeyboard() },
    );
    return;
  }

  const statusLabel: Record<string, string> = {
    pending: "В очереди",
    processing: "В обработке",
    done: "Выполнена",
    failed: "Ошибка",
  };

  const lines = tasks.map((t) => {
    const icon = t.status === "done" ? e("check") : t.status === "failed" ? e("cross") : t.status === "processing" ? e("refresh") : e("download");
    const title = t.title || t.originalPath.split("/").pop() || "Видео";
    const date = t.updatedAt
      ? new Date(t.updatedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "—";
    return `<blockquote>${icon} <b>${title}</b>\n${e("clipboard")} ${statusLabel[t.status] ?? t.status}  •  ${date}</blockquote>`;
  });

  await ctx.editMessageText(
    `${e("stats")} <b>Статус задач</b>\n\n${lines.join("\n")}`,
    { reply_markup: taskStatusKeyboard() },
  );
}
