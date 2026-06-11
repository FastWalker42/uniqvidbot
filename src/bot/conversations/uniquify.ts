import type { BotConversation, BotContext } from "../context";
import type { Api, RawApi } from "grammy";
import { VideoTask, User } from "../../models/index";
import { uniquifyVideoBatch, type UniqOptions } from "../../services/video-processor";
import { ensureDownloadDir, uniqueFilename, safeDelete } from "../../utils/file-utils";
import { mainMenuKeyboard, uniqToggleKeyboard, type UniqFlags } from "../../utils/keyboard";
import { e } from "../../utils/emoji";
import { handleNavCallback } from "../helpers/show-views";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { InputFile } from "grammy";

/** Text shown in the toggle-settings message (no exact percentages) */
const SETTINGS_TEXT =
  `Выбери какие эффекты применить. Каждый эффект будет применён со случайной силой для каждой копии.\n` +
  `Гарантируется минимум 2 ненулевых эффекта на копию. Смайлик — всегда если включён.`;

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
  if (flags.mirror) parts.push("Отзеркалить");
  return parts.length > 0 ? parts.join(", ") : "Нет эффектов";
}

/**
 * Background processing — runs after the conversation exits.
 * Uses Bun Workers for full parallelism, sends each copy
 * to the user as soon as it's ready via Bot API.
 * Updates the progress message with a live counter and clock emoji.
 */
async function processAndSendResults(
  api: Api<RawApi>,
  userId: number,
  inputPath: string,
  count: number,
  options: UniqOptions,
  processingMsgId: number,
  task: InstanceType<typeof VideoTask>,
  modeLabel: string,
): Promise<void> {
  let successCount = 0;
  let failCount = 0;
  const processedPaths: string[] = [];
  let lastEditTime = 0;
  const EDIT_COOLDOWN_MS = 1500; // Telegram rate-limit safety

  /** Update the progress message (throttled to avoid 429) */
  const updateProgress = async (done: number) => {
    const now = Date.now();
    if (now - lastEditTime < EDIT_COOLDOWN_MS && done < count) return;
    lastEditTime = now;

    try {
      await api.editMessageText(
        userId,
        processingMsgId,
        `${e("clock")} Обработка ${done}/${count} копий...\n\n` +
        `<blockquote>${e("art")} Эффекты: ${modeLabel}</blockquote>`,
      );
    } catch {
      // editMessage may fail if text is identical or message deleted — ignore
    }
  };

  try {
    const results = await uniquifyVideoBatch(
      inputPath,
      count,
      options,
      // Stream each copy to the user immediately as it finishes
      async (index, result) => {
        const done = successCount + failCount + 1;

        if (!existsSync(result.outputPath)) {
          failCount++;
          await updateProgress(done);
          return;
        }

        try {
          await api.sendDocument(userId, new InputFile(result.outputPath), {
            caption:
              `${e("art")} Уникальная копия ${done}/${count}\n` +
              `<blockquote>${e("sparkles")} Эффекты: ${result.appliedEffects.join(", ")}</blockquote>`,
          });
          successCount++;
          processedPaths.push(result.outputPath);
        } catch (sendErr) {
          console.error(`Failed to send copy ${done}:`, sendErr);
          // File was processed even if sending failed — still count it
          successCount++;
          processedPaths.push(result.outputPath);
        }

        await updateProgress(done);
      },
    );

    task.status = "done";
    task.processedPath = processedPaths.join(";");
    await task.save();

    await api.editMessageText(
      userId,
      processingMsgId,
      `${e("check")} Готово! Создано ${successCount} уникальных копий.`,
    );
  } catch (err) {
    task.status = successCount > 0 ? "done" : "failed";
    task.processedPath = processedPaths.join(";");
    task.error = (err as Error).message;
    await task.save();

    const label = successCount > 0
      ? `${e("warning")} Частично готово: ${successCount}/${count} копий. Ошибка: ${(err as Error).message}`
      : `${e("cross")} Ошибка обработки: ${(err as Error).message}`;

    try {
      await api.editMessageText(userId, processingMsgId, label);
    } catch {
      // Message may have been deleted
    }
  } finally {
    await safeDelete(inputPath);
  }

  try {
    await api.sendMessage(userId, "Выбери действие:", { reply_markup: mainMenuKeyboard() });
  } catch {
    // Bot may be blocked
  }
}

/**
 * Conversation: Uniquify a video — send back uniquified copies as files.
 *
 * Flow:
 * 1. User sends a video file
 * 2. Bot asks how many copies
 * 3. Bot shows toggle keyboard for effects (loaded from DB, user can toggle)
 * 4. User presses "Начать обработку"
 * 5. Bot saves settings to DB, starts background processing, EXITS conversation
 * 6. Background Workers process in parallel, send results as they complete
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
    mirror: savedSettings?.mirror ?? false,
  };

  const settingsMessageText = () =>
    `${e("art")} <b>Настройки уникализации</b>\n\n` +
    `${SETTINGS_TEXT}\n\n` +
    `<blockquote>${e("sparkles")} Текущие: ${flagsDescription(flags)}</blockquote>`;

  await countCtx.reply(settingsMessageText(), { reply_markup: uniqToggleKeyboard(flags) });

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
      else if (flag === "mirror") flags.mirror = !flags.mirror;

      await toggleCtx.answerCallbackQuery();

      await toggleCtx.editMessageText(
        settingsMessageText(),
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

  // ── Step 4: Start background processing (fire-and-forget) ──
  const options: UniqOptions = {
    emoji: flags.emoji,
    blur: flags.blur,
    colorCorrection: flags.colorCorrection,
    glitch: flags.glitch,
    noise: flags.noise,
    mirror: flags.mirror,
    metadataStrip: true,
  };

  const modeLabel = flagsDescription(flags);

  const processingMsg = await ctx.api.sendMessage(
    userId!,
    `${e("clock")} Обработка 0/${count} копий...\n\n` +
    `<blockquote>${e("art")} Эффекты: ${modeLabel}</blockquote>`,
  );

  const task = await VideoTask.create({
    userId,
    originalPath: localPath,
    title: caption || "Уникализация",
    uniqOptions: options,
    status: "processing",
    tgFileId,
  });

  // Fire-and-forget: conversation exits immediately, Workers process in parallel,
  // results are streamed to the user as each copy completes.
  processAndSendResults(
    ctx.api,
    userId!,
    localPath,
    count,
    options,
    processingMsg.message_id,
    task,
    modeLabel,
  ).catch((err) => {
    console.error("Background processing error:", err);
  });

  // Exit conversation — user is free to interact with the bot immediately
}
