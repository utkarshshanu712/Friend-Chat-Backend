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
<<<<<<< HEAD
    default: Date.now
  }
});

export const Message = mongoose.model('Message', messageSchema); 
=======
    default: Date.now,
  },
});

export const Message = mongoose.model("Message", messageSchema);
>>>>>>> f9bf8392d381df78ab081eef6cca137800343ecc
