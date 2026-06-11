import type { BotConversation, BotContext } from "../context";
import { Proxy } from "../../models/index";
import { parseProxyBatch } from "../../utils/proxy-parser";
import { proxyListKeyboard } from "../../utils/keyboard";
import { e } from "../../utils/emoji";

/**
 * Conversation: Add one or more proxies.
 * Accepts text messages with proxy lines.
 */
export async function addProxyConv(
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

  if (!msgCtx.message?.text) {
    await msgCtx.reply(
      `${e("cross")} Отправь прокси текстом.\nФормат: <code>IP:PORT:USER:PASS</code> или <code>USER:PASS@IP:PORT</code>`,
    );
    return;
  }

  const text = msgCtx.message.text;
  const { valid, invalid } = parseProxyBatch(text);

  let addedCount = 0;
  let duplicateCount = 0;

  for (const proxy of valid) {
    const existing = await Proxy.findOne({ userId, host: proxy.host, port: proxy.port });
    if (existing) {
      duplicateCount++;
      existing.username = proxy.username;
      existing.password = proxy.password;
      await existing.save();
      continue;
    }
    await Proxy.create({
      userId,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
      verified: false,
    });
    addedCount++;
  }

  // ── Result — return to proxy list ──
  const proxies = await Proxy.find({ userId, active: true }).lean();

  let msg = `${e("globe")} <b>Прокси добавлены</b>\n\n`;
  msg += `${e("check")} Новых: ${addedCount}`;
  if (duplicateCount > 0) msg += `\n${e("refresh")} Обновлено: ${duplicateCount}`;
  if (invalid.length > 0) {
    msg += `\n\n${e("cross")} Ошибки в строках:\n<code>${invalid.slice(0, 5).join("\n")}</code>`;
    if (invalid.length > 5) msg += `\n...и ещё ${invalid.length - 5}`;
  }
  await msgCtx.reply(msg, {
    reply_markup: proxyListKeyboard(proxies.map((p) => ({ _id: String(p._id), host: p.host, port: p.port }))),
  });
}
