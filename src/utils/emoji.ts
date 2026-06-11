/**
 * Premium custom emoji mapping for UniqVid Bot.
 * Uses tgiosicons, TranslucentPack, and TgAndroidIcons emoji packs.
 * Format: <tg-emoji emoji-id="ID">fallback</tg-emoji>
 *
 * NOTE: tg-emoji only works in message text with parse_mode: "HTML".
 * Inline keyboard button labels do NOT support custom emojis,
 * so we use the fallback characters there.
 */

const EMOJI_MAP = {
        // ── Brand ──
        logo:       { id: '5334681713316479679', fallback: '📱' },

        // ── Navigation ──
        back:       { id: '5960671702059848143', fallback: '⬅️' },
        home:       { id: '6042137469204303531', fallback: '🏠' },

        // ── Main menu actions ──
        plus:       { id: '6032924188828767321', fallback: '➕' },
        globe:      { id: '4983606271883086011', fallback: '🔗' },
        settings:   { id: '5904258298764334001', fallback: '⚙️' },
        video:      { id: '5253459775760388144', fallback: '🚀' },
        stats:      { id: '4985851813929420053', fallback: '💻' },
        art:        { id: '5276442772826515132', fallback: '🎨' },
        person:     { id: '4983363889698702988', fallback: '👤' },

        // ── Status / results ──
        check:      { id: '5774022692642492953', fallback: '✅' },
        cross:      { id: '6030757850274336631', fallback: '❌' },
        refresh:    { id: '5769248574499983619', fallback: '🔄' },
        warning:    { id: '5276240711795107620', fallback: '⚠️' },
        download:   { id: '6037157012242960559', fallback: '⬇️' },
        fire:       { id: '6008118472066732010', fallback: '🔥' },
        sparkles:   { id: '5778226250149532337', fallback: '✨' },
        zap:        { id: '5884428842780594914', fallback: '⚡' },

        // ── Channel / content ──
        image:      { id: '6030466823290360017', fallback: '🖼' },
        pencil:     { id: '5920046907782074235', fallback: '📝' },
        label:      { id: '5888620056551625531', fallback: '🏷' },
        robot:      { id: '6030400221232501136', fallback: '🤖' },
        eye:        { id: '6037397706505195857', fallback: '👁' },
        link:       { id: '6028171274939797252', fallback: '🔗' },
        camera:     { id: '5881806211195605908', fallback: '📸' },
        control:    { id: '5776424837786374634', fallback: '🎛' },

        // ── Tools ──
        wrench:     { id: '5962952497197748583', fallback: '🔧' },
        trash:      { id: '6039522349517115015', fallback: '🗑' },
        key:        { id: '6005570495603282482', fallback: '🔑' },
        lock:       { id: '6037249452824072506', fallback: '🔒' },
        mag:        { id: '5276395476646653290', fallback: '🔍' },
        cardIndex:  { id: '5766994197705921104', fallback: '🗂' },

        // ── Duplicate / existing from template ──
        bot:        { id: '5276127848644503161', fallback: '🤖' },
        folder:     { id: '5278227821364275264', fallback: '📁' },
        clipboard:  { id: '6034969813032374911', fallback: '📋' },
} as const

export type EmojiKey = keyof typeof EMOJI_MAP

/**
 * Return premium emoji HTML tag: <tg-emoji emoji-id="ID">fallback</tg-emoji>
 * Use in message text with parse_mode: HTML.
 */
export function e(key: EmojiKey): string {
        const entry = EMOJI_MAP[key]
        return `<tg-emoji emoji-id="${entry.id}">${entry.fallback}</tg-emoji>`
}

/**
 * Plain-text emoji — returns only the fallback character.
 * Use in inline keyboard button labels and answerCallbackQuery text
 * (these contexts do NOT support <tg-emoji>).
 */
export function pe(key: EmojiKey): string {
        return EMOJI_MAP[key].fallback
}

/**
 * Return only the custom_emoji_id — needed for InlineKeyboard button icons.
 */
export function iconId(key: EmojiKey): string {
        return EMOJI_MAP[key].id
}
