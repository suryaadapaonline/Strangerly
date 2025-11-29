// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: '*' } });

const connectionString = process.env.DATABASE_URL || null;
const pool = connectionString ? new Pool({ connectionString }) : null;

const online = new Map();
const waitingByGender = { any: [], male: [], female: [], other: [] };

function broadcastOnline() {
  const users = [...online.values()].map(u => ({
    id: u.id, gender: u.gender, room: u.room, status: u.status, displayName: u.displayName
  }));
  io.emit('online:list', users);
}

io.on('connection', (socket) => {
  socket.on('auth', (payload = {}) => {
    const { id = null, gender = 'any', displayName = 'Stranger' } = payload;
    const userId = id || socket.id;
    online.set(socket.id, { id: userId, gender, room: null, status: 'idle', displayName });
    socket.emit('auth:ok', { socketId: socket.id, userId });
    broadcastOnline();
  });

  socket.on('join:room', ({ room }) => {
    if (!room) return;
    socket.join(room);
    const u = online.get(socket.id);
    if (u) u.room = room;
    io.to(room).emit('room:joined', { userId: socket.id, room });
    broadcastOnline();
  });

  socket.on('leave:room', ({ room }) => {
    socket.leave(room);
    const u = online.get(socket.id);
    if (u) u.room = null;
    broadcastOnline();
  });

  socket.on('room:msg', ({ room, text }) => {
    if (!room) return;
    io.to(room).emit('room:msg', { userId: socket.id, text, ts: Date.now() });
  });

  socket.on('random:find', ({ genderPref = 'any' } = {}) => {
    const me = online.get(socket.id);
    if (!me) return;
    me.status = 'waiting';
    const queue = waitingByGender[genderPref] || waitingByGender.any;
    let matchSocketId = null;
    while (queue.length) {
      const candidate = queue.shift();
      if (candidate !== socket.id && online.has(candidate) && online.get(candidate).status === 'waiting') {
        matchSocketId = candidate;
        break;
      }
    }
    if (matchSocketId) {
      const room = `pair_${socket.id}_${matchSocketId}_${Date.now()}`;
      socket.join(room);
      io.sockets.sockets.get(matchSocketId)?.join(room);
      online.get(socket.id).status = 'chatting';
      online.get(matchSocketId).status = 'chatting';
      online.get(socket.id).room = room;
      online.get(matchSocketId).room = room;
      io.to(room).emit('random:matched', { room, participants: [socket.id, matchSocketId] });
      broadcastOnline();
    } else {
      waitingByGender[genderPref].push(socket.id);
      socket.emit('random:queued');
      broadcastOnline();
    }
  });

  socket.on('chat:msg', ({ room, text }) => {
    if (!room) return;
    io.to(room).emit('chat:msg', { userId: socket.id, text, ts: Date.now() });
  });

  socket.on('disconnect', () => {
    ['any','male','female','other'].forEach(k => {
      waitingByGender[k] = waitingByGender[k].filter(id => id !== socket.id);
    });
    online.delete(socket.id);
    io.emit('user:disconnected', { socketId: socket.id });
    broadcastOnline();
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
server.listen(port, () => console.log('Server listening on', port));