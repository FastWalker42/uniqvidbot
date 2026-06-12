import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Custom emojis / stickers / images that a user has uploaded
 * for the video uniqueness module.
 */
const customEmojiSchema = new Schema(
  {
    userId: { type: Number, required: true, index: true },
    /** Telegram file_id of the uploaded image/sticker */
    tgFileId: { type: String, required: true },
    /** Local path after download */
    localPath: { type: String, default: "" },
    /** Label for display in bot UI */
    label: { type: String, default: "" },
    /** File type: png, webp, etc. */
    fileType: { type: String, default: "png" },
  },
  { timestamps: true },
);

export type ICustomEmoji = InferSchemaType<typeof customEmojiSchema>;
export const CustomEmoji = model("CustomEmoji", customEmojiSchema);
