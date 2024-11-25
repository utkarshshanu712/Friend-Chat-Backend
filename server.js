import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Message } from './models/Message.js';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "https://chat220.netlify.app"],
    methods: ["GET", "POST"]
  }
});

const CHAT_PASSWORD = process.env.CHAT_PASSWORD || "(Mz@@@000)";
const PORT = process.env.PORT || 5000;

const activeUsers = new Map();

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Monitor database size
async function checkDatabaseSize() {
  const stats = await mongoose.connection.db.stats();
  const sizeInMB = stats.dataSize / (1024 * 1024);
  
  if (sizeInMB > 350) { // Clean up when approaching 400MB
    const oldestMessages = await Message.find()
      .sort({ timestamp: 1 })
      .limit(100);
    
    if (oldestMessages.length > 0) {
      await Message.deleteMany({
        _id: { $in: oldestMessages.map(m => m._id) }
      });
    }
  }
}

// Check size every hour
setInterval(checkDatabaseSize, 3600000);

io.on('connection', (socket) => {
  socket.on('auth', ({ username, password }) => {
    if (password === CHAT_PASSWORD) {
      activeUsers.set(socket.id, username);
      socket.emit('auth-success');
      io.emit('users-update', Array.from(activeUsers.values()));
      
      // Load last 50 messages
      Message.find()
        .sort({ timestamp: -1 })
        .limit(50)
        .then(messages => {
          socket.emit('message-history', messages.reverse());
        });
    } else {
      socket.emit('auth-failed');
    }
  });

  socket.on('send-message', async (message) => {
    const username = activeUsers.get(socket.id);
    if (username) {
      const newMessage = new Message({
        username,
        message,
        isFile: false
      });
      await newMessage.save();
      io.emit('receive-message', {
        username,
        message,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('send-file', async (fileData) => {
    const username = activeUsers.get(socket.id);
    if (username) {
      const newMessage = new Message({
        username,
        isFile: true,
        fileData
      });
      await newMessage.save();
      io.emit('receive-file', {
        ...fileData,
        username,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('disconnect', () => {
    activeUsers.delete(socket.id);
    io.emit('users-update', Array.from(activeUsers.values()));
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
