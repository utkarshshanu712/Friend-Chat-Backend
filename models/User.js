<<<<<<< HEAD
import mongoose from 'mongoose';
=======
import mongoose from "mongoose";
>>>>>>> f9bf8392d381df78ab081eef6cca137800343ecc

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
<<<<<<< HEAD
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const User = mongoose.model('User', userSchema); 
=======
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const User = mongoose.model("User", userSchema);
>>>>>>> f9bf8392d381df78ab081eef6cca137800343ecc
