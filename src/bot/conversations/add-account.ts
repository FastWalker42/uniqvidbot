import type { BotConversation, BotContext } from "../context";
import { Account } from "../../models/index";
import { parseAccountBatch } from "../../utils/account-parser";
import { mainMenuKeyboard } from "../../utils/keyboard";

/**
 * Conversation: Add one or more accounts.
 * Accepts either a text message or a .txt file with accounts.
 */
export async function addAccountConv(
  conversation: BotConversation,
  ctx: BotContext,
): Promise<void> {
  // Wait for user message (text or document)
  const msgCtx = await conversation.wait();

  const userId = msgCtx.from?.id;
  if (!userId) return;

  // Check for cancel
  if (msgCtx.message?.text === "/cancel" || msgCtx.message?.text === "/start") {
    await msgCtx.reply("❌ Отменено.", { reply_markup: mainMenuKeyboard() });
    return;
  }

  let validCount = 0;
  let invalidLines: string[] = [];

  // ── Case 1: Text file (.txt) ──
  if (msgCtx.message?.document) {
    const doc = msgCtx.message.document;
    if (!doc.file_name?.endsWith(".txt")) {
      await msgCtx.reply(
        "❌ Пожалуйста, отправь файл в формате .txt или напиши данные текстом.",
        { reply_markup: mainMenuKeyboard() },
      );
      return;
    }

    const file = await msgCtx.getFile();
    const filePath = file.file_path;
    if (!filePath) {
      await msgCtx.reply("❌ Не удалось получить файл.", { reply_markup: mainMenuKeyboard() });
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
      "❌ Не понял. Отправь данные аккаунта текстом или файл .txt.",
      { reply_markup: mainMenuKeyboard() },
    );
    return;
  }

  // ── Result ──
  let msg = `<b>➕ Аккаунты добавлены</b>\n\n✅ Добавлено: ${validCount}`;
  if (invalidLines.length > 0) {
    msg += `\n\n❌ Ошибки в строках:\n<code>${invalidLines.slice(0, 5).join("\n")}</code>`;
    if (invalidLines.length > 5) msg += `\n...и ещё ${invalidLines.length - 5}`;
  }
  await msgCtx.reply(msg, { reply_markup: mainMenuKeyboard() });
}
