/**
 * Ticket Routes
 * POST /api/tickets       - Create a new support ticket
 * GET  /api/tickets       - Get all tickets
 * GET  /api/tickets/:id   - Get a specific ticket
 * POST /api/tickets/:id/heartbeat - Send heartbeat
 * POST /api/tickets/:id/complete  - Complete a ticket
 * DELETE /api/tickets/:id - Remove a ticket
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const store = require('../models/store');
const queueService = require('../services/queueService');
const heartbeatService = require('../services/heartbeatService');
const socketHandler = require('../socket/socketHandler');

// POST /api/tickets - Create ticket
router.post('/', (req, res) => {
  const { customerName, customerId, type, description, priority } = req.body;

  if (!customerName || !type || !description) {
    return res.status(400).json({ error: 'customerName, type, and description are required' });
  }

  if (!['billing', 'technical'].includes(type)) {
    return res.status(400).json({ error: "type must be 'billing' or 'technical'" });
  }

  const initialPriority = parseInt(priority) || 1;

  const ticket = {
    id: uuidv4(),
    customerId: customerId || uuidv4(),
    customerName,
    type,
    description,
    priority: initialPriority,
    initialPriority,
    displacementCount: 0,
    status: 'waiting',
    assignedAgentId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    queuePosition: null,
  };

  queueService.enqueue(ticket);
  heartbeatService.registerTicket(ticket.id);

  // Emit real-time events
  socketHandler.emit('ticket:created', { ticket });
  socketHandler.emitQueueUpdate();

  console.log(`[Ticket] Created: ${ticket.id} | Type: ${ticket.type} | Customer: ${ticket.customerName}`);

  res.status(201).json({ success: true, ticket });
});

// GET /api/tickets - All tickets
router.get('/', (req, res) => {
  const { status, type } = req.query;
  let tickets = [...store.tickets.values()];

  if (status) tickets = tickets.filter(t => t.status === status);
  if (type) tickets = tickets.filter(t => t.type === type);

  res.json({ success: true, tickets, count: tickets.length });
});

// GET /api/tickets/queue - Get ordered queue
router.get('/queue', (req, res) => {
  const queue = queueService.getQueue();
  res.json({ success: true, queue, count: queue.length });
});

// GET /api/tickets/:id - Get one ticket
router.get('/:id', (req, res) => {
  const ticket = store.tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  res.json({ success: true, ticket });
});

// POST /api/tickets/:id/heartbeat - Record heartbeat
router.post('/:id/heartbeat', (req, res) => {
  const ok = heartbeatService.recordHeartbeat(req.params.id);
  if (!ok) {
    return res.status(404).json({ error: 'Ticket not found or not active' });
  }
  res.json({ success: true, ticketId: req.params.id, timestamp: Date.now() });
});

// POST /api/tickets/:id/complete - Complete a ticket
router.post('/:id/complete', (req, res) => {
  const ticket = store.tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const completed = queueService.completeTicket(req.params.id);
  heartbeatService.unregisterTicket(req.params.id);

  socketHandler.emit('ticket:completed', { ticket: completed });
  socketHandler.emitQueueUpdate();

  res.json({ success: true, ticket: completed });
});

// DELETE /api/tickets/:id
router.delete('/:id', (req, res) => {
  const ticket = store.tickets.get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  queueService.removeFromQueue(req.params.id);
  heartbeatService.unregisterTicket(req.params.id);

  socketHandler.emit('ticket:removed', { ticketId: req.params.id });
  socketHandler.emitQueueUpdate();

  res.json({ success: true, message: 'Ticket removed' });
});

module.exports = router;