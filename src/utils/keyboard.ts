import { InlineKeyboard } from "grammy";
import { pe, iconId } from "./emoji";

/** Main menu keyboard shown after /start */
export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${pe("plus")} Добавить аккаунт`, "menu:add_account").icon(iconId("plus")).row()
    .text(`${pe("globe")} Добавить прокси`, "menu:add_proxy").icon(iconId("globe")).row()
    .text(`${pe("settings")} Настройка канала`, "menu:channel_settings").icon(iconId("settings")).row()
    .text(`${pe("video")} Загрузить Shorts`, "menu:upload_shorts").icon(iconId("video")).row()
    .text(`${pe("art")} Уникализация`, "menu:uniquify").icon(iconId("art")).row()
    .text(`${pe("stats")} Статус задач`, "menu:task_status").icon(iconId("stats")).row()
    .text(`${pe("person")} Мои аккаунты`, "menu:my_accounts").icon(iconId("person")).row()
    .text(`${pe("globe")} Мои прокси`, "menu:my_proxies").icon(iconId("globe"));
}

/** Back-to-main-menu button */
export function backKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(`${pe("back")} Назад`, "menu:back").icon(iconId("back"));
}

/** Confirmation keyboard with Yes/No */
export function yesNoKeyboard(yesAction: string, noAction: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${pe("check")} Да`, yesAction).icon(iconId("check"))
    .text(`${pe("cross")} Нет`, noAction).icon(iconId("cross"));
}

/** Uniquification mode selector */
export function uniqModeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${pe("check")} Да, размытие + смайлики`, "uniq:mode_full").icon(iconId("check"))
    .text(`${pe("art")} Только эффекты`, "uniq:mode_effects").icon(iconId("art"))
    .text(`${pe("wrench")} Только структура`, "uniq:mode_structure").icon(iconId("wrench"))
    .text(`${pe("cross")} Нет, оригинал`, "uniq:mode_none").icon(iconId("cross")).row()
    .text(`${pe("back")} Назад`, "menu:back").icon(iconId("back"));
}

/** Account list keyboard */
export function accountListKeyboard(accounts: { _id: string; login: string }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const acc of accounts) {
    kb.text(`${pe("person")} ${acc.login}`, `account:select:${acc._id}`).icon(iconId("person")).row();
  }
  kb.text(`${pe("back")} Назад`, "menu:back").icon(iconId("back"));
  return kb;
}

/** Proxy list keyboard */
export function proxyListKeyboard(proxies: { _id: string; host: string; port: number }[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const p of proxies) {
    kb.text(`${pe("globe")} ${p.host}:${p.port}`, `proxy:select:${p._id}`).icon(iconId("globe")).row();
  }
  kb.text(`${pe("back")} Назад`, "menu:back").icon(iconId("back"));
  return kb;
}

/** Channel settings menu */
export function channelSettingsKeyboard(accountId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${pe("image")} Аватарка`, `chset:avatar:${accountId}`).icon(iconId("image")).row()
    .text(`${pe("pencil")} Описание`, `chset:description:${accountId}`).icon(iconId("pencil")).row()
    .text(`${pe("label")} Теги`, `chset:tags:${accountId}`).icon(iconId("label")).row()
    .text(`${pe("robot")} ИИ-настройка по примеру`, `chset:ai_setup:${accountId}`).icon(iconId("robot")).row()
    .text(`${pe("back")} Назад`, "menu:back").icon(iconId("back"));
}

/** Task status keyboard */
export function taskStatusKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(`${pe("refresh")} Обновить`, "tasks:refresh").icon(iconId("refresh"))
    .text(`${pe("back")} Назад`, "menu:back").icon(iconId("back"));
}
