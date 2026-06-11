import type { BotConversation, BotContext } from "../context";
import { VideoTask, User } from "../../models/index";
import { uniquifyVideoBatch, type UniqOptions } from "../../services/video-processor";
import { ensureDownloadDir, uniqueFilename, safeDelete } from "../../utils/file-utils";
import { mainMenuKeyboard, uniqToggleKeyboard, type UniqFlags } from "../../utils/keyboard";
import { e } from "../../utils/emoji";
import { handleNavCallback } from "../helpers/show-views";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { InputFile } from "grammy";

/**
 * Build a human-readable description of the enabled flags.
 */
function flagsDescription(flags: UniqFlags): string {
  const parts: string[] = [];
  if (flags.emoji) parts.push("Смайлики");
  if (flags.blur) parts.push("Размытие краёв");
  if (flags.colorCorrection) parts.push("Цветокоррекция");
  if (flags.glitch) parts.push("Глитч");
  if (flags.noise) parts.push("Шум");
  return parts.length > 0 ? parts.join(", ") : "Нет эффектов";
}

/**
 * Conversation: Uniquify a video — send back uniquified copies as files.
 *
 * Flow:
 * 1. User sends a video file
 * 2. Bot asks how many copies
 * 3. Bot shows toggle keyboard for effects (loaded from DB, user can toggle)
 * 4. User presses "Начать обработку"
 * 5. Bot saves settings to DB, processes and sends files back
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
    await videoCtx.reply(`${e("cross")} Отменено.`, { reply_markup: mainMenuKeyboard() });
    return;
  }

  const video = videoCtx.message?.video || videoCtx.message?.document;
  if (!video) {
    await videoCtx.reply(
      `${e("cross")} Отправь видеофайл (MP4).`,
      { reply_markup: mainMenuKeyboard() },
    );
    return;
  }

  const isVideo = !!videoCtx.message?.video ||
    (videoCtx.message?.document?.mime_type?.startsWith("video/") ?? false);
  if (!isVideo) {
    await videoCtx.reply(
      `${e("cross")} Это не видеофайл. Отправь MP4.`,
      { reply_markup: mainMenuKeyboard() },
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
    await countCtx.reply(`${e("cross")} Нужно указать число.`, { reply_markup: mainMenuKeyboard() });
    return;
  }

  const count = parseInt(countText, 10);
  if (isNaN(count) || count < 1 || count > 20) {
    await safeDelete(localPath);
    await countCtx.reply(`${e("cross")} Число должно быть от 1 до 20.`, { reply_markup: mainMenuKeyboard() });
    return;
  }

  // ── Step 3: Toggle effects — load saved settings from DB ──
  const user = await User.findOne({ telegramId: userId });
  const savedSettings = user?.uniqSettings;
  const flags: UniqFlags = {
    emoji: savedSettings?.emoji ?? true,
    blur: savedSettings?.blur ?? true,
    colorCorrection: savedSettings?.colorCorrection ?? true,
    glitch: savedSettings?.glitch ?? true,
    noise: savedSettings?.noise ?? true,
  };

  await countCtx.reply(
    `${e("art")} <b>Настройки уникализации</b>\n\n` +
    `Выбери какие эффекты применить. Каждый эффект будет применён со случайной силой (0–10%) для каждой копии.\n` +
    `Гарантируется минимум 2 ненулевых эффекта на копию. Смайлик — всегда если включён.\n\n` +
    `<blockquote>${e("sparkles")} Текущие: ${flagsDescription(flags)}</blockquote>`,
    { reply_markup: uniqToggleKeyboard(flags) },
  );

  // Toggle loop — user can toggle flags until pressing "Начать" or "Назад"
  let startProcessing = false;
  while (!startProcessing) {
    const toggleCtx = await conversation.wait();

    const callbackData = toggleCtx.callbackQuery?.data;

    // Handle navigation (Назад)
    if (!callbackData || callbackData === "menu:back") {
      await safeDelete(localPath);
      if (callbackData) await handleNavCallback(toggleCtx);
      return;
    }

    // Handle toggle switches
    if (callbackData.startsWith("uniq:toggle:")) {
      const flag = callbackData.split(":")[2];
      if (flag === "emoji") flags.emoji = !flags.emoji;
      else if (flag === "blur") flags.blur = !flags.blur;
      else if (flag === "color") flags.colorCorrection = !flags.colorCorrection;
      else if (flag === "glitch") flags.glitch = !flags.glitch;
      else if (flag === "noise") flags.noise = !flags.noise;

      await toggleCtx.answerCallbackQuery();

      await toggleCtx.editMessageText(
        `${e("art")} <b>Настройки уникализации</b>\n\n` +
        `Выбери какие эффекты применить. Каждый эффект будет применён со случайной силой (0–10%) для каждой копии.\n` +
        `Гарантируется минимум 2 ненулевых эффекта на копию. Смайлик — всегда если включён.\n\n` +
        `<blockquote>${e("sparkles")} Текущие: ${flagsDescription(flags)}</blockquote>`,
        { reply_markup: uniqToggleKeyboard(flags) },
      );
      continue;
    }

    // Handle start
    if (callbackData === "uniq:start") {
      await toggleCtx.answerCallbackQuery();
      startProcessing = true;
      break;
    }

    // Unknown callback — treat as navigation
    if (callbackData.startsWith("menu:")) {
      await safeDelete(localPath);
      await handleNavCallback(toggleCtx);
      return;
    }
  }

  // ── Save settings to DB ──
  await User.findOneAndUpdate(
    { telegramId: userId },
    { uniqSettings: flags },
    { new: true },
  );

  // ── Step 4: Process and send ──
  const options: UniqOptions = {
    emoji: flags.emoji,
    blur: flags.blur,
    colorCorrection: flags.colorCorrection,
    glitch: flags.glitch,
    noise: flags.noise,
    metadataStrip: true,
  };

  const modeLabel = flagsDescription(flags);

  const processingMsg = await ctx.api.sendMessage(
    userId!,
    `${e("refresh")} Обрабатываю ${count} копий...\n\n` +
    `<blockquote>${e("art")} Эффекты: ${modeLabel}\n${e("zap")} Каждый эффект применяется со случайной силой 0–10%\nЭто может занять некоторое время</blockquote>`,
  );

  const task = await VideoTask.create({
    userId,
    originalPath: localPath,
    title: caption || "Уникализация",
    uniqOptions: options,
    status: "processing",
    tgFileId,
  });

  try {
    const results = await uniquifyVideoBatch(localPath, count, options);

    task.status = "done";
    task.processedPath = results.map((r) => r.outputPath).join(";");
    await task.save();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!existsSync(result.outputPath)) continue;

      await ctx.api.sendDocument(
        userId!,
        new InputFile(result.outputPath),
        {
          caption:
            `${e("art")} Уникальная копия ${i + 1}/${count}\n` +
            `<blockquote>${e("sparkles")} Эффекты: ${result.appliedEffects.join(", ")}</blockquote>`,
        },
      );
    }

    await ctx.api.editMessageText(
      userId,
      processingMsg.message_id,
      `${e("check")} Готово! Создано ${count} уникальных копий.`,
    );
  } catch (err) {
    task.status = "failed";
    task.error = (err as Error).message;
    await task.save();

    await ctx.api.editMessageText(
      userId,
      processingMsg.message_id,
      `${e("cross")} Ошибка обработки: ${(err as Error).message}`,
    );
  } finally {
    await safeDelete(localPath);
  }

  await ctx.api.sendMessage(userId!, "Выбери действие:", { reply_markup: mainMenuKeyboard() });
}
