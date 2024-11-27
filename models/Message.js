import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true
  },
  receiver: {
    type: String,
    default: null  // null means broadcast message
  },
  message: String,
  isFile: Boolean,
  fileData: {
    name: String,
    type: String,
    data: String
  },
  chatId: {
    type: String,  // Combination of both users' names (sorted alphabetically)
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

export const Message = mongoose.model('Message', messageSchema); 