/**
 * HeartbeatService
 * Monitors active tickets. If a ticket stops sending heartbeats,
 * it is removed from the queue automatically.
 */

const store = require('../models/store');
const queueService = require('./queueService');

const HEARTBEAT_TIMEOUT = parseInt(process.env.HEARTBEAT_TIMEOUT) || 30000; // 30 seconds default

let heartbeatCheckInterval = null;
let onTicketExpired = null; // callback to emit socket events

/**
 * Record a heartbeat for a ticket.
 */
function recordHeartbeat(ticketId) {
  const ticket = store.tickets.get(ticketId);
  if (!ticket || ticket.status !== 'waiting') return false;

  store.heartbeats.set(ticketId, Date.now());
  return true;
}

/**
 * Check for expired tickets and remove them from queue.
 */
function checkExpiredTickets() {
  const now = Date.now();
  const expired = [];

  for (const [ticketId, lastBeat] of store.heartbeats.entries()) {
    const ticket = store.tickets.get(ticketId);
    if (!ticket || ticket.status !== 'waiting') {
      store.heartbeats.delete(ticketId);
      continue;
    }

    if (now - lastBeat > HEARTBEAT_TIMEOUT) {
      expired.push(ticketId);
    }
  }

  for (const ticketId of expired) {
    store.heartbeats.delete(ticketId);
    const removed = queueService.removeFromQueue(ticketId);
    if (removed && onTicketExpired) {
      const ticket = store.tickets.get(ticketId);
      onTicketExpired(ticketId, ticket);
    }
  }

  return expired;
}

/**
 * Register a ticket for heartbeat monitoring.
 */
function registerTicket(ticketId) {
  store.heartbeats.set(ticketId, Date.now());
}

/**
 * Unregister a ticket from heartbeat monitoring.
 */
function unregisterTicket(ticketId) {
  store.heartbeats.delete(ticketId);
}

/**
 * Start the heartbeat checker loop.
 */
function startMonitoring(expiredCallback) {
  onTicketExpired = expiredCallback;
  if (heartbeatCheckInterval) clearInterval(heartbeatCheckInterval);
  heartbeatCheckInterval = setInterval(checkExpiredTickets, 5000); // check every 5s
  console.log(`[Heartbeat] Monitoring started. Timeout: ${HEARTBEAT_TIMEOUT}ms`);
}

/**
 * Stop the heartbeat checker loop.
 */
function stopMonitoring() {
  if (heartbeatCheckInterval) {
    clearInterval(heartbeatCheckInterval);
    heartbeatCheckInterval = null;
  }
}

/**
 * Get all active heartbeat entries.
 */
function getHeartbeats() {
  const result = {};
  for (const [id, ts] of store.heartbeats.entries()) {
    result[id] = { lastBeat: ts, age: Date.now() - ts };
  }
  return result;
}

module.exports = {
  recordHeartbeat,
  registerTicket,
  unregisterTicket,
  startMonitoring,
  stopMonitoring,
  getHeartbeats,
};