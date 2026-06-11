import { createConversation } from "@grammyjs/conversations";
import type { BotContext } from "../context";
import type { Composer } from "grammy";
import { addAccountConv } from "./add-account";
import { addProxyConv } from "./add-proxy";
import { uniquifyConv } from "./uniquify";
import { channelAvatarConv, channelDescriptionConv, channelTagsConv } from "./channel-settings";

export function registerConversations(bot: Composer<BotContext>) {
  bot.use(createConversation(addAccountConv));
  bot.use(createConversation(addProxyConv));
  bot.use(createConversation(uniquifyConv));
  bot.use(createConversation(channelAvatarConv));
  bot.use(createConversation(channelDescriptionConv));
  bot.use(createConversation(channelTagsConv));
}
