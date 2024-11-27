import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import mongoose from "mongoose";
import multer from "multer";
import path from "path";
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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (req.url.includes("profile-pic")) {
      cb(null, "uploads/profile-pics/");
    } else {
      cb(null, "uploads/attachments/");
    }
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// Monitor database size
async function checkDatabaseSize() {
  const stats = await mongoose.connection.db.stats();
  const sizeInMB = stats.dataSize / (1024 * 1024);

  if (sizeInMB > 350) {
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
  { username: "user2", password: "user456" },
  { username: "user3", password: "user789" },
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
      username: { $nin: defaultUsers.map((user) => user.username) },
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
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST");
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

// Add this route before socket.io setup
app.get("/users", async (req, res) => {
  try {
    const users = await User.find({}, "username");
    res.json(users.map((user) => ({ username: user.username })));
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Profile Picture Upload
app.post("/api/user/profile-pic", upload.single("profilePic"), async (req, res) => {
  const { username } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const user = await User.findOneAndUpdate(
      { username },
      { profilePic: `/uploads/profile-pics/${req.file.filename}` },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ imageUrl: `/uploads/profile-pics/${req.file.filename}` });
  } catch (error) {
    res.status(500).json({ error: "Failed to upload profile picture" });
  }
});

// File Attachment Upload
app.post("/api/messages/upload", upload.single("file"), async (req, res) => {
  const { sender, chatId } = req.body;

  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const newMessage = new Message({
      sender,
      chatId,
      isFile: true,
      fileData: {
        name: req.file.originalname,
        type: req.file.mimetype,
        data: `/uploads/attachments/${req.file.filename}`,
        size: req.file.size,
      },
      timestamp: new Date(),
    });

    await newMessage.save();
    res.json({ success: true, message: newMessage });
  } catch (error) {
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// Add this function at the top
function createChatId(user1, user2) {
  return [user1, user2].sort().join("_");
}

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Profile Picture Update via Socket
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

  // File Attachment Broadcast via Socket
  socket.on("send-file", async (fileData) => {
    const sender = activeUsers.get(socket.id);
    if (sender) {
      try {
        // Check if the file has already been sent (prevent duplicates)
        const existingMessage = await Message.findOne({ "fileData.data": fileData.data });
        if (existingMessage) {
          console.log("Duplicate message detected, skipping save.");
          return;
        }

        const newMessage = new Message({
          sender,
          isFile: true,
          fileData,
          timestamp: new Date(),
        });

        await newMessage.save();
        io.emit("receive-file", newMessage);
      } catch (err) {
        console.error("Error saving file message:", err);
        socket.emit("file-upload-failed");
      }
    }
  });

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
  socket.on("send-message", async (message) => {
    const sender = activeUsers.get(socket.id);
    if (sender) {
      try {
        const chatId = message.receiver
          ? createChatId(sender, message.receiver)
          : "broadcast";

        // Check for duplicate message
        const existingMessage = await Message.findOne({ chatId, message: message.message });
        if (existingMessage) {
          console.log("Duplicate message detected, skipping save.");
          return;
        }

        const newMessage = new Message({
          sender,
          receiver: message.receiver || null,
          message: message.message,
          chatId,
          timestamp: new Date(),
        });

        await newMessage.save();
        const messageToSend = newMessage.toObject();

        if (message.receiver) {
          // Find receiver's socket
          const receiverSocket = Array.from(activeUsers.entries()).find(
            ([_, username]) => username === message.receiver
          )?.[0];

          if (receiverSocket) {
            io.to(receiverSocket).emit("receive-message", messageToSend);
          }
          // Send to sender
          socket.emit("receive-message", messageToSend);
        } else {
          // Broadcast message
          io.emit("receive-message", messageToSend);
        }
      } catch (err) {
        console.error("Failed to save message:", err);
        socket.emit("message-error", { error: "Failed to send message" });
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

// Add endpoint to get chat history
app.get('/api/messages/:chatId', async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.chatId })
      .sort({ timestamp: 1 })
      .limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
