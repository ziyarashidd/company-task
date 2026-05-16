/**
 * Socket Handler
 * Manages all real-time WebSocket events using Socket.io.
 *
 * Events emitted to clients:
 *  - queue:update       → full queue array updated
 *  - ticket:created     → new ticket added
 *  - ticket:assigned    → ticket assigned to agent
 *  - ticket:completed   → ticket completed
 *  - ticket:expired     → ticket removed due to heartbeat timeout
 *  - priority:updated   → priorities incremented
 *  - agents:update      → agents list updated
 *
 * Events received from clients:
 *  - heartbeat          → { ticketId }
 *  - subscribe:ticket   → { ticketId } — subscribe to a specific ticket's updates
 */

const heartbeatService = require('../services/heartbeatService');
const queueService = require('../services/queueService');
const agentService = require('../services/agentService');
const priorityScheduler = require('../services/priorityScheduler');

let io = null;

function initSocket(socketIo) {
  io = socketIo;

  // Start heartbeat monitoring; callback fires on ticket expiry
  heartbeatService.startMonitoring((ticketId, ticket) => {
    emitQueueUpdate();
    io.emit('ticket:expired', { ticketId, ticket });
    console.log(`[Socket] Ticket expired due to inactivity: ${ticketId}`);
  });

  // Start priority scheduler; callback fires on priority increments
  priorityScheduler.startScheduler((updatedQueue) => {
    io.emit('priority:updated', { queue: updatedQueue });
    io.emit('queue:update', { queue: updatedQueue });
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Send current state on connect
    socket.emit('queue:update', { queue: queueService.getQueue() });
    socket.emit('agents:update', { agents: agentService.getAllAgents() });

    // Heartbeat from customer mobile app
    socket.on('heartbeat', ({ ticketId }) => {
      const ok = heartbeatService.recordHeartbeat(ticketId);
      socket.emit('heartbeat:ack', { ticketId, ok, timestamp: Date.now() });
    });

    // Subscribe to a specific ticket's room
    socket.on('subscribe:ticket', ({ ticketId }) => {
      socket.join(`ticket:${ticketId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[Socket] Socket.io initialized');
}

/**
 * Emit queue update to all connected clients.
 */
function emitQueueUpdate() {
  if (!io) return;
  io.emit('queue:update', { queue: queueService.getQueue() });
}

/**
 * Emit agents update to all connected clients.
 */
function emitAgentsUpdate() {
  if (!io) return;
  io.emit('agents:update', { agents: agentService.getAllAgents() });
}

/**
 * Emit a custom event to all clients.
 */
function emit(event, data) {
  if (!io) return;
  io.emit(event, data);
}

/**
 * Emit event to a specific ticket room.
 */
function emitToTicket(ticketId, event, data) {
  if (!io) return;
  io.to(`ticket:${ticketId}`).emit(event, data);
}

module.exports = {
  initSocket,
  emitQueueUpdate,
  emitAgentsUpdate,
  emit,
  emitToTicket,
};