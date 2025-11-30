// server/index.js  (REPLACE your current file with this)
const express = require('express');
const cors = require('cors');               // <-- NEW
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
app.use(cors());                            // <-- NEW (enables CORS for HTTP endpoints)

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// parse JSON for /report endpoint
app.use(express.json());

// Postgres pool — optional for MVP
const connectionString = process.env.DATABASE_URL || null;
const pool = connectionString ? new Pool({ connectionString }) : null;

// In-memory structures (simple MVP)
const online = new Map();
const waitingByGender = { any: [], male: [], female: [], other: [] };

// --- Moderation / Rate limiting config ---
const RATE_MAX = 5;      // max messages
const RATE_WINDOW = 10 * 1000; // ms window (10s)
const rateMap = new Map(); // socketId -> [timestamp1, timestamp2, ...]

// Simple profanity list (expand as needed)
const PROFANITY = ['badword1', 'badword2', 'fuck', 'shit', 'bitch'];
function filterProfanity(text){
  if(!text) return text;
  let out = text;
  for(const w of PROFANITY){
    const rx = new RegExp('\\b' + w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'ig');
    out = out.replace(rx, (m) => '★'.repeat(m.length));
  }
  return out;
}

// DB helpers
async function saveMessage(room, userId, text){
  if(!pool) return;
  try{
    await pool.query(
      'INSERT INTO messages (room_id, user_id, text, ts) VALUES ($1,$2,$3,now())',
      [room, userId, text]
    );
  }catch(err){
    console.error('saveMessage error', err);
  }
}

async function loadLastMessages(room, limit = 50){
  if(!pool) return [];
  try{
    const res = await pool.query(
      `SELECT user_id, text, extract(epoch from ts) * 1000 AS ts
       FROM messages WHERE room_id = $1 ORDER BY ts DESC LIMIT $2`,
      [room, limit]
    );
    // return in chronological order
    return res.rows.reverse().map(r => ({ userId: r.user_id, text: r.text, ts: Math.floor(r.ts) }));
  }catch(err){
    console.error('loadLastMessages error', err);
    return [];
  }
}

// reports saving
async function saveReport(report){
  if(!pool) {
    console.log('Report received (no DB):', report);
    return;
  }
  try{
    await pool.query(
      `INSERT INTO reports (reporter_id, reported_id, room_id, reason, created_at)
       VALUES ($1,$2,$3,$4,now())`,
      [report.reporterId || null, report.reportedId || null, report.roomId || null, report.reason || null]
    );
  }catch(err){
    console.error('saveReport error', err);
  }
}

// helper: check rate-limit. Returns {ok: true} or {ok:false, retryAfterMs}
function checkRate(socketId){
  const now = Date.now();
  const arr = rateMap.get(socketId) || [];
  // remove timestamps older than window
  const fresh = arr.filter(t => now - t <= RATE_WINDOW);
  if(fresh.length >= RATE_MAX){
    const oldest = fresh[0];
    const retryAfter = RATE_WINDOW - (now - oldest);
    return { ok: false, retryAfterMs: retryAfter };
  }
  // append now
  fresh.push(now);
  rateMap.set(socketId, fresh);
  return { ok: true };
}

// broadcast online users
function broadcastOnline() {
  const users = [...online.values()].map(u => ({ id: u.id, gender: u.gender, room: u.room, status: u.status, displayName: u.displayName }));
  io.emit('online:list', users);
}

// Express endpoint to receive reports from client
app.post('/report', async (req, res) => {
  try{
    const payload = req.body || {};
    // payload should include: reporterId, reportedId, roomId, reason (string)
    await saveReport(payload);
    res.json({ ok: true });
  }catch(err){
    console.error('/report error', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Socket logic
io.on('connection', socket => {
  console.log('connect', socket.id);

  socket.on('auth', async (payload = {}) => {
    const { id, gender='any', displayName='Stranger' } = payload;
    online.set(socket.id, { id: id || socket.id, gender, room: null, status: 'idle', displayName });
    socket.emit('auth:ok', { socketId: socket.id });
    broadcastOnline();
  });

  // join public room
  socket.on('join:room', async ({ room }) => {
    if (!room) return;
    socket.join(room);
    const u = online.get(socket.id); if (u) u.room = room;
    // load last messages for that room and send only to this socket
    const history = await loadLastMessages(room, 50);
    socket.emit('chat:history', history);
    io.to(room).emit('room:joined', { userId: socket.id, room });
    broadcastOnline();
  });

  socket.on('leave:room', ({ room }) => {
    socket.leave(room);
    const u = online.get(socket.id); if (u) u.room = null;
    broadcastOnline();
  });

  socket.on('room:msg', async ({ room, text }) => {
    if (!room) return;
    // rate limiting
    const rate = checkRate(socket.id);
    if(!rate.ok){
      socket.emit('rate:limit', { retryAfterMs: rate.retryAfterMs });
      return;
    }
    const clean = filterProfanity(text);
    // save & emit
    await saveMessage(room, socket.id, clean);
    io.to(room).emit('room:msg', { userId: socket.id, text: clean, ts: Date.now() });
  });

  // request random chat: { genderPref }
  socket.on('random:find', async ({ genderPref='any' } = {}) => {
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
      // Create a unique room for pair
      const room = `pair_${socket.id}_${matchSocketId}_${Date.now()}`;
      socket.join(room);
      const otherSocket = io.sockets.sockets.get(matchSocketId);
      otherSocket?.join(room);
      online.get(socket.id).status = 'chatting';
      online.get(matchSocketId).status = 'chatting';
      online.get(socket.id).room = room;
      online.get(matchSocketId).room = room;

      // load last messages for the pair room (useful if messages already exist)
      const history = await loadLastMessages(room, 50);
      // send history to both participants individually
      socket.emit('chat:history', history);
      otherSocket?.emit('chat:history', history);

      io.to(room).emit('random:matched', { room, participants: [socket.id, matchSocketId] });
      broadcastOnline();
    } else {
      waitingByGender[genderPref].push(socket.id);
      socket.emit('random:queued');
      broadcastOnline();
    }
  });

  // send message to random chat room
  socket.on('chat:msg', async ({ room, text }) => {
    if (!room) return;
    // rate limiting
    const rate = checkRate(socket.id);
    if(!rate.ok){
      socket.emit('rate:limit', { retryAfterMs: rate.retryAfterMs });
      return;
    }
    const clean = filterProfanity(text);
    // save & emit
    await saveMessage(room, socket.id, clean);
    io.to(room).emit('chat:msg', { userId: socket.id, text: clean, ts: Date.now() });
  });

  // disconnect
  socket.on('disconnect', () => {
    ['any','male','female','other'].forEach(k => {
      waitingByGender[k] = waitingByGender[k].filter(id => id !== socket.id);
    });
    online.delete(socket.id);
    io.emit('user:disconnected', { socketId: socket.id });
    broadcastOnline();
  });
});

// simple health
app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
server.listen(port, () => console.log('Server listening on', port));
