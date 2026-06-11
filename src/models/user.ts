import { Schema, model, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    telegramId: { type: Number, required: true, unique: true, index: true },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    isPremium: { type: Boolean, default: false },
    banned: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type IUser = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
