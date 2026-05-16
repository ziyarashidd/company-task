/**
 * Main Entry Point - Real-Time Intelligent Support Queue System
 * Backend: Node.js + Express + Socket.io
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const ticketRoutes = require('./routes/ticketRoutes');
const agentRoutes = require('./routes/agentRoutes');
const socketHandler = require('./socket/socketHandler');

const PORT = process.env.PORT || 5000;

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── Socket.io Setup ──────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/tickets', ticketRoutes);
app.use('/api/agents', agentRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Initialize Socket ────────────────────────────────────────────────────────
socketHandler.initSocket(io);

// ─── Seed Demo Data ───────────────────────────────────────────────────────────
function seedDemoData() {
  const agentService = require('./services/agentService');

  agentService.createAgent({ name: 'Alice Johnson', specialization: 'billing' });
  agentService.createAgent({ name: 'Bob Smith', specialization: 'technical' });
  agentService.createAgent({ name: 'Carol White', specialization: 'billing' });
  agentService.createAgent({ name: 'David Lee', specialization: 'technical' });

  console.log('[Seed] Demo agents created');
}

// ─── Start Server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 Support Queue Backend running on port ${PORT}`);
  console.log(`   HTTP: http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
  seedDemoData();
});

module.exports = { app, server };