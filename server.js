import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Message } from "./models/Message.js";
import { User } from "./models/User.js";
import cors from "cors";

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "https://chat220.netlify.app"],
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 52428800, // 50MB in bytes
});

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
  { username: "Utkarsh", password: "@@@Abc123" },
  { username: "Vishal", password: "vishal8544" },
  { username: "Shubham", password: "Shubham456" },
  { username: "user3", password: "user789" },
];

// Initialize default users
async function initializeUsers() {
  for (const user of defaultUsers) {
    try {
      await User.findOneAndUpdate({ username: user.username }, user, {
        upsert: true,
      });
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
        $nin: defaultUsers.map((user) => user.username),
      },
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

app.use(
  cors({
    origin: ["https://chat220.netlify.app", "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true,
  })
);

// Add headers middleware for additional CORS support
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://chat220.netlify.app");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST");
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

// Add this route before socket.io setup
app.get("/users", async (req, res) => {
  try {
    const users = await User.find({}, 'username profilePic');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Add this function at the top
function createChatId(user1, user2) {
  return [user1, user2].sort().join("_");
}

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Event to delete a message
  socket.on("delete-message", async ({ messageId }) => {
    const username = activeUsers.get(socket.id);
    if (username) {
      try {
        const message = await Message.findById(messageId);
        if (
          message &&
          (message.sender === username || message.receiver === username)
        ) {
          // Perform hard delete
          await Message.findByIdAndDelete(messageId);

          // Notify all clients to remove the message completely
          io.emit("message-deleted", { messageId });
        } else {
          socket.emit("delete-failed", {
            error: "Unauthorized to delete this message",
          });
        }
      } catch (err) {
        console.error("Error deleting message:", err);
        socket.emit("delete-failed", {
          error: "An error occurred during deletion",
        });
      }
    }
  });

  socket.on("auth", async ({ username, password }) => {
    try {
      const user = await User.findOne({ username });
      if (user && user.password === password) {
        activeUsers.set(socket.id, username);
        socket.emit("auth-success", { username });
        io.emit("users-update", Array.from(activeUsers.values()));

        // Send broadcast message history
        const broadcastMessages = await Message.find({ chatId: "broadcast" })
          .sort({ timestamp: -1 })
          .limit(100);
        socket.emit("message-history", broadcastMessages.reverse());
      } else {
        socket.emit("auth-failed");
      }
    } catch (err) {
      console.error("Auth error:", err);
      socket.emit("auth-failed");
    }
  });

  // Update the message handler
  socket.on("send-message", async (messageData) => {
    try {
      // Create new message document
      const message = new Message({
        sender: messageData.sender,
        receiver: messageData.receiver,
        message: messageData.message,
        isFile: messageData.isFile || false,
        fileData: messageData.fileData || {},
        chatId: messageData.chatId,
        timestamp: messageData.timestamp
      });

      // Save message to database
      await message.save();

      // Emit to appropriate recipients
      if (messageData.receiver) {
        // Private message
        const receiverSocket = activeUsers.get(messageData.receiver);
        if (receiverSocket) {
          io.to(receiverSocket).emit("receive-message", message);
        }
        socket.emit("receive-message", message);
      } else {
        // Broadcast message
        io.emit("receive-message", message);
      }
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  socket.on("send-file", async (fileData) => {
    const sender = activeUsers.get(socket.id);
    if (sender) {
      try {
        const newMessage = new Message({
          sender,
          isFile: true,
          fileData,
          timestamp: new Date(),
        });
        await newMessage.save();

        io.emit("receive-file", {
          _id: newMessage._id,
          sender,
          fileData,
          isFile: true,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Error saving file message:", err);
        socket.emit("file-upload-failed");
      }
    }
  });

  socket.on("disconnect", () => {
    activeUsers.delete(socket.id);
    io.emit("users-update", Array.from(activeUsers.values()));
  });

  // Password change handler
  socket.on(
    "change-password",
    async ({ username, oldPassword, newPassword }) => {
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
    }
  );

  // Private message handler
  socket.on("private-message", async ({ receiver, message }) => {
    const sender = activeUsers.get(socket.id);
    if (sender) {
      const newMessage = new Message({
        sender,
        receiver,
        message,
        isRead: false,
        readBy: [sender],
      });
      await newMessage.save();

      // Find receiver's socket
      const receiverSocket = Array.from(activeUsers.entries()).find(
        ([_, username]) => username === receiver
      )?.[0];

      if (receiverSocket) {
        io.to(receiverSocket).emit("receive-private-message", {
          sender,
          message,
          timestamp: new Date().toISOString(),
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
        const senderSocket = Array.from(activeUsers.entries()).find(
          ([_, username]) => username === message.sender
        )?.[0];

        if (senderSocket) {
          io.to(senderSocket).emit("message-read", {
            messageId,
            reader,
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
        // Validate that it's an image data URL
        if (!profilePic.startsWith('data:image/')) {
          socket.emit("profile-pic-updated", { 
            success: false, 
            error: "Invalid image format" 
          });
          return;
        }

        user.profilePic = profilePic;
        await user.save();
        
        // Emit success event with the updated profile pic
        socket.emit("profile-pic-updated", { 
          success: true, 
          profilePic: profilePic 
        });
        
        // Broadcast profile pic update to other users
        socket.broadcast.emit("user-profile-updated", {
          username,
          profilePic
        });
      }
    } catch (err) {
      console.error("Error updating profile picture:", err);
      socket.emit("profile-pic-updated", { 
        success: false, 
        error: "Server error" 
      });
    }
  });

  socket.on("mark-messages-read", async ({ chatId, reader }) => {
    try {
      await Message.updateMany(
        { 
          chatId,
          readBy: { $ne: reader }
        },
        { 
          $addToSet: { readBy: reader },
          isRead: true
        }
      );
    } catch (err) {
      console.error("Error marking messages as read:", err);
    }
  });
});

// Add endpoint to get chat history
app.get("/api/messages/:chatId", async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId })
      .sort({ timestamp: 1 })
      .limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// 