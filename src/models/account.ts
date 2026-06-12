import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * YouTube account linked to a Telegram user.
 * Login:Password:BackupEmail format.
 */
const accountSchema = new Schema(
  {
    userId: { type: Number, required: true, index: true },
    login: { type: String, required: true },
    password: { type: String, required: true },
    backupEmail: { type: String, default: "" },
    proxyId: { type: Schema.Types.ObjectId, ref: "Proxy", default: null },
    channelAvatarFileId: { type: String, default: "" },
    channelDescription: { type: String, default: "" },
    channelTags: { type: [String], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

accountSchema.index({ userId: 1, login: 1 }, { unique: true });

export type IAccount = InferSchemaType<typeof accountSchema>;
export const Account = model("Account", accountSchema);
