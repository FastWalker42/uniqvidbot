import { InlineKeyboard } from "grammy";
import { iconId } from "./emoji";

/** Main menu keyboard shown after /start */
export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Настройка канала", "menu:channel_settings").icon(iconId("settings")).row()
    .text("Загрузить Shorts", "menu:upload_shorts").icon(iconId("video")).row()
    .text("Уникализация", "menu:uniquify").icon(iconId("art")).row()
    .text("Статус задач", "menu:task_status").icon(iconId("stats")).row()
    .text("Мои аккаунты", "menu:my_accounts").icon(iconId("person")).row()
    .text("Мои прокси", "menu:my_proxies").icon(iconId("globe"));
}

/** Back-to-main-menu button */
export function backKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Назад", "menu:back").icon(iconId("back"));
}

/** Confirmation keyboard with Yes/No */
export function yesNoKeyboard(yesAction: string, noAction: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Да", yesAction).icon(iconId("check"))
    .text("Нет", noAction).icon(iconId("cross"));
}

/** Uniquification mode selector */
export function uniqModeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Да, размытие + смайлики", "uniq:mode_full").icon(iconId("check"))
    .text("Только эффекты", "uniq:mode_effects").icon(iconId("art"))
    .text("Только структура", "uniq:mode_structure").icon(iconId("wrench"))
    .text("Нет, оригинал", "uniq:mode_none").icon(iconId("cross")).row()
    .text("Назад", "menu:back").icon(iconId("back"));
}

/** Account list keyboard with "Add" button at the bottom */
export function accountListKeyboard(accounts: { _id: string; login: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const acc of accounts) {
    kb.text(acc.login, `account:select:${acc._id}`).icon(iconId("person")).row();
  }
  kb.text("Добавить аккаунт", "menu:add_account").icon(iconId("plus")).row();
  kb.text("Назад", "menu:back").icon(iconId("back"));
  return kb;
}

/** Proxy list keyboard with "Add" button at the bottom */
export function proxyListKeyboard(proxies: { _id: string; host: string; port: number }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of proxies) {
    kb.text(`${p.host}:${p.port}`, `proxy:select:${p._id}`).icon(iconId("globe")).row();
  }
  kb.text("Добавить прокси", "menu:add_proxy").icon(iconId("plus")).row();
  kb.text("Назад", "menu:back").icon(iconId("back"));
  return kb;
}

/** Channel settings menu */
export function channelSettingsKeyboard(accountId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Аватарка", `chset:avatar:${accountId}`).icon(iconId("image")).row()
    .text("Описание", `chset:description:${accountId}`).icon(iconId("pencil")).row()
    .text("Теги", `chset:tags:${accountId}`).icon(iconId("label")).row()
    .text("ИИ-настройка по примеру", `chset:ai_setup:${accountId}`).icon(iconId("robot")).row()
    .text("Назад", "menu:back").icon(iconId("back"));
}

/** Task status keyboard */
export function taskStatusKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Обновить", "tasks:refresh").icon(iconId("refresh"))
    .text("Назад", "menu:back").icon(iconId("back"));
}
