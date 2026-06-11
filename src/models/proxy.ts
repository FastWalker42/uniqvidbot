import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Proxy linked to a Telegram user.
 * Supports formats: IP:PORT:USER:PASS  or  USER:PASS@IP:PORT
 */
const proxySchema = new Schema(
  {
    userId: { type: Number, required: true, index: true },
    host: { type: String, required: true },
    port: { type: Number, required: true },
    username: { type: String, default: "" },
    password: { type: String, default: "" },
    /** Whether proxy connectivity was verified */
    verified: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

proxySchema.index({ userId: 1, host: 1, port: 1 }, { unique: true });

export type IProxy = InferSchemaType<typeof proxySchema>;
export const Proxy = model("Proxy", proxySchema);
