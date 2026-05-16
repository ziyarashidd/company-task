// In-Memory Data Store
// Acts as our database for this project

const store = {
  tickets: new Map(),       // ticketId -> ticket object
  agents: new Map(),        // agentId -> agent object
  queue: [],                // ordered array of ticketIds (sorted by priority)
  heartbeats: new Map(),    // ticketId -> last heartbeat timestamp
};

// ─── Ticket Model ─────────────────────────────────────────────────────────────
// {
//   id: string,
//   customerId: string,
//   customerName: string,
//   type: 'billing' | 'technical',
//   description: string,
//   priority: number,           // starts at 1, increases over time
//   initialPriority: number,
//   displacementCount: number,  // how many times pushed backward (max 3)
//   status: 'waiting' | 'assigned' | 'completed',
//   assignedAgentId: string | null,
//   createdAt: ISO string,
//   updatedAt: ISO string,
//   queuePosition: number,      // current position in queue (1-based)
// }

// ─── Agent Model ──────────────────────────────────────────────────────────────
// {
//   id: string,
//   name: string,
//   specialization: 'billing' | 'technical',
//   isAvailable: boolean,
//   assignedTickets: string[],  // array of ticket IDs
//   createdAt: ISO string,
// }

module.exports = store;