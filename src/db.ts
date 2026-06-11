import mongoose from "mongoose";
import { config } from "./config";

export async function connectDB() {
  await mongoose.connect(config.mongoUri);
  console.log("MongoDB connected");
}
