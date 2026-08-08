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
};
export function wireBus(handlers) { Object.assign(bus, handlers); }
