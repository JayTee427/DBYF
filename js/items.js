// ============================================================
// items.js — the run BUILD.
// Items are permanent for the whole run: they stack, they combine,
// some of them are a bad idea, and losing one actually hurts.
// ============================================================
import { S } from './state.js';
import { bus } from './bus.js';
import { AU, say } from './audio.js';

/**
 * passive: multipliers folded together every frame.
 *   heat    — burn rate multiplier
 *   aggro   — how fast birds notice you
 *   speed   — movement multiplier
 *   stam    — stamina drain multiplier
 *   guard   — chance a bird strike is blocked outright
 *   loot    — item spawn multiplier (applied at generation)
 * active: an ability on [E] with a cooldown.
 */
export const ITEMS = {
  // ---------------- common: solid, simple, stackable ----------------
  sandals: {
    icon: '\u{1FA74}', name: 'SANDALS', rarity: 1, w: 12,
    desc: 'the sand cannot reach you',
    passive: { heat: 0.55 }, tags: ['gear'],
  },
  kelp: {
    icon: '\u{1F33F}', name: 'KELP WRAP', rarity: 1, w: 11,
    desc: 'soggy armour — recharges in the sea',
    passive: { heat: 0.78 }, shield: 60, tags: ['gear', 'wet'],
  },
  cap: {
    icon: '\u{1F9E2}', name: 'LOST CAP', rarity: 1, w: 10,
    desc: 'harder for the birds to spot you',
    passive: { aggro: 0.75 }, tags: ['gear'],
  },
  bucket: {
    icon: '\u{1FAA3}', name: 'BUCKET', rarity: 1, w: 10,
    desc: '[E] douse your feet — refill in the sea',
    passive: {}, active: { id: 'douse', cd: 7, label: 'DOUSE' }, charges: 2, tags: ['gear', 'wet'],
  },
  boogie: {
    icon: '\u{1F3C4}', name: 'BOOGIE BOARD', rarity: 1, w: 9,
    desc: '[E] ride it — fast, and your feet never touch',
    passive: {}, active: { id: 'surf', cd: 9, label: 'SURF' }, tags: ['gear'],
  },
  oar: {
    icon: '\u{1F6F6}', name: 'OAR', rarity: 1, w: 9,
    desc: '[E] pole-vault clean over a patch',
    passive: {}, active: { id: 'vault', cd: 6, label: 'VAULT' }, tags: ['gear'],
  },
  umbrella: {
    icon: '\u{26F1}', name: 'BEACH UMBRELLA', rarity: 1, w: 8,
    desc: '[E] plant it — a patch of shade that stays',
    passive: {}, active: { id: 'plant', cd: 14, label: 'PLANT' }, tags: ['gear'],
  },

  // ---------------- rare: build-defining ----------------
  spinach: {
    icon: '\u{1F96C}', name: 'CAN OF SPINACH', rarity: 2, w: 7,
    desc: '[E] FISTS. punt every bird in reach.',
    passive: {}, active: { id: 'punch', cd: 10, label: 'FISTS' }, tags: ['fight'],
  },
  boots: {
    icon: '\u{1F97E}', name: 'PIRATE BOOTS', rarity: 2, w: 6,
    desc: 'nearly heatproof — but LOUD',
    passive: { heat: 0.22, aggro: 1.7 }, tags: ['gear', 'pirate', 'loud'],
  },
  hat: {
    icon: '\u{1F3F4}', name: "PIRATE'S HAT", rarity: 2, w: 6,
    desc: 'gulls sometimes salute instead of robbing you',
    passive: { guard: 0.3 }, tags: ['pirate'],
  },
  net: {
    icon: '\u{1F578}', name: 'FISHING NET', rarity: 2, w: 6,
    desc: '[E] tangle every bird nearby',
    passive: {}, active: { id: 'net', cd: 12, label: 'CAST NET' }, tags: ['fight'],
  },
  crab: {
    icon: '\u{1F980}', name: 'HERMIT CRAB', rarity: 2, w: 6,
    desc: 'a small disloyal bodyguard',
    passive: { guard: 0.45 }, tags: ['pet'],
  },
  rock: {
    icon: '\u{1FAA8}', name: 'SPECIAL ROCK', rarity: 2, w: 5,
    desc: '[E] throw it and appear where it lands',
    passive: { speed: 0.96 }, active: { id: 'blink', cd: 11, label: 'THROW' }, tags: ['odd'],
  },
  timepiece: {
    icon: '\u{23F1}', name: 'OLD TIMEPIECE', rarity: 2, w: 5,
    desc: '[E] stop the sun, the birds and the sea',
    passive: {}, active: { id: 'freeze', cd: 22, label: 'STOP TIME' }, tags: ['odd'],
  },
  bottle: {
    icon: '\u{1F4EC}', name: 'MESSAGE IN A BOTTLE', rarity: 2, w: 5,
    desc: 'shows you the cool way through',
    passive: {}, tags: ['odd'],
  },
  float: {
    icon: '\u{1F52E}', name: 'GLASS FLOAT', rarity: 2, w: 5,
    desc: 'the sea reaches a little further for you',
    passive: {}, tags: ['wet', 'odd'],
  },
  duck: {
    icon: '\u{1F986}', name: 'RUBBER DUCK', rarity: 2, w: 5,
    desc: 'does nothing. beloved.',
    passive: {}, tags: ['odd'],
  },

  // ---------------- cursed: genuinely a gamble ----------------
  dollar: {
    icon: '\u{1FA99}', name: 'CURSED SAND DOLLAR', rarity: 3, w: 4,
    desc: 'loot everywhere — and the Sun hates you',
    passive: { loot: 1.8, sunFocus: 2.2 }, cursed: true, tags: ['odd'],
  },
  corndog: {
    icon: '\u{1F32D}', name: 'CORN DOG', rarity: 3, w: 4,
    desc: 'fast and delicious. you are now prey.',
    passive: { speed: 1.14, aggro: 2.2 }, cursed: true, tags: ['food'],
  },
  tuna: {
    icon: '\u{1F96B}', name: 'OLD TUNA CAN', rarity: 3, w: 3,
    desc: 'summons the eagle. he may bless or abduct you.',
    passive: { aggro: 1.35, eagle: true }, cursed: true, tags: ['food'],
  },
};

// ---------------- synergies: the reason to plan a build ----------------
export const SYNERGIES = [
  // named pairs — the ones worth hunting for
  { id: 'captain', need: ['hat', 'boots'], name: 'THE CAPTAIN',
    blurb: 'the birds salute. mostly.', mod: { aggro: 0.35, guard: 0.25 } },
  { id: 'insulated', need: ['sandals', 'kelp'], name: 'FULLY INSULATED',
    blurb: 'you barely feel the sand', mod: { heat: 0.6 } },
  { id: 'bouncer', need: ['spinach', 'crab'], name: 'THE BOUNCER',
    blurb: 'nothing with wings is getting past', mod: { guard: 0.4 } },
  { id: 'picnic', need: ['corndog', 'tuna'], name: 'THE PICNIC',
    blurb: 'you are a walking buffet. good luck.', mod: { aggro: 1.6, loot: 1.5 } },
  // tag families — these come together often enough to feel like a build
  { id: 'sealegs', tag: 'wet', count: 2, name: 'SEA LEGS',
    blurb: 'damp, and delighted about it', mod: { heat: 0.72 } },
  { id: 'kitted', tag: 'gear', count: 3, name: 'FULLY KITTED',
    blurb: 'you came prepared, for once', mod: { speed: 1.08, stam: 0.8 } },
  { id: 'scrapper', tag: 'fight', count: 2, name: 'SCRAPPER',
    blurb: 'come on then', mod: { guard: 0.5, aggro: 0.8 } },
  { id: 'beachcomber', tag: 'odd', count: 3, name: 'BEACHCOMBER',
    blurb: 'your pockets make no sense', mod: { loot: 1.6, heat: 0.85 } },
];

// ---------------- weighted roll ----------------
export function rollItem(rng, favourRare) {
  const keys = Object.keys(ITEMS);
  let tot = 0;
  for (const k of keys) {
    const it = ITEMS[k];
    tot += it.w * (favourRare && it.rarity >= 2 ? 2.4 : 1);
  }
  let r = rng() * tot;
  for (const k of keys) {
    const it = ITEMS[k];
    r -= it.w * (favourRare && it.rarity >= 2 ? 2.4 : 1);
    if (r <= 0) return k;
  }
  return 'sandals';
}

// ---------------- the build ----------------
export function makeInstance(key) {
  const def = ITEMS[key];
  return {
    key, def,
    shield: def.shield || 0,
    charges: def.charges !== undefined ? def.charges : Infinity,
    cd: 0,
  };
}

/** Which synergies the current build satisfies. */
export function activeSynergies() {
  const have = new Set(S.slots.map(s => s.key));
  const tagCount = (t) => S.slots.filter(s => (s.def.tags || []).includes(t)).length;
  return SYNERGIES.filter(sy => sy.need
    ? sy.need.every(k => have.has(k))
    : tagCount(sy.tag) >= sy.count);
}

/** All passives folded together, synergies included. */
export function buildStats() {
  const out = { heat: 1, aggro: 1, speed: 1, stam: 1, guard: 0, loot: 1, sunFocus: 1, eagle: false };
  for (const s of S.slots) {
    const p = s.def.passive || {};
    if (p.heat !== undefined) out.heat *= p.heat;
    if (p.aggro !== undefined) out.aggro *= p.aggro;
    if (p.speed !== undefined) out.speed *= p.speed;
    if (p.stam !== undefined) out.stam *= p.stam;
    if (p.loot !== undefined) out.loot *= p.loot;
    if (p.sunFocus !== undefined) out.sunFocus *= p.sunFocus;
    if (p.guard !== undefined) out.guard = 1 - (1 - out.guard) * (1 - p.guard);
    if (p.eagle) out.eagle = true;
  }
  for (const sy of activeSynergies()) {
    const m = sy.mod;
    if (m.heat !== undefined) out.heat *= m.heat;
    if (m.aggro !== undefined) out.aggro *= m.aggro;
    if (m.speed !== undefined) out.speed *= m.speed;
    if (m.loot !== undefined) out.loot *= m.loot;
    if (m.guard !== undefined) out.guard = 1 - (1 - out.guard) * (1 - m.guard);
  }
  return out;
}

export const hasItem = (k) => S.slots.some(s => s.key === k);
export const findItem = (k) => S.slots.find(s => s.key === k);
/** The ability [E] will fire: leftmost ready active. */
export function readyActive() {
  return S.slots.find(s => s.def.active && s.cd <= 0 && s.charges > 0)
      || S.slots.find(s => s.def.active);
}

let lastSyn = new Set();
/** Announce synergies the moment a build comes together. */
export function checkSynergies() {
  const now = activeSynergies();
  for (const sy of now) {
    if (!lastSyn.has(sy.id)) {
      bus.banner(sy.name, sy.blurb);
      AU.shanty();
      say(sy.name, true);
    }
  }
  lastSyn = new Set(now.map(s => s.id));
}
export function resetSynergies() { lastSyn = new Set(); }

/** Add to the build. Returns the item pushed out, if any. */
export function grant(key, silent) {
  const inst = makeInstance(key);
  S.slots.push(inst);
  let dropped = null;
  if (S.slots.length > S.maxSlots) dropped = S.slots.shift();
  S.stats.items++;
  if (!silent) {
    AU.pickup();
    bus.toast('+ ' + inst.def.icon + ' ' + inst.def.name + ' — ' + inst.def.desc,
      inst.def.cursed ? 'warn' : '');
    if (dropped) bus.toast('↻ dropped ' + dropped.def.icon + ' ' + dropped.def.name, 'warn');
    if (inst.def.cursed) say('this feels like a mistake.', false);
    if (key === 'duck') say('quack.', false);
  }
  checkSynergies();
  return dropped;
}
export function removeItem(inst) {
  const i = S.slots.indexOf(inst);
  if (i >= 0) S.slots.splice(i, 1);
  checkSynergies();
}
export function tickCooldowns(dt) {
  for (const s of S.slots) if (s.cd > 0) s.cd -= dt;
}
