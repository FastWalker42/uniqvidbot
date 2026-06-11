import { Schema, model, type InferSchemaType } from "mongoose";

export type VideoTaskStatus = "pending" | "processing" | "done" | "failed";

const videoTaskSchema = new Schema(
  {
    userId: { type: Number, required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    /** Path to the original video file on disk */
    originalPath: { type: String, required: true },
    /** Path to the processed (uniquified) video file on disk */
    processedPath: { type: String, default: "" },
    /** Video title / description for YouTube */
    title: { type: String, default: "" },
    /** Uniquification options applied */
    uniqOptions: {
      emoji: { type: Boolean, default: false },
      blur: { type: Boolean, default: false },
      colorCorrection: { type: Boolean, default: false },
      speedChange: { type: Boolean, default: false },
      metadataStrip: { type: Boolean, default: true },
      microTrim: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: ["pending", "processing", "done", "failed"],
      default: "pending",
      index: true,
    },
    error: { type: String, default: "" },
    /** Telegram file_id of the original video */
    tgFileId: { type: String, default: "" },
  },
  { timestamps: true },
);

export type IVideoTask = InferSchemaType<typeof videoTaskSchema>;
export const VideoTask = model("VideoTask", videoTaskSchema);
