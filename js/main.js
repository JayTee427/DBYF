// ============================================================
// DON'T BURN YOUR FEET — v0.3 "the beach fights back"
// hop -> scout -> commit. for real this time.
// ============================================================
import * as THREE from 'three';

// ---------------- seeded rng + value noise ----------------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let perm = new Uint8Array(512);
function seedNoise(seed) {
  const rng = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function hash2(ix, iz) { return perm[(perm[ix & 255] + iz) & 255] / 255; }
function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const u = fade(fx), v = fade(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ---------------- difficulty ----------------
const DIFFS = {
  tourist:    { label: 'TOURIST',    heat: 0.60, aggro: 0.60, itemRate: 1.25, mult: 1.0, gullDmg: 7 },
  local:      { label: 'LOCAL',      heat: 1.00, aggro: 1.00, itemRate: 1.00, mult: 1.5, gullDmg: 10 },
  firewalker: { label: 'FIREWALKER', heat: 1.35, aggro: 1.55, itemRate: 0.75, mult: 2.5, gullDmg: 14 },
  august:     { label: 'AUGUST',     heat: 1.80, aggro: 2.10, itemRate: 0.55, mult: 4.0, gullDmg: 18 },
};

// ---------------- weather characters (per-level modifiers) ----------------
const MODS = [
  { key: 'clear',   name: 'A NICE DAY',    heat: 1.00, aggro: 1.0, sky: 0x9fd4ff, fogc: 0xcfe8ff, fog: [70, 300], wash: 0, w: 30 },
  { key: 'noon',    name: 'HIGH NOON',     heat: 1.30, aggro: 1.0, sky: 0xbfe4ff, fogc: 0xe8f4ff, fog: [80, 320], wash: -1, w: 20 },
  { key: 'marine',  name: 'MARINE LAYER',  heat: 0.72, aggro: 1.1, sky: 0xb7c2ca, fogc: 0xc5ced4, fog: [22, 85],  wash: 0, w: 16 },
  { key: 'lowtide', name: 'LOW TIDE',      heat: 1.05, aggro: 1.25, sky: 0x9fd4ff, fogc: 0xcfe8ff, fog: [70, 300], wash: 4, w: 16 },
  { key: 'golden',  name: 'GOLDEN HOUR',   heat: 0.82, aggro: 1.60, sky: 0xffb35e, fogc: 0xffd9a0, fog: [60, 260], wash: 0, w: 14 },
];
const FLAVOR = [
  'THE SAND GROWS ANGRIER', 'THE GULLS KNOW YOUR NAME', 'THE SUN TAKES IT PERSONALLY',
  'EVEN THE TOWELS HAVE CRABS', 'THE OCEAN IS YOUR ONLY FRIEND', 'THE BEACH REMEMBERS',
  'SPF 1000 WOULD NOT SAVE YOU', 'THE DUNES HUNGER', 'YOUR SOLES ARE LEGEND',
];

// ---------------- item defs (FIFO 3 slots) ----------------
const ITEM_DEFS = {
  sandals:   { emoji: '\u{1FA74}', name: 'SANDALS',   dur: 30, weight: 14 },
  sunscreen: { emoji: '\u{1F9F4}', name: 'SUNSCREEN', dur: 25, weight: 14 },
  kelp:      { emoji: '\u{1F33F}', name: 'KELP WRAP', shield: 45, weight: 13 },
  popsicle:  { emoji: '\u{1F9CA}', name: 'POPSICLE',  dur: 8,  weight: 12 },
  spinach:   { emoji: '\u{1F96C}', name: 'SPINACH',   dur: 10, weight: 8 },
  duck:      { emoji: '\u{1F986}', name: 'RUBBER DUCK', dur: Infinity, weight: 8 },
  pizza:     { emoji: '\u{1F355}', name: 'PIZZA',     dur: 18, weight: 10 },
  oar:       { emoji: '\u{1F6F6}', name: 'OAR',       uses: 3, weight: 10 },
};

// ---------------- end goals ----------------
const GOALS = {
  truck:     { emoji: '\u{1F366}', name: 'ICE CREAM TRUCK', radius: 6, gauntlet: true,  beacon: 'jingle', zRange: [4, 14] },
  flipflops: { emoji: '\u{1FA74}', name: 'YOUR FLIP-FLOPS',  radius: 4, gauntlet: true,  beacon: 'ping',   zRange: [18, 26] },
  shower:    { emoji: '\u{1F6BF}', name: 'BEACH SHOWER',     radius: 5, gauntlet: true,  beacon: 'drip',   zRange: [8, 18] },
  umbrella:  { emoji: '\u{26F1}',  name: 'UMBRELLA CAMP',    radius: 5, gauntlet: false, beacon: 'ping',   zRange: [2, 12] },
  tidepools: { emoji: '\u{1FAA8}', name: 'TIDE POOLS',       radius: 6, gauntlet: false, beacon: 'ping',   zRange: [-6, -1] },
  nursery:   { emoji: '\u{1F9AD}', name: 'SEAL NURSERY ★', radius: 7, gauntlet: false, beacon: 'bark', zRange: [-4, 1] },
};

// ---------------- world constants ----------------
const SHORE = -12;
const X_MIN = -148, X_MAX = 148;
const START_X = -140, START_Z = -2;

// ---------------- global state ----------------
const G = {
  state: 'title',
  diff: DIFFS.local, diffKey: 'local',
  seed: 12345, mod: MODS[0],
  t: 0, dt: 0, runTime: 0, levelTime: 0,
  level: 1, totalScore: 0, levelMaxState: 0, levelAggroMax: false,
  feet: { L: 0, R: 0 }, planted: 'L',
  health: 100, heatState: 0, prevHeatState: 0,
  aggro: 0,
  slots: [],
  stats: null,
  refuges: [], items: [], gulls: [], dolphin: null, fx: [],
  goal: null,
  ev: { nextAt: 9, cloud: null, sunFocus: null, washBonus: 0, sneakerArmed: false, gauntletWarned: false },
  nextDolphin: 20,
  lastSay: 0, lastOwLine: 0, hotStreak: 0, lastSqueak: 0,
  score: 0, forceGoal: null,
};
function freshStats() {
  return { hotSteps: 0, steps: 0, gullsDodged: 0, gullsHit: 0, itemsCollected: 0,
    maxL: 0, maxR: 0, maxState: 0, punts: 0, hotStreaks: 0, crabs: 0, everAggroMax: false };
}
function effHeat() { return G.diff.heat * G.mod.heat * (1 + 0.10 * (G.level - 1)); }
function effAggro() { return G.diff.aggro * G.mod.aggro * (1 + 0.12 * (G.level - 1)); }
function addPoints(n) { G.totalScore += Math.round(n * G.diff.mult); }

// ---------------- DOM refs ----------------
const $ = (id) => document.getElementById(id);
const dom = {
  title: $('title'), pause: $('pause'), end: $('end'), hud: $('hud'),
  seedlabel: $('seedlabel'), goallabel: $('goallabel'), timelabel: $('timelabel'), scorelabel: $('scorelabel'),
  interlevel: $('interlevel'), ilTitle: $('il-title'), ilLines: $('il-lines'), ilNext: $('il-next'),
  lfoot: $('lfoot').querySelector('.gfill'), rfoot: $('rfoot').querySelector('.gfill'),
  lfootT: $('lfoot-t'), rfootT: $('rfoot-t'),
  health: $('health').querySelector('.gfill'), aggro: $('aggro').querySelector('.gfill'),
  slots: [$('slot0'), $('slot1'), $('slot2')],
  heatstate: $('heatstate'), smoke: $('smoke'), toasts: $('toasts'), vignette: $('vignette'),
  verdict: $('verdict'), epitaph: $('epitaph'), rlines: $('rlines'), scoreline: $('scoreline'),
  initials: $('initials'), lcells: [$('lc0'), $('lc1'), $('lc2')], hsrows: $('hsrows'),
};

// ============================================================
// AUDIO — all synthesized
// ============================================================
const AU = {
  ctx: null, master: null,
  jingleNext: 0, jingleI: 0, beaconNext: 0,
  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
      this.startSurf();
    } catch (e) { }
  },
  startSurf() {
    const ctx = this.ctx, len = 4 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0.10;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.05;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); lfo.start();
  },
  blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(ctx.currentTime + dur);
  },
  sweep(f0, f1, dur, type, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sawtooth';
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f1, ctx.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.1, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur + 0.05);
    o.connect(g); g.connect(this.master); o.start(); o.stop(ctx.currentTime + dur + 0.1);
  },
  noiseBurst(dur, hp, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx, len = Math.floor(dur * ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = hp > 1000 ? 'highpass' : 'lowpass'; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = vol || 0.12;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  },
  step(state, inWater) {
    if (!this.ctx) return;
    if (inWater) { this.noiseBurst(0.12, 900, 0.14); return; }
    this.blip(70 + state * 12, 0.07, 'triangle', 0.14);
    if (state >= 2) this.noiseBurst(0.06 + state * 0.04, 3600, 0.05 + state * 0.03);
  },
  screech() { this.sweep(2400, 700, 0.5, 'sawtooth', 0.10); },
  pickup() { this.blip(880, 0.09, 'square', 0.12); this.blip(1320, 0.12, 'square', 0.10); },
  poof() { this.noiseBurst(0.2, 500, 0.1); },
  squeak() { this.blip(1900, 0.1, 'sine', 0.14); this.blip(2600, 0.14, 'sine', 0.1); },
  thwack() { this.noiseBurst(0.08, 300, 0.3); this.blip(180, 0.15, 'square', 0.2); },
  splash() { this.noiseBurst(0.35, 1200, 0.1); },
  bigSplash() { this.noiseBurst(0.9, 700, 0.22); },
  shanty() { const n = [392, 494, 587, 494, 587, 740]; n.forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'square', 0.14), i * 110)); },
  fanfare() { const n = [523, 659, 784, 1047, 784, 1047]; n.forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'square', 0.16), i * 140)); },
  sad() { const n = [392, 370, 349, 175]; n.forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'triangle', 0.15), i * 220)); },
  tick() { this.blip(1500, 0.03, 'square', 0.06); },
  bark(vol) { this.sweep(300, 180, 0.12, 'sawtooth', vol); setTimeout(() => this.sweep(320, 160, 0.14, 'sawtooth', vol), 160); },
  beacon(type, dist) {
    if (!this.ctx || dist > 90) return;
    const ctx = this.ctx, v = clamp(1 - dist / 90, 0, 1);
    if (type === 'jingle') {
      if (ctx.currentTime >= this.jingleNext) {
        const mel = [523, 659, 784, 659, 523, 659, 392, 0, 523, 659, 784, 880, 784, 659, 523, 0];
        const f = mel[this.jingleI % mel.length]; this.jingleI++;
        this.jingleNext = ctx.currentTime + 0.21;
        if (f > 0) this.blip(f, 0.18, 'square', 0.16 * v);
      }
    } else if (ctx.currentTime >= this.beaconNext) {
      if (type === 'bark') { this.bark(0.12 * v); this.beaconNext = ctx.currentTime + 1.5; }
      else if (type === 'drip') { this.blip(1200, 0.05, 'sine', 0.12 * v); this.blip(900, 0.06, 'sine', 0.1 * v); this.beaconNext = ctx.currentTime + 0.9; }
      else { this.blip(980, 0.1, 'sine', 0.10 * v); this.beaconNext = ctx.currentTime + lerp(2.2, 0.5, v); }
    }
  },
};
function say(text, force) {
  const now = performance.now() / 1000;
  if (!force && now - G.lastSay < 3.0) return;
  G.lastSay = now;
  try {
    if (!window.speechSynthesis) return;
    if (speechSynthesis.speaking) { if (!force) return; speechSynthesis.cancel(); }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.35; u.pitch = 0.85 + Math.random() * 0.35; u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch (e) { }
}
const OW_LINES = [
  ['ooh. warm.', 'toasty toasty.', 'hmm. spicy sand.'],
  ['ow ow ow ow ow', 'ow. ow. OW.', 'hot hot hot hot'],
  ['HOT HOT HOT HOT HOT', 'WHY IS SAND', 'BAD BEACH. BAD.'],
  ['MY FEET ARE ON FIRE', 'I AM A TORCH', 'EVERYTHING IS PAIN'],
];

// ============================================================
// THREE SCENE
// ============================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd4ff);
scene.fog = new THREE.Fog(0xcfe8ff, 70, 300);
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 600);

scene.add(new THREE.HemisphereLight(0xfff2d0, 0x9a8a6a, 1.05));
const sunLight = new THREE.DirectionalLight(0xffffff, 1.3);
sunLight.position.set(40, 90, -40); scene.add(sunLight);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------- terrain ----------------
function getHeight(x, z) {
  let y = (z >= SHORE) ? (z - SHORE) * 0.05 : (z - SHORE) * 0.10;
  const d = smoothstep(8, 30, z);
  if (d > 0) y += d * (0.8 + 2.6 * noise2(x * 0.02 + 7, z * 0.025 + 3));
  y += smoothstep(-6, 4, z) * 0.18 * noise2(x * 0.18, z * 0.18);
  return y;
}
function beachY(z) { return (z >= SHORE) ? (z - SHORE) * 0.05 : (z - SHORE) * 0.10; }

// ---------------- heat + wetness ----------------
let waveReachNow = SHORE;
const WET_Z0 = -14, WET_ROWS = 30;
const lastWet = new Float32Array(WET_ROWS).fill(-999);
function waveReach(t) {
  const w = Math.sin(t * 0.45) * 0.6 + Math.sin(t * 0.27 + 2.1) * 0.4;
  const s = (w + 1) / 2;
  return SHORE + 11 * Math.pow(s, 1.6) + (G.mod.wash || 0) + G.ev.washBonus;
}
function updateWetness(t) {
  waveReachNow = waveReach(t);
  for (let r = 0; r < WET_ROWS; r++) if (WET_Z0 + r <= waveReachNow) lastWet[r] = t;
}
function wetnessAt(z, t) {
  if (z <= waveReachNow) return 1;
  const r = Math.floor(z - WET_Z0);
  if (r < 0) return 1; if (r >= WET_ROWS) return 0;
  return clamp(1 - (t - lastWet[r]) / 12, 0, 1);
}
// patchy heat: cool corridors (valleys) vs scorching zones (peaks). read the beach.
function sandHeat(x, z) {
  const n = noise2(x * 0.035 + 31, z * 0.045 + 11);
  let h = 0.28 + 0.90 * Math.pow(n, 1.6);
  h += smoothstep(-4, 24, z) * 0.15;
  // the gauntlet: goals that earn it get a scorching final approach
  if (G.goal && G.goal.def.gauntlet && x > G.goal.x - 25 && x < G.goal.x + 5) h += 0.45;
  return h;
}
function heatAt(x, z, t) {
  if (z <= waveReachNow) return -1;
  let h = sandHeat(x, z) * (1 - 0.92 * wetnessAt(z, t));
  const sf = G.ev.sunFocus;
  if (sf && sf.state === 'on' && Math.hypot(x - sf.x, z - sf.z) < 7) h += 0.7;
  return h;
}
function inCloudShade(x, z) {
  const c = G.ev.cloud;
  return c && Math.hypot(x - c.x, z - c.z) < 9;
}

// ---------------- sand mesh ----------------
const sandGeo = new THREE.PlaneGeometry(320, 64, 128, 40);
sandGeo.rotateX(-Math.PI / 2);
sandGeo.translate(0, 0, 6);
{
  const pos = sandGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, getHeight(pos.getX(i), pos.getZ(i)));
  sandGeo.computeVertexNormals();
  sandGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
}
const sandMat = new THREE.MeshLambertMaterial({ vertexColors: true });
scene.add(new THREE.Mesh(sandGeo, sandMat));
const COL_PALE = [0.96, 0.90, 0.72], COL_HOT = [1.0, 0.42, 0.18], COL_WET = [0.52, 0.44, 0.34];
function updateSandColors(t) {
  const pos = sandGeo.attributes.position, col = sandGeo.attributes.color;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);   // hot zones visibly shimmer
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const w = wetnessAt(z, t);
    let hn = clamp((sandHeat(x, z) - 0.42) / 0.6, 0, 1);
    hn = Math.pow(hn, 1.3) * clamp(0.7 + 0.3 * effHeat(), 0.7, 1.4);
    if (hn > 0.55) hn = Math.min(1, hn + pulse * 0.12);
    const h = clamp(hn, 0, 1);
    let r = lerp(COL_PALE[0], COL_HOT[0], h), g = lerp(COL_PALE[1], COL_HOT[1], h), b = lerp(COL_PALE[2], COL_HOT[2], h);
    r = lerp(r, COL_WET[0], w); g = lerp(g, COL_WET[1], w); b = lerp(b, COL_WET[2], w);
    if (inCloudShade(x, z)) { r *= 0.55; g *= 0.55; b *= 0.62; }
    col.setXYZ(i, r, g, b);
  }
  col.needsUpdate = true;
}

// ---------------- dynamic water quads ----------------
function makeQuad(color, opacity) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 2; scene.add(m); return m;
}
function setQuad(mesh, zNear, yNear, zFar, yFar) {
  const p = mesh.geometry.attributes.position.array;
  p[0] = -165; p[1] = yFar; p[2] = zFar;   p[3] = 165; p[4] = yFar; p[5] = zFar;
  p[6] = -165; p[7] = yNear; p[8] = zNear; p[9] = 165; p[10] = yNear; p[11] = zNear;
  mesh.geometry.attributes.position.needsUpdate = true;
}
const oceanDeep = makeQuad(0x1a6a9a, 1.0);
const washQuad = makeQuad(0x7fd4e8, 0.55);
const foamQuad = makeQuad(0xffffff, 0.85);
function updateWater() {
  const r = waveReachNow;
  setQuad(oceanDeep, r - 0.4, beachY(r - 0.4) + 0.02, -60, -0.6);
  setQuad(washQuad, -13.5, beachY(-13.5) + 0.04, r, beachY(r) + 0.04);
  setQuad(foamQuad, r - 0.5, beachY(r - 0.5) + 0.05, r + 0.05, beachY(r + 0.05) + 0.05);
}

// ---------------- sprites ----------------
function makeSunSprite(august) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = august ? '#ff7a33' : '#ffd93d';
  g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.fill();
  g.strokeStyle = g.fillStyle; g.lineWidth = 5;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    g.beginPath(); g.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50);
    g.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60); g.stroke();
  }
  g.fillStyle = '#222';
  g.fillRect(40, 52, 20, 10); g.fillRect(68, 52, 20, 10); g.fillRect(58, 54, 12, 4);
  g.strokeStyle = '#222'; g.lineWidth = 3;
  g.beginPath(); g.arc(60, 78, 14, 0.15 * Math.PI, 0.55 * Math.PI); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false }));
  s.scale.setScalar(august ? 34 : 22); s.position.set(60, 58, -80);
  return s;
}
let sunSprite = makeSunSprite(false); scene.add(sunSprite);

function textSprite(text, size) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '90px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  s.scale.setScalar(size || 1.6); return s;
}
function cloudSprite() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.92)';
  for (const [cx, cy, r] of [[70, 80, 38], [120, 60, 46], [175, 78, 40], [120, 88, 42]]) {
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  s.scale.set(24, 12, 1); return s;
}

// ============================================================
// LEVEL OBJECTS
// ============================================================
const levelGroup = new THREE.Group(); scene.add(levelGroup);
const M = (c, flat) => new THREE.MeshLambertMaterial({ color: c, flatShading: !!flat });

function mkSeal(scale, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.1, 4, 8), M(color));
  body.rotation.z = Math.PI / 2; body.position.y = 0.45; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 8), M(color));
  head.position.set(0.95, 0.62, 0); g.add(head);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), M(0x222222));
  nose.position.set(1.26, 0.6, 0); g.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 6), M(color));
  tail.rotation.z = Math.PI / 2; tail.position.set(-1.05, 0.4, 0); g.add(tail);
  g.scale.setScalar(scale);
  return g;
}
function mkPalm(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5.5, 6), M(0x8a6242));
  trunk.position.y = 2.7; trunk.rotation.z = 0.12; g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), M(0x3e8a4a));
    frond.material.side = THREE.DoubleSide;
    const a = i / 6 * Math.PI * 2;
    frond.position.set(0.6 + Math.cos(a) * 1.4, 5.4, Math.sin(a) * 1.4);
    frond.rotation.set(0, -a, -0.5);
    g.add(frond);
  }
  g.position.set(x, getHeight(x, z), z);
  return g;
}
function mkTower(x, z) {
  const g = new THREE.Group();
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), M(0xc23b2e));
    leg.position.set(lx, 1.6, lz); g.add(leg);
  }
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 2.8), M(0xf0e6d0));
  cab.position.y = 4.0; g.add(cab);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.0, 4), M(0xc23b2e));
  roof.position.y = 5.3; roof.rotation.y = Math.PI / 4; g.add(roof);
  g.position.set(x, getHeight(x, z), z);
  return g;
}

// ---------------- goal builders ----------------
function buildGoal(key, x, z) {
  const def = GOALS[key];
  const g = new THREE.Group();
  if (key === 'truck') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 2.2), M(0xfff5ee)); body.position.y = 1.9; g.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.25, 0.5, 2.25), M(0xff6fa5)); stripe.position.y = 2.3; g.add(stripe);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, 2.0), M(0xffe0ee)); cab.position.set(-2.7, 1.45, 0); g.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.1), M(0x334455)); win.position.set(0.4, 2.1, 1.12); g.add(win);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.0), M(0xff6fa5)); awning.position.set(0.4, 2.8, 1.6); awning.rotation.x = 0.3; g.add(awning);
    for (const [wx, wz] of [[-2.6, 1.0], [-2.6, -1.0], [1.6, 1.0], [1.6, -1.0]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 12), M(0x222222));
      w.rotation.x = Math.PI / 2; w.position.set(wx, 0.55, wz); g.add(w);
    }
    const cone = textSprite('\u{1F366}', 3.2); cone.position.y = 4.6; g.add(cone);
  } else if (key === 'flipflops') {
    for (const dz of [-0.5, 0.5]) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 8), M(0xff6fa5));
      f.rotation.x = Math.PI / 2; f.scale.y = 0.25; f.position.set(0, 0.15, dz); g.add(f);
    }
    const s = textSprite('\u{1FA74}', 2.4); s.position.y = 2.2; g.add(s);
  } else if (key === 'shower') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 10), M(0x8d8d95)); base.position.y = 0.1; g.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 8), M(0x666677)); pole.position.y = 1.8; g.add(pole);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 0.25, 8), M(0x99aabb)); head.position.set(0.4, 3.4, 0); head.rotation.z = -0.5; g.add(head);
    const s = textSprite('\u{1F4A6}', 1.8); s.position.set(0.8, 2.8, 0); g.add(s);
  } else if (key === 'umbrella') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.2, 8), M(0xddddcc)); pole.position.y = 1.6; pole.rotation.z = 0.2; g.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.1, 10), M(0xff5233)); top.position.set(-0.6, 3.0, 0); top.rotation.z = 0.2; g.add(top);
    const cooler = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.7), M(0x2288cc)); cooler.position.set(1.2, 0.35, 0.6); g.add(cooler);
    const towel = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.2), M(0xffe07a)); towel.rotation.x = -Math.PI / 2; towel.position.set(0.3, 0.05, -1.0); g.add(towel);
  } else if (key === 'tidepools') {
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, rr = 1.6 + (i % 2);
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), M(0x6a6a72, true));
      rock.scale.y = 0.45; rock.position.set(Math.cos(a) * rr, 0.25, Math.sin(a) * rr); g.add(rock);
    }
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.1, 12), new THREE.MeshBasicMaterial({ color: 0x2aa8c8, transparent: true, opacity: 0.8 }));
    pool.position.y = 0.12; g.add(pool);
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), M(0xff7a55)); star.position.set(0.5, 0.18, 0.3); g.add(star);
  } else if (key === 'nursery') {
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), M(0x6a6a72, true));
      rock.scale.y = 0.5; rock.position.set(Math.cos(a) * 3.2, 0.3, Math.sin(a) * 3.2); g.add(rock);
    }
    const mama = mkSeal(1.0, 0x5a6a78); mama.position.set(-1.2, 0.3, 0.8); mama.rotation.y = 0.6; g.add(mama);
    const mama2 = mkSeal(0.9, 0x4a5a68); mama2.position.set(1.4, 0.3, -0.9); mama2.rotation.y = -1.8; g.add(mama2);
    for (let i = 0; i < 3; i++) {
      const pup = mkSeal(0.45, 0xb8c4cc); pup.position.set(-0.5 + i * 0.9, 0.25, 1.8 - i * 0.5);
      pup.rotation.y = Math.random() * Math.PI * 2; pup.userData.pup = true; g.add(pup);
    }
    const s = textSprite('\u{2B50}', 2.0); s.position.y = 3.4; g.add(s);
  }
  g.position.set(x, getHeight(x, z), z);
  levelGroup.add(g);
  return { key, def, x, z, mesh: g };
}

// ---------------- refuges ----------------
function buildRefuge(type, x, z, rng) {
  let mesh, r, h;
  if (type === 'wood') {
    mesh = new THREE.Group();
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.22, 0.7), M(0x8a6242)); mesh.add(b1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.22, 0.6), M(0x9a7252));
    b2.position.set(0.3, 0.22, 0.2); b2.rotation.y = 0.5; mesh.add(b2);
    mesh.rotation.y = rng() * Math.PI; r = 1.6; h = 0.35;
  } else if (type === 'rock') {
    mesh = new THREE.Group();
    const r1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 0), M(0x8d8d95, true)); r1.scale.y = 0.55; mesh.add(r1);
    const r2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), M(0x7d7d85, true)); r2.scale.y = 0.5; r2.position.set(1.0, 0, 0.5); mesh.add(r2);
    r = 1.7; h = 0.5;
  } else {
    const cols = [0xff6fa5, 0x57d6f2, 0xffe07a, 0x9dff8a];
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.3), M(cols[Math.floor(rng() * cols.length)]));
    mesh.material.side = THREE.DoubleSide;
    mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = rng() * Math.PI; r = 1.3; h = 0.04;
  }
  mesh.position.set(x, getHeight(x, z) + (type === 'towel' ? 0.05 : 0.15), z);
  levelGroup.add(mesh);
  return { x, z, r, h, type, hasCrab: type === 'towel' && rng() < (G.diffKey === 'august' ? 0.5 : 0.2), crabDone: false };
}

// ---------------- items ----------------
function pickItemKey(rng) {
  const keys = Object.keys(ITEM_DEFS);
  let tot = 0; for (const k of keys) tot += ITEM_DEFS[k].weight;
  let roll = rng() * tot;
  for (const k of keys) { roll -= ITEM_DEFS[k].weight; if (roll <= 0) return k; }
  return 'sandals';
}
function buildItem(key, x, z) {
  const def = ITEM_DEFS[key];
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), M(0xffffff));
  base.position.y = 0.4; g.add(base);
  const s = textSprite(def.emoji, 1.5); s.position.y = 1.3; g.add(s);
  g.position.set(x, getHeight(x, z), z);
  levelGroup.add(g);
  return { key, x, z, mesh: g, taken: false, spin: Math.random() * Math.PI * 2 };
}

// ---------------- level generation ----------------
function pickGoal(rng) {
  if (G.forceGoal) return G.forceGoal;
  if (G.level === 1) return 'truck';
  if (rng() < 0.15) return 'nursery';
  const pool = ['truck', 'flipflops', 'shower', 'umbrella', 'tidepools'];
  return pool[Math.floor(rng() * pool.length)];
}
function pickMod(rng) {
  if (G.level === 1) return MODS[0];
  let tot = 0; for (const m of MODS) tot += m.w;
  let roll = rng() * tot;
  for (const m of MODS) { roll -= m.w; if (roll <= 0) return m; }
  return MODS[0];
}
function generateLevel() {
  while (levelGroup.children.length) levelGroup.remove(levelGroup.children[0]);
  G.refuges = []; G.items = []; G.gulls = []; G.dolphin = null; G.fx = [];
  G.ev = { nextAt: G.t + 8 + Math.random() * 6, cloud: null, sunFocus: null, washBonus: 0, sneakerArmed: false, gauntletWarned: false };
  G.seed = Math.floor(Math.random() * 90000) + 10000;
  seedNoise(G.seed);
  const rng = mulberry32(G.seed ^ 0x5EED);
  // weather + goal
  G.mod = pickMod(rng);
  scene.background = new THREE.Color(G.mod.sky);
  scene.fog.color.set(G.mod.fogc);
  scene.fog.near = G.mod.fog[0]; scene.fog.far = G.mod.fog[1];
  const goalKey = pickGoal(rng);
  const gdef = GOALS[goalKey];
  const gx = 126 + rng() * 16;
  const gz = gdef.zRange[0] + rng() * (gdef.zRange[1] - gdef.zRange[0]);
  // terrain refresh
  const pos = sandGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, getHeight(pos.getX(i), pos.getZ(i)));
  pos.needsUpdate = true; sandGeo.computeVertexNormals();
  G.goal = buildGoal(goalKey, gx, gz);
  // refuge chain: a meandering lifeline route with gaps you must commit across
  G.refuges.push(buildRefuge('towel', START_X, START_Z, rng));
  let cx = START_X + 9, cz = -1;
  while (cx < gx - 16) {
    cx += 8 + rng() * 6 + G.level * 0.4;     // gaps widen as you climb
    cz = clamp(cz + (rng() * 12 - 6), -8, 18);
    // steer the chain toward the goal's side of the beach near the end
    if (cx > gx - 50) cz = lerp(cz, gz, 0.25);
    const type = ['wood', 'rock', 'towel'][Math.floor(rng() * 3)];
    G.refuges.push(buildRefuge(type, cx, cz, rng));
    if (rng() < 0.3) G.refuges.push(buildRefuge(['wood', 'rock', 'towel'][Math.floor(rng() * 3)], cx + rng() * 8 - 4, clamp(cz + rng() * 16 - 8, -8, 20), rng));
  }
  // rocky steps into water-side goals
  if (goalKey === 'nursery' || goalKey === 'tidepools') {
    for (let i = 1; i <= 3; i++) G.refuges.push(buildRefuge('rock', gx - 12 + i * 3, lerp(cz, gz, i / 3), rng));
  }
  // items
  let ix = START_X + 10;
  while (ix < gx - 12) {
    ix += (13 + rng() * 9) * (1 + 0.08 * (G.level - 1)) / G.diff.itemRate;
    G.items.push(buildItem(pickItemKey(rng), ix, -7 + rng() * 21));
  }
  // scenery
  for (let i = 0; i < 5; i++) levelGroup.add(mkPalm(-130 + rng() * 260, 24 + rng() * 8));
  levelGroup.add(mkTower(-60 + rng() * 120, 18 + rng() * 6));
  lastWet.fill(-999);
  dom.seedlabel.textContent = 'LV ' + G.level + ' — BEACH #' + G.seed + ' — ' + G.mod.name;
}

// ============================================================
// GULLS (squadrons at higher levels)
// ============================================================
function buildGullMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.0, 6), M(0xf5f5f5));
  body.rotation.x = Math.PI / 2; g.add(body);
  const wingMat = M(0xe8e8e8); wingMat.side = THREE.DoubleSide;
  const w1 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.35), wingMat); w1.position.x = -0.6; g.add(w1);
  const w2 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.35), wingMat); w2.position.x = 0.6; g.add(w2);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 5), M(0xff9d3d));
  beak.rotation.x = Math.PI / 2; beak.position.z = 0.7; g.add(beak);
  g.userData.wings = [w1, w2];
  return g;
}
function spawnGulls() {
  const n = G.level >= 3 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const mesh = buildGullMesh(); scene.add(mesh);
    const delay = i * 0.7;
    const start = new THREE.Vector3(player.x - 18 - i * 6, 13 + i * 2, -26);
    const target = new THREE.Vector3(player.x + player.vx * 1.2 + i * 2, getHeight(player.x, player.z) + 1.2, player.z + i);
    const exit = new THREE.Vector3(player.x + 30, 16, -30);
    G.gulls.push({ mesh, t: -delay / 2.4, dur: 2.4, start, target, exit, resolved: false });
  }
  AU.screech();
}
function updateGulls(dt) {
  for (const gl of [...G.gulls]) {
    gl.t += dt / gl.dur;
    const t = gl.t;
    if (t < 0) continue;
    if (t >= 1) { scene.remove(gl.mesh); G.gulls.splice(G.gulls.indexOf(gl), 1); continue; }
    const p = new THREE.Vector3();
    if (t < 0.5) { const u = t / 0.5; p.lerpVectors(gl.start, gl.target, u); p.y = lerp(gl.start.y, gl.target.y, u * u); }
    else { const u = (t - 0.5) / 0.5; p.lerpVectors(gl.target, gl.exit, u); p.y = lerp(gl.target.y, gl.exit.y, u * u); }
    gl.mesh.position.copy(p);
    gl.mesh.lookAt(t < 0.5 ? gl.target : gl.exit);
    const flap = Math.sin(G.t * 18) * 0.7;
    gl.mesh.userData.wings[0].rotation.y = flap; gl.mesh.userData.wings[1].rotation.y = -flap;
    if (!gl.resolved && t >= 0.45) {
      gl.resolved = true;
      const d = Math.hypot(player.x - gl.target.x, player.z - gl.target.z);
      if (hasItem('spinach')) {
        AU.thwack(); addToast('GULL PUNTED! +150'); G.stats.punts++; addPoints(150); say('POW', true);
        gl.exit.y = 30;
      } else if (d < 2.6) {
        if (G.slots.length > 0) {
          const stolen = G.slots.pop();
          addToast('GULL STOLE YOUR ' + stolen.def.name + '!', true); AU.poof();
        } else {
          G.health -= G.diff.gullDmg; addToast('GULL ATTACK! -' + G.diff.gullDmg + ' HP', true);
          player.vx += 4;
        }
        G.stats.gullsHit++;
      } else {
        G.stats.gullsDodged++; addToast('DODGED! +150'); addPoints(150);
      }
    }
  }
}

// ---------------- dolphin ----------------
function updateDolphin(dt) {
  if (G.dolphin) {
    const d = G.dolphin; d.t += dt / 1.7;
    if (d.t >= 1) { scene.remove(d.mesh); G.dolphin = null; AU.splash(); return; }
    const x = lerp(d.x0, d.x1, d.t);
    const y = -0.5 + Math.sin(d.t * Math.PI) * 4.2;
    d.mesh.position.set(x, y, d.z);
    d.mesh.rotation.z = lerp(-1.0, 1.0, d.t) * (d.x1 > d.x0 ? -1 : 1);
  } else if (G.t > G.nextDolphin && G.state === 'playing') {
    G.nextDolphin = G.t + 22 + Math.random() * 28;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.6, 4, 8), M(0x6a7a8a));
    const x0 = player.x - 25 + Math.random() * 50;
    G.dolphin = { mesh, t: 0, x0, x1: x0 + 8, z: -24 };
    scene.add(mesh); AU.splash();
  }
}

// ============================================================
// EVENTS — the beach does things to you
// ============================================================
function scheduleEvent() {
  G.ev.nextAt = G.t + 13 + Math.random() * 10;
  const pool = [['cloud', 30], ['whale', 25]];
  if (G.level >= 2) { pool.push(['sunfocus', 25]); pool.push(['sneaker', 18]); }
  let tot = 0; for (const p of pool) tot += p[1];
  let roll = Math.random() * tot;
  for (const [k, w] of pool) { roll -= w; if (roll <= 0) return k; }
  return 'cloud';
}
function fireEvent(kind) {
  if (kind === 'cloud' && !G.ev.cloud) {
    const sp = cloudSprite(); sp.position.set(player.x - 30, 26, 8); scene.add(sp);
    G.ev.cloud = { x: player.x - 26, z: 2 + Math.random() * 10, sprite: sp, life: 26 };
    addToast('☁ a cloud! chase the shade!');
  } else if (kind === 'whale') {
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 4, 4, 8), M(0x44515e));
    mesh.position.set(player.x + 10, -3, -30); scene.add(mesh);
    G.fx.push({ kind: 'whale', mesh, t: 0 });
    addToast('\u{1F40B} WHALE! big wave incoming!');
    AU.bigSplash(); say('woah.', false);
  } else if (kind === 'sunfocus' && !G.ev.sunFocus) {
    const x = clamp(player.x + 12 + Math.random() * 8, X_MIN, X_MAX);
    const z = clamp(player.z + Math.random() * 8 - 4, -8, 20);
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.4, 7, 24),
      new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, getHeight(x, z) + 0.1, z); scene.add(ring);
    G.ev.sunFocus = { x, z, ring, state: 'warn', t: 0 };
    addToast('☀ THE SUN HAS NOTICED YOU', true);
  } else if (kind === 'sneaker') {
    G.ev.washBonus += 13; G.ev.sneakerArmed = true;
    addToast('\u{1F30A} SNEAKER WAVE!', true); say('uh oh.', true);
    AU.bigSplash();
  }
}
function updateEvents(dt) {
  const ev = G.ev;
  ev.washBonus = Math.max(0, ev.washBonus - dt * 4);
  if (ev.sneakerArmed && player.z <= waveReachNow) {
    ev.sneakerArmed = false;
    player.vz += 9; player.vx += 3;
    G.aggro = Math.min(100, G.aggro + 25);
    addToast('swept off your feet!', true); AU.splash();
  }
  if (ev.sneakerArmed && ev.washBonus <= 1) ev.sneakerArmed = false;
  if (ev.cloud) {
    ev.cloud.x += dt * 3.4; ev.cloud.life -= dt;
    ev.cloud.sprite.position.set(ev.cloud.x, 26, ev.cloud.z + 6);
    if (ev.cloud.life <= 0) { scene.remove(ev.cloud.sprite); ev.cloud = null; }
  }
  if (ev.sunFocus) {
    const sf = ev.sunFocus; sf.t += dt;
    if (sf.state === 'warn') {
      sf.ring.material.opacity = 0.25 + 0.35 * Math.abs(Math.sin(sf.t * 8));
      if (sf.t > 2) { sf.state = 'on'; sf.t = 0; sf.ring.material.opacity = 0.75; sf.ring.scale.setScalar(0.85); }
    } else if (sf.t > 6) { scene.remove(sf.ring); ev.sunFocus = null; }
  }
  for (const fx of [...G.fx]) {
    if (fx.kind === 'whale') {
      fx.t += dt / 2.2;
      if (fx.t >= 1) {
        scene.remove(fx.mesh); G.fx.splice(G.fx.indexOf(fx), 1);
        G.ev.washBonus += 8; addToast('SURF’S UP! the wash runs deep!');
      } else {
        fx.mesh.position.y = -3 + Math.sin(fx.t * Math.PI) * 6.5;
        fx.mesh.rotation.z = lerp(-0.9, 0.9, fx.t);
      }
    }
  }
  if (G.t >= ev.nextAt) { fireEvent(scheduleEvent()); }
}

// ============================================================
// PLAYER
// ============================================================
const player = {
  x: START_X, z: START_Z, y: 0, vy: 0, vx: 0, vz: 0,
  yaw: -Math.PI / 2, pitch: -0.05, grounded: true,
  stepAcc: 0, sprint: false,
};
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (G.state === 'end') { initialsKey(e); return; }
  keys.add(e.code);
  if (e.code === 'KeyE') tryOarVault();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

let pointerLocked = false, dragLook = false;
renderer.domElement.addEventListener('click', () => {
  if (G.state === 'playing' && !pointerLocked) requestLock();
});
function requestLock() {
  const p = renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock();
  if (p && p.catch) p.catch(() => { dragLook = true; });
  setTimeout(() => { if (!pointerLocked && G.state === 'playing') dragLook = true; }, 600);
}
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  if (!pointerLocked && G.state === 'playing' && !dragLook) setPaused(true);
});
let dragging = false;
window.addEventListener('mousedown', () => dragging = true);
window.addEventListener('mouseup', () => dragging = false);
window.addEventListener('mousemove', (e) => {
  if (G.state !== 'playing') return;
  if (pointerLocked || (dragLook && dragging)) {
    player.yaw -= e.movementX * 0.0024;
    player.pitch -= e.movementY * 0.0022;
    player.pitch = clamp(player.pitch, -1.3, 1.3);
  }
});

function tryOarVault() {
  if (G.state !== 'playing' || !player.grounded) return;
  const slot = G.slots.find(s => s.key === 'oar' && s.uses > 0);
  if (!slot) return;
  slot.uses--;
  player.vy = 3.6; player.grounded = false;
  const f = 15;
  player.vx += -Math.sin(player.yaw) * f; player.vz += -Math.cos(player.yaw) * f;
  addToast('OAR VAULT!'); AU.blip(300, 0.2, 'triangle', 0.2);
  if (slot.uses <= 0) { removeSlot(slot); addToast('the oar snapped', true); }
}

function hasItem(key) { return G.slots.some(s => s.key === key); }
function heatResist() {
  let m = 1;
  if (hasItem('sandals')) m *= 0.35;
  if (hasItem('sunscreen')) m *= 0.6;
  return m;
}
function addItemToSlots(key) {
  const def = ITEM_DEFS[key];
  const inst = { key, def, t: def.dur || Infinity, shield: def.shield || 0, uses: def.uses || 0 };
  G.slots.push(inst);
  if (G.slots.length > 3) {
    const ejected = G.slots.shift();
    addToast('↻ rotated out: ' + ejected.def.name, true); AU.poof();
  }
  G.stats.itemsCollected++; addPoints(40);
  AU.pickup(); addToast('+ ' + def.emoji + ' ' + def.name);
  if (key === 'pizza') { G.health = Math.min(100, G.health + 30); addToast('+30 HP (delicious, dangerous)'); }
  if (key === 'spinach') { AU.shanty(); say('SPINACH TIME', true); }
  if (key === 'duck') say('quack.', false);
}
function removeSlot(inst) {
  const i = G.slots.indexOf(inst); if (i >= 0) G.slots.splice(i, 1);
}

function addToast(text, bad) {
  const d = document.createElement('div');
  d.className = 'toast' + (bad ? ' bad' : ''); d.textContent = text;
  dom.toasts.appendChild(d);
  setTimeout(() => d.remove(), 1700);
}

// ============================================================
// GAME FLOW
// ============================================================
function startRun(diffKey) {
  G.diffKey = diffKey; G.diff = DIFFS[diffKey];
  G.state = 'playing'; G.runTime = 0;
  G.level = 1; G.totalScore = 0; G.levelTime = 0; G.levelMaxState = 0; G.levelAggroMax = false;
  G.feet.L = 0; G.feet.R = 0; G.health = 100; G.heatState = 0; G.prevHeatState = 0;
  G.aggro = 0; G.slots = []; G.stats = freshStats(); G.hotStreak = 0;
  player.x = START_X; player.z = START_Z; player.yaw = -Math.PI / 2; player.pitch = -0.05;
  player.vx = 0; player.vz = 0; player.vy = 0; player.grounded = true;
  scene.remove(sunSprite); sunSprite = makeSunSprite(diffKey === 'august'); scene.add(sunSprite);
  generateLevel();
  dom.title.classList.add('hidden'); dom.end.classList.add('hidden');
  dom.pause.classList.add('hidden'); dom.hud.classList.remove('hidden');
  AU.ensure(); requestLock();
  announceGoal();
}
function announceGoal() {
  const lines = {
    truck: 'I can hear the ice cream truck.',
    flipflops: 'my flip flops! I can see them from here!',
    shower: 'a shower. a beautiful, cold shower.',
    umbrella: 'that umbrella has my name on it.',
    tidepools: 'to the tide pools!',
    nursery: 'the seals... the seals are calling me.',
  };
  say(lines[G.goal.key] || 'off we go.', true);
  addToast(G.goal.def.emoji + ' FIND: ' + G.goal.def.name);
}
function setPaused(p) {
  if (p) { G.state = 'paused'; dom.pause.classList.remove('hidden'); }
  else { G.state = 'playing'; dom.pause.classList.add('hidden'); requestLock(); }
}
dom.pause.addEventListener('click', () => setPaused(false));
document.querySelectorAll('.diffbtn').forEach(b =>
  b.addEventListener('click', () => { AU.ensure(); startRun(b.dataset.diff); }));
$('btn-retry').addEventListener('click', () => startRun(G.diffKey));
$('btn-title').addEventListener('click', () => {
  dom.end.classList.add('hidden'); dom.hud.classList.add('hidden');
  dom.title.classList.remove('hidden'); G.state = 'title';
  renderHighscores(); if (document.exitPointerLock) document.exitPointerLock();
});

// ---------------- scoring ----------------
function doneness(v) {
  if (v < 20) return 'RARE (nice)';
  if (v < 40) return 'MEDIUM-RARE';
  if (v < 60) return 'MEDIUM';
  if (v < 80) return 'WELL DONE';
  if (v < 95) return 'CHARCOAL';
  return 'TECHNICALLY BRISKET';
}
function levelScore() {
  let score = 2000; const lines = [['BEACH CLEARED', '+2000']];
  if (G.goal.key === 'nursery') { score += 1000; lines.push(['SEAL APPROVAL ★', '+1000']); }
  const tb = Math.max(0, Math.round((150 - G.levelTime) * 15));
  if (tb > 0) { score += tb; lines.push(['SPEED BONUS', '+' + tb]); }
  if (G.slots.length === 3) { score += 300; lines.push(['FULL POUCH', '+300']); }
  if (hasItem('duck')) { score += 500; lines.push(['DUCK LOYALIST', '+500']); }
  if (G.heatState >= 3) { score += 400; lines.push(['PHOTO FINISH', '+400']); }
  if (G.levelMaxState <= 1) { score += 800; lines.push(['COOL CUSTOMER', '+800']); }
  if (!G.levelAggroMax) { score += 500; lines.push(['PACIFIST', '+500']); }
  const mult = G.diff.mult * (1 + 0.1 * (G.level - 1));
  score = Math.round(score * mult);
  lines.push(['LEVEL ' + G.level + ' × ' + G.diff.label, '×' + mult.toFixed(1)]);
  return { score, lines };
}
function levelComplete() {
  G.state = 'interlevel';
  const { score, lines } = levelScore();
  G.totalScore += score;
  if (G.goal.key === 'nursery') {
    G.goal.mesh.children.forEach(c => { if (c.userData && c.userData.pup) c.userData.bounce = true; });
    AU.bark(0.2); setTimeout(() => AU.bark(0.16), 500);
  }
  dom.ilTitle.textContent = G.goal.def.emoji + ' ' + G.goal.def.name + ' REACHED!';
  dom.ilLines.innerHTML = lines.map(l => '<div class="rline"><span>' + l[0] + '</span><span>' + l[1] + '</span></div>').join('')
    + '<div class="rline"><span>TOTAL</span><span>' + G.totalScore + '</span></div>';
  const flavor = G.level <= FLAVOR.length ? FLAVOR[G.level - 1] : FLAVOR[3 + Math.floor(Math.random() * (FLAVOR.length - 3))];
  dom.ilNext.textContent = 'LEVEL ' + (G.level + 1) + ' — ' + flavor;
  dom.interlevel.classList.remove('hidden');
  AU.fanfare();
  const winLines = {
    nursery: 'the seals. they approve of me.',
    truck: 'one ice cream, please.',
    shower: 'cold water. I am reborn.',
    flipflops: 'we are reunited. never again.',
    umbrella: 'shade, sweet shade.',
    tidepools: 'hello, tiny crabs. I live here now.',
  };
  say(winLines[G.goal.key] || 'sweet relief. NEXT BEACH.', true);
  setTimeout(nextLevel, 3600);
}
function nextLevel() {
  if (G.state !== 'interlevel') return;
  G.level++; G.levelTime = 0; G.levelMaxState = 0; G.levelAggroMax = false;
  G.feet.L = 0; G.feet.R = 0;
  G.health = Math.min(100, G.health + 20);
  G.aggro = 0; G.hotStreak = 0;
  player.x = START_X; player.z = START_Z;
  player.vx = 0; player.vz = 0; player.vy = 0; player.grounded = true;
  generateLevel();
  dom.interlevel.classList.add('hidden');
  G.state = 'playing';
  announceGoal();
}
function endRun() {
  G.state = 'end';
  if (document.exitPointerLock) document.exitPointerLock();
  const s = G.stats;
  const consolation = Math.round((player.x - START_X) * 2 * G.diff.mult);
  G.totalScore += consolation;
  G.score = G.totalScore;
  dom.verdict.textContent = 'YOUR FEET GAVE OUT';
  dom.verdict.className = 'burned';
  dom.epitaph.textContent = ['Here lie two feet. They were told to bring sandals.', 'The sand remains undefeated.', 'The gulls will sing of this day.'][Math.floor(Math.random() * 3)];
  dom.rlines.innerHTML = '';
  const rep = [
    ['Beaches cleared', G.level - 1], ['Fell on level', G.level],
    ['Left foot', doneness(s.maxL)], ['Right foot', doneness(s.maxR)],
    ['Steps on hot sand', s.hotSteps], ['Total steps', s.steps],
    ['Gulls dodged', s.gullsDodged], ['Gulls... not dodged', s.gullsHit],
    ['Towel crabs met', s.crabs],
    ['Items beachcombed', s.itemsCollected], ['Total time', G.runTime.toFixed(1) + 's'],
    ['Diagnosis', G.level > 1 ? 'a legend, briefly' : 'why did you do this'],
  ];
  for (const [k, v] of rep) {
    const d = document.createElement('div'); d.className = 'rline';
    d.innerHTML = '<span>' + k + '</span><span>' + v + '</span>'; dom.rlines.appendChild(d);
  }
  const d = document.createElement('div'); d.className = 'rline bonus';
  d.innerHTML = '<span>DISTANCE CONSOLATION</span><span>+' + consolation + '</span>'; dom.rlines.appendChild(d);
  dom.scoreline.textContent = 'SCORE: 0';
  let shown = 0; const step = Math.max(1, Math.round(G.score / 40));
  const iv = setInterval(() => {
    shown = Math.min(G.score, shown + step);
    dom.scoreline.textContent = 'SCORE: ' + shown; AU.tick();
    if (shown >= G.score) clearInterval(iv);
  }, 40);
  initialsActive = qualifies(G.score);
  if (initialsActive) {
    dom.initials.classList.remove('hidden');
    dom.initials.querySelector('p').textContent = '★ HIGH SCORE — ENTER YOUR INITIALS ★';
    initialsIdx = 0; initialsChars = ['A', 'A', 'A']; renderInitials();
  } else dom.initials.classList.add('hidden');
  dom.end.classList.remove('hidden');
  AU.sad(); say('tell my shoes... I loved them.', true);
}

// ---------------- high scores ----------------
function loadScores() {
  try { return JSON.parse(localStorage.getItem('dbyf_scores') || '[]'); } catch (e) { return []; }
}
function saveScores(sc) { try { localStorage.setItem('dbyf_scores', JSON.stringify(sc)); } catch (e) { } }
function qualifies(score) {
  if (score <= 0) return false;
  const sc = loadScores();
  return sc.length < 8 || score > sc[sc.length - 1].score;
}
function renderHighscores() {
  const sc = loadScores();
  dom.hsrows.innerHTML = '';
  if (!sc.length) {
    dom.hsrows.innerHTML = '<tr><td style="text-align:center;color:#a08050">no survivors yet. be the first.</td></tr>';
    return;
  }
  sc.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i + 1) + '.</td><td>' + r.ini + '</td><td class="sc">' + r.score + '</td><td class="df">' + r.diff + '</td>';
    dom.hsrows.appendChild(tr);
  });
}
let initialsActive = false, initialsIdx = 0, initialsChars = ['A', 'A', 'A'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function renderInitials() {
  dom.lcells.forEach((c, i) => {
    c.textContent = initialsChars[i];
    c.classList.toggle('active', i === initialsIdx && initialsActive);
  });
}
function initialsKey(e) {
  if (!initialsActive) return;
  const ch = e.key.toUpperCase();
  if (LETTERS.includes(ch) && ch.length === 1) {
    initialsChars[initialsIdx] = ch; AU.blip(700 + initialsIdx * 200, 0.08, 'square', 0.12);
    if (initialsIdx < 2) initialsIdx++; else confirmInitials();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const d = e.key === 'ArrowUp' ? 1 : -1;
    const cur = LETTERS.indexOf(initialsChars[initialsIdx]);
    initialsChars[initialsIdx] = LETTERS[(cur + d + LETTERS.length) % LETTERS.length];
    AU.tick();
  } else if (e.key === 'ArrowRight') initialsIdx = Math.min(2, initialsIdx + 1);
  else if (e.key === 'ArrowLeft') initialsIdx = Math.max(0, initialsIdx - 1);
  else if (e.key === 'Enter') confirmInitials();
  renderInitials();
}
function confirmInitials() {
  initialsActive = false;
  const sc = loadScores();
  sc.push({ ini: initialsChars.join(''), score: G.score, diff: G.diff.label });
  sc.sort((a, b) => b.score - a.score); sc.length = Math.min(sc.length, 8);
  saveScores(sc);
  dom.initials.querySelector('p').textContent = '★ SAVED. THE SEALS SAW EVERYTHING. ★';
  renderInitials(); AU.fanfare();
}

// ============================================================
// UPDATE
// ============================================================
const HEAT_NAMES = ['COMFY', 'TOASTY', 'OW OW OW', 'BURNING', 'ON FIRE'];
function footState(v) { return v < 25 ? 0 : v < 45 ? 1 : v < 70 ? 2 : v < 90 ? 3 : 4; }

function updatePlaying(dt) {
  G.runTime += dt; G.levelTime += dt;
  const p = player;
  p.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  const inWater = p.z <= waveReachNow;
  let speed = (p.sprint ? 9 : 6) * (inWater ? 0.55 : 1);
  if (G.heatState === 3) speed *= 1.25;
  if (G.heatState === 4) speed *= 1.35;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  const fx = -sy, fz = -cy, rx = cy, rz = -sy;
  let dx = (fx * mz + rx * mx), dz = (fz * mz + rz * mx);
  const dl = Math.hypot(dx, dz);
  if (dl > 0) { dx /= dl; dz /= dl; }
  p.vx *= Math.pow(0.05, dt); p.vz *= Math.pow(0.05, dt);
  p.x += (dx * speed + p.vx) * dt;
  p.z += (dz * speed + p.vz) * dt;
  p.x = clamp(p.x, X_MIN, X_MAX); p.z = clamp(p.z, -15.5, 34);

  // refuge check (you stand ON them now)
  let onRefuge = null;
  for (const r of G.refuges) {
    if (Math.hypot(p.x - r.x, p.z - r.z) < r.r) { onRefuge = r; break; }
  }
  // towel crab ambush
  if (onRefuge && onRefuge.hasCrab && !onRefuge.crabDone) {
    onRefuge.crabDone = true; G.stats.crabs++;
    G.health -= 5; player.vx += 3; player.vz += 2;
    addToast('\u{1F980} THERE WAS A CRAB IN THE TOWEL', true);
    AU.thwack(); say('CRAB. CRAB. CRAB.', true);
  }

  const ground = getHeight(p.x, p.z) + (onRefuge ? onRefuge.h : 0);
  if (p.grounded && keys.has('Space')) { p.vy = 5.2; p.grounded = false; AU.blip(240, 0.1, 'triangle', 0.1); }
  if (!p.grounded) {
    p.vy -= 13.5 * dt; p.y += p.vy * dt;
    if (p.y <= ground) { p.y = ground; p.grounded = true; p.vy = 0; }
  } else p.y = ground;

  // steps
  const moving = dl > 0 && p.grounded;
  if (moving) {
    p.stepAcc += speed * dt;
    const stepLen = p.sprint ? 2.1 : 1.8;
    if (p.stepAcc >= stepLen) {
      p.stepAcc = 0; G.stats.steps++;
      G.planted = G.planted === 'L' ? 'R' : 'L';
      AU.step(G.heatState, inWater);
      const h = heatAt(p.x, p.z, G.t);
      if (!inWater && !onRefuge && h > 0.55) G.stats.hotSteps++;
    }
  }

  // feet heat — hot sand is NOT a place to live
  const resist = heatResist();
  const coolBonus = hasItem('popsicle') ? 28 : 0;
  const shaded = inCloudShade(p.x, p.z);
  function applyFoot(foot, rate) {
    if (rate > 0) {
      const kelp = G.slots.find(s => s.key === 'kelp' && s.shield > 0);
      if (kelp) { const abs = Math.min(kelp.shield, rate * dt); kelp.shield -= abs; rate -= abs / dt; if (kelp.shield <= 0) { removeSlot(kelp); addToast('the kelp gave its life', true); AU.poof(); } }
    }
    G.feet[foot] = clamp(G.feet[foot] + rate * dt, 0, 100);
  }
  let rateL, rateR;
  if (inWater) { rateL = rateR = -55 - coolBonus; }
  else if (!p.grounded) { rateL = rateR = -6 - coolBonus; }
  else if (onRefuge) { rateL = rateR = -35 - coolBonus; }
  else if (shaded) { rateL = rateR = -14 - coolBonus; }
  else {
    const h = heatAt(p.x, p.z, G.t);
    if (h < 0.42) { rateL = rateR = -8 - coolBonus; }
    else {
      const base = (h - 0.42) * 42 * effHeat() * resist;
      if (moving) {
        rateL = G.planted === 'L' ? base * 0.75 : base * 0.3;
        rateR = G.planted === 'R' ? base * 0.75 : base * 0.3;
      } else { rateL = rateR = base * 0.6; }
      rateL -= coolBonus; rateR -= coolBonus;
    }
  }
  applyFoot('L', rateL); applyFoot('R', rateR);
  G.stats.maxL = Math.max(G.stats.maxL, G.feet.L);
  G.stats.maxR = Math.max(G.stats.maxR, G.feet.R);

  // heat state + voice + health
  const maxF = Math.max(G.feet.L, G.feet.R);
  G.heatState = footState(maxF);
  G.stats.maxState = Math.max(G.stats.maxState, G.heatState);
  G.levelMaxState = Math.max(G.levelMaxState, G.heatState);
  if (G.heatState > G.prevHeatState && G.heatState >= 1) {
    const lines = OW_LINES[G.heatState - 1];
    say(lines[Math.floor(Math.random() * lines.length)]);
  } else if (G.heatState >= 2 && G.t - G.lastOwLine > 6) {
    G.lastOwLine = G.t;
    const lines = OW_LINES[G.heatState - 1];
    say(lines[Math.floor(Math.random() * lines.length)]);
  }
  G.prevHeatState = G.heatState;
  for (const f of ['L', 'R']) if (G.feet[f] > 72) G.health -= (G.feet[f] - 72) / 28 * 4.5 * dt;
  if (G.heatState === 4) {
    G.health -= 3.5 * dt;
    if (hasItem('duck') && G.t - G.lastSqueak > 3) { G.lastSqueak = G.t; AU.squeak(); }
  }
  if (G.feet.L < 28 && G.feet.R < 28 && G.health < 100) G.health += 2.5 * dt;
  G.health = clamp(G.health, 0, 100);

  // aggro
  let aggroRate;
  if (inWater) aggroRate = 22;
  else if (p.z < waveReachNow + 2.5) aggroRate = 15;
  else aggroRate = -7;
  if (aggroRate > 0) {
    aggroRate *= effAggro();
    if (hasItem('pizza')) aggroRate *= 2.5;
  }
  if (hasItem('spinach')) aggroRate = Math.min(aggroRate, -10);
  G.aggro = clamp(G.aggro + aggroRate * dt, 0, 100);
  if (G.aggro >= 100 && G.gulls.length === 0) {
    G.stats.everAggroMax = true; G.levelAggroMax = true;
    spawnGulls(); G.aggro = 35;
  }
  updateGulls(dt);
  updateEvents(dt);

  // items
  for (const s of [...G.slots]) {
    if (isFinite(s.t)) {
      s.t -= dt;
      if (s.t <= 0) { removeSlot(s); addToast(s.def.emoji + ' ' + s.def.name + ' expired', true); AU.poof(); }
    }
  }
  for (const it of G.items) {
    if (it.taken) continue;
    it.spin += dt * 2; it.mesh.rotation.y = it.spin;
    it.mesh.children[1].position.y = 1.3 + Math.sin(G.t * 2 + it.spin) * 0.15;
    if (Math.hypot(p.x - it.x, p.z - it.z) < 2.1) {
      it.taken = true; levelGroup.remove(it.mesh);
      addItemToSlots(it.key);
    }
  }

  // hot streak
  const hh = inWater || onRefuge || shaded ? 0 : heatAt(p.x, p.z, G.t);
  if (moving && p.sprint && hh > 0.55) {
    G.hotStreak += speed * dt;
    if (G.hotStreak > 28) { G.hotStreak = 0; addToast('HOT STREAK! +150'); G.stats.hotStreaks++; addPoints(150); }
  } else G.hotStreak = 0;

  // goal + beacon + gauntlet warning
  const goalDist = Math.hypot(G.goal.x - p.x, G.goal.z - p.z);
  AU.beacon(G.goal.def.beacon, goalDist);
  if (G.goal.def.gauntlet && !G.ev.gauntletWarned && p.x > G.goal.x - 28) {
    G.ev.gauntletWarned = true;
    addToast('\u{1F525} THE FINAL GAUNTLET \u{1F525}', true);
    say('the last stretch. it always burns.', true);
  }
  dom.goallabel.textContent = G.goal.def.emoji + ' ' + G.goal.def.name + ': ' + Math.max(0, Math.round(goalDist)) + 'm';
  if (goalDist < G.goal.def.radius) { levelComplete(); return; }
  if (G.health <= 0) { endRun(); return; }

  // camera
  const wobble = G.heatState >= 3 ? Math.sin(G.t * 7) * 0.05 * (G.heatState - 2) : 0;
  const bob = moving ? Math.sin(p.stepAcc / (p.sprint ? 2.1 : 1.8) * Math.PI * 2) * 0.07 : 0;
  camera.position.set(p.x, p.y + 1.62 + bob, p.z);
  camera.rotation.set(p.pitch, p.yaw + wobble, wobble * 0.5, 'YXZ');
}

// ---------------- HUD ----------------
function updateHUD() {
  dom.lfoot.style.width = G.feet.L + '%';
  dom.rfoot.style.width = G.feet.R + '%';
  dom.lfootT.textContent = HEAT_NAMES[footState(G.feet.L)];
  dom.rfootT.textContent = HEAT_NAMES[footState(G.feet.R)];
  dom.health.style.width = G.health + '%';
  dom.aggro.style.width = G.aggro + '%';
  dom.heatstate.textContent = HEAT_NAMES[G.heatState];
  dom.heatstate.className = 's' + G.heatState;
  dom.smoke.className = G.heatState === 4 ? 'on' : '';
  dom.vignette.style.opacity = clamp((Math.max(G.feet.L, G.feet.R) - 60) / 40, 0, 1) * 0.85;
  dom.timelabel.textContent = G.levelTime.toFixed(1) + 's';
  dom.scorelabel.textContent = 'SCORE ' + G.totalScore;
  dom.slots.forEach((el, i) => {
    const s = G.slots[i];
    if (!s) { el.className = 'slot empty'; el.innerHTML = 'EMPTY'; return; }
    el.className = 'slot';
    let sub = '';
    if (isFinite(s.t)) sub = Math.ceil(s.t) + 's';
    else if (s.uses) sub = s.uses + ' uses';
    else if (s.shield) sub = Math.ceil(s.shield) + ' shield';
    else sub = '∞';
    el.innerHTML = s.def.emoji + '<div class="sname">' + s.def.name + '</div><div class="stime">' + sub + '</div>';
  });
}

// ---------------- attract mode ----------------
function updateAttract(t) {
  const a = t * 0.06;
  camera.position.set(-40 + 50 * Math.sin(a), 9 + 2 * Math.sin(a * 2.3), 14 + 7 * Math.cos(a));
  camera.lookAt(20 * Math.sin(a * 0.5), 0.5, -6);
}

// ---------------- nursery pups bounce ----------------
function updatePups(dt) {
  if (!G.goal || G.goal.key !== 'nursery') return;
  for (const c of G.goal.mesh.children) {
    if (c.userData && c.userData.pup) {
      const amp = c.userData.bounce ? 1.2 : 0.25;
      c.position.y = 0.25 + Math.abs(Math.sin(G.t * 3 + c.position.x * 5)) * amp;
    }
  }
}

// ============================================================
// MAIN LOOP
// ============================================================
seedNoise(G.seed);
generateLevel();
renderHighscores();
window.DBYF = {
  G, player, levelComplete, nextLevel, endRun, generateLevel, fireEvent,
  step(dt) {  // headless sim tick for testing/balancing
    dt = dt || 0.016; G.dt = dt; G.t += dt;
    updateWetness(G.t);
    if (G.state === 'playing') { updatePlaying(dt); updateHUD(); }
  },
};
const clock = new THREE.Clock();
let colorTimer = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.dt = dt; G.t += dt;
  updateWetness(G.t);
  updateWater();
  colorTimer -= dt;
  if (colorTimer <= 0) { colorTimer = 0.12; updateSandColors(G.t); }
  updateDolphin(dt);
  updatePups(dt);
  if (G.state === 'playing') { updatePlaying(dt); updateHUD(); }
  else if (G.state === 'title') updateAttract(G.t);
  sunSprite.position.x = camera.position.x + 60;
  renderer.render(scene, camera);
}
loop();
