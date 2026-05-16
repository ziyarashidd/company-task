/**
 * Agent Routes
 * POST /api/agents                          - Create agent
 * GET  /api/agents                          - Get all agents
 * GET  /api/agents/:id                      - Get one agent
 * PATCH /api/agents/:id/availability        - Set available/busy
 * POST /api/agents/:id/assign/:ticketId     - Assign ticket to agent
 * POST /api/agents/auto-assign              - Auto assign next ticket
 * POST /api/agents/:id/complete/:ticketId   - Complete assignment
 * DELETE /api/agents/:id                    - Delete agent
 */

const express = require('express');
const router = express.Router();
const agentService = require('../services/agentService');
const socketHandler = require('../socket/socketHandler');

// POST /api/agents
router.post('/', (req, res) => {
  const { name, specialization } = req.body;

  if (!name || !specialization) {
    return res.status(400).json({ error: 'name and specialization are required' });
  }
  if (!['billing', 'technical'].includes(specialization)) {
    return res.status(400).json({ error: "specialization must be 'billing' or 'technical'" });
  }

  const agent = agentService.createAgent({ name, specialization });
  socketHandler.emitAgentsUpdate();

  res.status(201).json({ success: true, agent });
});

// GET /api/agents
router.get('/', (req, res) => {
  const agents = agentService.getAllAgents();
  res.json({ success: true, agents, count: agents.length });
});

// GET /api/agents/:id
router.get('/:id', (req, res) => {
  const agent = agentService.getAgentById(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json({ success: true, agent });
});

// PATCH /api/agents/:id/availability
router.patch('/:id/availability', (req, res) => {
  const { isAvailable } = req.body;
  if (typeof isAvailable !== 'boolean') {
    return res.status(400).json({ error: 'isAvailable must be a boolean' });
  }

  const agent = agentService.setAgentAvailability(req.params.id, isAvailable);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  socketHandler.emitAgentsUpdate();
  res.json({ success: true, agent });
});

// POST /api/agents/:id/assign/:ticketId
router.post('/:id/assign/:ticketId', (req, res) => {
  const result = agentService.assignTicketToAgent(req.params.ticketId, req.params.id);

  if (!result.success) {
    return res.status(400).json({ error: result.reason });
  }

  socketHandler.emit('ticket:assigned', { ticket: result.ticket, agent: result.agent });
  socketHandler.emitQueueUpdate();
  socketHandler.emitAgentsUpdate();

  res.json({ success: true, ticket: result.ticket, agent: result.agent });
});

// POST /api/agents/auto-assign
router.post('/auto-assign', (req, res) => {
  const result = agentService.autoAssign();

  if (!result) {
    return res.json({ success: false, message: 'No matching tickets or agents available' });
  }
  if (!result.success) {
    return res.status(400).json({ error: result.reason });
  }

  socketHandler.emit('ticket:assigned', { ticket: result.ticket, agent: result.agent });
  socketHandler.emitQueueUpdate();
  socketHandler.emitAgentsUpdate();

  res.json({ success: true, ticket: result.ticket, agent: result.agent });
});

// POST /api/agents/:id/complete/:ticketId
router.post('/:id/complete/:ticketId', (req, res) => {
  const result = agentService.completeAssignment(req.params.ticketId);

  if (!result.success) {
    return res.status(400).json({ error: result.reason });
  }

  socketHandler.emit('ticket:completed', { ticket: result.ticket, agent: result.agent });
  socketHandler.emitQueueUpdate();
  socketHandler.emitAgentsUpdate();

  res.json({ success: true, ticket: result.ticket, agent: result.agent });
});

// DELETE /api/agents/:id
router.delete('/:id', (req, res) => {
  const deleted = agentService.deleteAgent(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Agent not found' });

  socketHandler.emitAgentsUpdate();
  res.json({ success: true, message: 'Agent deleted' });
});

module.exports = router;