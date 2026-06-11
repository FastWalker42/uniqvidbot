import { Schema, model, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    telegramId: { type: Number, required: true, unique: true, index: true },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    isPremium: { type: Boolean, default: false },
    banned: { type: Boolean, default: false },
    /** Persisted uniquification settings */
    uniqSettings: {
      emoji: { type: Boolean, default: true },
      blur: { type: Boolean, default: true },
      colorCorrection: { type: Boolean, default: true },
      glitch: { type: Boolean, default: true },
      noise: { type: Boolean, default: true },
      mirror: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

export type IUser = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
