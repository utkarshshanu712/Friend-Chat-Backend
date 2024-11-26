import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Message } from "./models/Message.js";
import { User } from "./models/User.js";
import cors from 'cors';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "https://chat220.netlify.app"],
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 50e6 // 50MB in bytes
});



const PORT = process.env.PORT || 5000;

const activeUsers = new Map();

// MongoDB connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Monitor database size
async function checkDatabaseSize() {
  const stats = await mongoose.connection.db.stats();
  const sizeInMB = stats.dataSize / (1024 * 1024);

  if (sizeInMB > 350) {
    // Clean up when approaching 400MB
    const oldestMessages = await Message.find()
      .sort({ timestamp: 1 })
      .limit(100);

    if (oldestMessages.length > 0) {
      await Message.deleteMany({
        _id: { $in: oldestMessages.map((m) => m._id) },
      });
    }
  }
}

// Check size every hour
setInterval(checkDatabaseSize, 3600000);

// Add predefined users
const defaultUsers = [
  { username: 'admin', password: 'admin123' },
  { username: 'user1', password: 'user123' },
  { username: 'user2', password: 'user456' },
  { username: 'user3', password: 'user789' }
];

// Initialize default users
async function initializeUsers() {
  for (const user of defaultUsers) {
    try {
      await User.findOneAndUpdate(
        { username: user.username },
        user,
        { upsert: true }
      );
    } catch (err) {
      console.error(`Error creating user ${user.username}:`, err);
    }
  }
}

// Add this after the initializeUsers function
async function cleanupOldUsers() {
  try {
    await User.deleteMany({
      username: { 
        $nin: defaultUsers.map(user => user.username)
      }
    });
    console.log("Old users cleaned up successfully");
  } catch (err) {
    console.error("Error cleaning up old users:", err);
  }
}

// Call it after initializeUsers()
initializeUsers();
cleanupOldUsers();

app.use(express.json());

app.use(cors({
  origin: [
    'https://chat220.netlify.app',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST'],
  credentials: true
}));

// Add headers middleware for additional CORS support
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://chat220.netlify.app');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// Add this route before socket.io setup
app.get('/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username');
    res.json(users.map(user => ({ username: user.username })));
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

//delete
socket.on("delete-message", async ({ messageId }) => {
  const username = activeUsers.get(socket.id);
  if (username) {
    try {
      const message = await Message.findById(messageId);
      if (message && (message.sender === username || message.receiver === username)) {
        await Message.findByIdAndDelete(messageId); // Permanently delete the message from the database

        // Notify all clients that the message has been deleted
        io.emit("message-deleted", { messageId });
      } else {
        socket.emit("delete-failed", { error: "Unauthorized to delete this message" });
      }
    } catch (err) {
      console.error("Error deleting message:", err);
      socket.emit("delete-failed", { error: "An error occurred during deletion" });
    }
  }
});


io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  
  socket.on("auth", async ({ username, password }) => {
    try {
      const user = await User.findOne({ username });
      if (user && user.password === password) {
        activeUsers.set(socket.id, username);
        socket.emit("auth-success", { username });
        io.emit("users-update", Array.from(activeUsers.values()));

        // Send message history
        const messages = await Message.find()
          .sort({ timestamp: -1 })
          .limit(100);
        socket.emit("message-history", messages.reverse());
      } else {
        socket.emit("auth-failed");
      }
    } catch (err) {
      console.error("Auth error:", err);
      socket.emit("auth-failed");
    }
  });

  socket.on("send-message", async (message) => {
    const username = activeUsers.get(socket.id);
    if (username) {
      try {
        const newMessage = new Message({
          username,
          message: message.message,
          isFile: false,
          timestamp: new Date(),
        });
        await newMessage.save();
      } catch (err) {
        console.error("Failed to save message to MongoDB:", err);
      }
      // Always emit the message even if MongoDB fails
      io.emit("receive-message", {
        username,
        message: message.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  socket.on("send-file", async (fileData) => {
    const username = activeUsers.get(socket.id);
    if (username) {
      const newMessage = new Message({
        username,
        isFile: true,
        fileData,
        timestamp: new Date(),
      });
      await newMessage.save();
      io.emit("receive-file", {
        ...fileData,
        username,
        timestamp: new Date().toISOString(),
      });
    }
  });

  socket.on("disconnect", () => {
    activeUsers.delete(socket.id);
    io.emit("users-update", Array.from(activeUsers.values()));
  });

  // Password change handler
  socket.on("change-password", async ({ username, oldPassword, newPassword }) => {
    try {
      const user = await User.findOne({ username, password: oldPassword });
      if (user) {
        user.password = newPassword;
        user.hasChangedPassword = true;
        await user.save();
        socket.emit("password-change-success");
      } else {
        socket.emit("password-change-failed");
      }
    } catch (err) {
      socket.emit("password-change-failed");
    }
  });

  // Private message handler
  socket.on("private-message", async ({ receiver, message }) => {
    const sender = activeUsers.get(socket.id);
    if (sender) {
      const newMessage = new Message({
        sender,
        receiver,
        message,
        isRead: false,
        readBy: [sender]
      });
      await newMessage.save();
      
      // Find receiver's socket
      const receiverSocket = Array.from(activeUsers.entries())
        .find(([_, username]) => username === receiver)?.[0];
      
      if (receiverSocket) {
        io.to(receiverSocket).emit("receive-private-message", {
          sender,
          message,
          timestamp: new Date().toISOString()
        });
      }
    }
  });

  // Message read receipt handler
  socket.on("mark-message-read", async ({ messageId }) => {
    const reader = activeUsers.get(socket.id);
    if (reader) {
      const message = await Message.findById(messageId);
      if (message && !message.readBy.includes(reader)) {
        message.readBy.push(reader);
        message.isRead = true;
        await message.save();
        
        // Notify sender
        const senderSocket = Array.from(activeUsers.entries())
          .find(([_, username]) => username === message.sender)?.[0];
        
        if (senderSocket) {
          io.to(senderSocket).emit("message-read", {
            messageId,
            reader
          });
        }
      }
    }
  });


  // Profile picture change handler
  socket.on("update-profile-pic", async ({ username, profilePic }) => {
    try {
      const user = await User.findOne({ username });
      if (user) {
        user.profilePic = profilePic;
        await user.save();
        socket.emit("profile-pic-updated", { success: true });
      }
    } catch (err) {
      console.error("Error updating profile picture:", err);
      socket.emit("profile-pic-updated", { success: false });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
