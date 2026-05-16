/**
 * PriorityScheduler
 * Periodically increments priority for all waiting tickets.
 * Emits socket events when priority changes.
 */

const queueService = require('./queueService');

const PRIORITY_INCREMENT_INTERVAL = parseInt(process.env.PRIORITY_INCREMENT_INTERVAL) || 10000; // 10 seconds

let intervalId = null;
let onPriorityUpdate = null;

function startScheduler(updateCallback) {
  onPriorityUpdate = updateCallback;
  if (intervalId) clearInterval(intervalId);

  intervalId = setInterval(() => {
    const changed = queueService.incrementPriorities();
    if (changed && onPriorityUpdate) {
      onPriorityUpdate(queueService.getQueue());
    }
  }, PRIORITY_INCREMENT_INTERVAL);

  console.log(`[PriorityScheduler] Started. Interval: ${PRIORITY_INCREMENT_INTERVAL}ms`);
}

function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startScheduler, stopScheduler };