import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    required: true,
    trim: true
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
    default: null,
    validate: {
      validator: function(v) {
        return v === null || v.startsWith('data:image/');
      },
      message: 'Profile picture must be a valid image data URL'
    }
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  isOnline: {
    type: Boolean,
    default: false
  }
});

export const User = mongoose.model('User', userSchema);
