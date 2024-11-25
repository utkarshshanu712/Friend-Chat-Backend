import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  username: String,
  message: String,
  isFile: Boolean,
  fileData: {
    name: String,
    type: String,
    data: String,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

export const Message = mongoose.model("Message", messageSchema);
