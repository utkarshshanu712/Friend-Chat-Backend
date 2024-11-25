import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "https://chat220.netlify.app"],
    methods: ["GET", "POST"]
  }
});

const CHAT_PASSWORD = process.env.CHAT_PASSWORD || 'test123';
const PORT = process.env.PORT || 5000;

const activeUsers = new Map();

io.on('connection', (socket) => {
  socket.on('auth', ({ username, password }) => {
    if (password === CHAT_PASSWORD) {
      activeUsers.set(socket.id, username);
      socket.emit('auth-success');
      io.emit('users-update', Array.from(activeUsers.values()));
    } else {
      socket.emit('auth-failed');
    }
  });

  socket.on('send-message', (message) => {
    const username = activeUsers.get(socket.id);
    if (username) {
      io.emit('receive-message', {
        username,
        message,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('send-file', (fileData) => {
    const username = activeUsers.get(socket.id);
    if (username) {
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
