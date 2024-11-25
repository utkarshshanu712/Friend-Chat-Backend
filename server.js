const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["https://chat220.netlify.app", "http://localhost:5173"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const activeUsers = new Map();

const authenticateUser = (password) => {
  return password === process.env.CHAT_PASSWORD;
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('auth', ({ username, password }) => {
    if (authenticateUser(password)) {
      activeUsers.set(socket.id, username);
      io.emit('users-update', Array.from(activeUsers.values()));
      socket.emit('auth-success');
    } else {
      socket.emit('auth-failed');
    }
  });

  socket.on('send-message', (message) => {
    const username = activeUsers.get(socket.id);
    if (username) {
      io.emit('receive-message', {
        message,
        username,
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
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
