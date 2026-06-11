import type { BotConversation, BotContext } from "../context";
import { VideoTask, User } from "../../models/index";
import { ensureDownloadDir, uniqueFilename, safeDelete } from "../../utils/file-utils";
import { e, iconId } from "../../utils/emoji";
import { handleNavCallback } from "../helpers/show-views";
import { join } from "node:path";

/**
 * Conversation: Uniquify a video — Step 1: collect video + count.
 *
 * Flow:
 * 1. User sends a video file → download
 * 2. User sends copy count
 * 3. Bot creates VideoTask (pending), shows toggle keyboard, EXITS conversation
 * 4. Toggle / start / back are handled by explicit callback handlers (not conversation)
 */
export async function uniquifyConv(
  conversation: BotConversation,
  ctx: BotContext,
): Promise<void> {
  // ── Step 1: Wait for video ──
  const videoCtx = await conversation.wait();

  const userId = videoCtx.from?.id;
  if (!userId) return;

  // Handle navigation callbacks (e.g. "Назад") — navigate immediately
  if (videoCtx.callbackQuery) {
    await handleNavCallback(videoCtx);
    return;
  }

  if (videoCtx.message?.text === "/cancel" || videoCtx.message?.text === "/start") {
    await videoCtx.reply(`${e("cross")} Отменено.`, { reply_markup: { inline_keyboard: [] } });
    return;
  }

  const video = videoCtx.message?.video || videoCtx.message?.document;
  if (!video) {
    await videoCtx.reply(
      `${e("cross")} Отправь видеофайл (MP4).`,
    );
    return;
  }

  const isVideo = !!videoCtx.message?.video ||
    (videoCtx.message?.document?.mime_type?.startsWith("video/") ?? false);
  if (!isVideo) {
    await videoCtx.reply(
      `${e("cross")} Это не видеофайл. Отправь MP4.`,
    );
    return;
  }

  const caption = videoCtx.message?.caption || "";
  const tgFileId = video.file_id;

  // Download video
  const statusMsg = await videoCtx.reply(`${e("download")} Скачиваю видео...`);
  const downloadDir = await ensureDownloadDir("originals");
  const localName = uniqueFilename("video", "mp4");
  const localPath = join(downloadDir, localName);

  try {
    const file = await videoCtx.getFile();
    const filePath = file.file_path;
    if (!filePath) throw new Error("Failed to get file path");
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${filePath}`;
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
    const buffer = await response.arrayBuffer();
    await Bun.write(localPath, Buffer.from(buffer));
  } catch (err) {
    await safeDelete(localPath);
    await ctx.api.editMessageText(userId, statusMsg.message_id, `${e("cross")} Ошибка скачивания: ${(err as Error).message}`);
    return;
  }

  await ctx.api.editMessageText(userId, statusMsg.message_id, `${e("check")} Видео скачано.`);

  // ── Step 2: Ask how many copies ──
  await videoCtx.reply(
    `${e("control")} Сколько копий этого видео создать? (1–20)`,
  );
  const countCtx = await conversation.wait();

  // Handle navigation callbacks in copy count step
  if (countCtx.callbackQuery) {
    await safeDelete(localPath);
    await handleNavCallback(countCtx);
    return;
  }

  const countText = countCtx.message?.text?.trim();
  if (!countText) {
    await safeDelete(localPath);
    await countCtx.reply(`${e("cross")} Нужно указать число.`);
    return;
  }

  const count = parseInt(countText, 10);
  if (isNaN(count) || count < 1 || count > 20) {
    await safeDelete(localPath);
    await countCtx.reply(`${e("cross")} Число должно быть от 1 до 20.`);
    return;
  }

  // ── Step 3: Create pending task, show toggle keyboard, exit conversation ──
  const user = await User.findOne({ telegramId: userId });
  const savedSettings = user?.uniqSettings;

  const task = await VideoTask.create({
    userId,
    originalPath: localPath,
    title: caption || "Уникализация",
    uniqOptions: {
      emoji: savedSettings?.emoji ?? true,
      blur: savedSettings?.blur ?? true,
      colorCorrection: savedSettings?.colorCorrection ?? true,
      glitch: savedSettings?.glitch ?? true,
      noise: savedSettings?.noise ?? true,
      mirror: savedSettings?.mirror ?? false,
      metadataStrip: true,
    },
    status: "pending",
    tgFileId,
  });

  // Show toggle keyboard — callbacks will be handled by explicit handlers (not conversation)
  await showToggleKeyboard(countCtx, task._id.toString(), count);

  // Exit conversation — toggle/start/back handled by explicit callback handlers
}

/**
 * Show the toggle settings keyboard for a pending task.
 * Exported so explicit callback handlers can reuse it.
 */
export async function showToggleKeyboard(
  ctx: BotContext,
  taskId: string,
  count: number,
): Promise<void> {
  const userId = ctx.from!.id;
  const user = await User.findOne({ telegramId: userId });
  const savedSettings = user?.uniqSettings;
  const flags = {
    emoji: savedSettings?.emoji ?? true,
    blur: savedSettings?.blur ?? true,
    colorCorrection: savedSettings?.colorCorrection ?? true,
    glitch: savedSettings?.glitch ?? true,
    noise: savedSettings?.noise ?? true,
    mirror: savedSettings?.mirror ?? false,
  };

  const parts: string[] = [];
  if (flags.emoji) parts.push("Смайлики");
  if (flags.blur) parts.push("Размытие краёв");
  if (flags.colorCorrection) parts.push("Цветокоррекция");
  if (flags.glitch) parts.push("Глитч");
  if (flags.noise) parts.push("Шум");
  if (flags.mirror) parts.push("Отзеркалить");
  const currentLabel = parts.length > 0 ? parts.join(", ") : "Нет эффектов";

  const text =
    `${e("art")} <b>Настройки уникализации</b> (${count} копий)\n\n` +
    `Выбери какие эффекты применить. Каждый эффект будет применён со случайной силой для каждой копии.\n` +
    `Гарантируется минимум 2 ненулевых эффекта на копию. Смайлик — всегда если включён.\n\n` +
    `<blockquote>${e("sparkles")} Текущие: ${currentLabel}</blockquote>`;

  const { InlineKeyboard } = await import("grammy");
  const kb = new InlineKeyboard();

  kb.text(
    flags.emoji ? "Смайлики: ВКЛ" : "Смайлики: ВЫКЛ",
    `uniq:toggle:emoji:${taskId}:${count}`,
  ).icon(flags.emoji ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text(
    flags.blur ? "Размытие краёв: ВКЛ" : "Размытие краёв: ВЫКЛ",
    `uniq:toggle:blur:${taskId}:${count}`,
  ).icon(flags.blur ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text(
    flags.colorCorrection ? "Цветокоррекция: ВКЛ" : "Цветокоррекция: ВЫКЛ",
    `uniq:toggle:color:${taskId}:${count}`,
  ).icon(flags.colorCorrection ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text(
    flags.glitch ? "Глитч: ВКЛ" : "Глитч: ВЫКЛ",
    `uniq:toggle:glitch:${taskId}:${count}`,
  ).icon(flags.glitch ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text(
    flags.noise ? "Шум: ВКЛ" : "Шум: ВЫКЛ",
    `uniq:toggle:noise:${taskId}:${count}`,
  ).icon(flags.noise ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text(
    flags.mirror ? "Отзеркалить: ВКЛ" : "Отзеркалить: ВЫКЛ",
    `uniq:toggle:mirror:${taskId}:${count}`,
  ).icon(flags.mirror ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text("Начать обработку", `uniq:start:${taskId}:${count}`).icon(iconId("check")).row();
  kb.text("Отмена", `uniq:cancel:${taskId}`).icon(iconId("cross"));

  try {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { reply_markup: kb });
    } else {
      await ctx.reply(text, { reply_markup: kb });
    }
  } catch {
    // editMessage may fail if text identical — try reply as fallback
    try {
      await ctx.reply(text, { reply_markup: kb });
    } catch {
      // give up
    }
  }
}
