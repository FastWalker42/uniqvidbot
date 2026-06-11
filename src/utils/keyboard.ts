import { InlineKeyboard } from "grammy";
import { iconId } from "./emoji";

/** Uniquification toggle flags */
export interface UniqFlags {
  emoji: boolean;
  blur: boolean;
  colorCorrection: boolean;
  glitch: boolean;
  noise: boolean;
  mirror: boolean;
}

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

/** Uniquification toggle keyboard — each flag is a toggle button */
export function uniqToggleKeyboard(flags: UniqFlags): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Emoji toggle
  kb.text(
    flags.emoji ? "Смайлики: ВКЛ" : "Смайлики: ВЫКЛ",
    "uniq:toggle:emoji",
  ).icon(flags.emoji ? iconId("toggleOn") : iconId("toggleOff")).row();

  // Blur edges toggle
  kb.text(
    flags.blur ? "Размытие краёв: ВКЛ" : "Размытие краёв: ВЫКЛ",
    "uniq:toggle:blur",
  ).icon(flags.blur ? iconId("toggleOn") : iconId("toggleOff")).row();

  // Color correction toggle
  kb.text(
    flags.colorCorrection ? "Цветокоррекция: ВКЛ" : "Цветокоррекция: ВЫКЛ",
    "uniq:toggle:color",
  ).icon(flags.colorCorrection ? iconId("toggleOn") : iconId("toggleOff")).row();

  // Glitch toggle
  kb.text(
    flags.glitch ? "Глитч: ВКЛ" : "Глитч: ВЫКЛ",
    "uniq:toggle:glitch",
  ).icon(flags.glitch ? iconId("toggleOn") : iconId("toggleOff")).row();

  // Noise toggle
  kb.text(
    flags.noise ? "Шум: ВКЛ" : "Шум: ВЫКЛ",
    "uniq:toggle:noise",
  ).icon(flags.noise ? iconId("toggleOn") : iconId("toggleOff")).row();

  // Mirror toggle
  kb.text(
    flags.mirror ? "Отзеркалить: ВКЛ" : "Отзеркалить: ВЫКЛ",
    "uniq:toggle:mirror",
  ).icon(flags.mirror ? iconId("toggleOn") : iconId("toggleOff")).row();

  // Start processing
  kb.text("Начать обработку", "uniq:start").icon(iconId("check")).row();

  // Back
  kb.text("Назад", "menu:back").icon(iconId("back"));

  return kb;
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
