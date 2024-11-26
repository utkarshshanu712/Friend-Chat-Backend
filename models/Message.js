import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender: String,
  receiver: String,
  message: String,
  isFile: Boolean,
  fileData: {
    name: String,
    type: String,
    data: String
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readBy: [String],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedBy: [String],
  timestamp: {
    type: Date,
    default: Date.now
  }
});

export const Message = mongoose.model('Message', messageSchema); 