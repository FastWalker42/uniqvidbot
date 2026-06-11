import type { BotContext } from "../context";
import { Account, Proxy, VideoTask } from "../../models/index";
import {
  mainMenuKeyboard, accountListKeyboard, proxyListKeyboard,
  taskStatusKeyboard,
} from "../../utils/keyboard";
import { e } from "../../utils/emoji";

/** Show main menu by editing the current message */
export async function showMainMenu(ctx: BotContext) {
  await ctx.editMessageText(
    `${e("logo")} <b>UniqVid Bot</b>\n\nВыбери действие:`,
    { reply_markup: mainMenuKeyboard() },
  );
}

/** Show account list by editing the current message */
export async function showAccountList(ctx: BotContext) {
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

/** Show proxy list by editing the current message */
export async function showProxyList(ctx: BotContext) {
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

/** Show task status by editing the current message */
export async function showTaskStatus(ctx: BotContext) {
  const userId = ctx.from!.id;
  const tasks = await VideoTask.find({ userId })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  if (tasks.length === 0) {
    await ctx.editMessageText(
      `${e("stats")} <b>Статус задач</b>\n\nУ тебя пока нет задач.`,
      { reply_markup: taskStatusKeyboard() },
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

/**
 * Handle a navigation callback query inside a conversation.
 * Answers the callback and navigates to the appropriate view.
 * Returns true if the callback was handled as navigation.
 */
export async function handleNavCallback(ctx: BotContext): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data?.startsWith("menu:")) return false;

  await ctx.answerCallbackQuery();

  switch (data) {
    case "menu:my_accounts":
      await showAccountList(ctx);
      break;
    case "menu:my_proxies":
      await showProxyList(ctx);
      break;
    case "menu:task_status":
      await showTaskStatus(ctx);
      break;
    default:
      // menu:back and any unknown — go to main menu
      await showMainMenu(ctx);
      break;
  }
  return true;
}
