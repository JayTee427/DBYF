// ============================================================
// state.js — shared game state + tuning constants
// ============================================================

export const DIFFS = {
  // `lava` scales how much of the beach is scorching, so difficulty changes the
  // level layout you see — not just hidden multipliers
  tourist:    { label: 'TOURIST',    heat: 0.50, aggro: 0.45, loot: 1.30, mult: 1.0, birdDmg: 5,  stam: 1.4, lava: 0.55 },
  local:      { label: 'LOCAL',      heat: 0.95, aggro: 0.85, loot: 1.00, mult: 1.6, birdDmg: 8,  stam: 1.1, lava: 1.00 },
  firewalker: { label: 'FIREWALKER', heat: 1.20, aggro: 1.40, loot: 0.82, mult: 2.6, birdDmg: 13, stam: 0.9, lava: 1.30 },
  august:     { label: 'BAREFOOT IN AUGUST', heat: 1.65, aggro: 2.00, loot: 0.65, mult: 4.2, birdDmg: 18, stam: 0.75, lava: 1.60 },
};

// World bounds. A beach is a proper journey — long enough that your build has
// time to come together, break, and get rebuilt before you reach the end.
export const W = {
  xMin: -272, xMax: 272,
  zOcean: -26, zMin: -17, zMax: 32,
  startX: -252, startZ: 4,
  goalX: 252,
};

// heat tuning
export const HEAT = {
  safe: 0.44,          // below this, sand is comfortable
  burnRate: 48,        // lava hurts — but you can see every patch coming
  coolRefuge: -72,     // a fast bounce, not a rest stop — keeps the tempo up
  coolWater: -95,      // the full reset, if you dare stand in the birds' pantry
  coolWet: -22,
  coolShade: -15,
  coolCool: -4.5,      // plain sand is survivable, not restorative — that's what
                       // makes refuges, wet sand and shade worth routing through
  coolAir: -4,
  cookedAt: 80,        // a foot past this breaks your SOLE TRAIN
};

export const STAM = {
  max: 100, drain: 26, regen: 20, regenRest: 52, sprintMin: 12,
};

export const S = {
  mode: 'title',                    // title | play | scout | interlevel | dead | paused
  diffKey: 'local', diff: DIFFS.local,
  level: 1, seed: 0, weather: null, goal: null,
  t: 0, levelTime: 0, runTime: 0,
  feet: { L: 0, R: 0 }, plant: 'L',
  health: 100, stamina: 100, aggro: 0,
  heatState: 0, prevHeatState: 0,
  slots: [],
  score: 0, levelBanked: 0,
  combo: 0, comboT: 0,
  maxSlots: 3, eagleTimer: 0, nextGullAt: 0, freeze: 0,
  invuln: 0, invulnMax: 0, lastChant: 0, hitStop: 0, deathT: 0,
  stats: null,
  refuges: [], items: [], birds: [], props: [], fx: [], checkpoints: [],
  coolPads: [], guilt: 0, prophet: null, readT: 0,
  ev: null,
  tutorial: 0,
  lastVoice: 0, lastNag: 0, lastSqueak: 0,
  streak: 0,
  forceGoal: null, forceWeather: null,
};

export function freshStats() {
  return {
    steps: 0, hotSteps: 0, refugesUsed: 0, dodges: 0, hits: 0,
    items: 0, crabs: 0, punts: 0, maxL: 0, maxR: 0, maxState: 0,
    scouts: 0, waterTime: 0, leaps: 0, bestCombo: 0, cleanLevel: true, pacifist: true,
    raids: 0, thefts: 0, recovered: 0, conned: 0, scattered: 0,
    trips: 0, faceplants: 0, prophecies: 0, events: 0,
  };
}

export const HEAT_NAMES = ['COMFY', 'TOASTY', 'OW OW OW', 'BURNING', 'ON FIRE'];
export function footState(v) { return v < 25 ? 0 : v < 48 ? 1 : v < 70 ? 2 : v < 90 ? 3 : 4; }

// escalation comes mostly from more lava patches, so the per-level heat ramp is gentle
export function effHeat() { return S.diff.heat * (S.weather ? S.weather.heat : 1) * (1 + 0.045 * (S.level - 1)); }
export function effAggro() { return S.diff.aggro * (S.weather ? S.weather.aggro : 1) * (1 + 0.08 * (S.level - 1)); }
export function hasItem(k) { return S.slots.some(s => s.key === k); }
