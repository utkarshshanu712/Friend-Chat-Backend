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
  { username: 'utkarsh', password: '@@@Abc123' },
  { username: 'vishal', password: 'vishal8544' },
  { username: 'user2', password: 'kilo456' },
  { username: 'user3', password: 'nano789' }
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

// Initialize users on server start
initializeUsers();

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
  
  socket.on("auth", async ({ username, password }) => {
    try {
      const user = await User.findOne({ username, password });
      if (user) {
        activeUsers.set(socket.id, username);
        socket.emit("auth-success", { username });
        io.emit("users-update", Array.from(activeUsers.values()));

        try {
          const messages = await Message.find()
            .sort({ timestamp: -1 })
            .limit(100);
          socket.emit("message-history", messages.reverse());
        } catch (err) {
          console.error("MongoDB error:", err);
          socket.emit("use-local-storage");
        }
      } else {
        // Check against default users if MongoDB fails
        const defaultUser = defaultUsers.find(
          u => u.username === username && u.password === password
        );
        if (defaultUser) {
          activeUsers.set(socket.id, username);
          socket.emit("auth-success", { username });
          io.emit("users-update", Array.from(activeUsers.values()));
          socket.emit("use-local-storage");
        } else {
          socket.emit("auth-failed");
        }
      }
    } catch (err) {
      console.error("Auth error:", err);
      // Fallback to default users
      const defaultUser = defaultUsers.find(
        u => u.username === username && u.password === password
      );
      if (defaultUser) {
        activeUsers.set(socket.id, username);
        socket.emit("auth-success", { username });
        io.emit("users-update", Array.from(activeUsers.values()));
        socket.emit("use-local-storage");
      } else {
        socket.emit("auth-failed");
      }
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
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
