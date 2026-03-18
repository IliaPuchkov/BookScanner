import type { Box } from '../types';

// In-memory store for boxes created during the current work session.
// Resets automatically when a new session starts or when cleared on session end.

interface SessionStore {
  sessionId: string | null;
  boxes: Box[];
}

const store: SessionStore = {
  sessionId: null,
  boxes: [],
};

export const sessionStore = {
  /** Call when a session becomes active. Clears boxes if it's a new session. */
  setSession(sessionId: string) {
    if (store.sessionId !== sessionId) {
      store.sessionId = sessionId;
      store.boxes = [];
    }
  },

  /** Add a box created during the current session. */
  addBox(box: Box) {
    store.boxes = [box, ...store.boxes];
  },

  /** Returns boxes for the given session, or [] if session has changed. */
  getBoxes(sessionId: string): Box[] {
    if (store.sessionId !== sessionId) return [];
    return store.boxes;
  },

  /** Call when the session ends. */
  clear() {
    store.sessionId = null;
    store.boxes = [];
  },
};
