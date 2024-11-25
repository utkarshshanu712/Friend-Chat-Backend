import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  username: String,
  message: String,
  isFile: Boolean,
  fileData: {
    name: String,
    type: String,
    data: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 604800 // Auto-delete after 7 days
  }
});

// Create index for TTL
messageSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

export const Message = mongoose.model('Message', messageSchema); 