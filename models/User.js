import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  hasChangedPassword: {
    type: Boolean,
    default: false
  },
  profilePic: {
    type: String,
    default: null
  }
});

export const User = mongoose.model('User', userSchema); 