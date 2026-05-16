/**
 * QueueService
 * Core business logic for the ticket queue system.
 *
 * Priority Rules:
 *  - Higher priority number = higher urgency = earlier in queue
 *  - Priority auto-increments every PRIORITY_INCREMENT_INTERVAL ms
 *  - Equal priority: earlier ticket stays ahead (FIFO tiebreak)
 *  - Displacement limit: ticket cannot be pushed back more than 3 times
 */

const store = require('../models/store');

const PRIORITY_INCREMENT_VALUE = parseInt(process.env.PRIORITY_INCREMENT_VALUE) || 5;

/**
 * Sort comparator: higher priority first; ties broken by createdAt (earlier first).
 */
function compareTickets(idA, idB) {
  const a = store.tickets.get(idA);
  const b = store.tickets.get(idB);
  if (!a || !b) return 0;
  if (b.priority !== a.priority) return b.priority - a.priority; // descending priority
  return new Date(a.createdAt) - new Date(b.createdAt);          // ascending time
}

/**
 * Rebuild the queue array from scratch, respecting displacement locks.
 * Tickets with displacementCount >= 3 are "locked" and cannot move backward.
 */
function rebuildQueue() {
  const waitingTicketIds = [...store.tickets.entries()]
    .filter(([, t]) => t.status === 'waiting')
    .map(([id]) => id);

  // Separate locked vs free tickets
  const locked = [];
  const free = [];

  for (const id of waitingTicketIds) {
    const t = store.tickets.get(id);
    if (t.displacementCount >= 3) {
      locked.push(id);
    } else {
      free.push(id);
    }
  }

  // Sort free tickets by priority
  free.sort(compareTickets);
  locked.sort(compareTickets);

  // Merge: locked tickets keep their relative positions from the old queue
  // Strategy: rebuild queue with locked tickets pinned at their last positions,
  // then fill gaps with free tickets sorted by priority.
  const oldQueue = store.queue.filter(id => waitingTicketIds.includes(id));

  // Build a new queue: for each slot, if the old ticket is locked keep it,
  // otherwise pull the next highest-priority free ticket.
  const newQueue = [];
  const freeCopy = [...free]; // we'll consume this

  for (const oldId of oldQueue) {
    const t = store.tickets.get(oldId);
    if (t && t.displacementCount >= 3) {
      newQueue.push(oldId); // locked: stays in place
    }
    // if it's free, it will be placed by priority below
  }

  // Now re-insert free tickets around locked ones by priority
  // Simpler approach: treat locked as anchors at their current relative positions
  // and interleave free tickets before/between/after them by priority.
  // For clarity & correctness, we use this straightforward merge:
  const result = buildMergedQueue(locked, free, oldQueue);

  store.queue = result;
  updateQueuePositions();
  return store.queue;
}

/**
 * Build merged queue: free tickets sorted by priority are inserted,
 * but locked tickets cannot move backward relative to their previous order.
 */
function buildMergedQueue(lockedIds, freeIds, oldQueue) {
  // Get old positions of locked tickets
  const lockedOldPositions = lockedIds.map(id => ({
    id,
    oldPos: oldQueue.indexOf(id),
  })).sort((a, b) => a.oldPos - b.oldPos);

  // We'll do a sweep: place free tickets by priority, inserting locked tickets
  // at their relative positions.
  const result = [];
  const sortedFree = [...freeIds].sort(compareTickets);
  let freeIdx = 0;
  let lockedIdx = 0;
  let totalSlots = sortedFree.length + lockedOldPositions.length;

  for (let i = 0; i < totalSlots; i++) {
    // Check if next locked ticket should go here (based on old relative ordering)
    const nextLocked = lockedOldPositions[lockedIdx];
    const nextFree = sortedFree[freeIdx];

    if (!nextLocked && nextFree) {
      result.push(nextFree);
      freeIdx++;
    } else if (nextLocked && !nextFree) {
      result.push(nextLocked.id);
      lockedIdx++;
    } else if (nextLocked && nextFree) {
      // Compare: locked keeps its position relative to other locked tickets
      // Free ticket goes before locked if its priority is higher
      const lockedTicket = store.tickets.get(nextLocked.id);
      const freeTicket = store.tickets.get(nextFree);
      if (lockedTicket && freeTicket && freeTicket.priority > lockedTicket.priority) {
        result.push(nextFree);
        freeIdx++;
      } else {
        result.push(nextLocked.id);
        lockedIdx++;
      }
    }
  }

  return result;
}

/**
 * Update the queuePosition field on each ticket.
 */
function updateQueuePositions() {
  store.queue.forEach((id, idx) => {
    const ticket = store.tickets.get(id);
    if (ticket) {
      ticket.queuePosition = idx + 1;
      ticket.updatedAt = new Date().toISOString();
    }
  });
}

/**
 * Add a new ticket to the queue.
 */
function enqueue(ticket) {
  store.tickets.set(ticket.id, ticket);

  // Insert into queue at correct priority position
  store.queue.push(ticket.id);
  rebuildQueue();

  return ticket;
}

/**
 * Increment priority for all waiting tickets.
 * Called on a timer.
 */
function incrementPriorities() {
  let changed = false;
  for (const [, ticket] of store.tickets) {
    if (ticket.status === 'waiting') {
      ticket.priority += PRIORITY_INCREMENT_VALUE;
      ticket.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) {
    rebuildQueue();
  }
  return changed;
}

/**
 * Try to displace (push backward) a ticket.
 * Returns true if displaced, false if at limit.
 */
function displaceTicket(ticketId) {
  const ticket = store.tickets.get(ticketId);
  if (!ticket) return { success: false, reason: 'Ticket not found' };
  if (ticket.displacementCount >= 3) {
    return { success: false, reason: 'Displacement limit reached' };
  }

  // Move it one position back in queue
  const pos = store.queue.indexOf(ticketId);
  if (pos < 0 || pos >= store.queue.length - 1) {
    return { success: false, reason: 'Cannot displace further' };
  }

  // Swap with next ticket
  [store.queue[pos], store.queue[pos + 1]] = [store.queue[pos + 1], store.queue[pos]];
  ticket.displacementCount++;
  ticket.updatedAt = new Date().toISOString();
  updateQueuePositions();

  return { success: true, ticket };
}

/**
 * Get the full ordered queue with ticket objects.
 */
function getQueue() {
  return store.queue
    .map(id => store.tickets.get(id))
    .filter(Boolean);
}

/**
 * Get waiting tickets filtered by type.
 */
function getWaitingByType(type) {
  return store.queue
    .map(id => store.tickets.get(id))
    .filter(t => t && t.status === 'waiting' && t.type === type);
}

/**
 * Remove a ticket from the queue (e.g., inactivity / heartbeat timeout).
 */
function removeFromQueue(ticketId) {
  const ticket = store.tickets.get(ticketId);
  if (!ticket) return false;

  store.queue = store.queue.filter(id => id !== ticketId);
  ticket.status = 'completed';
  ticket.updatedAt = new Date().toISOString();
  updateQueuePositions();
  return true;
}

/**
 * Complete a ticket (agent finishes handling).
 */
function completeTicket(ticketId) {
  const ticket = store.tickets.get(ticketId);
  if (!ticket) return null;

  store.queue = store.queue.filter(id => id !== ticketId);
  ticket.status = 'completed';
  ticket.updatedAt = new Date().toISOString();
  updateQueuePositions();
  return ticket;
}

module.exports = {
  enqueue,
  rebuildQueue,
  incrementPriorities,
  displaceTicket,
  getQueue,
  getWaitingByType,
  removeFromQueue,
  completeTicket,
  updateQueuePositions,
};