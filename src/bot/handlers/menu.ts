import { type Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../context";
import { Account, Proxy } from "../../models/index";
import {
  mainMenuKeyboard, backKeyboard, accountListKeyboard,
  channelSettingsKeyboard, proxyListKeyboard,
} from "../../utils/keyboard";
import { e, iconId } from "../../utils/emoji";
import { showMainMenu, showAccountList, showProxyList, showTaskStatus } from "../helpers/show-views";

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
