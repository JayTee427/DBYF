// ============================================================
// main.js — camera, input, simulation, flow, arcade layer
// ============================================================
import * as THREE from 'three';
import { clamp, lerp, damp, angleLerp, mulberry32 } from './engine.js';
import {
  S, W, HEAT, STAM, DIFFS, freshStats, HEAT_NAMES, footState,
  effHeat, effAggro, hasItem,
} from './state.js';
import {
  scene, groundY, heatAt, wetness, waveZ, shadeAt, updateTide, updateOcean,
  paintSand, updateHaze, faceHaze, sunSprite, WEATHER,
} from './world.js';
import {
  Runner, ITEMS, GOALS, generateLevel, updateBirds, spawnGullRaid, spawnFalcon,
  updateEvents, updateSanderlings, particles, prints, wire, levelGroup,
} from './actors.js';
import { AU, say, OW } from './audio.js';

// ---------------- renderer & camera ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// yaw = -PI/2 puts the camera behind the runner looking up the beach toward the goal
const cam = { yaw: -Math.PI / 2, pitch: 0.30, dist: 8.2, height: 3.2, fov: 62, shake: 0 };

// ---------------- DOM ----------------
const $ = (id) => document.getElementById(id);
const D = {
  title: $('title'), hud: $('hud'), pause: $('pause'), inter: $('interlevel'), end: $('end'),
  lvl: $('lvl'), weather: $('weather'), goalLbl: $('goalLbl'), timeLbl: $('timeLbl'), scoreLbl: $('scoreLbl'),
  lfoot: $('lfoot'), rfoot: $('rfoot'), lfootT: $('lfootT'), rfootT: $('rfootT'),
  hp: $('hp'), stam: $('stam'), aggro: $('aggro'),
  slots: [$('s0'), $('s1'), $('s2')],
  state: $('heatstate'), toasts: $('toasts'), vig: $('vignette'), flash: $('flash'),
  arrow: $('arrow'), scoutHint: $('scoutHint'), combo: $('combo'),
  ilTitle: $('ilTitle'), ilLines: $('ilLines'), ilNext: $('ilNext'),
  verdict: $('verdict'), epitaph: $('epitaph'), card: $('card'), finalScore: $('finalScore'),
  initials: $('initials'), cells: [$('c0'), $('c1'), $('c2')], hs: $('hsrows'),
};

// ---------------- toasts & score ----------------
function toast(text, kind) {
  const d = document.createElement('div');
  d.className = 'toast' + (kind ? ' ' + kind : '');
  d.textContent = text;
  D.toasts.appendChild(d);
  setTimeout(() => d.remove(), 1800);
}
function addScore(n) { S.score += Math.round(n * S.diff.mult); }
wire(toast, addScore);

// ---------------- input ----------------
const keys = new Set();
const input = { fwd: 0, back: 0, left: 0, right: 0, sprint: 0, jump: false, scout: false };
addEventListener('keydown', (e) => {
  if (S.mode === 'dead') { initialsKey(e); return; }
  if (keys.has(e.code)) return;
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyE') useItem();
  if (e.code === 'KeyM') { const m = AU.toggleMute(); toast(m ? '🔇 MUTED' : '🔊 SOUND ON'); syncVolUI(); }
  if (e.code === 'BracketLeft') { AU.setVolume(AU.volume - 0.1); syncVolUI(); }
  if (e.code === 'BracketRight') { AU.setVolume(AU.volume + 0.1); syncVolUI(); }
  if (e.code === 'Escape' && S.mode === 'play') setPaused(true);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function readInput() {
  input.fwd = keys.has('KeyW') || keys.has('ArrowUp');
  input.back = keys.has('KeyS') || keys.has('ArrowDown');
  input.left = keys.has('KeyA') || keys.has('ArrowLeft');
  input.right = keys.has('KeyD') || keys.has('ArrowRight');
  input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  input.jump = keys.has('Space');
  input.scout = keys.has('KeyQ') || rmb;
}

let locked = false, rmb = false, dragging = false;
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button === 2) rmb = true;
  dragging = true;
  if (S.mode === 'play' && !locked) tryLock();
});
addEventListener('mouseup', (e) => { if (e.button === 2) rmb = false; dragging = false; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === renderer.domElement; });
function tryLock() { const p = renderer.domElement.requestPointerLock?.(); if (p?.catch) p.catch(() => { }); }
addEventListener('mousemove', (e) => {
  if (S.mode !== 'play' && S.mode !== 'scout') return;
  if (!locked && !dragging) return;
  cam.yaw -= e.movementX * 0.0026;
  cam.pitch = clamp(cam.pitch + e.movementY * 0.0022, -0.15, 1.05);
});
addEventListener('wheel', (e) => {
  if (S.mode !== 'play') return;
  cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 0.7, 5, 14);
}, { passive: true });

// ---------------- volume control ----------------
const volSlider = $('vol'), volLabel = $('volLabel');
function syncVolUI() {
  if (!volSlider) return;
  volSlider.value = String(Math.round(AU.volume * 100));
  volLabel.textContent = AU.muted ? 'MUTED' : Math.round(AU.volume * 100) + '%';
}
volSlider?.addEventListener('input', () => {
  AU.muted = false;
  AU.ensure(); AU.resume();
  AU.setVolume(volSlider.value / 100);
  syncVolUI();
});
$('muteBtn')?.addEventListener('click', () => { AU.ensure(); AU.toggleMute(); syncVolUI(); });
syncVolUI();

// ---------------- the runner ----------------
const runner = new Runner();

// ---------------- items ----------------
function grantItem(key) {
  const def = ITEMS[key];
  const inst = { key, def, t: def.dur ?? Infinity, shield: def.shield || 0, uses: def.uses || 0 };
  S.slots.push(inst);
  if (S.slots.length > 3) {
    const out = S.slots.shift();
    toast('↻ rotated out: ' + out.def.name, 'warn');
    AU.poof();
  }
  S.stats.items++; addScore(50); AU.pickup();
  toast('+ ' + def.icon + ' ' + def.name + ' — ' + def.blurb);
  if (key === 'pizza') { S.health = Math.min(100, S.health + 28); }
  if (key === 'spinach') { AU.shanty(); say('SPINACH TIME!', true); }
  if (key === 'duck') say('quack.', false);
  if (key === 'bottle') buildCoolRoute();
}
function dropSlot(inst) { const i = S.slots.indexOf(inst); if (i >= 0) S.slots.splice(i, 1); }
function useItem() {
  if (S.mode !== 'play' || !runner.grounded) return;
  const oar = S.slots.find(s => s.key === 'oar' && s.uses > 0);
  if (oar) {
    oar.uses--;
    runner.vy = 4.6; runner.grounded = false;
    runner.kx += Math.sin(runner.facing) * 17; runner.kz += Math.cos(runner.facing) * 17;
    toast('OAR VAULT!'); AU.sweep(300, 700, 0.25, 'triangle', 0.16);
    if (oar.uses <= 0) { dropSlot(oar); toast('the oar snapped', 'warn'); }
    return;
  }
  const bb = S.slots.find(s => s.key === 'boogie' && s.uses > 0);
  if (bb) {
    bb.uses--;
    runner.kx += Math.sin(runner.facing) * 22; runner.kz += Math.cos(runner.facing) * 22;
    S.stamina = Math.min(STAM.max, S.stamina + 30);
    toast('SURF THE SAND!'); AU.sweep(500, 900, 0.4, 'sine', 0.13);
    if (bb.uses <= 0) { dropSlot(bb); toast('the board split', 'warn'); }
    return;
  }
  AU.reject();
}
function heatResist() {
  let m = 1;
  if (hasItem('sandals')) m *= 0.38;
  if (hasItem('sunscreen')) m *= 0.62;
  if (hasItem('cap')) m *= 0.86;
  return m;
}

// ---------------- message-in-a-bottle: reveal a cool route ----------------
let routeMarks = [];
function clearRoute() { for (const m of routeMarks) scene.remove(m); routeMarks = []; }
function buildCoolRoute() {
  clearRoute();
  if (!S.goal) return;
  let x = runner.x, z = runner.z;
  for (let i = 0; i < 16 && x < S.goal.x - 6; i++) {
    let best = null;
    for (let dz = -12; dz <= 12; dz += 3) {
      const nz = clamp(z + dz, -4, 24), nx = x + 9;
      const h = heatAt(nx, nz, S.t) + Math.abs(nz - S.goal.z) * 0.004;
      if (!best || h < best.h) best = { x: nx, z: nz, h };
    }
    if (!best) break;
    x = best.x; z = best.z;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 4),
      new THREE.MeshBasicMaterial({ color: 0x66ffd0, transparent: true, opacity: 0.75 }));
    m.position.set(x, groundY(x, z) + 1.5, z);
    m.rotation.x = Math.PI;
    scene.add(m); routeMarks.push(m);
  }
  toast('\u{1F4EC} the bottle shows a cool path');
}

// ---------------- flow ----------------
function startRun(diffKey) {
  S.diffKey = diffKey; S.diff = DIFFS[diffKey];
  S.mode = 'play'; S.level = 1; S.score = 0; S.runTime = 0;
  S.feet.L = 0; S.feet.R = 0; S.health = 100; S.stamina = STAM.max;
  S.aggro = 0; S.slots = []; S.stats = freshStats(); S.tutorial = 0;
  S.heatState = 0; S.prevHeatState = 0; S.combo = 0;
  clearRoute();
  generateLevel(runner);
  cam.yaw = -Math.PI / 2; cam.pitch = 0.30;
  D.title.classList.add('hidden'); D.end.classList.add('hidden');
  D.inter.classList.add('hidden'); D.pause.classList.add('hidden');
  D.hud.classList.remove('hidden');
  AU.ensure(); AU.resume(); tryLock();
  announce();
}
function announce() {
  toast(S.goal.def.icon + '  FIND: ' + S.goal.def.name);
  const openers = {
    truck: 'I can hear the ice cream truck!',
    flipflops: 'my flip flops! all the way up there!',
    shower: 'a shower. a cold, beautiful shower.',
    umbrella: 'that umbrella has my name on it.',
    tidepools: 'to the tide pools!',
    nursery: 'the seals. I hear the seals!',
  };
  say(openers[S.goal.key] || 'off we go.', true);
}
function setPaused(p) {
  if (p && S.mode === 'play') { S.mode = 'paused'; D.pause.classList.remove('hidden'); document.exitPointerLock?.(); }
  else if (!p && S.mode === 'paused') { S.mode = 'play'; D.pause.classList.add('hidden'); tryLock(); }
}
D.pause.addEventListener('click', () => setPaused(false));
document.querySelectorAll('.diffbtn').forEach(b =>
  b.addEventListener('click', () => { AU.ensure(); AU.resume(); startRun(b.dataset.diff); }));
$('btnRetry').addEventListener('click', () => startRun(S.diffKey));
$('btnTitle').addEventListener('click', () => {
  D.end.classList.add('hidden'); D.hud.classList.add('hidden');
  D.title.classList.remove('hidden'); S.mode = 'title';
  renderScores(); document.exitPointerLock?.();
});

// ---------------- level complete ----------------
const FLAVOR = [
  'THE SAND GROWS ANGRIER', 'THE GULLS KNOW YOUR NAME', 'THE SUN TAKES IT PERSONALLY',
  'EVEN THE TOWELS HAVE CRABS', 'THE OCEAN IS YOUR ONLY FRIEND', 'YOUR SOLES ARE LEGEND',
  'THE BEACH REMEMBERS YOU', 'SPF 1000 WOULD NOT HELP',
];
function levelComplete() {
  S.mode = 'interlevel';
  const lines = [];
  let sc = 2000; lines.push(['REACHED THE GOAL', '+2000']);
  if (S.goal.key === 'nursery') { sc += 1200; lines.push(['⭐ SEAL APPROVAL', '+1200']); }
  const tb = Math.max(0, Math.round((120 - S.levelTime) * 18));
  if (tb) { sc += tb; lines.push(['SPEED BONUS', '+' + tb]); }
  if (S.slots.length === 3) { sc += 300; lines.push(['FULL POUCH', '+300']); }
  if (hasItem('duck')) { sc += 600; lines.push(['DUCK LOYALIST', '+600']); }
  if (S.heatState >= 3) { sc += 500; lines.push(['PHOTO FINISH', '+500']); }
  if (S.stats.cleanLevel) { sc += 900; lines.push(['COOL CUSTOMER', '+900']); }
  if (S.stats.pacifist) { sc += 600; lines.push(['PACIFIST', '+600']); }
  if (S.stats.bestCombo >= 3) {
    const cb = S.stats.bestCombo * 150;
    sc += cb; lines.push(['BEST SOLE TRAIN ×' + S.stats.bestCombo, '+' + cb]);
  }
  const mult = S.diff.mult * (1 + 0.1 * (S.level - 1));
  sc = Math.round(sc * mult);
  S.score += sc;
  lines.push(['LEVEL ' + S.level + ' × ' + S.diff.label, '×' + mult.toFixed(1)]);

  D.ilTitle.textContent = S.goal.def.icon + ' ' + S.goal.def.name;
  D.ilLines.innerHTML = lines.map(l => `<div class="row"><span>${l[0]}</span><span>${l[1]}</span></div>`).join('')
    + `<div class="row total"><span>TOTAL</span><span>${S.score}</span></div>`;
  D.ilNext.textContent = 'LEVEL ' + (S.level + 1) + ' — ' +
    (S.level <= FLAVOR.length ? FLAVOR[S.level - 1] : FLAVOR[3 + Math.floor(Math.random() * (FLAVOR.length - 3))]);
  D.inter.classList.remove('hidden');
  AU.fanfare();
  say(S.goal.def.line, true);
  if (S.goal.key === 'nursery') { AU.bark(0.2); setTimeout(() => AU.bark(0.16), 450); setTimeout(() => AU.bark(0.14), 900); }
  particles.burst(runner.x, runner.y + 1.4, runner.z, 26, { color: 0xffe07a, size: 0.42, ttl: 1.3, vy: 3.4, spread: 3.4 });
  setTimeout(nextLevel, 3600);
}
function nextLevel() {
  if (S.mode !== 'interlevel') return;
  S.level++;
  S.feet.L = 0; S.feet.R = 0;
  S.health = Math.min(100, S.health + 22);
  S.stamina = STAM.max;
  clearRoute();
  generateLevel(runner);
  D.inter.classList.add('hidden');
  S.mode = 'play';
  announce();
}

// ---------------- death ----------------
function doneness(v) {
  if (v < 20) return 'RARE (nice)';
  if (v < 40) return 'MEDIUM-RARE';
  if (v < 60) return 'MEDIUM';
  if (v < 80) return 'WELL DONE';
  if (v < 95) return 'CHARCOAL';
  return 'TECHNICALLY BRISKET';
}
function die() {
  S.mode = 'dead';
  document.exitPointerLock?.();
  const s = S.stats;
  const consolation = Math.round((runner.x - W.startX) * 3 * S.diff.mult);
  S.score += consolation;
  D.verdict.textContent = 'YOUR FEET GAVE OUT';
  D.epitaph.textContent = [
    'Here lie two feet. They were told to bring sandals.',
    'The sand remains undefeated.',
    'The gulls will sing of this day.',
    'He was warned. He was given a rubber duck. He persisted.',
  ][Math.floor(Math.random() * 4)];
  const rows = [
    ['Beaches cleared', S.level - 1],
    ['Fell on level', S.level],
    ['Left foot', doneness(s.maxL)],
    ['Right foot', doneness(s.maxR)],
    ['Steps taken', s.steps],
    ['Steps on hot sand', s.hotSteps],
    ['Refuges used', s.refugesUsed],
    ['Best SOLE TRAIN', '×' + s.bestCombo],
    ['Desperate leaps', s.leaps],
    ['Birds dodged', s.dodges],
    ['Birds... not dodged', s.hits],
    ['Towel crabs met', s.crabs],
    ['Items beachcombed', s.items],
    ['Total time', S.runTime.toFixed(1) + 's'],
    ['Diagnosis', S.level > 2 ? 'a legend, briefly' : 'why did you do this'],
  ];
  D.card.innerHTML = rows.map(r => `<div class="row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')
    + `<div class="row bonus"><span>DISTANCE CONSOLATION</span><span>+${consolation}</span></div>`;
  D.finalScore.textContent = 'SCORE: 0';
  let shown = 0, tickN = 0;
  const step = Math.max(1, Math.round(S.score / 45));
  const iv = setInterval(() => {
    shown = Math.min(S.score, shown + step);
    D.finalScore.textContent = 'SCORE: ' + shown;
    if (tickN++ % 4 === 0) AU.tick();          // a gentle rattle, not a machine gun
    if (shown >= S.score) clearInterval(iv);
  }, 38);
  initialsOn = qualifies(S.score);
  if (initialsOn) {
    D.initials.classList.remove('hidden');
    D.initials.querySelector('p').textContent = '★ HIGH SCORE — TYPE YOUR INITIALS ★';
    iIdx = 0; iChars = ['A', 'A', 'A']; renderInitials();
  } else D.initials.classList.add('hidden');
  D.end.classList.remove('hidden');
  AU.sad(); say('tell my shoes... I loved them.', true);
}

// ---------------- high scores ----------------
const loadScores = () => { try { return JSON.parse(localStorage.getItem('dbyf_hs') || '[]'); } catch { return []; } };
const saveScores = (v) => { try { localStorage.setItem('dbyf_hs', JSON.stringify(v)); } catch { } };
function qualifies(sc) { if (sc <= 0) return false; const l = loadScores(); return l.length < 8 || sc > l[l.length - 1].sc; }
function renderScores() {
  const l = loadScores();
  D.hs.innerHTML = l.length
    ? l.map((r, i) => `<tr><td>${i + 1}.</td><td class="ini">${r.ini}</td><td class="sc">${r.sc}</td><td class="df">${r.df}</td><td class="lv">LV${r.lv || 1}</td></tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#a89070">no survivors yet. be the first.</td></tr>';
}
let initialsOn = false, iIdx = 0, iChars = ['A', 'A', 'A'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';
function renderInitials() {
  D.cells.forEach((c, i) => { c.textContent = iChars[i]; c.classList.toggle('on', i === iIdx && initialsOn); });
}
function initialsKey(e) {
  if (!initialsOn) return;
  const ch = e.key.toUpperCase();
  if (ch.length === 1 && LETTERS.includes(ch)) {
    iChars[iIdx] = ch; AU.tone(700 + iIdx * 200, 0.07, 'square', 0.11);
    if (iIdx < 2) iIdx++; else commitInitials();
  } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const d = e.key === 'ArrowUp' ? 1 : -1;
    const cur = LETTERS.indexOf(iChars[iIdx]);
    iChars[iIdx] = LETTERS[(cur + d + LETTERS.length) % LETTERS.length]; AU.tick();
  } else if (e.key === 'ArrowRight') iIdx = Math.min(2, iIdx + 1);
  else if (e.key === 'ArrowLeft') iIdx = Math.max(0, iIdx - 1);
  else if (e.key === 'Enter') commitInitials();
  renderInitials();
}
function commitInitials() {
  initialsOn = false;
  const l = loadScores();
  l.push({ ini: iChars.join(''), sc: S.score, df: S.diff.label.split(' ')[0], lv: S.level });
  l.sort((a, b) => b.sc - a.sc); l.length = Math.min(l.length, 8);
  saveScores(l);
  D.initials.querySelector('p').textContent = '★ SAVED. THE SEALS SAW EVERYTHING. ★';
  renderInitials(); AU.fanfare();
}

// ---------------- tutorial ----------------
const TUTORIAL = [
  [2.0, 'WASD to run — mouse to look around'],
  [7.0, 'PALE sand is cool. ORANGE shimmering sand BURNS.'],
  [13.0, 'HOLD Q to SCOUT — rise up and plan your route'],
  [20.0, 'Land on driftwood & rocks to chain a SOLE TRAIN'],
  [28.0, 'SPACE hops (no burning in mid-air) and swaps your lead foot'],
  [36.0, 'SHIFT + SPACE = LEAP — clear a wide scorch band'],
  [45.0, 'The water resets both feet — but the birds are watching'],
];

// ---------------- simulation ----------------
function simulate(dt) {
  S.levelTime += dt; S.runTime += dt;

  const scouting = input.scout && runner.grounded;
  if (scouting && S.mode === 'play') { S.mode = 'scout'; S.stats.scouts++; AU.scout(); }
  else if (!scouting && S.mode === 'scout') S.mode = 'play';

  const st = runner.update(dt, input, cam.yaw);
  const { inWater, refuge } = st;

  // ---------- heat ----------
  const resist = heatResist();
  const cool = hasItem('popsicle') ? 30 : 0;
  const shade = shadeAt(runner.x, runner.z);
  const airborne = !runner.grounded;
  let rate;
  if (inWater) rate = HEAT.coolWater;
  else if (airborne) rate = HEAT.coolAir;
  else if (refuge) rate = HEAT.coolRefuge;
  else {
    const h = heatAt(runner.x, runner.z, S.t) * effHeat();
    if (h < HEAT.safe) rate = HEAT.coolCool - wetness(runner.z, S.t) * 12;
    else if (shade > 0.35) rate = HEAT.coolShade;
    else rate = (h - HEAT.safe) * HEAT.burnRate * resist;
  }
  rate -= cool;

  // kelp soaks up incoming heat until it gives out
  if (rate > 0) {
    const kelp = S.slots.find(s => s.key === 'kelp' && s.shield > 0);
    if (kelp) {
      const absorb = Math.min(kelp.shield, rate * dt);
      kelp.shield -= absorb; rate -= absorb / dt;
      if (kelp.shield <= 0) { dropSlot(kelp); toast('the kelp gave its life', 'warn'); AU.poof(); }
    }
  }
  // the planted foot takes the brunt — alternating is how you survive
  const moving = runner.speed > 0.6 && runner.grounded;
  if (rate > 0 && moving) {
    S.feet[S.plant] = clamp(S.feet[S.plant] + rate * 1.35 * dt, 0, 100);
    const other = S.plant === 'L' ? 'R' : 'L';
    S.feet[other] = clamp(S.feet[other] + rate * 0.45 * dt, 0, 100);
  } else {
    S.feet.L = clamp(S.feet.L + rate * dt, 0, 100);
    S.feet.R = clamp(S.feet.R + rate * dt, 0, 100);
  }
  S.stats.maxL = Math.max(S.stats.maxL, S.feet.L);
  S.stats.maxR = Math.max(S.stats.maxR, S.feet.R);

  // ---------- heat state ----------
  const worst = Math.max(S.feet.L, S.feet.R);
  S.heatState = footState(worst);
  S.stats.maxState = Math.max(S.stats.maxState, S.heatState);
  if (S.heatState >= 2) S.stats.cleanLevel = false;
  // cook a foot and the chain breaks — the cost of a bad line
  if (worst > HEAT.cookedAt && S.combo > 0) {
    if (S.combo >= 3) { toast('SOLE TRAIN BROKEN (×' + S.combo + ')', 'bad'); AU.reject(); }
    S.combo = 0;
  }
  if (S.heatState > S.prevHeatState && S.heatState >= 1) {
    const l = OW[S.heatState - 1]; say(l[Math.floor(Math.random() * l.length)]);
    if (S.heatState >= 3) cam.shake = 0.5;
  } else if (S.heatState >= 2 && S.t - S.lastNag > 5.5) {
    S.lastNag = S.t;
    const l = OW[S.heatState - 1]; say(l[Math.floor(Math.random() * l.length)]);
  }
  S.prevHeatState = S.heatState;

  // ---------- health ----------
  // health goes when a foot is genuinely cooked, and comes back when you cool off
  for (const f of ['L', 'R']) if (S.feet[f] > 78) S.health -= (S.feet[f] - 78) / 22 * 6.0 * dt;
  if (S.heatState === 4) {
    S.health -= 4.0 * dt;
    if (hasItem('duck') && S.t - S.lastSqueak > 2.6) { S.lastSqueak = S.t; AU.squeak(); }
  }
  if (worst < 25 && S.health < 100) S.health += 2.2 * dt;
  S.health = clamp(S.health, 0, 100);

  // ---------- bird aggro ----------
  // Several things draw them in, so the birds are a live pressure everywhere
  // on the beach — not a system you only meet if you paddle.
  let ag = -8;
  if (inWater) { ag = 26; S.stats.waterTime += dt; }
  else if (runner.z < waveZ + 3) ag = 15;
  if (S.heatState >= 4) ag += 15;                     // you smell like lunch
  else if (S.heatState === 3) ag += 6;
  if (hasItem('pizza')) ag += 12;
  if (hasItem('cap')) ag -= 3;                        // harder to spot
  if (ag > 0) ag *= effAggro();
  if (hasItem('spinach')) ag = Math.min(ag, -14);
  if (hasItem('hat')) ag *= 0.7;                      // a captain commands respect
  S.aggro = clamp(S.aggro + ag * dt, 0, 100);
  if (S.aggro >= 100 && S.birds.length === 0) {
    S.stats.pacifist = false;
    if (S.level >= 6 && Math.random() < 0.4) spawnFalcon(runner); else spawnGullRaid(runner);
    S.aggro = 30;
  }
  updateBirds(dt, runner);
  updateEvents(dt, runner);

  // ---------- items ----------
  for (const s of [...S.slots]) {
    if (isFinite(s.t)) {
      s.t -= dt;
      if (s.t <= 0) {
        dropSlot(s); AU.poof();
        toast(s.def.icon + ' ' + s.def.name + (s.key === 'sandals' ? ' flew off!' : ' expired'), 'warn');
        if (s.key === 'bottle') clearRoute();
      }
    }
  }
  for (const it of S.items) {
    if (it.taken) continue;
    it.ph += dt * 2.4;
    it.box.rotation.y = it.ph;
    it.box.position.y = 0.55 + Math.sin(it.ph) * 0.14;
    if (Math.hypot(runner.x - it.x, runner.z - it.z) < 2.2) {
      it.taken = true; levelGroup.remove(it.mesh);
      particles.burst(it.x, it.y + 0.8, it.z, 8, { color: 0xffe07a, size: 0.3, ttl: 0.6, spread: 1.6 });
      grantItem(it.key);
    }
  }

  // ---------- hot streak ----------
  if (moving && input.sprint && !inWater && !refuge && heatAt(runner.x, runner.z, S.t) * effHeat() > 0.75) {
    S.streak += runner.speed * dt;
    if (S.streak > 26) { S.streak = 0; toast('HOT STREAK! +250'); addScore(250); AU.coin(); }
  } else S.streak = 0;

  // ---------- tutorial ----------
  if (S.level === 1 && S.tutorial < TUTORIAL.length && S.levelTime > TUTORIAL[S.tutorial][0]) {
    toast(TUTORIAL[S.tutorial][1], 'tip');
    S.tutorial++;
  }

  // ---------- goal ----------
  const gd = Math.hypot(S.goal.x - runner.x, S.goal.z - runner.z);
  AU.beacon(S.goal.def.beacon, gd);
  AU.surfProximity(1 - clamp((runner.z - waveZ) / 22, 0, 1));
  if (S.goal.def.gauntlet && !S.ev.warned && runner.x > S.goal.x - 30) {
    S.ev.warned = true;
    toast('\u{1F525} THE FINAL GAUNTLET \u{1F525}', 'bad');
    say('the last stretch. it always burns.', true);
  }
  D.goalLbl.textContent = S.goal.def.icon + ' ' + S.goal.def.name + '  ' + Math.max(0, Math.round(gd)) + 'm';
  if (gd < S.goal.def.r) { levelComplete(); return; }
  if (S.health <= 0) { die(); return; }
}

// ---------------- camera ----------------
function updateCamera(dt) {
  const scouting = S.mode === 'scout';
  const wantDist = scouting ? 19 : cam.dist;
  const wantHeight = scouting ? 17 : cam.height;
  const wantPitch = scouting ? 0.85 : cam.pitch;
  const wantFov = scouting ? 78 : 62;

  cam._d = damp(cam._d ?? wantDist, wantDist, 7, dt);
  cam._h = damp(cam._h ?? wantHeight, wantHeight, 7, dt);
  cam._p = damp(cam._p ?? wantPitch, wantPitch, 7, dt);
  camera.fov = damp(camera.fov, wantFov, 7, dt);
  camera.updateProjectionMatrix();

  const cp = Math.cos(cam._p);
  const tx = runner.x + Math.sin(cam.yaw) * cam._d * cp;
  const tz = runner.z + Math.cos(cam.yaw) * cam._d * cp;
  const ty = runner.y + cam._h + Math.sin(cam._p) * cam._d * 0.55;

  cam.shake = Math.max(0, cam.shake - dt * 1.6);
  const sh = cam.shake * 0.16 + (S.heatState >= 3 ? 0.035 * (S.heatState - 2) : 0);
  camera.position.set(
    tx + (Math.random() - 0.5) * sh,
    Math.max(ty, groundY(tx, tz) + 1.2) + (Math.random() - 0.5) * sh,
    tz + (Math.random() - 0.5) * sh,
  );
  camera.lookAt(runner.x, runner.y + (scouting ? 0.4 : 1.25), runner.z);
}

// ---------------- HUD ----------------
function updateHUD() {
  D.lfoot.style.width = S.feet.L + '%';
  D.rfoot.style.width = S.feet.R + '%';
  D.lfootT.textContent = HEAT_NAMES[footState(S.feet.L)];
  D.rfootT.textContent = HEAT_NAMES[footState(S.feet.R)];
  D.hp.style.width = S.health + '%';
  D.stam.style.width = S.stamina + '%';
  D.aggro.style.width = S.aggro + '%';
  D.state.textContent = HEAT_NAMES[S.heatState];
  D.state.className = 's' + S.heatState;
  D.vig.style.opacity = clamp((Math.max(S.feet.L, S.feet.R) - 55) / 45, 0, 1) * 0.9;
  D.timeLbl.textContent = S.levelTime.toFixed(1) + 's';
  D.scoreLbl.textContent = 'SCORE ' + S.score;
  D.lvl.textContent = 'LV ' + S.level + '  —  BEACH #' + S.seed;
  D.weather.textContent = S.weather.name;
  D.scoutHint.classList.toggle('hidden', S.mode === 'scout' || S.level > 1);
  if (S.combo >= 2) {
    D.combo.classList.remove('hidden');
    D.combo.textContent = 'SOLE TRAIN ×' + S.combo;
    D.combo.style.fontSize = Math.min(15 + S.combo * 1.6, 34) + 'px';
  } else D.combo.classList.add('hidden');

  // goal arrow
  const dx = S.goal.x - runner.x, dz = S.goal.z - runner.z;
  const ang = Math.atan2(dx, dz) - cam.yaw;
  D.arrow.style.transform = `rotate(${-ang + Math.PI}rad)`;

  D.slots.forEach((el, i) => {
    const s = S.slots[i];
    if (!s) { el.className = 'slot empty'; el.innerHTML = '<span class="e">empty</span>'; return; }
    el.className = 'slot' + (s.def.tier === 2 ? ' rare' : '');
    let sub = isFinite(s.t) ? Math.ceil(s.t) + 's'
      : s.uses ? s.uses + '× [E]'
      : s.shield ? Math.ceil(s.shield) + ' shield' : '∞';
    el.innerHTML = `<span class="ic">${s.def.icon}</span><span class="nm">${s.def.name}</span><span class="tm">${sub}</span>`;
  });
}

// ---------------- attract mode ----------------
function attract(t) {
  const a = t * 0.055;
  camera.fov = 62; camera.updateProjectionMatrix();
  camera.position.set(Math.sin(a) * 55, 13 + Math.sin(a * 2.1) * 2.5, 16 + Math.cos(a) * 12);
  camera.lookAt(Math.sin(a * 0.6) * 25, 1.0, 2);
}

// ---------------- boot ----------------
S.stats = freshStats();
S.mode = 'title';
generateLevel(runner);
runner.root.visible = true;
renderScores();

const clock = new THREE.Clock();
let paintAcc = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  S.t += dt;

  readInput();
  updateTide(S.t);
  updateOcean(S.t);
  paintAcc -= dt;
  if (paintAcc <= 0) { paintAcc = 0.1; paintSand(S.t); }
  updateSanderlings(S.t);
  particles.update(dt);
  prints.update(dt);

  if (S.mode === 'play' || S.mode === 'scout') {
    simulate(dt);
    updateCamera(dt);
    updateHUD();
    updateHaze(S.t, runner.x, runner.z);
  } else if (S.mode === 'title') {
    attract(S.t);
  } else {
    updateCamera(dt);
  }
  faceHaze(camera);

  // seal pups bounce forever, because they are seals
  if (S.goal?.mesh.userData.pups) {
    for (const p of S.goal.mesh.userData.pups) {
      p.position.y = 0.28 + Math.abs(Math.sin(S.t * 3.2 + p.userData.ph)) * (S.mode === 'interlevel' ? 1.5 : 0.35);
    }
  }
  if (S.goal) S.goal.marker.position.y = groundY(S.goal.x, S.goal.z) + 9.5 + Math.sin(S.t * 2) * 0.5;
  sunSprite.position.set(camera.position.x + 70, 62, camera.position.z - 130);

  renderer.render(scene, camera);
}
loop();

// ---------------- debug / balance handle ----------------
window.DBYF = {
  S, runner, camera, cam, keys, input, renderer, scene, AU,
  levelComplete, die, nextLevel, generateLevel: () => generateLevel(runner),
  /** headless tick. `visual` does the expensive repaint; skip it for balance sims. */
  step(dt = 0.016, visual = true) {
    S.t += dt; readInput(); updateTide(S.t);
    if (S.mode === 'play' || S.mode === 'scout') { simulate(dt); if (visual) updateHUD(); }
    if (!visual) return;
    updateOcean(S.t); paintSand(S.t); updateSanderlings(S.t);
    updateCamera(dt); faceHaze(camera);
  },
  /** synchronous render → downscaled JPEG, so the art can be inspected headlessly */
  shot(w = 900, h = 560, q = 0.72) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    updateHaze(S.t, runner.x, runner.z); faceHaze(camera);
    renderer.render(scene, camera);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
    return c.toDataURL('image/jpeg', q);
  },
  goto(x, z) { runner.x = x; runner.z = z; runner.y = groundY(x, z); },
  heatProbe: (x, z) => heatAt(x, z, S.t) * effHeat(),
};
