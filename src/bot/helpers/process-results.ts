import type { Api, RawApi } from "grammy";
import { VideoTask } from "../../models/index";
import { uniquifyVideoBatch, type UniqOptions } from "../../services/video-processor";
import { safeDelete } from "../../utils/file-utils";
import { mainMenuKeyboard } from "../../utils/keyboard";
import { e } from "../../utils/emoji";
import { existsSync } from "node:fs";
import { InputFile } from "grammy";

/**
 * Background processing — fire-and-forget after user clicks "Начать обработку".
 * Uses Bun Workers for full parallelism, sends each copy
 * to the user as soon as it's ready via Bot API.
 * Updates the progress message with a live counter and premium clock emoji.
 */
export async function processAndSendResults(
  api: Api<RawApi>,
  userId: number,
  inputPath: string,
  count: number,
  options: UniqOptions,
  processingMsgId: number,
  task: InstanceType<typeof VideoTask>,
  modeLabel: string,
): Promise<void> {
  const processedPaths: string[] = [];
  let lastEditTime = 0;
  const EDIT_COOLDOWN_MS = 1200; // Telegram rate-limit safety
  let completedCount = 0; // atomic-ish counter: incremented BEFORE progress update
  let editInProgress = false; // guard against concurrent edits

  /** Update the progress message via editMessage (throttled, no concurrent edits) */
  const updateProgress = async (done: number, force = false): Promise<void> => {
    if (editInProgress && !force) return;
    const now = Date.now();
    if (!force && now - lastEditTime < EDIT_COOLDOWN_MS && done < count) return;

    editInProgress = true;
    lastEditTime = now;
    try {
      await api.editMessageText(
        userId,
        processingMsgId,
        `${e("clock")} Обработка ${done}/${count} копий...\n\n` +
        `<blockquote>${e("art")} Эффекты: ${modeLabel}</blockquote>`,
      );
    } catch {
      // editMessage may fail if text is identical or message deleted
    } finally {
      editInProgress = false;
    }
  };

  try {
    const results = await uniquifyVideoBatch(
      inputPath,
      count,
      options,
      // Stream each copy to the user immediately as it finishes
      async (index, result) => {
        // Increment counter FIRST so progress reflects real state
        completedCount++;
        const done = completedCount;

        if (!existsSync(result.outputPath)) {
          await updateProgress(done);
          return;
        }

        try {
          await api.sendDocument(userId, new InputFile(result.outputPath), {
            caption:
              `${e("art")} Уникальная копия ${done}/${count}\n` +
              `<blockquote>${e("sparkles")} Эффекты: ${result.appliedEffects.join(", ")}</blockquote>`,
          });
          processedPaths.push(result.outputPath);
        } catch (sendErr) {
          console.error(`Failed to send copy ${done}:`, sendErr);
          processedPaths.push(result.outputPath);
        }

        // Always update progress after each copy; force on last one
        await updateProgress(done, done >= count);
      },
    );

    const successCount = processedPaths.length;
    const failCount = count - successCount;

    task.status = failCount === 0 ? "done" : (successCount > 0 ? "done" : "failed");
    task.processedPath = processedPaths.join(";");
    await task.save();

    // Final editMessage — always forced, shows completion
    try {
      await api.editMessageText(
        userId,
        processingMsgId,
        `${e("check")} Готово! Создано ${successCount} уникальных копий.` +
        (failCount > 0 ? `\n${e("warning")} Не удалось: ${failCount}` : ""),
      );
    } catch {
      // message may have been deleted
    }
  } catch (err) {
    const successCount = processedPaths.length;

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
