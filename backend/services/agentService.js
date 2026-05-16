/**
 * AgentService
 * Manages support agents and ticket assignment logic.
 *
 * Rules:
 *  - Billing tickets → only billing agents
 *  - Technical tickets → only technical agents
 *  - If correct agent type unavailable, ticket must wait (no queue bypass)
 */

const store = require('../models/store');
const queueService = require('./queueService');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a new agent.
 */
function createAgent({ name, specialization }) {
  const agent = {
    id: uuidv4(),
    name,
    specialization, // 'billing' | 'technical'
    isAvailable: true,
    assignedTickets: [],
    createdAt: new Date().toISOString(),
  };
  store.agents.set(agent.id, agent);
  return agent;
}

/**
 * Get all agents.
 */
function getAllAgents() {
  return [...store.agents.values()];
}

/**
 * Get agent by ID.
 */
function getAgentById(agentId) {
  return store.agents.get(agentId) || null;
}

/**
 * Update agent availability.
 */
function setAgentAvailability(agentId, isAvailable) {
  const agent = store.agents.get(agentId);
  if (!agent) return null;
  agent.isAvailable = isAvailable;
  return agent;
}

/**
 * Assign a specific ticket to a specific agent.
 * Validates specialization match.
 */
function assignTicketToAgent(ticketId, agentId) {
  const ticket = store.tickets.get(ticketId);
  const agent = store.agents.get(agentId);

  if (!ticket) return { success: false, reason: 'Ticket not found' };
  if (!agent) return { success: false, reason: 'Agent not found' };
  if (ticket.status !== 'waiting') return { success: false, reason: 'Ticket is not waiting' };

  // Specialization check
  if (ticket.type !== agent.specialization) {
    return {
      success: false,
      reason: `Ticket type '${ticket.type}' can only be handled by ${ticket.type} agents. This agent specializes in ${agent.specialization}.`,
    };
  }

  // Assign
  ticket.status = 'assigned';
  ticket.assignedAgentId = agentId;
  ticket.updatedAt = new Date().toISOString();

  agent.assignedTickets.push(ticketId);
  agent.isAvailable = false;

  // Remove from queue
  store.queue = store.queue.filter(id => id !== ticketId);
  queueService.updateQueuePositions();

  return { success: true, ticket, agent };
}

/**
 * Auto-assign: find the highest-priority waiting ticket that matches
 * an available agent. Respects queue order (no bypassing).
 */
function autoAssign() {
  const queue = queueService.getQueue(); // in priority order
  const availableAgents = [...store.agents.values()].filter(a => a.isAvailable);

  if (availableAgents.length === 0) return null;
  if (queue.length === 0) return null;

  // Find the first ticket in queue order that has a matching available agent
  for (const ticket of queue) {
    if (ticket.status !== 'waiting') continue;

    const matchingAgent = availableAgents.find(a => a.specialization === ticket.type);
    if (matchingAgent) {
      return assignTicketToAgent(ticket.id, matchingAgent.id);
    }
    // If first ticket has no matching agent, it must wait — no bypass
    // So we stop here (queue order must not be violated)
    break;
  }

  return null;
}

/**
 * Complete an assigned ticket and free the agent.
 */
function completeAssignment(ticketId) {
  const ticket = store.tickets.get(ticketId);
  if (!ticket) return { success: false, reason: 'Ticket not found' };

  const agentId = ticket.assignedAgentId;
  const agent = store.agents.get(agentId);

  ticket.status = 'completed';
  ticket.updatedAt = new Date().toISOString();

  if (agent) {
    agent.assignedTickets = agent.assignedTickets.filter(id => id !== ticketId);
    if (agent.assignedTickets.length === 0) {
      agent.isAvailable = true;
    }
  }

  return { success: true, ticket, agent };
}

/**
 * Delete an agent.
 */
function deleteAgent(agentId) {
  const agent = store.agents.get(agentId);
  if (!agent) return false;
  store.agents.delete(agentId);
  return true;
}

module.exports = {
  createAgent,
  getAllAgents,
  getAgentById,
  setAgentAvailability,
  assignTicketToAgent,
  autoAssign,
  completeAssignment,
  deleteAgent,
};