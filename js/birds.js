// ============================================================
// birds.js — the beach has a bird problem.
// Birds physically live here. They land, they watch, they edge
// closer, and when enough of them have gathered they come for
// your things. You can see it coming the whole time.
// ============================================================
import * as THREE from 'three';
import { clamp, lerp, damp, toon, meshOf, emojiSprite } from './engine.js';
import { S, W } from './state.js';
import { scene, groundY } from './world.js';
import { AU, say } from './audio.js';
import { bus } from './bus.js';
import { ITEMS, buildStats, removeItem, grant, hasItem } from './items.js';

export const flock = [];
const MAX_BIRDS = 14;

// ---------------- meshes ----------------
function birdMesh(opts) {
  const { body = 0xf7f7f2, wing = 0x8e9aa6, tip = 0x2c2c34, beak = 0xffa33d, head = 0xffffff, scale = 1 } = opts || {};
  const g = new THREE.Group();
  const b = meshOf(new THREE.CapsuleGeometry(0.3, 0.66, 4, 8), body);
  b.rotation.x = Math.PI / 2; g.add(b);
  const h = meshOf(new THREE.SphereGeometry(0.27, 8, 8), head); h.position.z = 0.58; g.add(h);
  const bk = meshOf(new THREE.ConeGeometry(0.1, 0.4, 5), beak, { outlineScale: 1.25 });
  bk.rotation.x = Math.PI / 2; bk.position.z = 0.94; g.add(bk);
  // grey wings with dark tips read against pale sand from a long way off
  const wm = toon(wing); wm.side = THREE.DoubleSide;
  const tm = toon(tip); tm.side = THREE.DoubleSide;
  const mkWing = (side) => {
    const w = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.5), wm);
    inner.position.x = side * 0.58; w.add(inner);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.4), tm);
    outer.position.x = side * 1.42; w.add(outer);
    g.add(w); return w;
  };
  const w1 = mkWing(-1), w2 = mkWing(1);
  const legs = meshOf(new THREE.CylinderGeometry(0.045, 0.045, 0.38, 4), 0xf0a04a, { outline: false });
  legs.position.y = -0.36; g.add(legs);
  g.userData.wings = [w1, w2];
  g.userData.legs = legs;
  g.scale.setScalar(scale * 1.45);
  return g;
}
/** every bird gets a little ground shadow so you can always place it */
function groundBlob(r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 14),
    new THREE.MeshBasicMaterial({ color: 0x2a1c10, transparent: true, opacity: 0.3, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 5; scene.add(m); return m;
}
function shadowDisc(r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 6; scene.add(m); return m;
}

const PRESET = {
  gull:    { body: 0xfbfbf8, wing: 0x9aa6b2, tip: 0x24242c, beak: 0xffa33d, scale: 1.0 },
  thief:   { body: 0x6e6a72, wing: 0x4a4652, tip: 0x1c1a22, head: 0xdedae4, beak: 0xd94b3a, scale: 1.1 },
  plover:  { body: 0xf6ecdc, wing: 0xbfa981, tip: 0x4a4038, head: 0xfff8ec, beak: 0x2e2a26, scale: 0.7 },
  vulture: { body: 0x3d3138, wing: 0x241e24, tip: 0x141014, head: 0xb05a4a, beak: 0xe0d0b0, scale: 1.6 },
  falcon:  { body: 0x6a6472, wing: 0x3a3644, tip: 0x16141c, head: 0xd8cfc0, beak: 0x2e2a30, scale: 1.25 },
  eagle:   { body: 0x5a4230, wing: 0x3a2a18, tip: 0x1e1610, head: 0xfaf7f2, beak: 0xf5c542, scale: 2.3 },
};

function addBird(kind, x, z, y, state) {
  if (flock.length >= MAX_BIRDS) return null;
  const mesh = birdMesh(PRESET[kind]);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  const b = {
    kind, mesh, x, z, y, state, t: 0, hop: Math.random() * 6.3,
    carry: null, carrySprite: null, shadow: null, scared: 0,
    blob: groundBlob(0.5 * (PRESET[kind].scale || 1) * 1.45),
    tgt: { x, z }, vy: 0, dur: 0, angle: Math.random() * 6.3,
  };
  flock.push(b);
  return b;
}
function killBird(b) {
  scene.remove(b.mesh);
  if (b.shadow) scene.remove(b.shadow);
  if (b.blob) scene.remove(b.blob);
  if (b.carrySprite) scene.remove(b.carrySprite);
  const i = flock.indexOf(b);
  if (i >= 0) flock.splice(i, 1);
}
export function clearFlock() { for (const b of [...flock]) killBird(b); }

// ---------------- flock pressure ----------------
/** How many gulls should be loitering, given how interesting you are. */
function desiredGulls() {
  if (S.eagleTimer > 0) return 0;                 // nobody argues with the eagle
  return Math.min(8, Math.floor(S.aggro / 12));
}
function gullsWatching() { return flock.filter(b => b.kind === 'gull' && b.state === 'watch').length; }

function spawnLandingGull(runner) {
  const ang = Math.random() * Math.PI * 2;
  const r = 13 + Math.random() * 9;
  const lx = clamp(runner.x + Math.cos(ang) * r, W.xMin, W.xMax);
  const lz = clamp(runner.z + Math.sin(ang) * r, W.zMin + 1, W.zMax - 2);
  const b = addBird('gull', lx - 16, lz - 14, 12 + Math.random() * 5, 'flyin');
  if (!b) return;
  b.tgt = { x: lx, z: lz };
  b.dur = 1.4 + Math.random() * 0.6;
  if (Math.random() < 0.4) AU.gullCall();
}

/** The raid: everything that has gathered takes off at once. */
function launchRaid(runner) {
  const watchers = flock.filter(b => b.kind === 'gull' && b.state === 'watch');
  if (!watchers.length) return;
  watchers.forEach((b, i) => {
    b.state = 'takeoff';
    b.t = -i * 0.28;                              // staggered so you can react
    const lead = 0.35 + i * 0.06;
    b.strike = {
      x: clamp(runner.x + Math.sin(runner.facing) * runner.speed * lead + (Math.random() - 0.5) * 3, W.xMin, W.xMax),
      z: clamp(runner.z + Math.cos(runner.facing) * runner.speed * lead + (Math.random() - 0.5) * 3, W.zMin, W.zMax),
    };
    b.shadow = shadowDisc(2.4);
  });
  AU.screech();
  bus.toast('\u{1F426} THE FLOCK IS COMING — MOVE!', 'bad');
  bus.shake(0.6);
  say('here they come!', true);
  S.stats.raids++;
}

// ---------------- theft ----------------
function stealFrom(b, runner, wantBest) {
  if (!S.slots.length) return false;
  let inst;
  if (wantBest) {
    inst = [...S.slots].sort((p, q) => (q.def.rarity || 1) - (p.def.rarity || 1))[0];
  } else {
    inst = S.slots[Math.floor(Math.random() * S.slots.length)];
  }
  removeItem(inst);
  b.carry = inst.key;
  b.state = 'carry';
  b.t = 0;
  b.carrySprite = emojiSprite(inst.def.icon, 1.1);
  scene.add(b.carrySprite);
  bus.toast('\u{1F426} STOLE YOUR ' + inst.def.name + ' — CHASE IT!', 'bad');
  bus.shake(0.8);
  AU.poof();
  say('hey! HEY! that is mine!', true);
  S.stats.thefts++;
  return true;
}
function recoverFrom(b) {
  const key = b.carry;
  b.carry = null;
  if (b.carrySprite) { scene.remove(b.carrySprite); b.carrySprite = null; }
  grant(key, true);
  bus.toast('\u{1F44A} GOT IT BACK! ' + ITEMS[key].icon + ' +400');
  bus.score(400);
  AU.coin(); AU.thwack();
  say('thank you. thief.', true);
  S.stats.recovered++;
  b.state = 'flee'; b.t = 0;
}

/** Player charged into a bird, punched, or netted: scatter it. */
export function scatterAt(x, z, radius, forceful) {
  let n = 0;
  for (const b of [...flock]) {
    if (b.kind === 'vulture' || b.kind === 'eagle') continue;
    const d = Math.hypot(b.x - x, b.z - z);
    if (d > radius) continue;
    if (b.carry) { recoverFrom(b); n++; continue; }
    if (b.state === 'watch' || b.state === 'flyin' || forceful) {
      b.state = 'flee'; b.t = 0; b.scared = 1;
      n++;
    }
  }
  if (n) {
    S.aggro = Math.max(0, S.aggro - (forceful ? 45 : 12 * n));
    AU.gullCall();
    if (forceful) { bus.toast('SCATTERED ×' + n + '  +' + n * 120); bus.score(n * 120); }
  }
  return n;
}

// ---------------- special birds ----------------
export function spawnThief(runner) {
  const b = addBird('thief', runner.x - 20, runner.z - 10, 9, 'stalk');
  if (b) {
    bus.toast("\u{1F426}\u{200D}\u{2B1B} a HEERMANN'S GULL is shadowing you", 'warn');
    say('that one is planning something.', false);
  }
}
export function spawnPlover(runner) {
  // the broken-wing act: it flops beside a "prize" out in the scorching sand
  const ang = Math.random() * Math.PI * 2;
  const lx = clamp(runner.x + Math.cos(ang) * 16, W.xMin, W.xMax);
  const lz = clamp(runner.z + Math.sin(ang) * 12, 2, W.zMax - 4);
  const b = addBird('plover', lx, lz, groundY(lx, lz) + 0.2, 'lure');
  if (!b) return;
  b.lure = emojiSprite('\u{2728}', 1.3);
  b.lure.position.set(lx, groundY(lx, lz) + 1.2, lz);
  scene.add(b.lure);
  b.mesh.position.y = groundY(lx, lz) + 0.18;
}
export function spawnVulture(runner) {
  if (flock.some(b => b.kind === 'vulture')) return;
  const b = addBird('vulture', runner.x, runner.z, 22, 'circle');
  if (b) {
    bus.toast('\u{1F985} a vulture is circling. it is being patient.', 'warn');
    say('oh that is not encouraging.', true);
  }
}
export function spawnFalcon(runner) {
  const b = addBird('falcon', runner.x + 12, runner.z - 18, 28, 'lock');
  if (!b) return;
  b.shadow = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.5, 26),
    new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  b.shadow.rotation.x = -Math.PI / 2;
  b.shadow.renderOrder = 7;
  scene.add(b.shadow);
  AU.sweep(1500, 2100, 0.4, 'triangle', 0.07);
  bus.toast('\u{1F985} PEREGRINE FALCON — GET BEHIND A ROCK', 'bad');
  say('oh no. oh no no no.', true);
}
export function spawnEagle(runner, summoned) {
  if (flock.some(b => b.kind === 'eagle')) return;
  const b = addBird('eagle', runner.x - 26, runner.z - 20, 20, 'arrive');
  if (!b) return;
  S.eagleTimer = 14;
  for (const o of flock) if (o.kind !== 'eagle') { o.state = 'flee'; o.t = 0; }
  AU.sweep(1100, 700, 0.7, 'triangle', 0.085);
  bus.toast('\u{1F985} THE BALD EAGLE. everything else just left.', summoned ? 'warn' : '');
  bus.shake(1);
  say(summoned ? 'the can. the can worked.' : 'whoa. look at that thing.', true);
}

// ---------------- per-frame ----------------
export function updateBirds(dt, runner, frozen) {
  const stats = buildStats();
  if (S.eagleTimer > 0) S.eagleTimer -= dt;

  // keep the loitering flock topped up to match how interesting you are
  if (!frozen && S.mode === 'play') {
    const want = desiredGulls();
    const have = flock.filter(b => b.kind === 'gull' && (b.state === 'watch' || b.state === 'flyin')).length;
    if (have < want && S.t > (S.nextGullAt || 0)) {
      S.nextGullAt = S.t + 0.7 + Math.random() * 0.9;
      spawnLandingGull(runner);
    }
    if (S.aggro >= 100 && gullsWatching() > 0) {
      launchRaid(runner);
      S.aggro = 24;
    }
  }

  for (const b of [...flock]) {
    if (frozen && b.kind !== 'eagle') { flapIdle(b, dt * 0.15); continue; }
    b.t += dt;
    switch (b.kind) {
      case 'gull': updateGull(b, dt, runner, stats); break;
      case 'thief': updateThief(b, dt, runner, stats); break;
      case 'plover': updatePlover(b, dt, runner); break;
      case 'vulture': updateVulture(b, dt, runner); break;
      case 'falcon': updateFalcon(b, dt, runner, stats); break;
      case 'eagle': updateEagle(b, dt, runner); break;
    }
    b.mesh.position.set(b.x, b.y, b.z);
    if (b.carrySprite) b.carrySprite.position.set(b.x, b.y - 0.55, b.z);
    if (b.blob) {
      const gy = groundY(b.x, b.z);
      const h = clamp(b.y - gy, 0, 20);
      b.blob.position.set(b.x, gy + 0.05, b.z);
      b.blob.material.opacity = lerp(0.34, 0.05, clamp(h / 14, 0, 1));
      b.blob.scale.setScalar(1 + h * 0.06);
    }
  }
}
function flapIdle(b, dt) {
  const f = Math.sin(S.t * 16 + b.hop) * 0.7;
  b.mesh.userData.wings[0].rotation.y = f;
  b.mesh.userData.wings[1].rotation.y = -f;
}
function flapFly(b) {
  const f = Math.sin(S.t * 20 + b.hop) * 0.85;
  b.mesh.userData.wings[0].rotation.y = f;
  b.mesh.userData.wings[1].rotation.y = -f;
  b.mesh.userData.legs.visible = false;
}
function standStill(b) {
  b.mesh.userData.wings[0].rotation.y = 0.1;
  b.mesh.userData.wings[1].rotation.y = -0.1;
  b.mesh.userData.legs.visible = true;
}
function face(b, tx, tz) {
  b.mesh.rotation.y = Math.atan2(tx - b.x, tz - b.z);
}

// ---- western gull: land, watch, creep closer, raid ----
function updateGull(b, dt, runner, stats) {
  const gy = groundY(b.x, b.z);
  if (b.state === 'flyin') {
    const k = clamp(b.t / b.dur, 0, 1);
    b.x = lerp(b.x, b.tgt.x, 1 - Math.exp(-4 * dt));
    b.z = lerp(b.z, b.tgt.z, 1 - Math.exp(-4 * dt));
    b.y = lerp(b.y, groundY(b.tgt.x, b.tgt.z) + 0.34, 1 - Math.exp(-3.2 * dt));
    flapFly(b); face(b, b.tgt.x, b.tgt.z);
    if (k >= 1) { b.state = 'watch'; b.t = 0; }

  } else if (b.state === 'watch') {
    b.y = damp(b.y, gy + 0.34, 10, dt);
    standStill(b);
    face(b, runner.x, runner.z);
    // they edge in, hop by hop. the closer they are, the sooner it starts.
    const d = Math.hypot(runner.x - b.x, runner.z - b.z);
    if (d > 4.5 && b.t > 0.9) {
      b.t = 0;
      const step = 0.9 + Math.random() * 0.8;
      b.x += (runner.x - b.x) / d * step;
      b.z += (runner.z - b.z) / d * step;
      b.hopUntil = S.t + 0.22;
    }
    if (S.t < (b.hopUntil || 0)) b.y = gy + 0.34 + Math.sin((b.hopUntil - S.t) * 14) * 0.16;
    // charging through a loitering gull scatters it — real agency
    if (d < 2.0 && runner.speed > 7.5) {
      b.state = 'flee'; b.t = 0;
      S.aggro = Math.max(0, S.aggro - 10);
      bus.toast('SHOOED! +80'); bus.score(80); AU.gullCall();
    }

  } else if (b.state === 'takeoff') {
    if (b.t < 0) { standStill(b); return; }          // staggered start
    flapFly(b);
    b.y = damp(b.y, gy + 7, 6, dt);
    if (b.shadow) {
      b.shadow.position.set(b.strike.x, groundY(b.strike.x, b.strike.z) + 0.06, b.strike.z);
      b.shadow.material.opacity = 0.2 + 0.25 * Math.abs(Math.sin(S.t * 14));
    }
    if (b.t > 0.75) { b.state = 'dive'; b.t = 0; b.from = { x: b.x, y: b.y, z: b.z }; }

  } else if (b.state === 'dive') {
    const k = clamp(b.t / 0.55, 0, 1);
    b.x = lerp(b.from.x, b.strike.x, k);
    b.z = lerp(b.from.z, b.strike.z, k);
    b.y = lerp(b.from.y, groundY(b.strike.x, b.strike.z) + 0.7, k * k);
    flapFly(b); face(b, b.strike.x, b.strike.z);
    if (b.shadow) b.shadow.scale.setScalar(lerp(1.3, 0.8, k));
    if (k >= 1) {
      resolveHit(b, runner, stats, 2.7, false);
      // a successful theft puts it in 'carry' — don't stomp that, it's chaseable
      if (b.state === 'dive') { b.state = 'flee'; b.t = 0; b.angle = Math.random() * 6.3; }
      if (b.shadow) { scene.remove(b.shadow); b.shadow = null; }
    }

  } else if (b.state === 'carry') {
    flapFly(b);
    // slow and low at first — you get a few seconds to run it down
    const climb = b.t < 2.4 ? 1.1 : 4.5;
    const speed = b.t < 2.4 ? 3.4 : 9;
    b.y += climb * dt;
    b.x += Math.sin(b.angle) * speed * dt;
    b.z += Math.cos(b.angle) * speed * dt;
    face(b, b.x + Math.sin(b.angle), b.z + Math.cos(b.angle));
    const d = Math.hypot(runner.x - b.x, runner.z - b.z);
    if (d < 2.6 && b.y - runner.y < 3.2) recoverFrom(b);
    else if (b.t > 7 || b.y > 26) {
      bus.toast('...it got away with it.', 'bad');
      killBird(b);
    }

  } else if (b.state === 'flee') {
    flapFly(b);
    b.y += 5 * dt;
    b.x += Math.sin(b.angle) * 11 * dt;
    b.z += Math.cos(b.angle) * 11 * dt;
    if (b.t > 2.2) killBird(b);
  }
}

// ---- Heermann's gull: the professional. waits for you to slip. ----
function updateThief(b, dt, runner, stats) {
  if (b.state === 'stalk') {
    const d = Math.hypot(runner.x - b.x, runner.z - b.z);
    const want = 9;
    const k = (d - want) * 0.9;
    const ang = Math.atan2(runner.x - b.x, runner.z - b.z);
    b.x += Math.sin(ang) * k * dt;
    b.z += Math.cos(ang) * k * dt;
    b.x += Math.sin(S.t * 0.6 + b.hop) * 2 * dt;
    b.y = damp(b.y, groundY(b.x, b.z) + 5.5, 3, dt);
    flapFly(b); face(b, runner.x, runner.z);
    // it strikes the moment you're vulnerable: mid-air, burning, or in the sea
    const vulnerable = !runner.grounded || S.heatState >= 3 || runner.z <= -2;
    if (vulnerable && S.slots.length && b.t > 3.5) {
      b.state = 'snatch'; b.t = 0; b.from = { x: b.x, y: b.y, z: b.z };
      AU.screech();
    }
  } else if (b.state === 'snatch') {
    const k = clamp(b.t / 0.45, 0, 1);
    b.x = lerp(b.from.x, runner.x, k);
    b.z = lerp(b.from.z, runner.z, k);
    b.y = lerp(b.from.y, runner.y + 0.9, k * k);
    flapFly(b);
    if (k >= 1) {
      const g = buildStats().guard;
      if (Math.random() < g) {
        bus.toast('\u{1F980} blocked the thief!'); AU.thwack(); b.state = 'flee'; b.t = 0;
      } else if (!stealFrom(b, runner, true)) { b.state = 'flee'; b.t = 0; }
      b.angle = Math.random() * 6.3;
    }
  } else if (b.state === 'carry') {
    updateGull(b, dt, runner, stats);
  } else if (b.state === 'flee') {
    flapFly(b); b.y += 5 * dt;
    b.x += Math.sin(b.angle) * 12 * dt; b.z += Math.cos(b.angle) * 12 * dt;
    if (b.t > 2.4) killBird(b);
  }
}

// ---- snowy plover: the broken-wing con ----
function updatePlover(b, dt, runner) {
  const gy = groundY(b.x, b.z);
  if (b.state === 'lure') {
    b.y = gy + 0.18 + Math.abs(Math.sin(S.t * 7 + b.hop)) * 0.1;
    b.mesh.rotation.z = Math.sin(S.t * 9) * 0.5;          // flopping pathetically
    b.mesh.rotation.y = Math.sin(S.t * 2) * 1.2;
    standStill(b);
    if (b.lure) b.lure.position.y = gy + 1.2 + Math.sin(S.t * 3) * 0.15;
    const d = Math.hypot(runner.x - b.x, runner.z - b.z);
    if (d < 4.5) {
      b.state = 'flee'; b.t = 0; b.angle = Math.random() * 6.3;
      b.mesh.rotation.z = 0;
      if (b.lure) { scene.remove(b.lure); b.lure = null; }
      bus.toast('the plover was FINE. it was never hurt.', 'warn');
      AU.gullCall();
      say('you little liar!', true);
      S.stats.conned++;
    }
    if (b.t > 26) { if (b.lure) scene.remove(b.lure); killBird(b); }
  } else {
    flapFly(b); b.y += 4 * dt;
    b.x += Math.sin(b.angle) * 9 * dt; b.z += Math.cos(b.angle) * 9 * dt;
    if (b.t > 2.5) killBird(b);
  }
}

// ---- turkey vulture: does nothing. that's the point. ----
function updateVulture(b, dt, runner) {
  b.angle += dt * 0.55;
  const r = 9;
  b.x = damp(b.x, runner.x + Math.cos(b.angle) * r, 2, dt);
  b.z = damp(b.z, runner.z + Math.sin(b.angle) * r, 2, dt);
  b.y = damp(b.y, groundY(runner.x, runner.z) + 17, 1.6, dt);
  b.mesh.rotation.y = -b.angle + Math.PI / 2;
  b.mesh.userData.wings[0].rotation.y = 0.12;     // soaring, barely flapping
  b.mesh.userData.wings[1].rotation.y = -0.12;
  b.mesh.userData.legs.visible = false;
  if (S.heatState < 3) { b.state = 'flee'; }
  if (b.state === 'flee') { b.y += 3 * dt; if (b.y > 34) killBird(b); }
}

// ---- peregrine falcon: lock, stoop, scatter everything ----
function updateFalcon(b, dt, runner, stats) {
  if (b.state === 'lock') {
    b.angle += dt * 1.1;
    b.x = runner.x + Math.cos(b.angle) * 13;
    b.z = runner.z + Math.sin(b.angle) * 13;
    b.y = damp(b.y, groundY(runner.x, runner.z) + 24, 2, dt);
    flapFly(b); face(b, runner.x, runner.z);
    if (b.shadow) {
      b.shadow.position.set(runner.x, runner.y + 0.07, runner.z);
      b.shadow.material.opacity = 0.35 + 0.45 * Math.abs(Math.sin(b.t * 9));
      b.shadow.scale.setScalar(lerp(2.4, 1.0, clamp(b.t / 2.6, 0, 1)));
    }
    if (b.t > 2.6) {
      b.state = 'stoop'; b.t = 0;
      b.from = { x: b.x, y: b.y, z: b.z };
      b.strike = { x: runner.x, z: runner.z };
      AU.sweep(2100, 400, 0.5, 'triangle', 0.1);
    }
  } else if (b.state === 'stoop') {
    const k = clamp(b.t / 0.5, 0, 1);
    b.x = lerp(b.from.x, b.strike.x, k * k);
    b.z = lerp(b.from.z, b.strike.z, k * k);
    b.y = lerp(b.from.y, groundY(b.strike.x, b.strike.z) + 0.8, k * k);
    flapFly(b);
    if (k >= 1) {
      const sheltered = runner.refuge && (runner.refuge.type === 'rock' || runner.refuge.type === 'wood');
      if (sheltered) {
        bus.toast('SHELTERED! the falcon is furious  +500'); bus.score(500);
        S.stats.dodges++; AU.screech();
      } else {
        resolveHit(b, runner, stats, 4.0, true);
      }
      if (b.shadow) { scene.remove(b.shadow); b.shadow = null; }
      b.state = 'flee'; b.t = 0; b.angle = Math.random() * 6.3;
    }
  } else {
    flapFly(b); b.y += 8 * dt;
    b.x += Math.sin(b.angle) * 16 * dt; b.z += Math.cos(b.angle) * 16 * dt;
    if (b.t > 2.5) killBird(b);
  }
}

// ---- bald eagle: outranks everyone. may bless, may abduct. ----
function updateEagle(b, dt, runner) {
  if (b.state === 'arrive') {
    b.x = damp(b.x, runner.x, 1.6, dt);
    b.z = damp(b.z, runner.z, 1.6, dt);
    b.y = damp(b.y, groundY(runner.x, runner.z) + 15, 1.6, dt);
    flapFly(b); face(b, runner.x, runner.z);
    if (b.t > 2.6) { b.state = 'circle'; b.t = 0; }
  } else if (b.state === 'circle') {
    b.angle += dt * 0.7;
    b.x = runner.x + Math.cos(b.angle) * 10;
    b.z = runner.z + Math.sin(b.angle) * 10;
    b.y = damp(b.y, groundY(runner.x, runner.z) + 13, 2, dt);
    b.mesh.rotation.y = -b.angle + Math.PI / 2;
    flapFly(b);
    if (b.t > 5.5) {
      // carrying something fishy? you're the delivery.
      if (hasItem('tuna') || hasItem('corndog')) { b.state = 'abduct'; b.t = 0; }
      else { b.state = 'gift'; b.t = 0; }
    }
  } else if (b.state === 'gift') {
    b.y = damp(b.y, groundY(b.x, b.z) + 9, 2, dt);
    flapFly(b);
    if (b.t > 0.9) {
      const pool = Object.keys(ITEMS).filter(k => ITEMS[k].rarity === 2);
      const key = pool[Math.floor(Math.random() * pool.length)];
      grant(key);
      bus.toast('\u{1F985} the eagle drops something and leaves. respect.');
      bus.score(300);
      AU.fanfare();
      say('thank you, sir.', true);
      b.state = 'leave'; b.t = 0; b.angle = Math.random() * 6.3;
    }
  } else if (b.state === 'abduct') {
    const k = clamp(b.t / 0.8, 0, 1);
    b.x = damp(b.x, runner.x, 8, dt);
    b.z = damp(b.z, runner.z, 8, dt);
    b.y = damp(b.y, runner.y + 1.4, 6, dt);
    flapFly(b);
    if (k >= 1 && !b.grabbed) {
      b.grabbed = true;
      runner.abductedBy = b;
      bus.toast('\u{1F985} YOU SMELL LIKE FISH', 'bad');
      say('put me down! put me DOWN!', true);
      AU.sweep(700, 1300, 0.6, 'triangle', 0.09);
      b.dropAt = { x: clamp(runner.x + 22 + Math.random() * 16, W.xMin, W.xMax),
                   z: clamp(4 + Math.random() * 16, W.zMin + 2, W.zMax - 4) };
    }
    if (b.grabbed) {
      b.state = 'flying'; b.t = 0;
    }
  } else if (b.state === 'flying') {
    b.x = damp(b.x, b.dropAt.x, 1.5, dt);
    b.z = damp(b.z, b.dropAt.z, 1.5, dt);
    b.y = damp(b.y, groundY(b.x, b.z) + 11, 1.6, dt);
    flapFly(b);
    runner.x = b.x; runner.z = b.z; runner.y = b.y - 1.4;
    runner.grounded = false; runner.vy = 0;
    if (Math.hypot(b.x - b.dropAt.x, b.z - b.dropAt.z) < 2.5 || b.t > 4.5) {
      runner.abductedBy = null;
      runner.vy = -1;
      bus.toast('dropped. rude, but a shortcut.');
      say('...actually that helped.', true);
      b.state = 'leave'; b.t = 0; b.angle = Math.random() * 6.3;
    }
  } else {
    flapFly(b); b.y += 6 * dt;
    b.x += Math.sin(b.angle) * 13 * dt; b.z += Math.cos(b.angle) * 13 * dt;
    if (b.t > 3) killBird(b);
  }
}

// ---------------- sanderlings: harmless, and an honest tide tell ----------------
const sanderlings = [];
export function buildSanderlings() {
  for (const s of sanderlings) scene.remove(s.mesh);
  sanderlings.length = 0;
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const b = meshOf(new THREE.SphereGeometry(0.15, 6, 6), 0xf8f4ec, { outlineScale: 1.2 });
    b.scale.z = 1.5; g.add(b);
    const bk = meshOf(new THREE.ConeGeometry(0.03, 0.15, 4), 0x33302c, { outline: false });
    bk.rotation.x = Math.PI / 2; bk.position.z = 0.21; g.add(bk);
    scene.add(g);
    sanderlings.push({ mesh: g, x: W.xMin + Math.random() * (W.xMax - W.xMin), off: Math.random() * 2.6, ph: Math.random() * 6.3 });
  }
}
export function updateSanderlings(t, waveZ) {
  for (const s of sanderlings) {
    const z = waveZ + 0.9 + s.off + Math.sin(t * 3 + s.ph) * 0.35;
    s.mesh.position.set(s.x + Math.sin(t * 2.2 + s.ph) * 1.4, groundY(s.x, z) + 0.15 + Math.abs(Math.sin(t * 14 + s.ph)) * 0.04, z);
    s.mesh.rotation.y = Math.cos(t * 2.2 + s.ph) > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
}

// ---------------- shared strike resolution ----------------
function resolveHit(b, runner, stats, radius, heavy) {
  const d = Math.hypot(runner.x - b.x, runner.z - b.z);
  if (d >= radius) {
    S.stats.dodges++;
    bus.toast('DODGED! +150'); bus.score(150); AU.coin();
    return;
  }
  if (Math.random() < stats.guard) {
    bus.toast(hasItem('crab') ? '\u{1F980} the crab saw it coming!' : '\u{1F3F4} they salute and veer off');
    AU.thwack();
    return;
  }
  S.stats.hits++;
  bus.shake(0.9);
  if (heavy) {
    S.health -= S.diff.birdDmg;
    runner.kx += (Math.random() - 0.5) * 15;
    runner.kz += (Math.random() - 0.5) * 15;
    if (S.slots.length) stealFrom(b, runner, true);
    else bus.toast('FALCON HIT! -' + S.diff.birdDmg + ' HP', 'bad');
    AU.thwack();
  } else if (S.slots.length && Math.random() < 0.75) {
    stealFrom(b, runner, false);
  } else {
    S.health -= S.diff.birdDmg;
    runner.kx += (Math.random() - 0.5) * 8; runner.kz += 4;
    bus.toast('PECKED! -' + S.diff.birdDmg + ' HP', 'bad');
    AU.thwack();
  }
}
