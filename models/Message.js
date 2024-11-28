import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true
  },
  receiver: {
    type: String,
    default: null
  },
  message: String,
  isFile: {
    type: Boolean,
    default: false
  },
  fileData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  chatId: String,
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

export const Message = mongoose.model('Message', messageSchema);
