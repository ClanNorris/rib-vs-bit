// test/helpers.js — shared stub-socket helper for GameRoom unit tests.

/**
 * A stub WebSocket that records every message the room sends.
 * GameRoom.broadcast()/_send() gate on `readyState === 1` (OPEN), so this
 * records outbound traffic for assertions. Parsed JSON is pushed to `sent`.
 *
 * @param {number} readyState  WebSocket readyState (default 1 = OPEN).
 */
export function makeSocket(readyState = 1) {
  const sent = [];
  return {
    readyState,
    sent,
    send(data) {
      sent.push(JSON.parse(data));
    },
    close() {
      this.readyState = 3 /* CLOSED */;
    },
    /** Messages of a given `type`, newest last. */
    ofType(type) {
      return this.sent.filter((m) => m.type === type);
    },
    /** The last message of a given `type`, or undefined. */
    lastOfType(type) {
      const all = this.ofType(type);
      return all[all.length - 1];
    },
  };
}
