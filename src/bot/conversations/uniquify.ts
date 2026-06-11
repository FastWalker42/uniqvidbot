import type { BotConversation, BotContext } from "../context";
import { VideoTask } from "../../models/index";
import { uniquifyVideoBatch, type UniqOptions } from "../../services/video-processor";
import { ensureDownloadDir, uniqueFilename, safeDelete } from "../../utils/file-utils";
import { mainMenuKeyboard, uniqModeKeyboard } from "../../utils/keyboard";
import { e } from "../../utils/emoji";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { InputFile } from "grammy";

/**
 * Conversation: Uniquify a video — send back uniquified copies as files.
 *
 * Flow:
 * 1. User sends a video file
 * 2. Bot asks how many copies
 * 3. Bot asks uniquification mode
 * 4. Bot processes and sends files back
 */
export async function uniquifyConv(
  conversation: BotConversation,
  ctx: BotContext,
): Promise<void> {
  // ── Step 1: Wait for video ──
  const videoCtx = await conversation.wait();

  const userId = videoCtx.from?.id;
  if (!userId) return;

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

  // ── Step 3: Ask uniquification mode ──
  await countCtx.reply(
    `${e("art")} Включить уникализацию?`,
    { reply_markup: uniqModeKeyboard() },
  );
  const modeCtx = await conversation.wait();

  const callbackData = modeCtx.callbackQuery?.data;
  if (!callbackData) {
    await safeDelete(localPath);
    await modeCtx.reply(`${e("cross")} Выбери режим.`, { reply_markup: mainMenuKeyboard() });
    return;
  }

  await modeCtx.answerCallbackQuery();

  let options: UniqOptions;
  let modeLabel: string;
  switch (callbackData) {
    case "uniq:mode_full":
      options = { emoji: true, blur: true, colorCorrection: true, speedChange: true, metadataStrip: true, microTrim: true };
      modeLabel = "Полная уникализация";
      break;
    case "uniq:mode_effects":
      options = { emoji: true, blur: true, colorCorrection: true, metadataStrip: true };
      modeLabel = "Только визуальные эффекты";
      break;
    case "uniq:mode_structure":
      options = { speedChange: true, metadataStrip: true, microTrim: true };
      modeLabel = "Только структурные изменения";
      break;
    case "uniq:mode_none":
      options = { metadataStrip: true };
      modeLabel = "Только очистка метаданных";
      break;
    default:
      await safeDelete(localPath);
      await modeCtx.reply(`${e("cross")} Неизвестный режим.`, { reply_markup: mainMenuKeyboard() });
      return;
  }

  // ── Step 4: Process and send ──
  const processingMsg = await modeCtx.reply(
    `${e("refresh")} Обрабатываю ${count} копий...\n\n` +
    `<blockquote>${e("art")} Режим: ${modeLabel}\n${e("zap")} Это может занять некоторое время</blockquote>`,
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

      await modeCtx.replyWithDocument(
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

  await modeCtx.reply("Выбери действие:", { reply_markup: mainMenuKeyboard() });
}
