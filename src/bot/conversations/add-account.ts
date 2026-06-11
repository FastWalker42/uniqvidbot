import type { BotConversation, BotContext } from "../context";
import { Account } from "../../models/index";
import { parseAccountBatch } from "../../utils/account-parser";
import { accountListKeyboard } from "../../utils/keyboard";
import { e } from "../../utils/emoji";
import { InlineKeyboard } from "grammy";
import { iconId } from "../../utils/emoji";

/** Keyboard to return to account list after adding */
function accountsBackKeyboard(accounts: { _id: string; login: string }[]): InlineKeyboard {
  return accountListKeyboard(accounts);
}

/**
 * Conversation: Add one or more accounts.
 * Accepts either a text message or a .txt file with accounts.
 */
export async function addAccountConv(
  conversation: BotConversation,
  ctx: BotContext,
): Promise<void> {
  const msgCtx = await conversation.wait();

  const userId = msgCtx.from?.id;
  if (!userId) return;

  if (msgCtx.message?.text === "/cancel" || msgCtx.message?.text === "/start") {
    await msgCtx.reply(`${e("cross")} Отменено.`);
    return;
  }

  let validCount = 0;
  let invalidLines: string[] = [];

  // ── Case 1: Text file (.txt) ──
  if (msgCtx.message?.document) {
    const doc = msgCtx.message.document;
    if (!doc.file_name?.endsWith(".txt")) {
      await msgCtx.reply(
        `${e("cross")} Пожалуйста, отправь файл в формате .txt или напиши данные текстом.`,
      );
      return;
    }

    const file = await msgCtx.getFile();
    const filePath = file.file_path;
    if (!filePath) {
      await msgCtx.reply(`${e("cross")} Не удалось получить файл.`);
      return;
    }
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${filePath}`;
    const response = await fetch(fileUrl);
    const text = await response.text();
    const { valid, invalid } = parseAccountBatch(text);
    invalidLines = invalid;

    for (const acc of valid) {
      await Account.findOneAndUpdate(
        { userId, login: acc.login },
        { userId, login: acc.login, password: acc.password, backupEmail: acc.backupEmail },
        { upsert: true, new: true },
      );
    }
    validCount = valid.length;
  }
  // ── Case 2: Text message ──
  else if (msgCtx.message?.text) {
    const text = msgCtx.message.text;
    const { valid, invalid } = parseAccountBatch(text);
    invalidLines = invalid;

    for (const acc of valid) {
      await Account.findOneAndUpdate(
        { userId, login: acc.login },
        { userId, login: acc.login, password: acc.password, backupEmail: acc.backupEmail },
        { upsert: true, new: true },
      );
    }
    validCount = valid.length;
  } else {
    await msgCtx.reply(
      `${e("cross")} Не понял. Отправь данные аккаунта текстом или файл .txt.`,
    );
    return;
  }

  // ── Result — return to account list ──
  const accounts = await Account.find({ userId, active: true }).lean();

  let msg = `${e("plus")} <b>Аккаунты добавлены</b>\n\n${e("check")} Добавлено: ${validCount}`;
  if (invalidLines.length > 0) {
    msg += `\n\n${e("cross")} Ошибки в строках:\n<code>${invalidLines.slice(0, 5).join("\n")}</code>`;
    if (invalidLines.length > 5) msg += `\n...и ещё ${invalidLines.length - 5}`;
  }
  await msgCtx.reply(msg, {
    reply_markup: accountsBackKeyboard(accounts.map((a) => ({ _id: String(a._id), login: a.login }))),
  });
}
