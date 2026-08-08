// ============================================================
// actors.js — the runner, refuges, loot, goals, birds, events
// ============================================================
import * as THREE from 'three';
import {
  clamp, lerp, smoothstep, damp, angleLerp, mulberry32, seedNoise,
  toon, meshOf, emojiSprite, labelSprite, faceSprite, Particles, Footprints,
} from './engine.js';
import { S, W, HEAT, STAM, DIFFS, effHeat, effAggro, hasItem, footState } from './state.js';
import { scene, groundY, heatAt, wetness, waveZ, waveEdgeAt, shadeAt, pickWeather, applyWeather, buildScenery, resetTide, rebuildTerrain, WEATHER } from './world.js';
import { AU, say, OW } from './audio.js';
import { ITEMS, rollItem, buildStats } from './items.js';
import { clearFlock, spawnPlover, buildSanderlings } from './birds.js';

export const particles = new Particles(scene, 260);
export const prints = new Footprints(scene, 64);
export const levelGroup = new THREE.Group();
scene.add(levelGroup);

// ============================================================
// ============================================================
// GOALS
// ============================================================
export const GOALS = {
  truck:     { icon: '\u{1F366}', name: 'ICE CREAM TRUCK', r: 5.5, beacon: 'jingle', z: [10, 20], gauntlet: true,
               line: 'one ice cream. please. hurry.' },
  flipflops: { icon: '\u{1FA74}', name: 'YOUR FLIP-FLOPS',  r: 4.0, beacon: 'ping',   z: [20, 27], gauntlet: true,
               line: 'we are reunited! never again!' },
  shower:    { icon: '\u{1F6BF}', name: 'THE BEACH SHOWER', r: 4.5, beacon: 'drip',   z: [14, 22], gauntlet: true,
               line: 'cold water. I am reborn.' },
  umbrella:  { icon: '\u{26F1}',  name: 'UMBRELLA CAMP',    r: 5.0, beacon: 'ping',   z: [6, 16],  gauntlet: false,
               line: 'shade! sweet shade!' },
  tidepools: { icon: '\u{1FAA8}', name: 'THE TIDE POOLS',   r: 5.5, beacon: 'chime',  z: [-6, 0],  gauntlet: false,
               line: 'hello little crabs. I live here now.' },
  nursery:   { icon: '\u{1F9AD}', name: 'THE SEAL NURSERY', r: 6.5, beacon: 'bark',   z: [-5, 1],  gauntlet: false,
               line: 'the seals... the seals approve of me.' },
};

// ============================================================
// THE RUNNER — a person, visible, with feet that cook
// ============================================================
const SKIN = 0xf3c9a0;
const FOOT_COLORS = [
  [0.00, 0xf3c9a0], [0.30, 0xffb59c], [0.55, 0xff7d62], [0.80, 0xff3d1f], [1.00, 0xff1400],
];
function footColor(v) {
  const k = clamp(v / 100, 0, 1);
  for (let i = 1; i < FOOT_COLORS.length; i++) {
    if (k <= FOOT_COLORS[i][0]) {
      const [k0, c0] = FOOT_COLORS[i - 1], [k1, c1] = FOOT_COLORS[i];
      const u = (k - k0) / (k1 - k0);
      const a = new THREE.Color(c0), b = new THREE.Color(c1);
      return a.lerp(b, u);
    }
  }
  return new THREE.Color(0xff1400);
}

export class Runner {
  constructor() {
    const root = new THREE.Group();
    const rig = new THREE.Group(); root.add(rig);

    const torso = meshOf(new THREE.CapsuleGeometry(0.29, 0.34, 4, 10), 0xffd166);
    torso.position.y = 1.06; rig.add(torso);
    const trunks = meshOf(new THREE.CapsuleGeometry(0.30, 0.10, 4, 10), 0x2ec4b6);
    trunks.position.y = 0.80; rig.add(trunks);

    const headG = new THREE.Group(); headG.position.y = 1.58; rig.add(headG);
    const head = meshOf(new THREE.SphereGeometry(0.30, 14, 12), SKIN);
    headG.add(head);
    const hair = meshOf(new THREE.SphereGeometry(0.305, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x4a3323);
    hair.position.y = 0.02; headG.add(hair);
    const shades = meshOf(new THREE.BoxGeometry(0.44, 0.11, 0.08), 0x241a20, { outlineScale: 1.12 });
    shades.position.set(0, 0.05, 0.26); headG.add(shades);
    const zinc = meshOf(new THREE.ConeGeometry(0.055, 0.13, 6), 0xfff6e8, { outlineScale: 1.15 });
    zinc.rotation.x = Math.PI / 2; zinc.position.set(0, -0.04, 0.30); headG.add(zinc);
    const mouth = meshOf(new THREE.BoxGeometry(0.16, 0.05, 0.05), 0x7a2b2b, { outline: false });
    mouth.position.set(0, -0.15, 0.27); headG.add(mouth);

    const mkArm = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.34, 1.24, 0);
      const a = meshOf(new THREE.CapsuleGeometry(0.085, 0.36, 4, 8), SKIN);
      a.position.y = -0.25; g.add(a);
      rig.add(g); return g;
    };
    const mkLeg = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.16, 0.74, 0);
      const l = meshOf(new THREE.CapsuleGeometry(0.105, 0.36, 4, 8), SKIN);
      l.position.y = -0.26; g.add(l);
      const foot = meshOf(new THREE.BoxGeometry(0.26, 0.15, 0.42), SKIN, { outlineScale: 1.14 });
      foot.position.set(0, -0.52, 0.07); g.add(foot);
      rig.add(g);
      return { g, foot };
    };
    this.root = root; this.rig = rig; this.headG = headG; this.mouth = mouth;
    this.armL = mkArm(-1); this.armR = mkArm(1);
    const lL = mkLeg(-1), lR = mkLeg(1);
    this.legL = lL.g; this.legR = lR.g;
    this.footL = lL.foot; this.footR = lR.foot;

    scene.add(root);

    this.x = W.startX; this.z = W.startZ; this.y = 0;
    this.vy = 0; this.kx = 0; this.kz = 0;           // knockback velocity
    this.facing = 0; this.grounded = true;
    this.phase = 0; this.speed = 0; this.squash = 1;
    this.refuge = null; this.stepFlip = 1;
    this.vaultT = 0; this.hopCool = 0; this.leapT = -99; this.airTime = 0;
    this.vx = 0; this.vz = 0; this.coyote = 0; this.skid = 0;
    this.landImpact = 0; this.jumpBuffer = 0;
  }

  reset() {
    this.x = W.startX; this.z = W.startZ; this.y = groundY(this.x, this.z);
    this.vy = 0; this.kx = 0; this.kz = 0; this.facing = Math.PI / 2;
    this.grounded = true; this.phase = 0; this.speed = 0; this.refuge = null;
    this.hopCool = 0; this.airTime = 0;
    this.vx = 0; this.vz = 0; this.coyote = 0; this.skid = 0; this.landImpact = 0;
  }

  /** ground height here, including whatever you're standing on */
  sample(x, z) {
    let y = groundY(x, z), ref = null;
    for (const r of S.refuges) {
      if (Math.hypot(x - r.x, z - r.z) < r.r) {
        const ry = groundY(r.x, r.z) + r.h;
        if (ry > y - 0.4) { y = Math.max(y, ry); ref = r; }
      }
    }
    return { y, ref };
  }

  update(dt, input, camYaw) {
    const wasGrounded = this.grounded;

    // ---- intent (camera-relative)
    // The camera orbits to player + (sin yaw, cos yaw) * dist and looks back at
    // the player, so the direction it faces is F = (-sin yaw, -cos yaw) and the
    // screen-right vector is R = (cos yaw, -sin yaw).
    let f = 0, r = 0;
    if (input.fwd) f += 1;
    if (input.back) f -= 1;
    if (input.right) r += 1;
    if (input.left) r -= 1;
    const mag = Math.min(1, Math.hypot(f, r));
    let wishX = 0, wishZ = 0;
    if (mag > 0) {
      const n = Math.hypot(f, r);
      f /= n; r /= n;
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      wishX = -s * f + c * r;
      wishZ = -c * f - s * r;
    }

    // ---- speed & stamina
    const inWater = this.z <= waveEdgeAt(this.x, S.t);
    const wantSprint = input.sprint && S.stamina > 1 && mag > 0;
    let base = wantSprint ? 10.4 : 6.0;
    if (inWater) base *= 0.55;
    if (S.heatState === 3) base *= 1.22;             // panic sprint
    if (S.heatState === 4) base *= 1.32;
    if (hasItem('sandals')) base *= 1.04;
    if (S.mode === 'scout') base = 0;

    if (wantSprint) S.stamina = clamp(S.stamina - STAM.drain * dt / S.diff.stam, 0, STAM.max);
    else {
      const resting = (this.refuge || inWater) && mag === 0;
      S.stamina = clamp(S.stamina + (resting ? STAM.regenRest : STAM.regen) * dt, 0, STAM.max);
    }

    // ---- integrate with real acceleration, so the runner has weight.
    // Ground grips, air doesn't, and hard turns cost you speed instead of
    // pivoting on the spot like a cursor.
    const grounded = this.grounded;
    const accel = grounded ? (S.heatState >= 3 ? 40 : 54) : 16;
    const friction = grounded ? 20 : 1.2;
    this.skid = Math.max(0, (this.skid || 0) - dt * 3);
    if (mag > 0 && base > 0) {
      const tvx = wishX * base, tvz = wishZ * base;
      let dvx = tvx - this.vx, dvz = tvz - this.vz;
      const dvl = Math.hypot(dvx, dvz);
      if (dvl > 0.0001) {
        // reversing hard? that's a skid, not a turn
        const sp0 = Math.hypot(this.vx, this.vz);
        const dot = sp0 > 0.5 ? (this.vx * wishX + this.vz * wishZ) / sp0 : 1;
        if (dot < -0.25 && sp0 > 5.5 && grounded) {
          this.skid = 1;                      // grip breaks immediately, recovers over ~0.35s
          if (!this.skidSfx || S.t - this.skidSfx > 0.5) {
            this.skidSfx = S.t;
            AU.noise(0.22, 900, 0.05, true);
            particles.burst(this.x, this.y + 0.05, this.z, 5,
              { color: 0xefdcb0, size: 0.28, ttl: 0.5, vy: 0.7, spread: 1.5 });
          }
        }
        const grip = accel * (this.skid > 0.3 ? 0.45 : 1);
        const k = Math.min(1, grip * dt / dvl);
        this.vx += dvx * k; this.vz += dvz * k;
      }
    } else {
      const sp0 = Math.hypot(this.vx, this.vz);
      if (sp0 > 0) {
        const drop = Math.min(sp0, friction * dt);
        this.vx -= this.vx / sp0 * drop;
        this.vz -= this.vz / sp0 * drop;
      }
    }
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > base && base > 0) { this.vx = this.vx / sp * base; this.vz = this.vz / sp * base; }

    const decay = Math.pow(0.02, dt);
    this.kx *= decay; this.kz *= decay;
    this.x += (this.vx + this.kx) * dt;
    this.z += (this.vz + this.kz) * dt;
    this.x = clamp(this.x, W.xMin, W.xMax);
    this.z = clamp(this.z, W.zMin - 1.5, W.zMax);
    this.speed = Math.hypot(this.vx, this.vz);

    // ---- vertical
    const { y: gy, ref } = this.sample(this.x, this.z);
    this.refuge = this.grounded ? ref : this.refuge;
    // coyote time: a fraction of a second of grace after a refuge edge, so
    // running off a plank and jumping late still works like you meant it to
    if (this.grounded) this.coyote = 0.13; else this.coyote -= dt;
    if ((this.grounded || this.coyote > 0) && input.jump && this.hopCool <= 0) {
      // A sprinting jump is a LEAP: long, costly, and the only way over a
      // wide scorch band. A standing tap is a quick hop that swaps your lead
      // foot — the one bit of direct control over the per-foot gauges.
      const leaping = wantSprint && S.stamina > 18 && mag > 0;
      if (leaping) {
        this.vy = 6.4;
        this.kx += wishX * 12; this.kz += wishZ * 12;
        S.stamina = clamp(S.stamina - 16, 0, STAM.max);
        this.leapT = S.t; S.stats.leaps++;
        AU.sweep(300, 620, 0.22, 'triangle', 0.13);
      } else {
        this.vy = 5.4; AU.hop();
      }
      S.plant = S.plant === 'L' ? 'R' : 'L';   // hop to rest the cooking foot
      this.grounded = false; this.coyote = 0; this.hopCool = 0.12; this.squash = 0.82;
      particles.burst(this.x, gy + 0.05, this.z, leaping ? 7 : 4,
        { color: 0xf0dcae, size: 0.3, ttl: 0.5, vy: 0.8, spread: leaping ? 1.6 : 0.9 });
    }
    this.hopCool -= dt;
    if (!this.grounded) {
      this.vy -= 15.5 * dt;
      this.y += this.vy * dt;
      if (this.y <= gy) {
        // impact scales everything: squash, dust, sound and the camera kick
        const impact = clamp(-this.vy / 13, 0, 1);
        const hard = impact > 0.45;
        this.y = gy; this.vy = 0; this.grounded = true; this.refuge = ref;
        this.squash = lerp(0.93, 0.58, impact);
        this.landImpact = impact;
        // a heavy landing scrubs some speed — you have to gather yourself
        if (hard) { this.vx *= 0.78; this.vz *= 0.78; }
        AU.land(hard);
        particles.burst(this.x, gy + 0.05, this.z, Math.round(3 + impact * 12),
          { color: inWater ? 0xcfefff : 0xf0dcae, size: 0.26 + impact * 0.25,
            ttl: 0.5 + impact * 0.3, vy: 0.8 + impact * 1.6, spread: 1.1 + impact * 1.8 });
        if (ref && !wasGrounded) this.onRefugeLand(ref);
      }
    } else this.y = damp(this.y, gy, 22, dt);

    // ---- facing & animation
    if (mag > 0) this.facing = angleLerp(this.facing, Math.atan2(wishX, wishZ), 1 - Math.exp(-16 * dt));
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.facing;
    this.animate(dt, mag > 0, inWater);

    // ---- footsteps
    if (this.grounded && mag > 0) {
      const prev = this.phase;
      this.phase += this.speed * dt * 1.55;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) this.footstep(gy, inWater);
    } else if (!this.grounded) this.phase += dt * 2;

    return { inWater, refuge: this.refuge, groundYHere: gy };
  }

  onRefugeLand(ref) {
    S.stats.refugesUsed++;
    // SOLE TRAIN: every fresh refuge you reach without cooking a foot extends
    // the chain. This is what turns "walk on the pale bits" into route-running.
    if (!ref.used) {
      ref.used = true;
      S.combo++;
      S.comboT = S.t;
      const pts = 60 * S.combo;
      addScore(pts);
      if (S.combo >= 2) {
        toast('SOLE TRAIN ×' + S.combo + '  +' + pts);
        AU.tone(520 + Math.min(S.combo, 10) * 70, 0.09, 'square', 0.13);
      }
      S.stats.bestCombo = Math.max(S.stats.bestCombo, S.combo);
      // a clean landing is worth stamina — it keeps the tempo up
      S.stamina = clamp(S.stamina + 12, 0, STAM.max);
    }
    if (ref.type === 'towel' && ref.crab && !ref.crabSprung) {
      ref.crabSprung = true; S.stats.crabs++;
      S.health -= 6; this.kx += (Math.random() - 0.5) * 8; this.kz += 5;
      AU.crab(); say('CRAB! CRAB! CRAB!', true);
      toast('\u{1F980} THERE WAS A CRAB IN THE TOWEL', 'bad');
      particles.burst(this.x, this.y + 0.3, this.z, 10, { color: 0xff6a4a, size: 0.32, ttl: 0.7, spread: 2.2 });
    }
  }

  footstep(gy, inWater) {
    S.plant = S.plant === 'L' ? 'R' : 'L';
    S.stats.steps++;
    const surf = inWater ? 'water' : (this.refuge && this.refuge.type !== 'towel' ? 'wood' : 'sand');
    AU.step(S.heatState, surf);
    const foot = S.feet[S.plant];
    const side = S.plant === 'L' ? -0.18 : 0.18;
    const fx = this.x + Math.cos(this.facing) * side;
    const fz = this.z - Math.sin(this.facing) * side;
    if (!inWater && !this.refuge) {
      const h = heatAt(this.x, this.z, S.t);
      if (h > HEAT.safe) S.stats.hotSteps++;
      const wet = wetness(this.z, S.t);
      const col = foot > 78 ? 0x2a1208 : wet > 0.4 ? 0x6b5540 : 0xd8bc90;
      prints.stamp(fx, gy, fz, this.facing, col, foot > 78 ? 0.75 : 0.4);
      particles.burst(fx, gy + 0.04, fz, 2, { color: 0xefdcb0, size: 0.22, ttl: 0.4, vy: 0.7, spread: 0.6 });
    }
    if (inWater) particles.burst(fx, gy + 0.05, fz, 4, { color: 0xd8f4ff, size: 0.26, ttl: 0.45, vy: 1.5, spread: 1.1 });
  }

  animate(dt, moving, inWater) {
    const heat = S.heatState;
    const sp = clamp(this.speed / 10, 0, 1);
    const panic = heat >= 3 ? 1 : 0;
    const swing = moving ? lerp(0.35, 0.95, sp) : 0;
    const ph = this.phase * (1 + panic * 0.35);

    this.legL.rotation.x = Math.sin(ph) * swing;
    this.legR.rotation.x = -Math.sin(ph) * swing;
    if (!this.grounded) { this.legL.rotation.x = 0.5; this.legR.rotation.x = -0.35; }

    // arms: swing normally; fling overhead when the feet are screaming
    const armSwing = -Math.sin(ph) * swing * 0.85;
    this.armL.rotation.x = armSwing; this.armR.rotation.x = -armSwing;
    const up = panic ? lerp(0, -2.5, 0.5 + 0.5 * Math.sin(S.t * 14)) : 0;
    this.armL.rotation.x += up; this.armR.rotation.x += up;
    this.armL.rotation.z = panic ? 0.5 : 0.08;
    this.armR.rotation.z = panic ? -0.5 : -0.08;

    // ...unless it's happening, in which case: the gesture. one hand up, one
    // hand down, back and forth, for as long as it lasts.
    if (S.invuln > 0) {
      const w = Math.sin(S.t * 7.5);
      this.armL.rotation.x = -1.45 - w * 0.85;
      this.armR.rotation.x = -1.45 + w * 0.85;
      this.armL.rotation.z = 0.95;
      this.armR.rotation.z = -0.95;
      this.rig.rotation.z = w * 0.07;
      this.headG.rotation.z = -w * 0.12;
      this.mouth.scale.y = 1 + Math.abs(w) * 2.2;
    }

    // body bob, lean, wobble
    this.squash = damp(this.squash, 1, 9, dt);
    const bob = moving && this.grounded ? Math.abs(Math.sin(ph)) * 0.07 * sp : 0;
    this.rig.position.y = bob;
    this.rig.scale.set(1 / this.squash, this.squash, 1 / this.squash);
    this.rig.rotation.x = -sp * 0.16 - panic * 0.1;
    this.rig.rotation.z = panic ? Math.sin(S.t * 16) * 0.09 : Math.sin(S.t * 2) * 0.012;
    this.headG.rotation.z = panic ? Math.sin(S.t * 19) * 0.14 : 0;
    this.mouth.scale.y = heat >= 2 ? 1 + Math.abs(Math.sin(S.t * 12)) * 2.6 : 1;

    // feet: the gauge lives on the character
    for (const [foot, key] of [[this.footL, 'L'], [this.footR, 'R']]) {
      const v = S.feet[key];
      foot.material.color.copy(footColor(v));
      foot.material.emissive.setHex(v > 88 ? 0xff3300 : 0x000000);
      foot.material.emissiveIntensity = v > 88 ? (v - 88) / 12 * 0.9 : 0;
      if (v > 52 && this.grounded && Math.random() < dt * (v - 50) * 0.5) {
        const wp = foot.getWorldPosition(new THREE.Vector3());
        particles.spawn(wp.x, wp.y + 0.1, wp.z, {
          color: v > 88 ? 0xff8844 : 0xf0f0f0, size: v > 88 ? 0.36 : 0.28,
          ttl: v > 88 ? 0.6 : 0.9, vy: v > 88 ? 2.4 : 1.5, opacity: 0.7, grow: 2,
        });
      }
    }
  }
}

// ============================================================
// REFUGES
// ============================================================
function buildRefuge(type, x, z, rng) {
  const g = new THREE.Group();
  let r, h;
  if (type === 'wood') {
    const rot = (rng() - 0.5) * 0.7;
    const a = meshOf(new THREE.CylinderGeometry(0.42, 0.5, 4.0, 7), 0xa88055);
    a.rotation.set(0, rot, Math.PI / 2); a.position.y = 0.42; g.add(a);
    const b = meshOf(new THREE.CylinderGeometry(0.28, 0.34, 2.6, 6), 0x8a6242);
    b.rotation.set(0, rot + 1.1, Math.PI / 2); b.position.set(0.6, 0.32, 0.9); g.add(b);
    const branch = meshOf(new THREE.CylinderGeometry(0.13, 0.17, 1.5, 5), 0x9a7350);
    branch.rotation.set(0.5, rot, 1.0); branch.position.set(-1.4, 0.85, -0.4); g.add(branch);
    r = 2.2; h = 0.82;
  } else if (type === 'rock') {
    const a = meshOf(new THREE.IcosahedronGeometry(1.5, 0), 0xa7a3a8); a.scale.y = 0.66; a.position.y = 0.3; g.add(a);
    const b = meshOf(new THREE.IcosahedronGeometry(0.85, 0), 0x8d8992);
    b.scale.y = 0.62; b.position.set(1.35, 0.12, 0.6); g.add(b);
    const cap = meshOf(new THREE.IcosahedronGeometry(0.55, 0), 0xbdb8bd);
    cap.scale.y = 0.5; cap.position.set(-0.4, 1.0, 0.2); g.add(cap);
    r = 2.3; h = 1.16;
  } else if (type === 'board') {
    const rot = (rng() - 0.5) * 0.9;
    const a = meshOf(new THREE.CapsuleGeometry(0.62, 2.2, 4, 10), 0x4fc3e8);
    a.rotation.set(Math.PI / 2, 0, rot); a.scale.y = 1; a.position.y = 0.34;
    a.scale.z = 0.34; g.add(a);
    const stripe = meshOf(new THREE.BoxGeometry(3.1, 0.06, 0.26), 0xfff1c9, { outline: false });
    stripe.rotation.y = rot; stripe.position.y = 0.56; g.add(stripe);
    r = 1.9; h = 0.56;
  } else { // towel — bunched up, with a bag on it
    const cols = [0xff6fa5, 0x57d6f2, 0xffe07a, 0x9dff8a, 0xc792ff];
    const col = cols[Math.floor(rng() * cols.length)];
    const rot = (rng() - 0.5) * 1.2;
    const a = meshOf(new THREE.BoxGeometry(3.0, 0.22, 2.0), col);
    a.rotation.y = rot; a.position.y = 0.11; g.add(a);
    const fold = meshOf(new THREE.BoxGeometry(3.0, 0.26, 0.55), col);
    fold.rotation.y = rot; fold.position.set(Math.sin(rot) * 0.6, 0.3, Math.cos(rot) * 0.6); g.add(fold);
    if (rng() < 0.5) {
      const bag = meshOf(new THREE.BoxGeometry(0.7, 0.6, 0.5), 0xe8734a);
      bag.position.set(-0.9, 0.5, -0.5); bag.rotation.y = rot; g.add(bag);
    }
    r = 2.0; h = 0.26;
  }
  // a pale scuff of shade under every refuge so the eye reads "safe spot"
  const halo = new THREE.Mesh(new THREE.CircleGeometry(r * 1.05, 20),
    new THREE.MeshBasicMaterial({ color: 0x2a1c10, transparent: true, opacity: 0.16, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.03; halo.renderOrder = 2; g.add(halo);
  g.position.set(x, groundY(x, z), z);
  levelGroup.add(g);
  const crab = type === 'towel' && rng() < (S.diffKey === 'august' ? 0.55 : 0.22);
  return { x, z, r, h, type, mesh: g, crab, crabSprung: false };
}

// ============================================================
// LOOT
// ============================================================
function buildItemPickup(key, x, z) {
  const def = ITEMS[key];
  const g = new THREE.Group();
  const rare = (def.rarity || 1) >= 2;
  const box = meshOf(new THREE.IcosahedronGeometry(0.34, 0), rare ? 0xffd94a : 0xffffff);
  box.position.y = 0.55; g.add(box);
  const ic = def.label ? labelSprite(def.label, 1.5) : emojiSprite(def.icon, 1.25);
  ic.position.y = 1.35; g.add(ic);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 18),
    new THREE.MeshBasicMaterial({ color: rare ? 0xffd94a : 0xbfe8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  g.position.set(x, groundY(x, z), z);
  levelGroup.add(g);
  return { key, x, z, mesh: g, box, taken: false, ph: Math.random() * 6.3 };
}

// ============================================================
// GOAL MODELS
// ============================================================
function buildGoal(key, x, z) {
  const def = GOALS[key];
  const g = new THREE.Group();

  if (key === 'truck') {
    const body = meshOf(new THREE.BoxGeometry(5.0, 2.6, 2.5), 0xfff7f0); body.position.y = 2.1; g.add(body);
    const stripe = meshOf(new THREE.BoxGeometry(5.05, 0.6, 2.55), 0xff6fa5, { outline: false }); stripe.position.y = 2.5; g.add(stripe);
    const cab = meshOf(new THREE.BoxGeometry(1.8, 1.7, 2.3), 0xffe6f0); cab.position.set(-3.2, 1.6, 0); g.add(cab);
    const win = meshOf(new THREE.BoxGeometry(2.4, 1.1, 0.12), 0x2f4858, { outline: false }); win.position.set(0.4, 2.3, 1.28); g.add(win);
    const awn = meshOf(new THREE.BoxGeometry(2.8, 0.1, 1.2), 0xff6fa5); awn.position.set(0.4, 3.05, 1.8); awn.rotation.x = 0.35; g.add(awn);
    for (const [wx, wz] of [[-3.0, 1.15], [-3.0, -1.15], [1.9, 1.15], [1.9, -1.15]]) {
      const w = meshOf(new THREE.CylinderGeometry(0.6, 0.6, 0.36, 12), 0x2a2a30);
      w.rotation.x = Math.PI / 2; w.position.set(wx, 0.6, wz); g.add(w);
    }
    const cone = emojiSprite('\u{1F366}', 3.4); cone.position.y = 5.2; g.add(cone);

  } else if (key === 'flipflops') {
    for (const dz of [-0.55, 0.55]) {
      const f = meshOf(new THREE.BoxGeometry(0.55, 0.12, 1.2), 0xff5c8a);
      f.position.set(dz * 0.4, 0.12, dz); f.rotation.y = dz * 0.3; g.add(f);
      const strap = meshOf(new THREE.TorusGeometry(0.22, 0.05, 6, 10), 0xffd166, { outline: false });
      strap.rotation.x = Math.PI / 2; strap.position.set(dz * 0.4, 0.24, dz + 0.2); g.add(strap);
    }
    const towel = meshOf(new THREE.BoxGeometry(2.6, 0.08, 1.7), 0x57d6f2); towel.position.set(0, 0.05, -1.6); g.add(towel);

  } else if (key === 'shower') {
    const base = meshOf(new THREE.CylinderGeometry(1.8, 1.9, 0.24, 12), 0x9aa3ad); base.position.y = 0.12; g.add(base);
    const pole = meshOf(new THREE.CylinderGeometry(0.14, 0.14, 3.8, 8), 0x6e7782); pole.position.y = 2.0; g.add(pole);
    const arm = meshOf(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 8), 0x6e7782);
    arm.rotation.z = Math.PI / 2; arm.position.set(0.5, 3.8, 0); g.add(arm);
    const head = meshOf(new THREE.CylinderGeometry(0.42, 0.22, 0.3, 10), 0xaebac6); head.position.set(1.0, 3.65, 0); g.add(head);
    const drop = emojiSprite('\u{1F4A6}', 1.6); drop.position.set(1.0, 2.7, 0); g.add(drop);

  } else if (key === 'umbrella') {
    const pole = meshOf(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 8), 0xe8e0cc); pole.position.y = 1.8; pole.rotation.z = 0.18; g.add(pole);
    const top = meshOf(new THREE.ConeGeometry(3.0, 1.3, 12), 0xff5233); top.position.set(-0.62, 3.35, 0); top.rotation.z = 0.18; g.add(top);
    const cooler = meshOf(new THREE.BoxGeometry(1.3, 0.85, 0.85), 0x2288cc); cooler.position.set(1.5, 0.42, 0.7); g.add(cooler);
    const lid = meshOf(new THREE.BoxGeometry(1.35, 0.16, 0.9), 0xdff2ff, { outline: false }); lid.position.set(1.5, 0.9, 0.7); g.add(lid);
    const towel = meshOf(new THREE.BoxGeometry(2.4, 0.08, 1.6), 0xffe07a); towel.position.set(0.2, 0.05, -1.3); g.add(towel);

  } else if (key === 'tidepools') {
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, rr = 2.2 + (i % 3) * 0.7;
      const rock = meshOf(new THREE.IcosahedronGeometry(0.95, 0), 0x6d6d76);
      rock.scale.y = 0.5; rock.position.set(Math.cos(a) * rr, 0.28, Math.sin(a) * rr); g.add(rock);
    }
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.12, 16),
      new THREE.MeshBasicMaterial({ color: 0x2aa8c8, transparent: true, opacity: 0.85 }));
    pool.position.y = 0.16; g.add(pool);
    const star = meshOf(new THREE.SphereGeometry(0.24, 8, 6), 0xff7a55); star.position.set(0.6, 0.2, 0.4); g.add(star);
    const anem = meshOf(new THREE.SphereGeometry(0.18, 8, 6), 0xc792ff); anem.position.set(-0.5, 0.2, -0.5); g.add(anem);

  } else if (key === 'nursery') {
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + 0.4;
      const rock = meshOf(new THREE.IcosahedronGeometry(1.0, 0), 0x9a9298);
      rock.scale.y = 0.42; rock.position.set(Math.cos(a) * 5.2, 0.2, Math.sin(a) * 5.2); g.add(rock);
    }
    const mkSeal = (sc, col) => {  // warm brown-grey so they read against cool rock
      const s = new THREE.Group();
      const b = meshOf(new THREE.CapsuleGeometry(0.5, 1.15, 4, 8), col);
      b.rotation.z = Math.PI / 2; b.position.y = 0.5; s.add(b);
      const hd = meshOf(new THREE.SphereGeometry(0.36, 10, 8), col); hd.position.set(1.0, 0.68, 0); s.add(hd);
      const nz = meshOf(new THREE.SphereGeometry(0.09, 6, 6), 0x241a20, { outline: false }); nz.position.set(1.32, 0.64, 0); s.add(nz);
      const tl = meshOf(new THREE.ConeGeometry(0.28, 0.55, 6), col);
      tl.rotation.z = Math.PI / 2; tl.position.set(-1.1, 0.45, 0); s.add(tl);
      s.scale.setScalar(sc);
      return s;
    };
    const m1 = mkSeal(1.7, 0x6b5a4e); m1.position.set(-2.2, 0.3, 1.6); m1.rotation.y = 0.7; g.add(m1);
    const m2 = mkSeal(1.6, 0x574a41); m2.position.set(2.4, 0.3, -1.8); m2.rotation.y = -1.9; g.add(m2);
    const pups = [];
    for (let i = 0; i < 4; i++) {
      const p = mkSeal(0.85, 0xd8cfc4);
      p.position.set(-2.0 + i * 1.5, 0.28, 2.6 - (i % 2) * 1.1);
      p.rotation.y = Math.random() * 6.28;
      p.userData.pup = true; p.userData.ph = Math.random() * 6.28;
      g.add(p); pups.push(p);
    }
    g.userData.pups = pups;
    const star = emojiSprite('\u{2B50}', 2.2); star.position.y = 4.2; g.add(star);
  }

  g.position.set(x, groundY(x, z), z);
  levelGroup.add(g);

  // a landmark you can see from the start line
  const marker = emojiSprite(def.icon, 3.0);
  marker.material.fog = false; marker.material.depthTest = false;
  marker.renderOrder = 900;
  marker.position.set(x, groundY(x, z) + 9.5, z);
  levelGroup.add(marker);

  return { key, def, x, z, mesh: g, marker, reached: false };
}

// ============================================================
// EVENTS — the beach does things to you
// ============================================================
function cloudMesh() {
  const g = new THREE.Group();
  for (const [x, y, z, r] of [[0, 0, 0, 2.6], [2.4, -0.3, 0.4, 2.0], [-2.4, -0.2, -0.3, 2.1], [0.6, 0.9, -0.6, 1.8]]) {
    const p = meshOf(new THREE.SphereGeometry(r, 8, 6), 0xffffff, { outline: false });
    p.position.set(x, y, z); g.add(p);
  }
  return g;
}
export function freshEvents() {
  return { clouds: [], focus: null, surge: 0, nextAt: 10, dolphin: null, whale: null, sneaker: false, warned: false };
}
export function spawnCloud(x, z) {
  const mesh = cloudMesh();
  mesh.position.set(x, 22, z); scene.add(mesh);
  S.ev.clouds.push({ x, z, r: 9, mesh, life: 40, vx: 2.6 });
}
export function fireEvent(kind, runner) {
  const ev = S.ev;
  if (kind === 'cloud') {
    spawnCloud(runner.x - 26, clamp(runner.z + (Math.random() - 0.5) * 14, 0, 20));
    toast('\u{2601} shade incoming — chase it');
  } else if (kind === 'whale') {
    const m = meshOf(new THREE.CapsuleGeometry(1.7, 4.5, 4, 8), 0x455260);
    m.rotation.z = Math.PI / 2; m.position.set(runner.x + 14, -4, -34); scene.add(m);
    ev.whale = { mesh: m, t: 0 };
    toast('\u{1F40B} WHALE!'); AU.splash(true); say('whoa!', false);
  } else if (kind === 'focus') {
    const x = clamp(runner.x + 14 + Math.random() * 10, W.xMin, W.xMax);
    const z = clamp(runner.z + (Math.random() - 0.5) * 10, 0, 22);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.4, 8.0, 26),
      new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, groundY(x, z) + 0.08, z); scene.add(ring);
    ev.focus = { x, z, r: 8, ring, t: 0, armed: false };
    toast('\u{2600} THE SUN HAS NOTICED YOU', 'bad');
    AU.sweep(400, 1200, 0.6, 'sawtooth', 0.1);
  } else if (kind === 'sneaker') {
    ev.surge += 12; ev.sneaker = true;
    toast('\u{1F30A} SNEAKER WAVE', 'bad'); say('uh oh.', true); AU.splash(true);
  }
  ev.nextAt = S.t + 12 + Math.random() * 10;
}
export function updateEvents(dt, runner) {
  const ev = S.ev;
  ev.surge = Math.max(0, ev.surge - dt * 3.5);

  for (const c of [...ev.clouds]) {
    c.x += c.vx * dt; c.life -= dt;
    c.mesh.position.set(c.x, 22, c.z);
    if (c.life <= 0 || c.x > W.xMax + 40) { scene.remove(c.mesh); ev.clouds.splice(ev.clouds.indexOf(c), 1); }
  }
  if (ev.focus) {
    const f = ev.focus; f.t += dt;
    if (!f.armed) {
      f.ring.material.opacity = 0.3 + 0.45 * Math.abs(Math.sin(f.t * 8));
      if (f.t > 2.2) { f.armed = true; f.t = 0; f.ring.material.opacity = 0.85; AU.sizzle(); }
    } else if (f.t > 6.5) { scene.remove(f.ring); ev.focus = null; }
  }
  if (ev.whale) {
    ev.whale.t += dt / 2.4;
    if (ev.whale.t >= 1) {
      scene.remove(ev.whale.mesh); ev.whale = null;
      ev.surge += 9; toast("SURF'S UP — the wash runs deep");
    } else {
      ev.whale.mesh.position.y = -4 + Math.sin(ev.whale.t * Math.PI) * 8;
      ev.whale.mesh.rotation.x = lerp(-0.9, 0.9, ev.whale.t);
    }
  }
  if (ev.sneaker && runner.z <= waveZ) {
    ev.sneaker = false;
    runner.kz += 11; runner.kx += (Math.random() - 0.5) * 6;
    S.aggro = clamp(S.aggro + 22, 0, 100);
    toast('swept off your feet!', 'bad'); AU.splash(true);
    particles.burst(runner.x, runner.y + 0.4, runner.z, 16, { color: 0xdff4ff, size: 0.42, ttl: 0.8, spread: 3.5 });
  }
  if (ev.sneaker && ev.surge <= 0.5) ev.sneaker = false;

  if (S.t >= ev.nextAt) {
    const pool = [['cloud', 30], ['whale', 22]];
    if (S.level >= 2) pool.push(['focus', 26], ['sneaker', 18]);
    let tot = 0; for (const [, w] of pool) tot += w;
    let r = Math.random() * tot; let pick = 'cloud';
    for (const [k, w] of pool) { r -= w; if (r <= 0) { pick = k; break; } }
    fireEvent(pick, runner);
  }
}

// ============================================================
// CHECKPOINTS — a long beach needs staging posts
// ============================================================
function buildCheckpoint(x, z, idx) {
  const g = new THREE.Group();
  for (const [lx, lz] of [[-1.9, -1.5], [1.9, -1.5], [-1.9, 1.5], [1.9, 1.5]]) {
    const post = meshOf(new THREE.CylinderGeometry(0.11, 0.11, 2.9, 6), 0xd9c9a8);
    post.position.set(lx, 1.45, lz); g.add(post);
  }
  const canopy = meshOf(new THREE.BoxGeometry(4.6, 0.22, 3.8), 0x35b5a0);
  canopy.position.y = 2.95; g.add(canopy);
  const stripe = meshOf(new THREE.BoxGeometry(4.65, 0.1, 0.9), 0xfff1c9, { outline: false });
  stripe.position.y = 3.1; g.add(stripe);
  const cooler = meshOf(new THREE.BoxGeometry(1.2, 0.8, 0.8), 0x2288cc);
  cooler.position.set(1.2, 0.4, -0.9); g.add(cooler);
  const mat = meshOf(new THREE.BoxGeometry(3.4, 0.14, 2.4), 0xffe07a);
  mat.position.y = 0.07; g.add(mat);
  const flag = emojiSprite('\u{26FA}', 2.0);
  flag.material.fog = false; flag.material.depthTest = false; flag.renderOrder = 890;
  flag.position.y = 5.6; g.add(flag);
  g.position.set(x, groundY(x, z), z);
  levelGroup.add(g);
  // it also works as a refuge you can stand on
  S.refuges.push({ x, z, r: 4.2, h: 0.2, type: 'wood', mesh: g, crab: false, crabSprung: false, used: true });
  return { x, z, idx, mesh: g, taken: false };
}
export function checkCheckpoints(runner) {
  for (const cp of S.checkpoints) {
    if (cp.taken) continue;
    if (Math.hypot(runner.x - cp.x, runner.z - cp.z) > 7) continue;
    cp.taken = true;
    S.feet.L = 0; S.feet.R = 0;
    S.stamina = STAM.max;
    S.health = Math.min(100, S.health + 12);
    const bonus = 400;
    toast('\u{26FA} CHECKPOINT ' + (cp.idx + 1) + '/' + S.checkpoints.length +
          ' — feet cooled  +' + bonus);
    addScore(bonus);
    AU.fanfare();
    say(['oh thank god.', 'shade. blessed shade.', 'five minutes. just five minutes.'][cp.idx % 3], true);
    particles.burst(cp.x, groundY(cp.x, cp.z) + 1.2, cp.z, 16,
      { color: 0x8affc1, size: 0.36, ttl: 0.9, vy: 2.4, spread: 2.6 });
  }
}

// ============================================================
// LEVEL GENERATION — routes with real trade-offs
// ============================================================
export function generateLevel(runner) {
  while (levelGroup.children.length) levelGroup.remove(levelGroup.children[0]);
  S.refuges = []; S.items = []; S.fx = []; S.checkpoints = [];
  clearFlock();
  // attention carries between beaches: the birds remember an interesting person
  S.combo = 0; S.aggro *= 0.5; S.eagleTimer = 0; S.freeze = 0; S.thiefAt = false; S.invuln = 0;
  if (S.ev) {
    for (const c of S.ev.clouds) scene.remove(c.mesh);
    if (S.ev.focus) scene.remove(S.ev.focus.ring);
    if (S.ev.whale) scene.remove(S.ev.whale.mesh);
  }
  S.ev = freshEvents(); S.ev.nextAt = S.t + 9;
  particles.clear(); prints.clear();

  S.seed = Math.floor(Math.random() * 90000) + 10000;
  seedNoise(S.seed);
  const rng = mulberry32(S.seed ^ 0x5EED);

  applyWeather(pickWeather(rng));
  rebuildTerrain();
  resetTide();
  buildScenery(rng);
  buildSanderlings();

  // ---- goal
  let gk = S.forceGoal;
  if (!gk) {
    if (S.level === 1) gk = 'truck';
    else if (rng() < 0.16) gk = 'nursery';
    else {
      const pool = ['truck', 'flipflops', 'shower', 'umbrella', 'tidepools'];
      gk = pool[Math.floor(rng() * pool.length)];
    }
  }
  const gz = GOALS[gk].z[0] + rng() * (GOALS[gk].z[1] - GOALS[gk].z[0]);
  S.goal = buildGoal(gk, W.goalX, gz);

  // ---- the spine: a chain of refuges you can actually chain
  S.refuges.push(buildRefuge('towel', W.startX, W.startZ, rng));
  let x = W.startX, z = W.startZ;
  const maxGap = 9.5 + Math.min(5, S.level * 0.5);
  while (x < W.goalX - 14) {
    const gap = 6.5 + rng() * (maxGap - 6.5);
    x += gap;
    z = clamp(z + (rng() - 0.5) * 13, -3, 20);
    if (x > W.goalX - 45) z = lerp(z, gz, 0.3);
    const t = ['wood', 'rock', 'towel', 'board'][Math.floor(rng() * 4)];
    S.refuges.push(buildRefuge(t, x, z, rng));
    // side branches: a shore option and a dune option
    if (rng() < 0.42) S.refuges.push(buildRefuge(rng() < 0.5 ? 'wood' : 'rock', x + (rng() - 0.5) * 7, clamp(z - 8 - rng() * 6, -4, 22), rng));
    if (rng() < 0.34) S.refuges.push(buildRefuge(rng() < 0.5 ? 'towel' : 'board', x + (rng() - 0.5) * 7, clamp(z + 8 + rng() * 7, -4, 23), rng));
  }
  if (gk === 'nursery' || gk === 'tidepools') {
    for (let i = 1; i <= 3; i++) S.refuges.push(buildRefuge('rock', W.goalX - 13 + i * 3.2, lerp(z, gz, i / 3), rng));
  }

  // ---- loot. Most of it sits ON the refuge route, so simply playing well
  // builds your kit; the rare stuff is out in the dunes where it's hot.
  const lootMul = S.diff.loot * buildStats().loot;
  const spine = S.refuges.filter(r => r.x > W.startX + 6);
  for (const r of spine) {
    if (rng() > 0.22 * lootMul) continue;
    // sat right on the refuge: reaching safety and kitting out are the same move
    const a = rng() * Math.PI * 2;
    const ix = clamp(r.x + Math.cos(a) * rng() * 1.2, W.xMin, W.goalX - 6);
    const iz = clamp(r.z + Math.sin(a) * rng() * 1.2, -3, 24);
    const it = buildItemPickup(rollItem(rng, false), ix, iz);
    it.mesh.position.y += r.h;                      // sit on top of the driftwood
    S.items.push(it);
  }
  let dx = W.startX + 24;
  while (dx < W.goalX - 10) {                       // risky dune caches
    dx += 46 + rng() * 26;
    S.items.push(buildItemPickup(rollItem(rng, true), dx, 19 + rng() * 8));
  }

  // ---- staging posts: the beach becomes three legs, not one long jog
  const legs = 4;
  for (let i = 1; i < legs; i++) {
    const cx = lerp(W.startX, W.goalX, i / legs);
    // sit it near whichever refuge is closest so it lands on the natural route
    // sit it right on the spine so following the route always hits it
    let near = null, bd = 1e9;
    for (const r of S.refuges) { const d = Math.abs(r.x - cx); if (d < bd) { bd = d; near = r; } }
    const px = near ? near.x : cx;
    const cz = clamp(near ? near.z : 8, -2, 22);
    S.checkpoints.push(buildCheckpoint(px, cz, i - 1));
  }
  // a plover works this beach from level 3 on, running its little con
  if (S.level >= 3 && rng() < 0.55) spawnPlover(runner);

  S.levelTime = 0; S.streak = 0;
  S.stats.cleanLevel = true; S.stats.pacifist = true;
  runner.reset();
  AU.jingleI = 0;
}

// ============================================================
// small helpers wired from main
// ============================================================
let toastFn = () => { }, scoreFn = () => { };
export function wire(t, sc) { toastFn = t; scoreFn = sc; }
export function toast(text, kind) { toastFn(text, kind); }
export function addScore(n) { scoreFn(n); }
