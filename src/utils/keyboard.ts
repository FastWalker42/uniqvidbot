import { InlineKeyboard } from "grammy";
import { pe } from "./emoji";

/** Main menu keyboard shown after /start */
export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${pe("plus")} Добавить аккаунт`, "menu:add_account").row()
    .text(`${pe("globe")} Добавить прокси`, "menu:add_proxy").row()
    .text(`${pe("settings")} Настройка канала`, "menu:channel_settings").row()
    .text(`${pe("video")} Загрузить Shorts`, "menu:upload_shorts").row()
    .text(`${pe("art")} Уникализация`, "menu:uniquify").row()
    .text(`${pe("stats")} Статус задач`, "menu:task_status").row()
    .text(`${pe("person")} Мои аккаунты`, "menu:my_accounts").row()
    .text(`${pe("globe")} Мои прокси`, "menu:my_proxies");
}

/** Back-to-main-menu button */
export function backKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(`${pe("back")} Назад`, "menu:back");
}

/** Confirmation keyboard with Yes/No */
export function yesNoKeyboard(yesAction: string, noAction: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${pe("check")} Да`, yesAction)
    .text(`${pe("cross")} Нет`, noAction);
}

/** Uniquification mode selector */
export function uniqModeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${pe("check")} Да, размытие + смайлики`, "uniq:mode_full")
    .text(`${pe("art")} Только эффекты`, "uniq:mode_effects")
    .text(`${pe("wrench")} Только структура`, "uniq:mode_structure")
    .text(`${pe("cross")} Нет, оригинал`, "uniq:mode_none").row()
    .text(`${pe("back")} Назад`, "menu:back");
}

/** Account list keyboard */
export function accountListKeyboard(accounts: { _id: string; login: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const acc of accounts) {
    kb.text(`${pe("person")} ${acc.login}`, `account:select:${acc._id}`).row();
  }
  kb.text(`${pe("back")} Назад`, "menu:back");
  return kb;
}

/** Proxy list keyboard */
export function proxyListKeyboard(proxies: { _id: string; host: string; port: number }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of proxies) {
    kb.text(`${pe("globe")} ${p.host}:${p.port}`, `proxy:select:${p._id}`).row();
  }
  kb.text(`${pe("back")} Назад`, "menu:back");
  return kb;
}

/** Channel settings menu */
export function channelSettingsKeyboard(accountId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${pe("image")} Аватарка`, `chset:avatar:${accountId}`).row()
    .text(`${pe("pencil")} Описание`, `chset:description:${accountId}`).row()
    .text(`${pe("label")} Теги`, `chset:tags:${accountId}`).row()
    .text(`${pe("robot")} ИИ-настройка по примеру`, `chset:ai_setup:${accountId}`).row()
    .text(`${pe("back")} Назад`, "menu:back");
}

/** Task status keyboard */
export function taskStatusKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${pe("refresh")} Обновить`, "tasks:refresh")
    .text(`${pe("back")} Назад`, "menu:back");
}
