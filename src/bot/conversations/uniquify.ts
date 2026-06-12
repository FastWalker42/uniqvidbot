import type { BotConversation, BotContext } from "../context";
import { VideoTask, User } from "../../models/index";
import { ensureDownloadDir, uniqueFilename, safeDelete } from "../../utils/file-utils";
import { e, iconId } from "../../utils/emoji";
import { handleNavCallback } from "../helpers/show-views";
import { processAndSendResults } from "../helpers/process-results";
import { type UniqOptions } from "../../services/video-processor";
import { InlineKeyboard } from "grammy";
import { join } from "node:path";

/** Uniquification toggle flags */
interface UniqFlags {
  emoji: boolean;
  blur: boolean;
  colorCorrection: boolean;
  glitch: boolean;
  noise: boolean;
  mirror: boolean;
}

/**
 * Conversation: Uniquify a video — full flow.
 *
 * 1. User sends a video file → download
 * 2. User sends copy count
 * 3. Bot creates VideoTask (pending), shows toggle keyboard
 * 4. Loop: toggle / start / cancel / back handled INSIDE conversation
 * 5. On "start" → fire-and-forget background processing, exit conversation
 *
 * ALL callbacks are handled via conversation.wait() to avoid the
 * @grammyjs/conversations middleware intercepting callbacks that should
 * go to explicit handlers.
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
    await videoCtx.reply(`${e("cross")} Отправь видеофайл (MP4).`);
    return;
  }

  const isVideo = !!videoCtx.message?.video ||
    (videoCtx.message?.document?.mime_type?.startsWith("video/") ?? false);
  if (!isVideo) {
    await videoCtx.reply(`${e("cross")} Это не видеофайл. Отправь MP4.`);
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
  await videoCtx.reply(`${e("control")} Сколько копий этого видео создать? (1–20)`);
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

  // ── Step 3: Create pending task, show toggle keyboard ──
  const user = await User.findOne({ telegramId: userId });
  const savedSettings = user?.uniqSettings;

  const flags: UniqFlags = {
    emoji: savedSettings?.emoji ?? true,
    blur: savedSettings?.blur ?? true,
    colorCorrection: savedSettings?.colorCorrection ?? true,
    glitch: savedSettings?.glitch ?? true,
    noise: savedSettings?.noise ?? true,
    mirror: savedSettings?.mirror ?? false,
  };

  const task = await VideoTask.create({
    userId,
    originalPath: localPath,
    title: caption || "Уникализация",
    uniqOptions: {
      emoji: flags.emoji,
      blur: flags.blur,
      colorCorrection: flags.colorCorrection,
      glitch: flags.glitch,
      noise: flags.noise,
      mirror: flags.mirror,
      metadataStrip: true,
    },
    status: "pending",
    tgFileId,
  });

  const taskId = task._id.toString();

  // Show toggle keyboard
  await showToggleKeyboard(countCtx, flags, count);

  // ── Step 4: Loop — handle toggle / start / cancel / back ──
  let startProcessing = false;

  while (!startProcessing) {
    const toggleCtx = await conversation.wait();
    const callbackData = toggleCtx.callbackQuery?.data;

    // Not a callback — ignore text messages, etc.
    if (!callbackData) {
      // If user types /start or /cancel, exit
      if (toggleCtx.message?.text === "/start" || toggleCtx.message?.text === "/cancel") {
        await safeDelete(localPath);
        await task.deleteOne();
        await toggleCtx.reply(`${e("cross")} Отменено.`);
        return;
      }
      continue;
    }

    // Handle navigation (Назад, etc.)
    if (callbackData.startsWith("menu:")) {
      await toggleCtx.answerCallbackQuery();
      await safeDelete(localPath);
      await task.deleteOne();
      await handleNavCallback(toggleCtx);
      return;
    }

    // Handle toggle: uniq:toggle:<flag>
    if (callbackData.startsWith("uniq:toggle:")) {
      const flag = callbackData.split(":")[2];
      await toggleCtx.answerCallbackQuery();

      // Map callback flag name to UniqFlags key
      const flagMap: Record<string, keyof UniqFlags> = {
        emoji: "emoji",
        blur: "blur",
        color: "colorCorrection",
        glitch: "glitch",
        noise: "noise",
        mirror: "mirror",
      };

      const flagKey = flagMap[flag];
      if (flagKey) {
        // Toggle in local state
        flags[flagKey] = !flags[flagKey];

        // Persist to user settings
        const u = await User.findOne({ telegramId: userId });
        if (u) {
          (u.uniqSettings as any)[flagKey] = flags[flagKey];
          await u.save();
        }
      }

      // Re-show keyboard with updated flags
      await showToggleKeyboard(toggleCtx, flags, count);
      continue;
    }

    // Handle start: uniq:start
    if (callbackData === "uniq:start") {
      startProcessing = true;
      await toggleCtx.answerCallbackQuery();

      // Build options from current flags
      const options: UniqOptions = {
        emoji: flags.emoji,
        blur: flags.blur,
        colorCorrection: flags.colorCorrection,
        glitch: flags.glitch,
        noise: flags.noise,
        mirror: flags.mirror,
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

      await toggleCtx.editMessageText(
        `${e("clock")} Обработка 0/${count} копий...\n\n` +
        `<blockquote>${e("art")} Эффекты: ${modeLabel}</blockquote>`,
      );

      const processingMsgId = toggleCtx.callbackQuery?.message?.message_id!;

      // Fire-and-forget background processing
      processAndSendResults(
        toggleCtx.api,
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

      // Exit conversation — background processing will continue
      return;
    }

    // Handle cancel: uniq:cancel
    if (callbackData === "uniq:cancel") {
      await toggleCtx.answerCallbackQuery();
      await safeDelete(localPath);
      await task.deleteOne();
      await toggleCtx.editMessageText(`${e("cross")} Отменено.`);
      return;
    }

    // Unknown callback — just answer it
    await toggleCtx.answerCallbackQuery();
  }
}

/**
 * Show the toggle settings keyboard.
 * Uses simple callback data (uniq:toggle:emoji, uniq:start, uniq:cancel)
 * because the conversation has taskId and count in scope.
 */
async function showToggleKeyboard(
  ctx: BotContext,
  flags: UniqFlags,
  count: number,
): Promise<void> {
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

  const kb = new InlineKeyboard();

  kb.text(
    flags.emoji ? "Смайлики: ВКЛ" : "Смайлики: ВЫКЛ",
    "uniq:toggle:emoji",
  ).icon(flags.emoji ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text(
    flags.blur ? "Размытие краёв: ВКЛ" : "Размытие краёв: ВЫКЛ",
    "uniq:toggle:blur",
  ).icon(flags.blur ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text(
    flags.colorCorrection ? "Цветокоррекция: ВКЛ" : "Цветокоррекция: ВЫКЛ",
    "uniq:toggle:color",
  ).icon(flags.colorCorrection ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text(
    flags.glitch ? "Глитч: ВКЛ" : "Глитч: ВЫКЛ",
    "uniq:toggle:glitch",
  ).icon(flags.glitch ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text(
    flags.noise ? "Шум: ВКЛ" : "Шум: ВЫКЛ",
    "uniq:toggle:noise",
  ).icon(flags.noise ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text(
    flags.mirror ? "Отзеркалить: ВКЛ" : "Отзеркалить: ВЫКЛ",
    "uniq:toggle:mirror",
  ).icon(flags.mirror ? iconId("toggleOn") : iconId("toggleOff")).row();

  kb.text("Начать обработку", "uniq:start").icon(iconId("check")).row();
  kb.text("Отмена", "uniq:cancel").icon(iconId("cross"));

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
