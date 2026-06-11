import { InlineKeyboard } from "grammy";

/** Main menu keyboard shown after /start */
export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Добавить аккаунт", "menu:add_account").row()
    .text("🌐 Добавить прокси", "menu:add_proxy").row()
    .text("⚙️ Настройка канала", "menu:channel_settings").row()
    .text("🎬 Загрузить Shorts", "menu:upload_shorts").row()
    .text("🎨 Уникализация", "menu:uniquify").row()
    .text("📊 Статус задач", "menu:task_status").row()
    .text("👤 Мои аккаунты", "menu:my_accounts").row()
    .text("🌐 Мои прокси", "menu:my_proxies");
}

/** Back-to-main-menu button */
export function backKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("⬅️ Назад", "menu:back");
}

/** Confirmation keyboard with Yes/No */
export function yesNoKeyboard(yesAction: string, noAction: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Да", yesAction)
    .text("❌ Нет", noAction);
}

/** Uniquification mode selector */
export function uniqModeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Да, размытие + смайлики", "uniq:mode_full")
    .text("🎨 Только эффекты", "uniq:mode_effects")
    .text("🔧 Только структура", "uniq:mode_structure")
    .text("❌ Нет, оригинал", "uniq:mode_none").row()
    .text("⬅️ Назад", "menu:back");
}

/** Account list keyboard */
export function accountListKeyboard(accounts: { _id: string; login: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const acc of accounts) {
    kb.text(acc.login, `account:select:${acc._id}`).row();
  }
  kb.text("⬅️ Назад", "menu:back");
  return kb;
}

/** Proxy list keyboard */
export function proxyListKeyboard(proxies: { _id: string; host: string; port: number }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of proxies) {
    kb.text(`${p.host}:${p.port}`, `proxy:select:${p._id}`).row();
  }
  kb.text("⬅️ Назад", "menu:back");
  return kb;
}

/** Channel settings menu */
export function channelSettingsKeyboard(accountId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("🖼 Аватарка", `chset:avatar:${accountId}`).row()
    .text("📝 Описание", `chset:description:${accountId}`).row()
    .text("🏷 Теги", `chset:tags:${accountId}`).row()
    .text("🤖 ИИ-настройка по примеру", `chset:ai_setup:${accountId}`).row()
    .text("⬅️ Назад", "menu:back");
}

/** Task status keyboard */
export function taskStatusKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("🔄 Обновить", "tasks:refresh")
    .text("⬅️ Назад", "menu:back");
}
