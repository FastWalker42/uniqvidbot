import type { BotConversation, BotContext } from "../context";
import { Account } from "../../models/index";
import { mainMenuKeyboard, channelSettingsKeyboard } from "../../utils/keyboard";
import { e } from "../../utils/emoji";

/**
 * Conversation: Set channel avatar.
 * User sends an image, bot stores the file_id.
 */
export async function channelAvatarConv(
  conversation: BotConversation,
  ctx: BotContext,
): Promise<void> {
  const callbackData = ctx.callbackQuery?.data as string | undefined;
  const accountId = callbackData?.split(":")[2] || "";

  const msgCtx = await conversation.wait();
  const userId = msgCtx.from?.id;
  if (!userId) return;

  // Handle callback queries (e.g. "Назад" button) — exit conversation gracefully
  if (msgCtx.callbackQuery) {
    await msgCtx.answerCallbackQuery();
    return;
  }

  if (msgCtx.message?.text === "/cancel" || msgCtx.message?.text === "/start") {
    await msgCtx.reply(`${e("cross")} Отменено.`, { reply_markup: mainMenuKeyboard() });
    return;
  }

  const photo = msgCtx.message?.photo;
  if (!photo) {
    await msgCtx.reply(`${e("cross")} Отправь картинку для аватарки.`, { reply_markup: mainMenuKeyboard() });
    return;
  }

  const fileId = photo[photo.length - 1].file_id;

  if (accountId) {
    await Account.findByIdAndUpdate(accountId, { channelAvatarFileId: fileId });
    await msgCtx.reply(
      `${e("check")} Аватарка сохранена!\n\n` +
      `<blockquote>${e("image")} Будет установлена при следующей загрузке через браузерную автоматизацию.</blockquote>`,
      { reply_markup: channelSettingsKeyboard(accountId) },
    );
  } else {
    await msgCtx.reply(`${e("cross")} Аккаунт не выбран.`, { reply_markup: mainMenuKeyboard() });
  }
}

/**
 * Conversation: Set channel description.
 */
export async function channelDescriptionConv(
  conversation: BotConversation,
  ctx: BotContext,
): Promise<void> {
  const callbackData = ctx.callbackQuery?.data as string | undefined;
  const accountId = callbackData?.split(":")[2] || "";

  const msgCtx = await conversation.wait();
  const userId = msgCtx.from?.id;
  if (!userId) return;

  // Handle callback queries (e.g. "Назад" button) — exit conversation gracefully
  if (msgCtx.callbackQuery) {
    await msgCtx.answerCallbackQuery();
    return;
  }

  if (msgCtx.message?.text === "/cancel" || msgCtx.message?.text === "/start") {
    await msgCtx.reply(`${e("cross")} Отменено.`, { reply_markup: mainMenuKeyboard() });
    return;
  }

  const text = msgCtx.message?.text;
  if (!text) {
    await msgCtx.reply(`${e("cross")} Отправь текст для описания.`, { reply_markup: mainMenuKeyboard() });
    return;
  }

  if (accountId) {
    await Account.findByIdAndUpdate(accountId, { channelDescription: text });
    await msgCtx.reply(
      `${e("check")} Описание сохранено!\n\n` +
      `<blockquote>${e("pencil")} Будет применено при настройке канала на YouTube.</blockquote>`,
      { reply_markup: channelSettingsKeyboard(accountId) },
    );
  } else {
    await msgCtx.reply(`${e("cross")} Аккаунт не выбран.`, { reply_markup: mainMenuKeyboard() });
  }
}

/**
 * Conversation: Set channel tags.
 */
export async function channelTagsConv(
  conversation: BotConversation,
  ctx: BotContext,
): Promise<void> {
  const callbackData = ctx.callbackQuery?.data as string | undefined;
  const accountId = callbackData?.split(":")[2] || "";

  const msgCtx = await conversation.wait();
  const userId = msgCtx.from?.id;
  if (!userId) return;

  // Handle callback queries (e.g. "Назад" button) — exit conversation gracefully
  if (msgCtx.callbackQuery) {
    await msgCtx.answerCallbackQuery();
    return;
  }

  if (msgCtx.message?.text === "/cancel" || msgCtx.message?.text === "/start") {
    await msgCtx.reply(`${e("cross")} Отменено.`, { reply_markup: mainMenuKeyboard() });
    return;
  }

  const text = msgCtx.message?.text;
  if (!text) {
    await msgCtx.reply(`${e("cross")} Отправь теги через запятую.`, { reply_markup: mainMenuKeyboard() });
    return;
  }

  const tags = text.split(",").map((t) => t.trim()).filter(Boolean);

  if (accountId) {
    await Account.findByIdAndUpdate(accountId, { channelTags: tags });
    await msgCtx.reply(
      `${e("check")} Теги сохранены: ${tags.join(", ")}\n\n` +
      `<blockquote>${e("label")} Будут применены в настройках канала на YouTube.</blockquote>`,
      { reply_markup: channelSettingsKeyboard(accountId) },
    );
  } else {
    await msgCtx.reply(`${e("cross")} Аккаунт не выбран.`, { reply_markup: mainMenuKeyboard() });
  }
}
