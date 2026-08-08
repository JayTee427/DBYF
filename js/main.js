// ============================================================
// main.js — camera, input, simulation, flow, arcade layer
// ============================================================
import * as THREE from 'three';
import { clamp, lerp, damp, angleLerp, mulberry32, meshOf } from './engine.js';
import {
  S, W, HEAT, STAM, DIFFS, freshStats, HEAT_NAMES, footState,
  effHeat, effAggro, hasItem, sunPressure,
} from './state.js';
import {
  scene, groundY, heatAt, wetness, waveZ, shadeAt, updateTide, updateOcean,
  paintSand, updateHaze, faceHaze, sunSprite, tickWeatherTurn, transitionWeather, WEATHER,
} from './world.js';
import {
  Runner, GOALS, generateLevel, updateEvents, checkCheckpoints, checkChests,
  dropItem, fireEvent, buildGoalAt, buildChestAt,
  particles, prints, wire, levelGroup,
} from './actors.js';
import {
  ITEMS, SYNERGIES, buildStats, activeSynergies, grant, removeItem, findItem,
  readyActive, tickCooldowns, checkSynergies, resetSynergies, hasItem as hasIt,
  footHeatMul, rollItem,
} from './items.js';
import {
  flock, updateBirds, updateSanderlings, scatterAt, clearFlock,
  spawnThief, spawnVulture, spawnFalcon, spawnEagle, spawnTerns, spawnPelicanLine,
} from './birds.js';
import { wireBus } from './bus.js';
import { AU, say, OW } from './audio.js';
import { MUSIC } from './music.js';
import { PROFILE, UNLOCKS, STARTING_ITEMS, MUTATORS } from './profile.js';

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
  warn: $('warnWrap'),
  banner: $('banner'), ability: $('ability'), swapHint: $('swapHint'), syn: $('syn'),
  invuln: $('invuln'),
  ilTitle: $('ilTitle'), ilLines: $('ilLines'), ilNext: $('ilNext'),
  verdict: $('verdict'), epitaph: $('epitaph'), runName: $('runName'),
  card: $('card'), finalScore: $('finalScore'),
  initials: $('initials'), cells: [$('c0'), $('c1'), $('c2')], hs: $('hsrows'),
  hsPage: $('hsPage'), career: $('career'),
  pBuild: $('pBuild'), pSyn: $('pSyn'), pStats: $('pStats'),
  pKeys: $('pKeys'), pVitals: $('pVitals'),
  codex: $('codex'), cxBody: $('cxBody'),
  mutbox: $('mutbox'), mutrow: $('mutrow'), mutMult: $('mutMult'),
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
  if (key === 'mapfrag') {
    S.mapFrags++;
    if (S.mapFrags >= 3) {
      S.mapFrags = 0;
      S.islandPending = true;
      banner('THE MAP IS COMPLETE', 'next beach: TREASURE ISLAND');
      toast('\u{1F5FA} three fragments. you know where it is now.');
      AU.shanty(); AU.fanfare();
      say('I know where it is. I KNOW WHERE IT IS.', true);
    } else {
      banner('MAP FRAGMENT  ' + S.mapFrags + '/3', 'a corner of something older');
      toast('\u{1F5FA} map fragment ' + S.mapFrags + ' of 3');
      AU.coin();
    }
    addScore(400);
    return;
  }
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
/** Hit-stop: freeze the world for a few frames so an impact reads as force. */
function hitStop(seconds) { S.hitStop = Math.max(S.hitStop || 0, seconds); }
function flashScreen(alpha, ms) {
  D.flash.style.transition = 'none';
  D.flash.style.opacity = String(alpha);
  requestAnimationFrame(() => {
    D.flash.style.transition = `opacity ${ms}ms ease-out`;
    D.flash.style.opacity = '0';
  });
}
wireBus({
  toast, score: addScore, banner,
  shake: (v) => { cam.shake = Math.max(cam.shake, v); hitStop(v * 0.05); },
  instant: instantPickup,
  flash: (a) => flashScreen(a, 220),
  teach,
});
/**
 * Say something once, the first time it ever happens to you, and then never
 * again on any run. Held in the profile, not the run, so a veteran isn't
 * lectured and a beginner isn't left to guess.
 */
function teach(id) {
  const line = PROFILE.teach(id);
  if (!line) return;
  // let the moment itself land first, then explain it
  setTimeout(() => { toast(line, 'tip'); AU.tick(); }, 850);
}

// ---------------- input ----------------
const keys = new Set();
const input = { fwd: 0, back: 0, left: 0, right: 0, sprint: 0, jump: false, scout: false };
addEventListener('keydown', (e) => {
  if (S.mode === 'dead') { initialsKey(e); return; }
  if (keys.has(e.code)) return;
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyE') useItem();
  if (e.code === 'KeyN') { const on = MUSIC.toggle(); toast(on ? '🎵 MUSIC ON' : '🎵 MUSIC OFF'); }
  if (e.code === 'KeyM') { const m = AU.toggleMute(); toast(m ? '🔇 MUTED' : '🔊 SOUND ON'); syncVolUI(); }
  if (e.code === 'BracketLeft') { AU.setVolume(AU.volume - 0.1); syncVolUI(); }
  if (e.code === 'BracketRight') { AU.setVolume(AU.volume + 0.1); syncVolUI(); }
  if (e.code === 'Escape') {
    if (S.mode === 'play') setPaused(true);
    else if (S.mode === 'paused') setPaused(false);
  }
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

  } else if (id === 'popsicle') {
    S.feet.L = Math.max(0, S.feet.L - 42); S.feet.R = Math.max(0, S.feet.R - 42);
    inst.charges--;
    toast('\u{1F9CA} aaaahhh — ' + inst.charges + ' licks left');
    AU.tone(1300, 0.1, 'sine', 0.06); AU.noise(0.3, 2400, 0.03, true);
    if (inst.charges <= 0) { removeItem(inst); toast('the popsicle is gone. only stick remains.', 'warn'); }

  } else if (id === 'eat') {
    S.health = Math.min(100, S.health + 34);
    inst.charges--;
    toast('\u{1F355} +34 HP. worth it.');
    AU.tone(300, 0.09, 'triangle', 0.07); AU.tone(240, 0.12, 'triangle', 0.06, 0.1);
    say('mmm. sandy.', true);
    if (inst.charges <= 0) { removeItem(inst); }

  } else if (id === 'scan') {
    let n = 0;
    for (const it of S.items) {
      if (it.taken) continue;
      if (Math.abs(it.x - runner.x) > 70) continue;
      it.mesh.children[1].scale.setScalar(2.4);          // blow up the icon so it's spottable
      n++;
    }
    for (const ch of S.chests) if (!ch.opened) ch.mesh.children[4].scale.setScalar(3.2);
    toast('\u{1F52D} ' + n + ' things worth having up ahead');
    AU.tone(1200, 0.09, 'sine', 0.05); AU.tone(1600, 0.12, 'sine', 0.04, 0.08);

  } else if (id === 'plank') {
    const px = runner.x, pz = runner.z;
    const plank = meshOf(new THREE.BoxGeometry(3.4, 0.24, 1.1), 0x9a7350);
    plank.rotation.y = runner.facing;
    plank.position.set(px, groundY(px, pz) + 0.12, pz);
    levelGroup.add(plank);
    S.refuges.push({ x: px, z: pz, r: 2.0, h: 0.28, type: 'wood', mesh: plank, crab: false, crabSprung: false, used: true });
    inst.charges--;
    toast('\u{1F6F6} plank down — ' + inst.charges + ' left');
    AU.land(false);
    if (inst.charges <= 0) removeItem(inst);

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
  // whatever rotates out lands on the sand rather than vanishing, so a
  // careless pickup is always recoverable
  const ejected = S.slots.length >= S.maxSlots && !ITEMS[it.key].instant ? S.slots[0] : null;
  particles.burst(it.x, groundY(it.x, it.z) + 0.8, it.z, 8,
    { color: ITEMS[it.key].rarity >= 2 ? 0xffd94a : 0xbfe8ff, size: 0.32, ttl: 0.6, spread: 1.7 });
  grant(it.key);
  addScore(60);
  if (ejected) {
    const a = Math.random() * Math.PI * 2;
    const dropped = dropItem(ejected.key, runner.x + Math.sin(a) * 3.2, runner.z + Math.cos(a) * 3.2);
    dropped.cooldown = 2.0;                     // so you don't instantly re-grab it
  }
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
function buildCoolRoute(quiet) {
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
  if (!quiet) toast('\u{1F4EC} the bottle shows a cool path');
}

// ---------------- flow ----------------
function startRun(diffKey) {
  S.diffKey = diffKey; S.diff = DIFFS[diffKey];
  // mutators are locked in at the start of a run and can't be changed mid-run
  const muts = PROFILE.activeMutators();
  S.mut = {}; for (const m of muts) S.mut[m.id] = true;
  S.mutMult = PROFILE.mutatorMult();
  S.mode = 'play'; S.level = 1; S.score = 0; S.runTime = 0;
  S.feet.L = 0; S.feet.R = 0; S.health = 100; S.stamina = STAM.max;
  S.aggro = 0; S.slots = []; S.stats = freshStats(); S.tutorial = 0;
  S.heatState = 0; S.prevHeatState = 0; S.combo = 0; S.invuln = 0;
  S.hitStop = 0; S.deathT = 0;
  resetSynergies();
  clearRoute();
  generateLevel(runner);
  cam.yaw = -Math.PI / 2; cam.pitch = 0.30;
  D.title.classList.add('hidden'); D.end.classList.add('hidden');
  D.inter.classList.add('hidden'); D.pause.classList.add('hidden');
  D.hud.classList.remove('hidden');
  if (ghost) ghost.visible = false;
  AU.ensure(); AU.resume(); tryLock();
  if (AU.ctx) { MUSIC.init(AU.ctx, AU.master); MUSIC.start(S.weather.key); }
  announce();
  if (muts.length) {
    setTimeout(() => {
      banner('MADE IT WORSE ×' + S.mutMult.toFixed(2), muts.map(m => m.name).join(' · '));
      for (const m of muts) toast(m.icon + ' ' + m.name + ' — ' + m.blurb, 'warn');
    }, 1200);
  }
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
/**
 * The pause screen is the only place you can actually READ your build.
 * Forty items with one-line HUD labels is not a game you can plan in, so
 * everything you're carrying gets spelled out here in full.
 */
function renderPause() {
  const build = buildStats();
  const pct = (v) => (v >= 1 ? '+' : '−') + Math.round(Math.abs(v - 1) * 100) + '%';

  D.pBuild.innerHTML = (S.slots.length ? S.slots : []).map((s) => {
    const d = s.def;
    const meta = [];
    if (d.active) {
      meta.push(s.cd > 0 ? `[E] ${d.active.label} — ${s.cd.toFixed(1)}s` : `[E] ${d.active.label} — READY`);
    }
    if (s.charges !== Infinity) meta.push(s.charges + ' left');
    if (s.shield > 0) meta.push('shield ' + Math.round(s.shield));
    if (s.foot) meta.push('fits the ' + (s.foot === 'L' ? 'LEFT' : 'RIGHT') + ' foot');
    if (d.cursed) meta.push('<span class="cursed">CURSED</span>');
    return `<div class="pitem"><div class="pic">${d.icon}</div><div class="pbody">
      <div class="pname">${d.name}</div><div class="pdesc">${d.desc}</div>
      ${meta.length ? `<div class="pmeta">${meta.join('  ·  ')}</div>` : ''}</div></div>`;
  }).join('')
    + Array.from({ length: Math.max(0, S.maxSlots - S.slots.length) }, () =>
      `<div class="pitem empty"><div class="pic">·</div><div class="pbody">
        <div class="pname">EMPTY POCKET</div>
        <div class="pdesc">run over something and it's yours</div></div></div>`).join('');

  const syn = activeSynergies();
  D.pSyn.innerHTML = syn.length
    ? syn.map(s => `<div>★ ${s.name} — <i>${s.blurb}</i></div>`).join('')
    : '<div style="color:#a89070">★ no synergies yet — items combine by name and by tag</div>';

  const st = [
    ['Burn rate', pct(build.heat), build.heat < 1],
    ['Bird attention', pct(build.aggro), build.aggro < 1],
    ['Move speed', pct(build.speed), build.speed > 1],
    ['Stamina drain', pct(build.stam), build.stam < 1],
    ['Blocks a bird strike', Math.round(build.guard * 100) + '%', build.guard > 0],
    ['Loot found', pct(build.loot), build.loot > 1],
    ['Pockets', S.maxSlots, build.slots > 0],
  ];
  D.pStats.innerHTML = st.map((r) => {
    const flat = r[1] === '+0%' || r[1] === '0%' || r[1] === '−0%';
    return `<div class="row ${flat ? '' : (r[2] ? 'good' : 'bad')}">
      <span>${r[0]}</span><span>${r[1]}</span></div>`;
  }).join('');

  D.pKeys.innerHTML = [
    ['WASD', 'run'], ['MOUSE', 'look around'], ['SHIFT', 'sprint (costs stamina)'],
    ['SPACE', 'hop — swaps your lead foot, and it can\'t burn mid-air'],
    ['SHIFT+SPACE', 'a desperate ~11m leap'],
    ['Q (hold)', 'scout — pull the camera up and read the beach'],
    ['E', 'use your leftmost ready ability'],
    ['F', 'drop your oldest item on purpose'],
    ['ESC', 'this screen'], ['M / N', 'mute / music'], ['[ ]', 'volume'],
  ].map(r => `<div class="row"><span>${r[0]}</span> — ${r[1]}</div>`).join('');

  const worst = Math.max(S.feet.L, S.feet.R);
  D.pVitals.innerHTML = [
    ['Beach', S.level + '  (' + S.diff.label + ')'],
    ['Weather', S.weather ? S.weather.name : '—'],
    ['Looking for', S.goal ? S.goal.def.icon + ' ' + S.goal.def.name : '—'],
    ['Distance left', S.goal ? Math.round(Math.max(0, S.goal.x - runner.x)) + 'm' : '—'],
    ['Left foot', Math.round(S.feet.L) + '%'],
    ['Right foot', Math.round(S.feet.R) + '%'],
    ['Health', Math.round(S.health) + '%'],
    ['Bird suspicion', Math.round(S.aggro) + '%'],
    ['Score so far', S.score],
    ['Hottest foot says', HEAT_NAMES[footState(worst)]],
  ].map(r => `<div class="row"><span>${r[0]}</span> — ${r[1]}</div>`).join('');
}
function setPaused(p) {
  if (p && S.mode === 'play') {
    S.mode = 'paused'; renderPause();
    D.pause.classList.remove('hidden'); document.exitPointerLock?.();
  } else if (!p && S.mode === 'paused') {
    S.mode = 'play'; D.pause.classList.add('hidden'); tryLock();
  }
}
D.pause.addEventListener('click', () => setPaused(false));
document.querySelectorAll('.diffbtn').forEach(b =>
  b.addEventListener('click', () => { AU.ensure(); AU.resume(); startRun(b.dataset.diff); }));
$('btnRetry').addEventListener('click', () => startRun(S.diffKey));
$('btnTitle').addEventListener('click', () => {
  D.end.classList.add('hidden'); D.hud.classList.add('hidden');
  D.title.classList.remove('hidden'); S.mode = 'title';
  if (AU.ctx) { MUSIC.init(AU.ctx, AU.master); MUSIC.start('title'); }
  renderScores(); renderCareer(); document.exitPointerLock?.();
});

// ============================================================
// THE CODEX — 40 items, 9 birds, 20 events and 12 abilities is too much
// to learn by dying. This is the page that just tells you.
// ============================================================
const CODEX_BIRDS = [
  ['\u{1F426}', 'WESTERN GULL', 'The mob. They gather overhead in a slow wheel that grows as your '
    + 'suspicion climbs, then peel off one at a time into a telegraphed dive. You get a shadow and a '
    + 'half-second of warning. Sidestep it.'],
  ['\u{1F985}', 'HEERMANN\'S GULL', 'The thief. It does not want to hurt you — it wants an item, and '
    + 'if it gets one it flies off with it. Chase it down and you get the item back.'],
  ['\u{1F423}', 'SNOWY PLOVER', 'Tiny, protected, and a liar. It fakes a broken wing to drag you off '
    + 'your line and away from its nest. Following it always costs you.'],
  ['\u{1F99A}', 'WILLETS & GODWITS', 'Dozing in loose groups. Sprint too close and the whole lot '
    + 'explodes upward screaming, and every bird on the beach looks over.'],
  ['\u{1F426}', 'LEAST TERN', 'Darts in tight circles around your head and shoves you off your line '
    + 'for about eighteen seconds. Arrives from beach 5.'],
  ['\u{1F9A2}', 'BROWN PELICAN', 'Squadrons of five in formation. The leader drags a patch of cool '
    + 'shadow you can ride — and running into one knocks you flat.'],
  ['\u{1F985}', 'TURKEY VULTURE', 'Circles patiently. It is not attacking. It is just... waiting, '
    + 'and it would like you to know it has noticed how you\'re doing.'],
  ['\u{1F985}', 'PEREGRINE FALCON', 'Locks on from very high, then arrives all at once. The single '
    + 'hardest hit in the game. If you have the GoPro you get a warning arrow.'],
  ['\u{1F985}', 'BALD EAGLE', 'Summoned by the old tuna can. He may bless you or he may pick you up '
    + 'and carry you somewhere. Both count as an experience.'],
  ['\u{1F9A2}', 'THE WASH PROPHET', 'One pelican per beach, standing apart from everything, who never '
    + 'attacks. Linger near him and he tells you something. It is a coin flip whether it is true, and '
    + 'he will not tell you which. The captain\'s pipe improves his odds.'],
];
const CODEX_EVENTS = [
  ['\u{1F415}', 'DOG + BALL', 'kicks up a trail of cool damp sand — follow it'],
  ['\u{1F423}', 'PLOVER NESTING ZONE', 'lovely cool sand, roped off. it is a trap, and she is watching'],
  ['\u{1F9AD}', 'SEA LION PILE', 'tiptoe past for points, sprint past and wear it'],
  ['\u{1F3F0}', 'SANDCASTLE KINGDOM', 'packed damp lanes are a real road; breaking a tower costs you'],
  ['\u{1FA81}', 'KITE GUY', 'his crashed kite is cool ground until he reels it back in'],
  ['\u{1F41F}', 'GRUNION RUN', 'every bird leaves for twenty seconds. go.'],
  ['\u{1F492}', 'BEACH WEDDING', 'cross the seating and the photographer\'s flash blinds you'],
  ['\u{1F50D}', 'METAL DETECTOR MAN', 'he digs up real loot and leaves it where he stops'],
  ['\u{1F3D0}', 'LOOSE VOLLEYBALL', 'punt it gently for points, sprint into it and go feet-up'],
  ['\u{1F30A}', 'LOW TIDE', 'the sea walks out and leaves a cool flat. briefly.'],
  ['\u{1F426}', 'SEAGULL CIVIL WAR', 'they turn on each other. walk straight through the middle.'],
  ['\u{1F3A3}', 'FISHERMAN\'S BACKCAST', 'stand near him mid-cast and you get hooked'],
  ['\u{1F32A}', 'DUST DEVIL', 'it is five years old and carrying someone\'s things'],
  ['\u{1F3C4}', 'SURF SCHOOL', 'the whistle spikes attention; somebody drops a board you can stand on'],
  ['\u{2601}', 'CLOUD SHADE', 'a moving patch of cool. chase it.'],
  ['\u{1F40B}', 'WHALE / DOLPHIN ESCORT', 'a pod paces you offshore and you run faster out of pride'],
  ['\u{1F31E}', 'SUN FOCUS', 'it is concentrating. on you. move.'],
  ['\u{1F30A}', 'SNEAKER WAVE', 'the sea reaches much further than it should'],
];
const CODEX_PIECES = [
  ['\u{1F525}', 'THE BOARDWALK', 'a lava lake with seven rickety planks across it'],
  ['\u{1F3F0}', 'THE SANDCASTLE KINGDOM', 'a scorched block with one winding cool lane through it'],
  ['\u{1F3A1}', 'THE OLD PIER', 'elevated, safe, and absolutely covered in gulls'],
  ['\u{1F3D6}', 'THE TOWEL VILLAGE', 'cool towels everywhere, and half of them have a crab in them'],
  ['\u{1F6A9}', 'THE LIFEGUARD TOWER', 'climb it and the whole beach lays itself out for you'],
  ['\u{1F3D0}', 'THE VOLLEYBALL COURT', 'flat, packed, cool — and there is a game on'],
  ['\u{1F6B0}', 'THE STORM DRAIN', 'a cool concrete motorway to the sea. something lives in it.'],
  ['\u{1FAA8}', 'THE ROCK JETTY', 'cool the whole way, and total bird exposure'],
  ['\u{1F525}', 'THE BONFIRE PIT', 'last night\'s fire. still going. rings of baked sand.'],
];
function codexTab(tab) {
  if (tab === 'basics') {
    return `
      <h4>THE ENTIRE GAME</h4>
      <p>The sand is lava. Your two feet heat up <b>separately</b>, and when either one passes
      about 80% you lose health fast. Get to the goal at the far end of the beach before that
      happens. Then do it again on a hotter beach. Forever.</p>
      <h4>THE TWO GAUGES THAT MATTER</h4>
      <p><b>LEFT FOOT / RIGHT FOOT</b> — they cook independently, which is the whole trick.
      Tapping <b>SPACE</b> hops and <i>swaps your lead foot</i>, so you can rest the bad one on
      the good one's time. You also can't burn while you're in the air.</p>
      <p><b>BIRD SUSPICION</b> — climbs while you're loud, fed, exposed or panicking. When it's
      high the gulls gather overhead, and when the mob is big enough they start diving.</p>
      <h4>THE GROUND</h4>
      <p>Most of the beach is survivable. The <b>bright orange puddles</b> are not — they are
      real, discrete patches you can see and route around, and they get denser every level.
      Cool things: <i>wet sand near the water, shade, towels, boardwalk, rock, concrete, and
      the sea itself</i>. Standing in the sea is the full reset, but it's also the birds' pantry.</p>
      <h4>SOLE TRAIN</h4>
      <p>Chain fresh refuges without cooking a foot and you build a combo. It is worth real
      points, and it is the difference between finishing a beach and posting a score.</p>
      <h4>THINGS THAT ARE NOT OBVIOUS</h4>
      <p>• <b>Hold Q</b> to scout: the camera lifts and you can read the whole stretch ahead.<br>
      • Items are <b>permanent for the run</b> and you only get three pockets (four with the
      shorts). Picking up a fourth pushes your oldest one out onto the sand, where you can
      still go back for it.<br>
      • Items <b>combine</b>. Some by name, some just by sharing a tag. Check the pause screen.<br>
      • The sun climbs while you're out there — dawdling always costs you something.<br>
      • Some beaches <b>change weather partway through</b>.<br>
      • If you're in real trouble, somebody might walk out with your shoes. Go to her.</p>`;
  }
  if (tab === 'items') {
    let found = 0;
    const rows = Object.keys(ITEMS).map((k) => {
      const d = ITEMS[k];
      const known = PROFILE.isUnlocked(k);
      if (known) found++;
      const unlock = UNLOCKS.find(u => u.item === k);
      const cls = 'cxrow' + (known ? (d.cursed ? ' cursed' : '') : ' locked');
      const tags = (d.tags || []).join(' · ');
      return `<div class="${cls}"><div class="ci">${known ? d.icon : '\u{2753}'}</div><div>
        <div class="cn">${known ? d.name : '???'}</div>
        <div class="cd">${known ? d.desc : (unlock ? 'locked — ' + unlock.text : 'you have not found this yet')}</div>
        ${known && tags ? `<div class="ck">${tags}</div>` : ''}</div></div>`;
    }).join('');
    return `<h4>ITEMS — ${found} OF ${Object.keys(ITEMS).length} DISCOVERED</h4>
      <p>Everything here is permanent for the run. <b>[E]</b> fires your leftmost ready ability.
      Locked items simply don't spawn yet — the game hands them to you as you earn them, so a
      first run isn't forty things at once.</p>
      <div class="cxgrid">${rows}</div>
      <div class="cxnote">chest-only rewards and instant pickups never need unlocking</div>`;
  }
  if (tab === 'birds') {
    return `<h4>WHO IS WATCHING YOU</h4>
      <p>Bird suspicion is the second resource. Everything below reacts to it.</p>
      <div class="cxgrid">${CODEX_BIRDS.map(b =>
        `<div class="cxrow"><div class="ci">${b[0]}</div><div>
          <div class="cn">${b[1]}</div><div class="cd">${b[2]}</div></div></div>`).join('')}</div>`;
  }
  return `<h4>WHERE YOU ARE GOING</h4>
    <p>Each beach has one goal at the far end, and it announces itself. A few make you
    stop and do something when you get there.</p>
    <div class="cxgrid">${Object.keys(GOALS).map(k => {
      const g = GOALS[k];
      const note = g.lowTide ? 'you have to wait for the tide to go out'
        : g.quiet ? 'approach at a WALK or they scatter'
        : g.hold ? `takes ${g.hold}s — ${(g.verb || '').toLowerCase()}`
        : g.asphalt ? 'the blacktop in front of it is the hottest ground on the beach'
        : 'just reach it';
      return `<div class="cxrow"><div class="ci">${g.icon}</div><div>
        <div class="cn">${g.name}</div><div class="cd">${note}</div></div></div>`;
    }).join('')}</div>
    <h4>SET PIECES</h4>
    <p>Two or three of these are stitched into every beach, and they force their own
    ground — you can't stroll around them.</p>
    <div class="cxgrid">${CODEX_PIECES.map(b =>
      `<div class="cxrow"><div class="ci">${b[0]}</div><div>
        <div class="cn">${b[1]}</div><div class="cd">${b[2]}</div></div></div>`).join('')}</div>
    <h4>THINGS THAT JUST HAPPEN</h4>
    <div class="cxgrid">${CODEX_EVENTS.map(b =>
      `<div class="cxrow"><div class="ci">${b[0]}</div><div>
        <div class="cn">${b[1]}</div><div class="cd">${b[2]}</div></div></div>`).join('')}</div>
    <h4>THE WEATHER</h4>
    <div class="cxgrid">${Object.keys(WEATHER).map(k => {
      const w = WEATHER[k];
      const bits = [];
      bits.push(w.heat > 1.05 ? 'burns faster' : w.heat < 0.95 ? 'burns slower' : 'normal heat');
      if (w.aggro > 1.1) bits.push('birds bolder');
      if (w.aggro < 0.9) bits.push('birds calmer');
      if (w.gust) bits.push('shoves you sideways');
      if (w.coolMul) bits.push('nothing cools properly');
      if (w.wash > 2) bits.push('the sea is way out');
      return `<div class="cxrow"><div class="ci">\u{1F324}</div><div>
        <div class="cn">${w.name}</div><div class="cd">${bits.join(' · ')}</div></div></div>`;
    }).join('')}</div>`;
}
let cxTab = 'basics';
function renderCodex() { D.cxBody.innerHTML = codexTab(cxTab); D.cxBody.scrollTop = 0; }
$('btnCodex').addEventListener('click', () => {
  AU.ensure(); AU.resume();
  D.title.classList.add('hidden'); D.codex.classList.remove('hidden');
  cxTab = 'basics';
  document.querySelectorAll('.cxtab').forEach(t => t.classList.toggle('on', t.dataset.tab === 'basics'));
  renderCodex();
});
$('btnCodexBack').addEventListener('click', () => {
  D.codex.classList.add('hidden'); D.title.classList.remove('hidden');
});
document.querySelectorAll('.cxtab').forEach(t => t.addEventListener('click', () => {
  cxTab = t.dataset.tab;
  document.querySelectorAll('.cxtab').forEach(o => o.classList.toggle('on', o === t));
  renderCodex(); AU.tick();
}));

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
  if (S.slots.length >= S.maxSlots) { sc += 300; lines.push(['FULL POUCH', '+300']); }
  if (hasItem('duck')) { sc += 600; lines.push(['DUCK LOYALIST', '+600']); }
  if (S.heatState >= 3) { sc += 500; lines.push(['PHOTO FINISH', '+500']); }
  if (S.stats.cleanLevel) { sc += 900; lines.push(['COOL CUSTOMER', '+900']); }
  if (S.stats.pacifist) { sc += 600; lines.push(['PACIFIST', '+600']); }
  if (S.stats.bestCombo >= 3) {
    const cb = S.stats.bestCombo * 150;
    sc += cb; lines.push(['BEST SOLE TRAIN ×' + S.stats.bestCombo, '+' + cb]);
  }
  const mult = S.diff.mult * (1 + 0.1 * (S.level - 1)) * S.mutMult;
  sc = Math.round(sc * mult);
  S.score += sc;
  lines.push(['LEVEL ' + S.level + ' × ' + S.diff.label, '×' + mult.toFixed(1)]);
  if (S.mutMult > 1) {
    const on = Object.keys(S.mut).map(id => MUTATORS.find(m => m.id === id).name).join(' · ');
    lines.push(['⚠ ' + on, '×' + S.mutMult.toFixed(2)]);
  }

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
  S.level++; S.goalHold = 0;
  S.feet.L = 0; S.feet.R = 0;
  S.health = Math.min(100, S.health + 22);
  S.stamina = STAM.max;
  clearRoute();
  generateLevel(runner);
  D.inter.classList.add('hidden');
  S.mode = 'play';
  MUSIC.setMood(S.weather.key);        // the new beach's weather rescores it
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
/**
 * Every run gets a name, taken from whatever it was actually ABOUT. Each
 * candidate scores itself against the run's stats and the loudest one wins,
 * so "THE SANDAL INCIDENT" only shows up on a run that really was one.
 */
function nameTheRun(s) {
  const lvl = Math.max(1, S.level);
  // score everything PER BEACH, so a name describes what the run was like
  // rather than just how long it went on
  const per = (n) => n / lvl;
  const cand = [
    ['THE SANDAL INCIDENT',        per(s.faceplants * 2 + s.trips)],
    ['DEATH BY PELICAN',           per(s.hits) * 1.6],
    ['A SERIES OF ROBBERIES',      per(s.thefts) * 4],
    ['THE LONG WALK BACK',         per(s.recovered) * 4],
    ['THE GREAT BIRD WAR',         per(s.punts * 3 + s.raids)],
    ['THE BEACHCOMBER',            per(s.items) * 0.28],
    ['NOTHING BUT LAVA',           per(s.hotSteps) * 0.03],
    ['A CAREER IN PODIATRY',       lvl >= 8 ? 3 + lvl * 0.5 : 0],
    ['THE PLOVER AFFAIR',          per(s.conned) * 5],
    ['SHE CAME BACK FOR YOU',      s.rescues * 9],
    ['THE TREASURE HUNT',          per(s.chests) * 5 + s.islands * 8],
    ['CRAB-ADJACENT',              per(s.crabs) * 3],
    ['THE SOLE TRAIN',             s.bestCombo >= 8 ? s.bestCombo * 0.7 : 0],
    ['LISTENING TO A PELICAN',     per(s.prophecies) * 4],
    ['ABDUCTED, BRIEFLY',          s.eagles * 10],
    ['THE SWIM',                   per(s.waterTime) * 0.3],
    ['MOSTLY RUNNING AWAY',        per(s.leaps) * 0.8],
    // these two describe the SHAPE of a run, so they only apply once one
    // has actually happened — otherwise a fresh stat block wins by default
    ['A QUIET DAY, MOSTLY',        s.pacifist && s.hits === 0 && lvl >= 3 ? 4 + lvl * 0.4 : 0],
    ['THE TOURIST',                lvl <= 1 ? 5 : 0],
  ];
  cand.sort((a, b) => b[1] - a[1]);
  // if nothing about the run stood out, it was just a day at the beach
  return cand[0][1] < 3 ? 'AN ORDINARY AFTERNOON' : cand[0][0];
}

/** The feet give out: collapse, smoke, a beat of silence, then the card. */
function beginDeath() {
  if (S.mode === 'dying') return;
  S.mode = 'dying';
  S.deathT = 0;
  keys.clear();
  runner.trip('faceplant', null);
  runner.stumbleT = 99;                    // stay down
  runner.stumbleMax = 99;
  hitStop(0.35);
  cam.shake = 1.4;
  flashScreen(0.55, 500);
  MUSIC.stop(1.6);
  AU.sad();
  say(['tell my shoes... I loved them.', 'I regret... the sandals...', 'so... close...'][Math.floor(Math.random() * 3)], true);
  particles.burst(runner.x, runner.y + 0.5, runner.z, 24,
    { color: 0x555555, size: 0.5, ttl: 1.6, vy: 1.8, spread: 2.4, grow: 3 });
  document.exitPointerLock?.();
}
function updateDying(dt) {
  S.deathT += dt;
  // keep the body down and smoking while the camera pulls back
  runner.root.rotation.x = damp(runner.root.rotation.x, 1.5, 8, dt);
  runner.rig.position.y = damp(runner.rig.position.y, -0.55, 8, dt);
  if (Math.random() < dt * 14) {
    particles.spawn(runner.x + (Math.random() - 0.5) * 1.2, runner.y + 0.3,
      runner.z + (Math.random() - 0.5) * 1.2,
      { color: 0x777777, size: 0.42, ttl: 1.5, vy: 1.5, opacity: 0.55, grow: 2.6 });
  }
  cam._d = damp(cam._d ?? 9, 13, 1.6, dt);
  cam._h = damp(cam._h ?? 3, 6.5, 1.6, dt);
  const cp = Math.cos(cam._p ?? 0.3);
  camera.position.set(
    runner.x + Math.sin(cam.yaw) * cam._d * cp,
    runner.y + cam._h,
    runner.z + Math.cos(cam.yaw) * cam._d * cp,
  );
  camera.lookAt(runner.x, runner.y + 0.3, runner.z);
  if (S.deathT > 2.2) die();
}
function die() {
  S.mode = 'dead';
  S.hitStop = 0;
  // the only thing that outlives the run
  PROFILE.absorb(S.stats, S.level, S.score, true);
  const fresh = PROFILE.claim();
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
  S.runName = nameTheRun(s);
  D.runName.textContent = '“' + S.runName + '”';
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
    ['Times she saved you', s.rescues],
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
  const mutLine = Object.keys(S.mut).map(id => {
    const m = MUTATORS.find(x => x.id === id); return m ? m.icon + ' ' + m.name : id;
  }).join('  ·  ');
  D.card.innerHTML = rows.map(r => `<div class="row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')
    + `<div class="row bonus"><span>DISTANCE CONSOLATION</span><span>+${consolation}</span></div>`
    + `<div class="row" style="margin-top:6px;border-top:2px solid var(--line);padding-top:6px">
         <span>FINAL BUILD</span><span style="max-width:16em;text-align:right">${buildLine}</span></div>`
    + (syn ? `<div class="row bonus"><span>SYNERGIES</span><span>${syn}</span></div>` : '')
    + (mutLine ? `<div class="row bonus"><span>MADE IT WORSE (×${S.mutMult.toFixed(2)})</span>`
        + `<span style="max-width:16em;text-align:right">${mutLine}</span></div>` : '')
    + (fresh.length
      ? '<div class="row" style="margin-top:6px;border-top:2px solid var(--line);padding-top:6px">'
        + '<span>NEWLY UNLOCKED</span><span></span></div>'
        + fresh.map(u => `<div class="row bonus"><span>${ITEMS[u.item].icon} ${ITEMS[u.item].name}</span>`
            + `<span>${u.text}</span></div>`).join('')
      : '');
  if (fresh.length) {
    setTimeout(() => {
      banner('UNLOCKED ×' + fresh.length, fresh.map(u => ITEMS[u.item].name).join(' · '));
      AU.fanfare();
    }, 900);
  }
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

// ============================================================
// HALL OF SOLES — kept in scores.json on the server so initials outlive
// browser wipes, new machines and every revision of the game. localStorage
// is a mirror, used as the fallback on static hosting, and the two are
// merged on load so a score is never lost either way.
// ============================================================
const MAX_SCORES = 100;
let scoreCache = [];
const localScores = () => { try { return JSON.parse(localStorage.getItem('dbyf_hs') || '[]'); } catch { return []; } };
const mirrorLocal = (v) => { try { localStorage.setItem('dbyf_hs', JSON.stringify(v)); } catch { } };

function mergeScores(a, b) {
  const seen = new Set();
  const all = [...a, ...b].filter(r => r && typeof r.sc === 'number');
  const out = [];
  for (const r of all.sort((x, y) => y.sc - x.sc)) {
    const k = `${r.ini}|${r.sc}|${r.lv || 1}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
  }
  return out.slice(0, MAX_SCORES);
}
async function fetchScores() {
  // scores.json is read as a PLAIN STATIC FILE, which works identically on the
  // local Python server and on static hosting like Vercel. The committed file
  // is therefore the canonical hall, shared by everyone playing the deploy.
  let published = [];
  try {
    const r = await fetch('scores.json?t=' + Date.now(), { cache: 'no-store' });
    if (r.ok) published = await r.json();
  } catch { /* no file yet */ }
  scoreCache = mergeScores(published, localScores());
  mirrorLocal(scoreCache);
  renderScores();
}
async function pushScore(entry) {
  scoreCache = mergeScores([entry], scoreCache);
  mirrorLocal(scoreCache);
  renderScores();
  // Writing back only works where a real server is listening (local play).
  // On static hosting this 404s harmlessly and the localStorage mirror keeps
  // the score; to publish it to everyone, commit scores.json.
  try {
    const r = await fetch('_scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (r.ok) {                       // adopt the server's canonical table
      scoreCache = mergeScores(await r.json(), scoreCache);
      mirrorLocal(scoreCache);
      renderScores();
    }
  } catch { /* static host — the mirror already has it */ }
}
const loadScores = () => scoreCache;
function qualifies(sc) {
  if (sc <= 0) return false;
  return scoreCache.length < MAX_SCORES || sc > scoreCache[scoreCache.length - 1].sc;
}

// the attract board shows a dozen at a time and scrolls through the whole hall
const PAGE = 12;
let hsPage = 0, hsPageAt = 0;
function renderCareer() {
  if (!D.career) return;
  const st = PROFILE.data.stats;
  const total = Object.keys(ITEMS).filter(k => ITEMS[k].w > 0).length;
  const got = Math.min(PROFILE.discovered(), total);
  const bits = [
    ['beaches cleared', st.beaches], ['runs', st.runs], ['deaths', st.deaths],
    ['best beach', st.bestLevel], ['best score', st.bestScore.toLocaleString()],
    ['faceplants', st.faceplants], ['crabs met', st.crabs],
    ['times robbed', st.thefts], ['loot chased back', st.recovered],
    ['times she saved you', st.rescues],
  ];
  const next = PROFILE.nextUp(3).map(u =>
    `<div><span>${ITEMS[u.item].icon} ${ITEMS[u.item].name}</span>` +
    `<span>${u.text} &mdash; ${Math.min(u.have, u.at)}/${u.at}</span></div>`).join('');
  D.career.innerHTML =
    '<div class="ch">&#9670; YOUR CAREER &#9670;</div>' +
    '<div class="cstats">' + bits.map(b => `<span>${b[0]} <b>${b[1]}</b></span>`).join('') + '</div>' +
    `<div class="disc">${got} / ${total} BEACH ITEMS DISCOVERED</div>` +
    `<div class="bar"><i style="width:${Math.round(got / total * 100)}%"></i></div>` +
    (next ? '<div class="next">' + next + '</div>' : '<div class="disc">everything found. astonishing.</div>');
  renderMutators();
}

/**
 * MAKE IT WORSE — earned rule changes you switch on before a run. The panel
 * stays hidden until you've earned your first one, so a new player never
 * sees it. Each pays a score multiplier, and they stack.
 */
function renderMutators() {
  if (!D.mutbox) return;
  const earned = MUTATORS.filter(m => PROFILE.mutatorEarned(m));
  if (!earned.length) { D.mutbox.classList.add('hidden'); return; }
  D.mutbox.classList.remove('hidden');
  D.mutrow.innerHTML = MUTATORS.map((m) => {
    const has = PROFILE.mutatorEarned(m);
    const on = has && PROFILE.mutatorOn(m.id);
    const have = PROFILE.data.stats[m.need[0]] || 0;
    const cls = 'mut' + (on ? ' on' : '') + (has ? '' : ' locked');
    const sub = has ? m.blurb : `locked — ${m.need[0]} ${Math.min(have, m.need[1])}/${m.need[1]}`;
    return `<button class="${cls}" data-mut="${m.id}" ${has ? '' : 'disabled'}>
      <b>${m.icon} ${has ? m.name : '???'}</b><i>${sub}</i>
      <span class="mm">+${Math.round(m.mult * 100)}% score</span></button>`;
  }).join('');
  const mult = PROFILE.mutatorMult();
  D.mutMult.textContent = mult > 1 ? `×${mult.toFixed(2)} SCORE` : 'nothing switched on';
  D.mutrow.querySelectorAll('.mut[data-mut]').forEach(b => b.addEventListener('click', () => {
    if (b.disabled) return;
    PROFILE.toggleMutator(b.dataset.mut);
    AU.ensure(); AU.tick();
    renderMutators();
  }));
}

function renderScores() {
  const l = scoreCache;
  if (!l.length) {
    D.hs.innerHTML = '<div class="empty">no survivors yet. be the first.</div>';
    if (D.hsPage) D.hsPage.textContent = '';
    return;
  }
  const pages = Math.max(1, Math.ceil(l.length / PAGE));
  hsPage %= pages;
  const start = hsPage * PAGE;
  const rows = l.slice(start, start + PAGE);
  D.hs.innerHTML = rows.map((r, i) => {
    const rank = start + i + 1;
    const crown = rank === 1 ? ' \u{1F451}' : '';
    return `<div class="hsrow${rank <= 3 ? ' top' : ''}">` +
      `<span class="rk">${rank}.</span>` +
      `<span class="ini">${r.ini}${crown}</span>` +
      `<span class="sc">${r.sc.toLocaleString()}</span>` +
      `<span class="df">${r.df || ''}</span>` +
      `<span class="lv">LV${r.lv || 1}</span></div>`;
  }).join('');
  if (D.hsPage) {
    const shown = `${start + 1}–${start + rows.length}`;
    D.hsPage.textContent = pages > 1
      ? `${l.length} SOULS  ·  SHOWING ${shown}  ·  PAGE ${hsPage + 1}/${pages}`
      : `${l.length} SOUL${l.length === 1 ? '' : 'S'}`;
  }
}
/** Cycle the hall while the title screen idles. */
function tickScoreboard(t) {
  if (S.mode !== 'title') return;
  if (scoreCache.length <= PAGE) return;
  if (t - hsPageAt < 4.5) return;
  hsPageAt = t;
  hsPage++;
  renderScores();
  D.hs.parentElement.style.animation = 'none';
  void D.hs.parentElement.offsetWidth;
  D.hs.parentElement.style.animation = 'hsflip .45s ease-out';
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
  pushScore({
    ini: iChars.join(''),
    sc: S.score,
    df: S.diff.label.split(' ')[0],
    lv: S.level,
    at: new Date().toISOString().slice(0, 10),
  });
  D.initials.querySelector('p').textContent = '★ SAVED TO THE HALL. THE SEALS SAW EVERYTHING. ★';
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

  // the sky is allowed to change its mind partway down the beach
  tickWeatherTurn(dt);
  if (S.wxAnnounce) {
    const [ttl, blurb] = S.wxAnnounce; S.wxAnnounce = null;
    banner(ttl, blurb);
    teach('weather');
    AU.sweep(300, 620, 1.4, 'sine', 0.045);
    MUSIC.setMood(S.wxTo ? S.wxTo.key : S.weather.key);   // rescore for the new sky
    say(blurb, true);
  }

  const scouting = input.scout && runner.grounded;
  if (scouting && S.mode === 'play') { S.mode = 'scout'; S.stats.scouts++; AU.scout(); teach('scout'); }
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
  // shorts grant a fourth pocket — unless ONE POCKET says otherwise
  S.maxSlots = S.mut.onepocket ? 1 : 3 + build.slots;
  while (S.slots.length > S.maxSlots) S.slots.shift();
  if (runner.refuge) teach('refuge');
  // the soggy paperback pays you to actually sit still on a refuge
  if (hasIt('paperback') && runner.refuge && runner.speed < 0.8) {
    S.readT = (S.readT || 0) + dt;
    if (S.readT > 1) { S.readT = 0; addScore(45); }
  }
  // doubloons: heavy, but the score just keeps coming
  if (build.gold) { S.goldT = (S.goldT || 0) + dt; if (S.goldT > 0.5) { S.goldT = 0; addScore(70); } }
  // climb the lifeguard tower and the whole beach lays itself out for you —
  // the reward for going up is that you never have to guess again
  if (runner.refuge && runner.refuge.tower && !runner.refuge.claimed) {
    runner.refuge.claimed = true;
    let n = 0;
    for (const it of S.items) {
      if (it.taken) continue;
      it.mesh.children[1].scale.setScalar(2.4); n++;
    }
    for (const ch of S.chests) if (!ch.opened) ch.mesh.children[4].scale.setScalar(3.2);
    buildCoolRoute(true);
    banner('THE WHOLE BEACH', 'you can see everything from up here');
    toast('\u{1F6A9} ' + n + ' things worth having, and the cool way through  +400');
    addScore(400); AU.scout(); say('oh, THAT is where everything is.', true);
  }
  // the keys belong to a car, and the car is in the parking lot
  if (build.keys && !S.keysUsed && S.goal.key !== 'parking') {
    S.keysUsed = true;
    const gz = GOALS.parking.z[0] + Math.random() * (GOALS.parking.z[1] - GOALS.parking.z[0]);
    S.goal.marker.visible = false;
    S.goal = buildGoalAt('parking', S.goal.x, clamp(gz, 20, 28));
    banner('CHANGE OF PLAN', 'somebody wants their keys back');
    toast('\u{1F511} a car alarm starts chirping up at the lot');
    say('these belong to somebody. right. the lot.', true);
  }
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
  // humidity: nothing cools as well as it should, and you know it
  if (rate < 0 && S.weather.coolMul) rate *= S.weather.coolMul;
  // shoes: hugely protective, but not literal immunity — stand in a lava
  // patch long enough and they'll still start to go
  if (S.shoes > 0 && rate > 0) rate *= 0.12;
  if (S.invuln > 0) rate = Math.min(rate, HEAT.coolRefuge);   // the sand simply gives up
  // the planted foot takes the brunt — alternating is how you survive.
  // single shoes protect one foot only, which is very funny and quite useful.
  const mulL = rate > 0 ? footHeatMul('L') : 1;
  const mulR = rate > 0 ? footHeatMul('R') : 1;
  const moving = runner.speed > 0.6 && runner.grounded;
  if (rate > 0 && moving) {
    const lead = S.plant === 'L' ? 1.35 : 0.45;
    S.feet.L = clamp(S.feet.L + rate * lead * mulL * dt, 0, 100);
    S.feet.R = clamp(S.feet.R + rate * (1.8 - lead) * mulR * dt, 0, 100);
  } else {
    S.feet.L = clamp(S.feet.L + rate * mulL * dt, 0, 100);
    S.feet.R = clamp(S.feet.R + rate * mulR * dt, 0, 100);
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
  if (inWater) { ag = 24; S.stats.waterTime += dt; teach('water'); }
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
    if (S.level >= 5 && S.aggro > 60 && !flock.some(b => b.kind === 'tern') && Math.random() < 0.10 * dt) {
      spawnTerns(runner, 3);
    }
    if (S.level >= 4 && !flock.some(b => b.state === 'formation') && Math.random() < 0.055 * dt) {
      spawnPelicanLine(runner);
    }
    const wantEagle = build.eagle ? 0.05 : 0.008;
    if (S.level >= 3 && S.eagleTimer <= 0 && Math.random() < wantEagle * dt) spawnEagle(runner, build.eagle);
  }

  S.freeze = Math.max(0, S.freeze - dt);
  updateBirds(dt, runner, S.freeze > 0);
  if (S.freeze <= 0) updateEvents(dt, runner);
  tickCooldowns(dt);
  checkCheckpoints(runner);
  checkChests(dt, runner);
  // charging through loiterers scatters them — you're not helpless
  if (runner.speed > 8.5) scatterAt(runner.x, runner.z, 2.4, false);

  // ---------- loot: free slot auto-takes, a full build makes you choose ----------
  nearItem = null;
  for (const it of S.items) {
    if (it.taken) continue;
    it.ph += dt * 2.4;
    it.box.rotation.y = it.ph;
    it.box.position.y = 0.55 + Math.sin(it.ph) * 0.14;
    // lantern: cursed pickups visibly glow before you're anywhere near them
    if (build.identify && ITEMS[it.key].cursed && !it.lit) {
      it.lit = true;
      it.box.material.color.setHex(0xc86bff);
      it.box.material.emissive?.setHex(0x5a1f8a);
      if (it.mesh.children[2]) it.mesh.children[2].material.color.setHex(0xc86bff);
    }
    if (it.tumble > 0) {                        // freshly knocked loose — settle it
      it.tumble -= dt;
      it.mesh.position.y = damp(it.mesh.position.y, groundY(it.x, it.z), 9, dt);
      it.mesh.rotation.z = it.tumble * 4;
      if (it.tumble <= 0) it.mesh.rotation.z = 0;
    }
    if (it.cooldown > 0) { it.cooldown -= dt; continue; }
    const d = Math.hypot(runner.x - it.x, runner.z - it.z);
    // Always auto-pickup. If your build is full the oldest rotates out and
    // lands on the sand at your feet, so nothing is ever lost by accident.
    if (d < 2.9) takeItem(it);
    else if (d < 9 && S.slots.length >= S.maxSlots && !ITEMS[it.key].instant) {
      if (!nearItem || d < nearItem.d) nearItem = { it, d };
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
  // the score follows your predicament: cooking feet, a mob overhead, a
  // dive already in the air, or the desperate last stretch to the goal
  const diving = flock.some(b => b.state === 'dive' || b.state === 'stoop' || b.state === 'peel');
  MUSIC.setIntensity(clamp(
    Math.max(S.feet.L, S.feet.R) / 130
    + S.aggro / 260
    + (diving ? 0.3 : 0)
    + (S.shoes > 0 ? 0.25 : 0)
    + (gd < 45 ? 0.2 : 0), 0, 1));

  // Some goals want more than a touch. Kept deliberately light — a beat of
  // character at the finish, never something that withholds the win.
  const gdef = S.goal.def;
  D.goalLbl.textContent = (S.goalHold > 0 && gdef.hold)
    ? `${gdef.icon} ${gdef.verb}… ${(gdef.hold - S.goalHold).toFixed(1)}s`
    : `${gdef.icon} ${gdef.name}  ${Math.max(0, Math.round(gd))}m`;
  // the pools are only pools when the sea has gone out. wait for it.
  const tideOut = waveZ < W.zMin + 4.5;
  if (gdef.lowTide && gd < gdef.r + 6 && !tideOut) {
    D.goalLbl.textContent = `${gdef.icon} WAIT FOR THE TIDE…`;
    S.goalHold = 0;
    if (S.t - (S.tideNag || 0) > 6) {
      S.tideNag = S.t;
      toast('\u{1F30A} the pools are under water — wait for it to pull out', 'warn');
      say('come on. go out. go out.', false);
    }
  } else if (gd < gdef.r) {
    if (!gdef.hold) { levelComplete(); return; }
    if (gdef.quiet && runner.speed > gdef.quiet) {
      // you came barrelling in and the pups scattered
      if (S.goalHold > 0.25) {
        toast('\u{1F9AD} you spooked them! slow down.', 'bad');
        AU.bark(0.09); say('sorry! sorry — walking! walking!', false);
      }
      S.goalHold = 0;
    } else {
      if (S.goalHold === 0) {
        const openers = { truck: 'one please. a big one.', shower: 'oh that is COLD',
                          nursery: 'hello. hello. I come in peace.' };
        say(openers[S.goal.key] || '', false);
      }
      S.goalHold += dt;
      if (S.goalHold >= gdef.hold) { levelComplete(); return; }
    }
  } else S.goalHold = 0;
  if (S.health <= 0) { beginDeath(); return; }
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
  const build = buildStats();
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
  // the GoPro: it sees what's lining you up before you do
  if (build.warn) {
    const threat = flock.find(b =>
      b.state === 'peel' || b.state === 'dive' || b.state === 'lock' ||
      b.state === 'stoop' || b.state === 'snatch');
    if (threat) {
      D.warn.classList.remove('hidden');
      const a = Math.atan2(threat.x - runner.x, threat.z - runner.z) - cam.yaw;
      D.warn.style.transform = `rotate(${-a + Math.PI}rad)`;
    } else D.warn.classList.add('hidden');
  } else D.warn.classList.add('hidden');

  if (S.invuln > 0) {
    D.invuln.classList.remove('hidden');
    D.invuln.textContent = '6 — 7   ' + S.invuln.toFixed(1) + 's';
  } else if (S.shoes > 0) {
    D.invuln.classList.remove('hidden');
    D.invuln.textContent = '\u{1F45F} SHOES  ' + S.shoes.toFixed(0) + 's';
  } else D.invuln.classList.add('hidden');
  if (S.combo >= 2) {
    D.combo.classList.remove('hidden');
    D.combo.textContent = 'SOLE TRAIN ×' + S.combo;
    D.combo.style.fontSize = Math.min(15 + S.combo * 1.6, 34) + 'px';
  } else D.combo.classList.add('hidden');

  // goal arrow. The cursed compass still points at the goal — just via the
  // single worst line available. It is not wrong. It is mean.
  const dx = S.goal.x - runner.x, dz = S.goal.z - runner.z;
  let bearing = Math.atan2(dx, dz);
  if (hasIt('compass')) {
    let worst = -1, worstAng = bearing;
    for (let a = -1.15; a <= 1.15; a += 0.23) {
      const test = bearing + a;
      let heat = 0;
      for (let d = 6; d <= 26; d += 5) {
        heat += Math.max(0, heatAt(runner.x + Math.sin(test) * d,
                                   runner.z + Math.cos(test) * d, S.t));
      }
      if (heat > worst) { worst = heat; worstAng = test; }
    }
    bearing = worstAng;
    D.arrow.style.color = '#c86bff';
  } else {
    D.arrow.style.color = '';
  }
  const ang = bearing - cam.yaw;
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

  // heads-up while you're still approaching, so a full build is a choice
  if (nearItem && S.slots.length) {
    const d = ITEMS[nearItem.it.key];
    // the lantern reads the thing before you touch it
    const cursedWarning = (build.identify && d.cursed)
      ? '<br><b style="color:#c86bff">\u{1F3EE} THE LANTERN FLARES — THIS ONE IS CURSED</b>' : '';
    D.swapHint.classList.remove('hidden');
    D.swapHint.innerHTML = `${d.icon} <b>${d.name}</b> — ${d.desc}${cursedWarning}<br>` +
      `<i>taking it drops ${S.slots[0].def.icon} ${S.slots[0].def.name} on the sand</i>`;
  } else D.swapHint.classList.add('hidden');

  // live synergy list
  const syns = activeSynergies();
  if (syns.length) {
    D.syn.classList.remove('hidden');
    D.syn.innerHTML = syns.map(s => `<span>★ ${s.name}</span>`).join('');
  } else D.syn.classList.add('hidden');
}

// ---------------- attract mode ----------------
// A ghost of your last death loops under the score table, jogging along and
// then going down exactly where you did. Straight out of the arcade.
let ghost = null, ghostT = 0;
function buildGhost() {
  const g = new THREE.Group();
  const mat = () => new THREE.MeshBasicMaterial({
    color: 0x2a1c2a, transparent: true, opacity: 0.32, depthWrite: false });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.29, 0.34, 4, 8), mat());
  torso.position.y = 1.06; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat());
  head.position.y = 1.58; g.add(head);
  const mk = (x) => {
    const l = new THREE.Group(); l.position.set(x, 0.74, 0);
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.36, 4, 6), mat());
    s.position.y = -0.26; l.add(s); g.add(l); return l;
  };
  const legL = mk(-0.16), legR = mk(0.16);
  const arm = (x) => {
    const a = new THREE.Group(); a.position.set(x, 1.24, 0);
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.36, 4, 6), mat());
    s.position.y = -0.25; a.add(s); g.add(a); return a;
  };
  g.userData = { legL, legR, armL: arm(-0.34), armR: arm(0.34) };
  scene.add(g);
  return g;
}
function updateGhost(dt) {
  if (!ghost) ghost = buildGhost();
  ghost.visible = S.mode === 'title';
  if (!ghost.visible) return;
  const runFor = 9, downFor = 3.2;
  ghostT = (ghostT + dt) % (runFor + downFor);
  const dying = ghostT > runFor;
  const gx = lerp(-60, 40, Math.min(1, ghostT / runFor));
  const gz = 8 + Math.sin(ghostT * 0.5) * 4;
  const u = ghost.userData;
  if (!dying) {
    const ph = ghostT * 11;
    ghost.position.set(gx, groundY(gx, gz) + Math.abs(Math.sin(ph)) * 0.06, gz);
    ghost.rotation.set(0, Math.PI / 2, 0);
    u.legL.rotation.x = Math.sin(ph) * 0.8;
    u.legR.rotation.x = -Math.sin(ph) * 0.8;
    // the classic: arms up, already regretting it
    u.armL.rotation.x = -1.4 - Math.sin(ph * 1.3) * 0.6;
    u.armR.rotation.x = -1.4 + Math.sin(ph * 1.3) * 0.6;
  } else {
    const k = Math.min(1, (ghostT - runFor) / 0.5);
    ghost.position.set(gx, groundY(gx, gz), gz);
    ghost.rotation.set(k * 1.5, Math.PI / 2, 0);
    u.legL.rotation.x = 0.4; u.legR.rotation.x = 0.25;
    u.armL.rotation.x = -2.2; u.armR.rotation.x = -2.2;
    if (Math.random() < dt * 8) {
      particles.spawn(gx + (Math.random() - 0.5), groundY(gx, gz) + 0.4, gz + (Math.random() - 0.5),
        { color: 0x888888, size: 0.36, ttl: 1.3, vy: 1.4, opacity: 0.35, grow: 2.4 });
    }
  }
}

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
renderCareer();
fetchScores();          // pull the persisted hall from scores.json

const clock = new THREE.Clock();
let paintAcc = 0;
function loop() {
  requestAnimationFrame(loop);
  let dt = Math.min(clock.getDelta(), 0.05);
  // hit-stop — the world hesitates for a few frames on a real impact
  if (S.hitStop > 0) { S.hitStop -= dt; dt *= 0.12; }
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
  } else if (S.mode === 'dying') {
    runner.root.position.set(runner.x, runner.y, runner.z);
    updateDying(dt);
  } else if (S.mode === 'title') {
    attract(S.t);
    tickScoreboard(S.t);
    updateGhost(dt);
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
  // the sun visibly bears down as the level wears on, so the mounting heat
  // has a cause you can see rather than just being a number getting worse
  const press = (sunPressure() - 1) / 0.20;
  sunSprite.position.set(camera.position.x + 70, 62 - press * 9, camera.position.z - 130);
  sunSprite.scale.setScalar(sunSprite.userData.baseScale * (1 + press * 0.22));

  renderer.render(scene, camera);
}
loop();

// ---------------- debug / balance handle ----------------
window.DBYF = {
  S, runner, camera, cam, keys, input, renderer, scene, AU, MUSIC, PROFILE,
  ITEMS, SYNERGIES, buildStats, activeSynergies, grant, readyActive, flock,
  spawnThief, spawnVulture, spawnFalcon, spawnEagle, scatterAt, useItem, dropItem,
  spawnTerns, spawnPelicanLine, fireEvent, buildChestAt, transitionWeather,
  rollItem, sunPressure, MUTATORS, setPaused,
  levelComplete, die, nextLevel, generateLevel: () => generateLevel(runner),
  /** headless tick. `visual` does the expensive repaint; skip it for balance sims. */
  step(dt = 0.016, visual = true) {
    if (S.hitStop > 0) { S.hitStop -= dt; dt *= 0.12; }
    S.t += dt; readInput(); updateTide(S.t);
    if (S.mode === 'play' || S.mode === 'scout') { simulate(dt); if (visual) updateHUD(); }
    else if (S.mode === 'dying') { runner.root.position.set(runner.x, runner.y, runner.z); updateDying(dt); }
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
  scores: () => scoreCache,
  refetchScores: fetchScores,
  cycleScores() { hsPage++; renderScores(); },
  heatProbe: (x, z) => heatAt(x, z, S.t) * effHeat(),
};
