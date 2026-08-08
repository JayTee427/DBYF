// ============================================================
// bus.js — tiny event sink so systems can talk to the UI
// without importing each other (keeps the import graph acyclic)
// ============================================================
export const bus = {
  toast: () => { },
  score: () => { },
  banner: () => { },
  shake: () => { },
  instant: () => { },
  flash: () => { },
  /** Explain something exactly once, ever. No-ops after the first time. */
  teach: () => { },
};
export function wireBus(handlers) { Object.assign(bus, handlers); }
