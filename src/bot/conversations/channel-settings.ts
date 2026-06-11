import type { BotConversation, BotContext } from "../context";
import { Account } from "../../models/index";
import { mainMenuKeyboard, channelSettingsKeyboard } from "../../utils/keyboard";

/**
 * Conversation: Set channel avatar.
 * User sends an image, bot stores the file_id.
 *
 * The accountId is passed via the conversation args mechanism:
 * ctx.conversation.enter("channelAvatarConv", { args: accountId })
 * It's accessible from the initial ctx that triggered the conversation.
 */
export async function channelAvatarConv(
  conversation: BotConversation,
  ctx: BotContext,
): Promise<void> {
  // accountId was passed via conversation.enter({ args: accountId })
  // We read it from the initial context callback data
  const callbackData = ctx.callbackQuery?.data as string | undefined;
  const accountId = callbackData?.split(":")[2] || "";

  const msgCtx = await conversation.wait();
  const userId = msgCtx.from?.id;
  if (!userId) return;

  if (msgCtx.message?.text === "/cancel" || msgCtx.message?.text === "/start") {
    await msgCtx.reply("❌ Отменено.", { reply_markup: mainMenuKeyboard() });
    return;
  }

  // Accept photo
  const photo = msgCtx.message?.photo;
  if (!photo) {
    await msgCtx.reply("❌ Отправь картинку для аватарки.", { reply_markup: mainMenuKeyboard() });
    return;
  }

  const fileId = photo[photo.length - 1].file_id; // highest resolution

  if (accountId) {
    await Account.findByIdAndUpdate(accountId, { channelAvatarFileId: fileId });
    await msgCtx.reply("✅ Аватарка сохранена!", { reply_markup: channelSettingsKeyboard(accountId) });
  } else {
    await msgCtx.reply("❌ Аккаунт не выбран.", { reply_markup: mainMenuKeyboard() });
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

  if (msgCtx.message?.text === "/cancel" || msgCtx.message?.text === "/start") {
    await msgCtx.reply("❌ Отменено.", { reply_markup: mainMenuKeyboard() });
    return;
  }

  const text = msgCtx.message?.text;
  if (!text) {
    await msgCtx.reply("❌ Отправь текст для описания.", { reply_markup: mainMenuKeyboard() });
    return;
  }

  if (accountId) {
    await Account.findByIdAndUpdate(accountId, { channelDescription: text });
    await msgCtx.reply("✅ Описание сохранено!", { reply_markup: channelSettingsKeyboard(accountId) });
  } else {
    await msgCtx.reply("❌ Аккаунт не выбран.", { reply_markup: mainMenuKeyboard() });
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

  if (msgCtx.message?.text === "/cancel" || msgCtx.message?.text === "/start") {
    await msgCtx.reply("❌ Отменено.", { reply_markup: mainMenuKeyboard() });
    return;
  }

  const text = msgCtx.message?.text;
  if (!text) {
    await msgCtx.reply("❌ Отправь теги через запятую.", { reply_markup: mainMenuKeyboard() });
    return;
  }

  const tags = text.split(",").map((t) => t.trim()).filter(Boolean);

  if (accountId) {
    await Account.findByIdAndUpdate(accountId, { channelTags: tags });
    await msgCtx.reply(`✅ Теги сохранены: ${tags.join(", ")}`, { reply_markup: channelSettingsKeyboard(accountId) });
  } else {
    await msgCtx.reply("❌ Аккаунт не выбран.", { reply_markup: mainMenuKeyboard() });
  }
}
