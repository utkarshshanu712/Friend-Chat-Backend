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
    name: String,
    type: String,
    data: String,
    size: Number
  },
  chatId: String,
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
