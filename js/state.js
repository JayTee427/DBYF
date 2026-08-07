// ============================================================
// state.js — shared game state + tuning constants
// ============================================================

export const DIFFS = {
  tourist:    { label: 'TOURIST',    heat: 0.62, aggro: 0.55, loot: 1.30, mult: 1.0, birdDmg: 6,  stam: 1.4 },
  local:      { label: 'LOCAL',      heat: 1.00, aggro: 1.00, loot: 1.00, mult: 1.6, birdDmg: 10, stam: 1.0 },
  firewalker: { label: 'FIREWALKER', heat: 1.32, aggro: 1.50, loot: 0.80, mult: 2.6, birdDmg: 14, stam: 0.85 },
  august:     { label: 'BAREFOOT IN AUGUST', heat: 1.70, aggro: 2.10, loot: 0.62, mult: 4.2, birdDmg: 18, stam: 0.7 },
};

// world bounds
export const W = {
  xMin: -105, xMax: 105,
  zOcean: -26, zMin: -17, zMax: 32,
  startX: -96, startZ: 4,
  goalX: 94,
};

// heat tuning
export const HEAT = {
  safe: 0.40,          // below this, sand is comfortable
  burnRate: 58,        // per second at h=1.4 on the planted foot
  coolRefuge: -46,
  coolWater: -78,
  coolWet: -20,
  coolShade: -14,
  coolCool: -9,
  coolAir: -5,
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
  stats: null,
  refuges: [], items: [], birds: [], props: [], fx: [],
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
    scouts: 0, waterTime: 0, cleanLevel: true, pacifist: true,
  };
}

export const HEAT_NAMES = ['COMFY', 'TOASTY', 'OW OW OW', 'BURNING', 'ON FIRE'];
export function footState(v) { return v < 25 ? 0 : v < 48 ? 1 : v < 70 ? 2 : v < 90 ? 3 : 4; }

export function effHeat() { return S.diff.heat * (S.weather ? S.weather.heat : 1) * (1 + 0.09 * (S.level - 1)); }
export function effAggro() { return S.diff.aggro * (S.weather ? S.weather.aggro : 1) * (1 + 0.11 * (S.level - 1)); }
export function hasItem(k) { return S.slots.some(s => s.key === k); }
