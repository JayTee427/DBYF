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
  Runner, GOALS, generateLevel, updateEvents, checkCheckpoints, dropItem,
  particles, prints, wire, levelGroup,
} from './actors.js';
import {
  ITEMS, SYNERGIES, buildStats, activeSynergies, grant, removeItem, findItem,
  readyActive, tickCooldowns, checkSynergies, resetSynergies, hasItem as hasIt,
} from './items.js';
import {
  flock, updateBirds, updateSanderlings, scatterAt, clearFlock,
  spawnThief, spawnVulture, spawnFalcon, spawnEagle,
} from './birds.js';
import { wireBus } from './bus.js';
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
  banner: $('banner'), ability: $('ability'), swapHint: $('swapHint'), syn: $('syn'),
  invuln: $('invuln'),
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
function banner(title, sub) {
  D.banner.innerHTML = `<b>${title}</b><span>${sub || ''}</span>`;
  D.banner.classList.remove('hidden');
  D.banner.style.animation = 'none'; void D.banner.offsetWidth;
  D.banner.style.animation = '';
  clearTimeout(banner._t);
  banner._t = setTimeout(() => D.banner.classList.add('hidden'), 2600);
}
/** Pickups that fire on contact instead of taking a slot. */
function instantPickup(key) {
  if (key === 'sixseven') {
    const dur = 2 + Math.random() * 4;              // 2–6 seconds, nobody knows why
    S.invuln = dur; S.invulnMax = dur; S.lastChant = 0;
    banner('6 &mdash; 7', 'invincible for ' + dur.toFixed(1) + ' seconds');
    toast('\u{1F522} SIX SEVEN');
    addScore(600);
    cam.shake = 0.7;
    AU.tone(587, 0.16, 'triangle', 0.09);
    AU.tone(784, 0.2, 'triangle', 0.09, 0.16);
    particles.burst(runner.x, runner.y + 1.2, runner.z, 26,
      { color: 0xffd94a, size: 0.42, ttl: 1.1, vy: 3.2, spread: 3.4 });
  }
}
wire(toast, addScore);
wireBus({
  toast, score: addScore, banner,
  shake: (v) => { cam.shake = Math.max(cam.shake, v); },
  instant: instantPickup,
});

// ---------------- input ----------------
const keys = new Set();
const input = { fwd: 0, back: 0, left: 0, right: 0, sprint: 0, jump: false, scout: false };
addEventListener('keydown', (e) => {
  if (S.mode === 'dead') { initialsKey(e); return; }
  if (keys.has(e.code)) return;
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyE') useItem();
  if (e.code === 'KeyF' && nearItem) {                 // swap into a full build
    const out = S.slots[0];
    toast('dropped ' + out.def.icon + ' ' + out.def.name + ' for it', 'warn');
    takeItem(nearItem.it);
    nearItem = null;
  }
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

// ---------------- abilities [E] ----------------
let surfing = 0, planted = null;
function useItem() {
  if (S.mode !== 'play') return;
  const inst = readyActive();
  if (!inst) { AU.reject(); return; }
  if (inst.cd > 0) { toast(inst.def.name + ' still cooling (' + Math.ceil(inst.cd) + 's)', 'warn'); AU.reject(); return; }
  if (inst.charges <= 0) { AU.reject(); return; }
  const id = inst.def.active.id;

  if (id === 'vault') {
    if (!runner.grounded) { AU.reject(); return; }
    runner.vy = 5.0; runner.grounded = false;
    runner.kx += Math.sin(runner.facing) * 19; runner.kz += Math.cos(runner.facing) * 19;
    toast('OAR VAULT!'); AU.sweep(300, 700, 0.25, 'triangle', 0.1);

  } else if (id === 'surf') {
    surfing = 1.7;
    runner.kx += Math.sin(runner.facing) * 20; runner.kz += Math.cos(runner.facing) * 20;
    S.stamina = Math.min(STAM.max, S.stamina + 25);
    toast('SURFING! feet off the sand'); AU.sweep(500, 900, 0.4, 'sine', 0.08);

  } else if (id === 'douse') {
    S.feet.L = Math.max(0, S.feet.L - 55); S.feet.R = Math.max(0, S.feet.R - 55);
    inst.charges--;
    toast('SPLOSH — ' + inst.charges + ' left (refill in the sea)');
    AU.splash(false);
    particles.burst(runner.x, runner.y + 0.4, runner.z, 14, { color: 0xd8f4ff, size: 0.34, ttl: 0.7, spread: 2 });

  } else if (id === 'punch') {
    const n = scatterAt(runner.x, runner.z, 11, true);
    S.stats.punts += n;
    toast(n ? 'POW! ×' + n : 'you punch the air, heroically');
    AU.thwack(); AU.shanty(); say('POW!', true);
    cam.shake = 0.8;
    particles.burst(runner.x, runner.y + 1.2, runner.z, 18, { color: 0xffe07a, size: 0.4, ttl: 0.6, spread: 3.4 });

  } else if (id === 'net') {
    const n = scatterAt(runner.x, runner.z, 15, true);
    toast(n ? 'NETTED ×' + n : 'the net catches nothing but sand');
    AU.poof();

  } else if (id === 'blink') {
    const d = 16;
    const tx = clamp(runner.x + Math.sin(runner.facing) * d, W.xMin, W.xMax);
    const tz = clamp(runner.z + Math.cos(runner.facing) * d, W.zMin, W.zMax);
    particles.burst(runner.x, runner.y + 0.8, runner.z, 12, { color: 0xbfe8ff, size: 0.34, ttl: 0.5, spread: 2 });
    runner.x = tx; runner.z = tz; runner.y = groundY(tx, tz);
    runner.kx = 0; runner.kz = 0;
    toast('THUNK — you are over there now'); AU.tone(420, 0.14, 'triangle', 0.09);
    particles.burst(tx, runner.y + 0.8, tz, 12, { color: 0xbfe8ff, size: 0.34, ttl: 0.5, spread: 2 });

  } else if (id === 'freeze') {
    S.freeze = 4.0;
    toast('\u{23F1} TIME STOPS. the sun looks annoyed.');
    AU.sweep(900, 300, 0.7, 'sine', 0.08); say('ha!', true);

  } else if (id === 'plant') {
    if (planted) scene.remove(planted.mesh);
    const mesh = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8), new THREE.MeshBasicMaterial({ color: 0xe8e0cc }));
    pole.position.y = 1.6; mesh.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.1, 12), new THREE.MeshBasicMaterial({ color: 0xff5233 }));
    top.position.y = 3.2; mesh.add(top);
    mesh.position.set(runner.x, groundY(runner.x, runner.z), runner.z);
    scene.add(mesh);
    planted = { mesh, x: runner.x, z: runner.z, r: 6 };
    S.ev.clouds.push({ x: runner.x, z: runner.z, r: 6, mesh: { position: { set() { } } }, life: 9999, vx: 0 });
    toast('\u{26F1} shade, planted. it stays.');
    AU.land(false);
  }

  inst.cd = inst.def.active.cd;
}
// ---------------- taking loot ----------------
let nearItem = null;
function takeItem(it) {
  it.taken = true;
  levelGroup.remove(it.mesh);
  // duplicates would stack multiplicatively into nonsense — cash them in instead
  if (hasIt(it.key)) {
    addScore(250);
    toast('already got ' + ITEMS[it.key].icon + ' — cashed in for 250');
    AU.coin();
    return;
  }
  particles.burst(it.x, groundY(it.x, it.z) + 0.8, it.z, 8,
    { color: ITEMS[it.key].rarity >= 2 ? 0xffd94a : 0xbfe8ff, size: 0.32, ttl: 0.6, spread: 1.7 });
  grant(it.key);
  addScore(60);
  if (it.key === 'bottle') buildCoolRoute();
}
/** Bucket refills itself whenever you stand in the sea. */
function refillWetGear(inWater) {
  if (!inWater) return;
  const b = findItem('bucket');
  if (b && b.charges < 2) { b.charges = 2; }
  const k = findItem('kelp');
  if (k && k.shield < (ITEMS.kelp.shield || 60)) k.shield = ITEMS.kelp.shield;
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
  S.heatState = 0; S.prevHeatState = 0; S.combo = 0; S.invuln = 0;
  resetSynergies();
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
  const tb = Math.max(0, Math.round((260 - S.levelTime) * 14));
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
    ['Flock raids survived', s.raids],
    ['Birds dodged', s.dodges],
    ['Birds... not dodged', s.hits],
    ['Robbed by seagulls', s.thefts],
    ['Loot chased down', s.recovered],
    ['Fell for the plover act', s.conned],
    ['Undignified stumbles', s.trips],
    ['Full faceplants', s.faceplants],
    ['Towel crabs met', s.crabs],
    ['Items beachcombed', s.items],
    ['Total time', S.runTime.toFixed(1) + 's'],
    ['Diagnosis', S.level > 2 ? 'a legend, briefly' : 'why did you do this'],
  ];
  const buildLine = S.slots.length
    ? S.slots.map(s => s.def.icon + ' ' + s.def.name).join('  ·  ')
    : 'nothing but your own two feet';
  const syn = activeSynergies().map(s => '★ ' + s.name).join('  ');
  D.card.innerHTML = rows.map(r => `<div class="row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')
    + `<div class="row bonus"><span>DISTANCE CONSOLATION</span><span>+${consolation}</span></div>`
    + `<div class="row" style="margin-top:6px;border-top:2px solid var(--line);padding-top:6px">
         <span>FINAL BUILD</span><span style="max-width:16em;text-align:right">${buildLine}</span></div>`
    + (syn ? `<div class="row bonus"><span>SYNERGIES</span><span>${syn}</span></div>` : '');
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

  // ---------- 6-7 ----------
  if (S.invuln > 0) {
    S.invuln -= dt;
    if (S.t - S.lastChant > 0.62) {                 // "six seven, six seven, six seven"
      S.lastChant = S.t;
      say('six seven', true);
      AU.tone(S.chantFlip ? 587 : 784, 0.1, 'triangle', 0.055);
      S.chantFlip = !S.chantFlip;
    }
    particles.spawn(runner.x + (Math.random() - 0.5) * 1.4, runner.y + 0.6 + Math.random() * 1.4,
      runner.z + (Math.random() - 0.5) * 1.4,
      { color: 0xffd94a, size: 0.3, ttl: 0.6, vy: 1.6, opacity: 0.8 });
    if (S.invuln <= 0) { toast('...and it wears off', 'warn'); say('aw.', true); }
  }

  // ---------- heat ----------
  const build = buildStats();
  const shade = shadeAt(runner.x, runner.z);
  const airborne = !runner.grounded;
  surfing = Math.max(0, surfing - dt);
  refillWetGear(inWater);
  let rate;
  if (inWater) rate = HEAT.coolWater;
  else if (airborne || surfing > 0) rate = HEAT.coolAir;
  else if (refuge) rate = HEAT.coolRefuge;
  else {
    const h = heatAt(runner.x, runner.z, S.t) * effHeat();
    if (h < HEAT.safe) rate = HEAT.coolCool - wetness(runner.z, S.t) * 12;
    else if (shade > 0.35) rate = HEAT.coolShade;
    else rate = (h - HEAT.safe) * HEAT.burnRate * build.heat;
  }

  // kelp soaks up incoming heat until it gives out (recharges in the sea)
  if (rate > 0) {
    const kelp = findItem('kelp');
    if (kelp && kelp.shield > 0) {
      const absorb = Math.min(kelp.shield, rate * dt);
      kelp.shield -= absorb; rate -= absorb / dt;
      if (kelp.shield <= 0) toast('the kelp is spent — soak it in the sea', 'warn');
    }
  }
  if (S.invuln > 0) rate = Math.min(rate, HEAT.coolRefuge);   // the sand simply gives up
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
  const untouchable = S.invuln > 0;
  for (const f of ['L', 'R']) if (!untouchable && S.feet[f] > 78) S.health -= (S.feet[f] - 78) / 22 * 6.0 * dt;
  if (S.heatState === 4) {
    if (!untouchable) S.health -= 4.0 * dt;
    if (hasItem('duck') && S.t - S.lastSqueak > 2.6) { S.lastSqueak = S.t; AU.squeak(); }
  }
  if (worst < 25 && S.health < 100) S.health += 2.2 * dt;
  S.health = clamp(S.health, 0, 100);

  // ---------- how interesting are you? ----------
  // Attention isn't an abstract bar any more: it decides how many gulls
  // physically land near you and start edging in. You can watch it happen.
  // a slow baseline so the flock is always quietly assembling somewhere behind
  // you — the beach is never empty of birds for long
  let ag = 3.2;
  if (inWater) { ag = 24; S.stats.waterTime += dt; }
  else if (runner.z < waveZ + 3) ag = 14;
  if (S.heatState >= 4) ag += 15;                     // you smell like lunch
  else if (S.heatState === 3) ag += 6;
  if (runner.speed < 0.5 && !refuge) ag += 3;         // dawdling in the open
  if (ag > 0) ag *= effAggro() * build.aggro;
  if (S.eagleTimer > 0) ag = Math.min(ag, -30);       // nobody dares while he's up
  S.aggro = clamp(S.aggro + ag * dt, 0, 100);
  if (S.aggro > 55) S.stats.pacifist = false;

  // special guests
  if (S.freeze <= 0) {
    if (S.level >= 4 && !S.thiefAt && S.levelTime > 8 && Math.random() < 0.25 * dt) {
      S.thiefAt = true; spawnThief(runner);
    }
    if (S.heatState >= 4 && Math.random() < 0.5 * dt) spawnVulture(runner);
    if (S.level >= 6 && S.aggro > 80 && Math.random() < 0.12 * dt) spawnFalcon(runner);
    const wantEagle = build.eagle ? 0.05 : 0.008;
    if (S.level >= 3 && S.eagleTimer <= 0 && Math.random() < wantEagle * dt) spawnEagle(runner, build.eagle);
  }

  S.freeze = Math.max(0, S.freeze - dt);
  updateBirds(dt, runner, S.freeze > 0);
  if (S.freeze <= 0) updateEvents(dt, runner);
  tickCooldowns(dt);
  checkCheckpoints(runner);
  // charging through loiterers scatters them — you're not helpless
  if (runner.speed > 8.5) scatterAt(runner.x, runner.z, 2.4, false);

  // ---------- loot: free slot auto-takes, a full build makes you choose ----------
  nearItem = null;
  for (const it of S.items) {
    if (it.taken) continue;
    it.ph += dt * 2.4;
    it.box.rotation.y = it.ph;
    it.box.position.y = 0.55 + Math.sin(it.ph) * 0.14;
    if (it.tumble > 0) {                        // freshly knocked loose — settle it
      it.tumble -= dt;
      it.mesh.position.y = damp(it.mesh.position.y, groundY(it.x, it.z), 9, dt);
      it.mesh.rotation.z = it.tumble * 4;
      if (it.tumble <= 0) it.mesh.rotation.z = 0;
    }
    const d = Math.hypot(runner.x - it.x, runner.z - it.z);
    if (d < 2.9) {
      // instant pickups don't need a slot, so they never make you choose
      if (ITEMS[it.key].instant || S.slots.length < S.maxSlots) takeItem(it);
      else if (!nearItem || d < nearItem.d) nearItem = { it, d };
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
  // speed pushes the camera back and widens the lens — cheap, and it makes
  // sprinting feel fast without changing a single movement number
  const rush = clamp(runner.speed / 10.4, 0, 1);
  const wantDist = scouting ? 19 : cam.dist + rush * 1.1;
  const wantHeight = scouting ? 17 : cam.height;
  const wantPitch = scouting ? 0.85 : cam.pitch;
  const wantFov = scouting ? 78 : 61 + rush * 8;

  // landing punches the camera down, then it springs back
  if (runner.landImpact > 0) {
    cam.kick = Math.max(cam.kick || 0, runner.landImpact);
    cam.shake = Math.max(cam.shake, runner.landImpact * 0.5);
    runner.landImpact = 0;
  }
  cam.kick = Math.max(0, (cam.kick || 0) - dt * 4.5);

  cam._d = damp(cam._d ?? wantDist, wantDist, 5, dt);
  cam._h = damp(cam._h ?? wantHeight, wantHeight, 5, dt);
  cam._p = damp(cam._p ?? wantPitch, wantPitch, 7, dt);
  camera.fov = damp(camera.fov, wantFov, 6, dt);
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
  camera.lookAt(runner.x, runner.y + (scouting ? 0.4 : 1.25) - cam.kick * 0.55, runner.z);
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
  if (S.invuln > 0) {
    D.invuln.classList.remove('hidden');
    D.invuln.textContent = '6 — 7   ' + S.invuln.toFixed(1) + 's';
  } else D.invuln.classList.add('hidden');
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
    el.className = 'slot r' + (s.def.rarity || 1);
    let sub = '';
    if (s.def.active) sub = s.cd > 0 ? Math.ceil(s.cd) + 's' : '[E]';
    if (s.def.charges !== undefined) sub = s.charges + '× ' + (s.cd > 0 ? Math.ceil(s.cd) + 's' : '[E]');
    else if (s.def.shield) sub = Math.round(s.shield) + ' shield';
    else if (!s.def.active) sub = s.def.cursed ? 'CURSED' : 'passive';
    el.innerHTML = `<span class="ic">${s.def.icon}</span><span class="nm">${s.def.name}</span><span class="tm">${sub}</span>`;
  });

  // active ability prompt
  const act = readyActive();
  if (act) {
    D.ability.classList.remove('hidden');
    const ready = act.cd <= 0 && act.charges > 0;
    D.ability.className = ready ? 'ready' : 'cooling';
    D.ability.innerHTML = `<b>E</b> ${act.def.icon} ${act.def.active.label}` +
      (ready ? '' : ` <i>${Math.ceil(act.cd)}s</i>`);
  } else D.ability.classList.add('hidden');

  // swap prompt when your build is full and you're standing on loot
  if (nearItem) {
    const d = ITEMS[nearItem.it.key];
    D.swapHint.classList.remove('hidden');
    D.swapHint.innerHTML = `${d.icon} <b>${d.name}</b> — ${d.desc}<br>` +
      `<b>F</b> to take (drops ${S.slots[0].def.icon} ${S.slots[0].def.name})`;
  } else D.swapHint.classList.add('hidden');

  // live synergy list
  const syns = activeSynergies();
  if (syns.length) {
    D.syn.classList.remove('hidden');
    D.syn.innerHTML = syns.map(s => `<span>★ ${s.name}</span>`).join('');
  } else D.syn.classList.add('hidden');
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
  updateSanderlings(S.t, waveZ);
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
  ITEMS, SYNERGIES, buildStats, activeSynergies, grant, readyActive, flock,
  spawnThief, spawnVulture, spawnFalcon, spawnEagle, scatterAt, useItem, dropItem,
  levelComplete, die, nextLevel, generateLevel: () => generateLevel(runner),
  /** headless tick. `visual` does the expensive repaint; skip it for balance sims. */
  step(dt = 0.016, visual = true) {
    S.t += dt; readInput(); updateTide(S.t);
    if (S.mode === 'play' || S.mode === 'scout') { simulate(dt); if (visual) updateHUD(); }
    if (!visual) return;
    updateOcean(S.t); paintSand(S.t); updateSanderlings(S.t, waveZ);
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
