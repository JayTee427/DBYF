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
import { ITEMS, rollItem, buildStats, removeItem, grant } from './items.js';
import { flock, clearFlock, spawnPlover, spawnProphet, spawnWillets, buildSanderlings, sanderlingNear } from './birds.js';
import { bus } from './bus.js';

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
  parking:   { icon: '\u{1F697}', name: 'THE PARKING LOT',  r: 5.5, beacon: 'alarm',  z: [22, 28], gauntlet: true,
               line: 'whoever you are, here are your keys.' },
  island:    { icon: '\u{1F3DD}', name: 'THE BURIED HOARD', r: 5.0, beacon: 'chime',  z: [2, 14],  gauntlet: false,
               line: 'it was real. it was ALL REAL.' },
  // she came back for you. now walk to the truck like a person with shoes.
  raptor:    { icon: '\u{1F6FB}', name: 'THE ORANGE RAPTOR', r: 6.5, beacon: 'horn', z: [17, 22], gauntlet: false,
               line: 'we are going home. and we are getting ice cream.' },
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
    this.stumbleT = 0; this.stumbleKind = null; this.stumbleMax = 1;
  }

  reset() {
    this.x = W.startX; this.z = W.startZ; this.y = groundY(this.x, this.z);
    this.vy = 0; this.kx = 0; this.kz = 0; this.facing = Math.PI / 2;
    this.grounded = true; this.phase = 0; this.speed = 0; this.refuge = null;
    this.hopCool = 0; this.airTime = 0;
    this.vx = 0; this.vz = 0; this.coyote = 0; this.skid = 0; this.landImpact = 0;
    this.stumbleT = 0; this.stumbleKind = null;
    this.root.rotation.set(0, this.facing, 0);
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
    // while you're stumbling you are a passenger
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    const downed = this.stumbleKind === 'faceplant' && this.stumbleT > this.stumbleMax * 0.45;
    const wantSprint = input.sprint && S.stamina > 1 && mag > 0 && this.stumbleT <= 0;
    let base = wantSprint ? 10.4 : 6.0;
    if (this.stumbleT > 0) base *= downed ? 0 : 0.35;
    if (inWater) base *= 0.55;
    if (S.heatState === 3) base *= 1.22;             // panic sprint
    if (S.heatState === 4) base *= 1.32;
    if (hasItem('sandals')) base *= 1.04;
    if (S.guilt > 0) base *= 0.78;                // moving slowly, full of regret
    // the wind shoves you around in gusts you have to lean against
    if (S.weather && S.weather.gust) {
      const g = (Math.sin(S.t * 0.55) * 0.6 + Math.sin(S.t * 1.7 + 1.3) * 0.4);
      const power = Math.max(0, g) * 7.5;
      this.kx += Math.sin(S.windDir) * power * dt;
      this.kz += Math.cos(S.windDir) * power * dt;
      if (power > 5 && Math.random() < dt * 3) {
        particles.spawn(this.x - Math.sin(S.windDir) * 2, this.y + 0.6 + Math.random(), this.z - Math.cos(S.windDir) * 2,
          { color: 0xefdcb0, size: 0.24, ttl: 0.7, vy: 0.3,
            vx: Math.sin(S.windDir) * 9, vz: Math.cos(S.windDir) * 9, opacity: 0.5, drag: 0.1 });
      }
    }
    if (S.ev && S.ev.escort > 0) base *= 1.06;    // the dolphins are rooting for you
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
    const slippy = buildStats().slip;             // surf wax: everything is a slide
    const accel = grounded ? (S.heatState >= 3 ? 40 : 54) * (slippy ? 0.6 : 1) : 16;
    const friction = (grounded ? 20 : 1.2) * (slippy ? 0.22 : 1);
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
    if ((this.grounded || this.coyote > 0) && input.jump && this.hopCool <= 0 && this.stumbleT <= 0) {
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
        // a big leap is exactly how you lose a sandal
        const sandal = S.slots.find(s => s.key === 'sandals');
        if (sandal && Math.random() < 0.14) {
          removeItem(sandal);
          const a = this.facing + (Math.random() - 0.5);
          dropItem('sandals', this.x + Math.sin(a) * 11, this.z + Math.cos(a) * 11);
          toast('\u{1FA74} YOUR SANDAL! it went THAT way', 'bad');
          say('no! my sandal!', true);
          AU.sweep(700, 1400, 0.5, 'sine', 0.07);
        }
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
        // come down too fast and too fast-moving and you do not stick it
        const horiz = Math.hypot(this.vx, this.vz);
        if (impact > 0.86 && !ref) this.trip('faceplant', 'BAD LANDING');
        else if (impact > 0.55 && horiz > 6.5 && !ref) this.trip('stumble');
      }
    } else this.y = damp(this.y, gy, 22, dt);

    // ---- the little birds are a genuine tripping hazard
    if (this.grounded && this.speed > 7 && this.stumbleT <= 0) {
      if (sanderlingNear(this.x, this.z, 1.5)) {
        this.trip('stumble', '\u{1F426} TRIPPED OVER A SANDERLING');
        AU.gullCall();
      }
    }
    // and belly-flopping into the shore break at full tilt is a classic
    if (this.grounded && inWater && this.speed > 9 && this.stumbleT <= 0 && Math.random() < dt * 2.2) {
      this.trip('faceplant', '\u{1F30A} FULL-SPEED BELLY FLOP');
      AU.splash(true);
    }

    // ---- facing & animation
    if (mag > 0 && this.stumbleT <= 0) this.facing = angleLerp(this.facing, Math.atan2(wishX, wishZ), 1 - Math.exp(-16 * dt));
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.facing;
    this.animate(dt, mag > 0 && this.stumbleT <= 0, inWater);
    this.animateStumble(dt);

    // ---- footsteps
    if (this.grounded && mag > 0) {
      const prev = this.phase;
      this.phase += this.speed * dt * 1.55;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) this.footstep(gy, inWater);
    } else if (!this.grounded) this.phase += dt * 2;

    return { inWater, refuge: this.refuge, groundYHere: gy };
  }

  /**
   * Lose your dignity. `kind` is 'stumble' (a staggering windmill recovery)
   * or 'faceplant' (down in the sand, briefly, face-first).
   */
  trip(kind, reason) {
    if (this.stumbleT > 0 || S.invuln > 0) return;
    this.stumbleKind = kind;
    this.stumbleT = kind === 'faceplant' ? 1.5 : 0.62;
    this.stumbleMax = this.stumbleT;
    S.stats.trips++;
    const gy = groundY(this.x, this.z);
    if (kind === 'faceplant') {
      S.stats.faceplants++;
      this.vx *= 0.15; this.vz *= 0.15;
      AU.land(true); AU.noise(0.3, 500, 0.12);
      bus.shake(1);
      particles.burst(this.x, gy + 0.15, this.z, 16,
        { color: 0xefdcb0, size: 0.38, ttl: 0.8, vy: 1.4, spread: 2.6 });
      // going face-first into scorching sand is, of course, much worse
      const h = heatAt(this.x, this.z, S.t) * effHeat();
      if (h > HEAT.safe && !this.refuge) {
        S.health -= 6;
        toast('\u{1F975} FACE-FIRST INTO THE HOT SAND', 'bad');
        say(['MY FACE! MY FACE!', 'not the face! not the face!', 'why is my face on fire'][Math.floor(Math.random() * 3)], true);
      } else {
        toast(reason || 'FACEPLANT', 'warn');
        say(['oof.', 'I meant to do that.', 'ow. my everything.'][Math.floor(Math.random() * 3)], true);
      }
      // something shakes loose
      if (S.slots.length && Math.random() < 0.7) {
        const lost = S.slots[Math.floor(Math.random() * S.slots.length)];
        removeItem(lost);
        dropItem(lost.key, this.x + (Math.random() - 0.5) * 4, this.z + (Math.random() - 0.5) * 4);
        toast('\u{1F4A5} dropped your ' + lost.def.name + '!', 'bad');
      }
    } else {
      this.vx *= 0.62; this.vz *= 0.62;
      AU.noise(0.16, 700, 0.07);
      bus.shake(0.4);
      particles.burst(this.x, gy + 0.1, this.z, 6,
        { color: 0xefdcb0, size: 0.28, ttl: 0.5, vy: 1.0, spread: 1.6 });
      if (reason) toast(reason, 'warn');
      say(['whoa!', 'woah — WOAH', 'nope nope nope', 'aaah!'][Math.floor(Math.random() * 4)], false);
    }
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
      S.health -= 6;
      // launched straight off the towel, arms everywhere
      this.vy = 4.2; this.grounded = false;
      const a = Math.random() * Math.PI * 2;
      this.kx += Math.sin(a) * 9; this.kz += Math.cos(a) * 9;
      this.trip('stumble', '\u{1F980} THERE WAS A CRAB IN THE TOWEL');
      AU.crab(); say('CRAB! CRAB! CRAB!', true);
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

  /** Overrides the normal pose while you're losing your dignity. */
  animateStumble(dt) {
    if (this.stumbleT <= 0) {
      this.root.rotation.x = damp(this.root.rotation.x, 0, 12, dt);
      this.root.rotation.z = damp(this.root.rotation.z, 0, 12, dt);
      return;
    }
    const k = 1 - this.stumbleT / this.stumbleMax;      // 0 → 1 through the recovery
    if (this.stumbleKind === 'faceplant') {
      // slam down face-first, lie there a beat, then push yourself back up
      const down = k < 0.18 ? k / 0.18 : k < 0.62 ? 1 : 1 - (k - 0.62) / 0.38;
      this.root.rotation.x = down * 1.5;
      this.rig.position.y = -down * 0.55;
      const flail = k < 0.2 ? 1 : 0;
      this.armL.rotation.x = -2.2 * down - flail * 0.6;
      this.armR.rotation.x = -2.2 * down - flail * 0.6;
      this.armL.rotation.z = 0.7 * down; this.armR.rotation.z = -0.7 * down;
      this.legL.rotation.x = 0.5 * down; this.legR.rotation.x = 0.35 * down;
      this.headG.rotation.x = -0.5 * down;
      // legs kick a bit while you're down there
      if (k > 0.2 && k < 0.6) {
        this.legL.rotation.x += Math.sin(S.t * 16) * 0.25;
        this.legR.rotation.x -= Math.sin(S.t * 16) * 0.25;
      }
    } else {
      // windmill: arms cartwheeling, body pitched forward, knees everywhere
      const w = Math.sin(S.t * 26), w2 = Math.cos(S.t * 26);
      const amt = Math.sin((1 - k) * Math.PI * 0.9);
      this.root.rotation.x = amt * 0.5;
      this.root.rotation.z = w2 * amt * 0.22;
      this.armL.rotation.x = -1.2 + w * 2.6 * amt;
      this.armR.rotation.x = -1.2 - w * 2.6 * amt;
      this.armL.rotation.z = 0.6 * amt; this.armR.rotation.z = -0.6 * amt;
      this.legL.rotation.x = w2 * 0.8 * amt;
      this.legR.rotation.x = -w2 * 0.8 * amt;
      this.headG.rotation.z = -w * 0.3 * amt;
      this.mouth.scale.y = 1 + amt * 2.5;
    }
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

/** Plant a chest at a chosen spot (level gen + testing). */
export function buildChestAt(x, z) { const c = buildChest(x, z); S.chests.push(c); return c; }

/** Build a goal at a chosen spot (used when the car keys reroute you). */
export function buildGoalAt(key, x, z) { return buildGoal(key, x, z); }

/** Knock something loose onto the sand — it tumbles, then you can grab it back. */
export function dropItem(key, x, z) {
  const cx = clamp(x, W.xMin + 2, W.xMax - 2);
  const cz = clamp(z, W.zMin, W.zMax - 2);
  const it = buildItemPickup(key, cx, cz);
  it.tumble = 0.7;
  it.mesh.position.y += 1.2;
  S.items.push(it);
  particles.burst(cx, groundY(cx, cz) + 0.8, cz, 7,
    { color: 0xffd0a0, size: 0.28, ttl: 0.5, spread: 1.8 });
  return it;
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

  } else if (key === 'raptor') {
    // big, orange, and sitting on 37s
    const TIRE = 0.86;
    const body = meshOf(new THREE.BoxGeometry(6.4, 1.5, 2.9), 0xf26a1b);
    body.position.y = 2.5; g.add(body);
    const cab = meshOf(new THREE.BoxGeometry(3.2, 1.35, 2.75), 0xff8330);
    cab.position.set(-0.8, 3.6, 0); g.add(cab);
    const glass = meshOf(new THREE.BoxGeometry(2.9, 0.95, 2.8), 0x33454f, { outline: false });
    glass.position.set(-0.8, 3.7, 0); g.add(glass);
    const bed = meshOf(new THREE.BoxGeometry(2.6, 0.75, 2.8), 0xd9581a);
    bed.position.set(2.1, 3.05, 0); g.add(bed);
    const grille = meshOf(new THREE.BoxGeometry(0.28, 1.0, 2.7), 0x2a2a30, { outline: false });
    grille.position.set(-3.3, 2.6, 0); g.add(grille);
    for (const s of [-1, 1]) {
      const lamp = meshOf(new THREE.BoxGeometry(0.2, 0.42, 0.6), 0xfff3c4, { outline: false });
      lamp.position.set(-3.3, 3.0, s * 0.95); g.add(lamp);
    }
    const bar = meshOf(new THREE.CylinderGeometry(0.09, 0.09, 2.7, 6), 0x2a2a30);
    bar.rotation.x = Math.PI / 2; bar.position.set(-0.9, 4.55, 0); g.add(bar);
    for (let i = -1; i <= 1; i++) {
      const pod = meshOf(new THREE.BoxGeometry(0.3, 0.28, 0.4), 0xfff3c4, { outline: false });
      pod.position.set(-0.9, 4.75, i * 0.9); g.add(pod);
    }
    for (const [wx, wz] of [[-2.3, 1.6], [-2.3, -1.6], [2.3, 1.6], [2.3, -1.6]]) {
      const tyre = meshOf(new THREE.CylinderGeometry(TIRE, TIRE, 0.62, 14), 0x201f24);
      tyre.rotation.x = Math.PI / 2; tyre.position.set(wx, TIRE, wz); g.add(tyre);
      const rim = meshOf(new THREE.CylinderGeometry(0.42, 0.42, 0.66, 8), 0xb9bcc2, { outline: false });
      rim.rotation.x = Math.PI / 2; rim.position.set(wx, TIRE, wz); g.add(rim);
    }
    const flag = emojiSprite('\u{1F6FB}', 3.0); flag.position.y = 6.6; g.add(flag);

  } else if (key === 'parking') {
    const lot = meshOf(new THREE.BoxGeometry(16, 0.14, 11), 0x4a4a52);
    lot.position.y = 0.07; g.add(lot);
    for (let i = -1; i <= 1; i++) {
      const line = meshOf(new THREE.BoxGeometry(0.16, 0.02, 8), 0xe8e2cf, { outline: false });
      line.position.set(i * 3.6, 0.16, 0); g.add(line);
    }
    const car = new THREE.Group();
    const body = meshOf(new THREE.BoxGeometry(4.0, 1.0, 1.9), 0xc8443a); body.position.y = 0.85; car.add(body);
    const cab = meshOf(new THREE.BoxGeometry(2.1, 0.85, 1.7), 0xdd6a5c); cab.position.set(-0.2, 1.6, 0); car.add(cab);
    for (const [wx, wz] of [[-1.3, 0.95], [-1.3, -0.95], [1.3, 0.95], [1.3, -0.95]]) {
      const w = meshOf(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), 0x25252b);
      w.rotation.x = Math.PI / 2; w.position.set(wx, 0.42, wz); car.add(w);
    }
    car.position.set(2.5, 0, 0); g.add(car);
    g.userData.car = car;

  } else if (key === 'island') {
    // no lava here at all: a rock garden and the hoard in the middle
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2, rr = 3.4 + (i % 3) * 1.1;
      const rock = meshOf(new THREE.IcosahedronGeometry(1.1, 0), 0x8f8f9a);
      rock.scale.y = 0.5; rock.position.set(Math.cos(a) * rr, 0.24, Math.sin(a) * rr); g.add(rock);
    }
    const chest = meshOf(new THREE.BoxGeometry(2.2, 1.3, 1.5), 0x8a6242); chest.position.y = 0.75; g.add(chest);
    const lid = meshOf(new THREE.BoxGeometry(2.3, 0.35, 1.6), 0xa8814f); lid.position.y = 1.55; lid.rotation.x = -0.5; g.add(lid);
    const gold = meshOf(new THREE.SphereGeometry(0.7, 10, 8), 0xffd94a); gold.position.y = 1.45; gold.scale.y = 0.5; g.add(gold);
    const shine = emojiSprite('\u{2728}', 2.4); shine.position.y = 3.2; g.add(shine);

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
  const marker = emojiSprite(def.icon, key === 'raptor' ? 4.6 : 3.0);
  marker.material.fog = false; marker.material.depthTest = false;
  marker.renderOrder = 900;
  marker.position.set(x, groundY(x, z) + (key === 'raptor' ? 11.5 : 9.5), z);
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
  return {
    clouds: [], focus: null, surge: 0, nextAt: 10, dolphin: null, whale: null,
    sneaker: false, warned: false, lowTide: 0, civilwar: 0,
    props: [],            // sea lions, sandcastles, wedding, kite, detector man
    grunion: 0,           // while > 0 every bird ignores you
    escort: 0,            // dolphin escort buff timer
  };
}

// ---------------- world props for the background events ----------------
function mkSeaLion(scale, col) {
  const g = new THREE.Group();
  const b = meshOf(new THREE.CapsuleGeometry(0.62, 1.5, 4, 8), col);
  b.rotation.z = Math.PI / 2; b.position.y = 0.6; g.add(b);
  const h = meshOf(new THREE.SphereGeometry(0.42, 10, 8), col); h.position.set(1.25, 0.85, 0); g.add(h);
  const nz = meshOf(new THREE.SphereGeometry(0.1, 6, 6), 0x241a20, { outline: false });
  nz.position.set(1.62, 0.8, 0); g.add(nz);
  const tl = meshOf(new THREE.ConeGeometry(0.34, 0.7, 6), col);
  tl.rotation.z = Math.PI / 2; tl.position.set(-1.4, 0.5, 0); g.add(tl);
  g.scale.setScalar(scale);
  return g;
}
function mkSandcastle(h) {
  const g = new THREE.Group();
  const base = meshOf(new THREE.CylinderGeometry(0.75, 0.95, h, 8), 0xe8cf9a);
  base.position.y = h / 2; g.add(base);
  const top = meshOf(new THREE.ConeGeometry(0.5, 0.5, 8), 0xd9bd84);
  top.position.y = h + 0.25; g.add(top);
  for (let i = 0; i < 3; i++) {
    const t = meshOf(new THREE.CylinderGeometry(0.22, 0.26, h * 0.7, 6), 0xe8cf9a);
    const a = i / 3 * Math.PI * 2;
    t.position.set(Math.cos(a) * 0.85, h * 0.35, Math.sin(a) * 0.85); g.add(t);
  }
  return g;
}
function addProp(kind, mesh, x, z, extra) {
  mesh.position.set(x, groundY(x, z), z);
  levelGroup.add(mesh);
  const p = Object.assign({ kind, mesh, x, z, t: 0, done: false }, extra || {});
  S.ev.props.push(p);
  // some props make the ground under them genuinely cooler
  if (kind === 'sandcastle') { p.pad = { x, z, r: 7.5 }; S.coolPads.push(p.pad); }
  if (kind === 'kite') { p.pad = { x, z, r: 2.6 }; S.coolPads.push(p.pad); }
  return p;
}
function dropProp(p) {
  levelGroup.remove(p.mesh);
  if (p.pad) { const i = S.coolPads.indexOf(p.pad); if (i >= 0) S.coolPads.splice(i, 1); }
  const j = S.ev.props.indexOf(p); if (j >= 0) S.ev.props.splice(j, 1);
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

  } else if (kind === 'dolphins') {
    // a pod paces you just offshore. purely nice, until you catch fire.
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const d = meshOf(new THREE.CapsuleGeometry(0.5, 1.7, 4, 8), 0x6a7a8a);
      d.rotation.z = Math.PI / 2; d.position.set(i * 3.2, 0, (i % 2) * 2.2);
      g.add(d);
    }
    const p = addProp('dolphins', g, runner.x - 6, -22, { life: 26 });
    p.mesh.position.y = -0.6;
    ev.escort = 26;
    toast('\u{1F42C} a pod pulls alongside you');
    bus.banner('FEELING COOL', 'the dolphins approve');
    AU.splash(false); say('hey! hey guys!', true);

  } else if (kind === 'sealions') {
    // a heap of them, asleep, directly in the way
    const g = new THREE.Group();
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const s = mkSeaLion(0.8 + Math.random() * 0.5, [0x6b5a4e, 0x574a41, 0x7a6858][i % 3]);
      s.position.set((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 4.5);
      s.rotation.y = Math.random() * 6.3;
      g.add(s);
    }
    const px = clamp(runner.x + 34 + Math.random() * 30, W.xMin, W.goalX - 14);
    addProp('sealions', g, px, clamp(-2 + Math.random() * 10, -4, 14), { r: 6.5, woke: false });
    toast('\u{1F9AD} a pile of sleeping sea lions. tiptoe.');

  } else if (kind === 'sandcastle') {
    // packed damp sand between the castles: a cool road, if you're careful
    const g = new THREE.Group();
    const castles = [];
    for (let i = 0; i < 7; i++) {
      const c = mkSandcastle(0.7 + Math.random() * 0.8);
      c.position.set((Math.random() - 0.5) * 11, 0, (Math.random() - 0.5) * 7);
      g.add(c); castles.push(c);
    }
    const pad = new THREE.Mesh(new THREE.CircleGeometry(7.5, 22),
      new THREE.MeshBasicMaterial({ color: 0x7a6242, transparent: true, opacity: 0.42, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.04; pad.renderOrder = 3; g.add(pad);
    const px = clamp(runner.x + 30 + Math.random() * 34, W.xMin, W.goalX - 14);
    addProp('sandcastle', g, px, clamp(2 + Math.random() * 14, -2, 20), { r: 7.5, castles });
    toast('\u{1F3F0} SANDCASTLE KINGDOM — cool sand, mind the towers');

  } else if (kind === 'kite') {
    const g = new THREE.Group();
    const k = meshOf(new THREE.ConeGeometry(1.5, 2.6, 4), 0xff5c8a);
    k.rotation.x = -Math.PI / 2; k.position.y = 0.25; g.add(k);
    const tail = meshOf(new THREE.BoxGeometry(0.12, 0.08, 2.4), 0xffe07a, { outline: false });
    tail.position.set(0, 0.2, -2); g.add(tail);
    const px = clamp(runner.x + 22 + Math.random() * 26, W.xMin, W.goalX - 12);
    addProp('kite', g, px, clamp(4 + Math.random() * 12, -2, 20), { r: 2.4, life: 20, reeled: false });
    toast('\u{1FA81} a kite comes down nearby — it\'s cool to stand on');

  } else if (kind === 'grunion') {
    ev.grunion = 22;
    for (const b of [...flock]) if (b.kind === 'gull') { b.state = 'flee'; b.t = 0; }
    S.aggro = 0;
    bus.banner('GRUNION RUN', 'every bird on the beach just left');
    toast('\u{1F41F} the shore is YOURS');
    AU.shanty(); say('where did everybody go? oh. fish.', true);

  } else if (kind === 'wedding') {
    const g = new THREE.Group();
    for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) {
      const chair = meshOf(new THREE.BoxGeometry(0.5, 0.7, 0.5), 0xfdfaf4);
      chair.position.set(-3 + i * 1.5, 0.35, -1.6 + r * 1.6); g.add(chair);
    }
    const arch = meshOf(new THREE.TorusGeometry(1.7, 0.13, 6, 14, Math.PI), 0xf6e7f2);
    arch.position.set(0, 0.1, 3.6); g.add(arch);
    const px = clamp(runner.x + 30 + Math.random() * 30, W.xMin, W.goalX - 14);
    addProp('wedding', g, px, clamp(6 + Math.random() * 12, 0, 20), { r: 5.5, crashed: false });
    toast('\u{1F492} somebody is getting married down there');

  } else if (kind === 'detector') {
    // sweeps the sand, headphones on, oblivious. wherever he digs, loot follows.
    const g = new THREE.Group();
    const body = meshOf(new THREE.CapsuleGeometry(0.3, 0.7, 4, 8), 0xc8b89a); body.position.y = 1.0; g.add(body);
    const head = meshOf(new THREE.SphereGeometry(0.27, 10, 8), 0xe8c9a4); head.position.y = 1.65; g.add(head);
    const cans = meshOf(new THREE.BoxGeometry(0.62, 0.16, 0.2), 0x2e2a30, { outlineScale: 1.1 });
    cans.position.y = 1.7; g.add(cans);
    const rod = meshOf(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 5), 0xb0b6bd);
    rod.rotation.z = 0.6; rod.position.set(0.55, 0.8, 0.35); g.add(rod);
    const coil = meshOf(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 12), 0x8d939a);
    coil.position.set(1.05, 0.14, 0.6); g.add(coil);
    const px = clamp(runner.x + 26 + Math.random() * 26, W.xMin, W.goalX - 16);
    addProp('detector', g, px, clamp(6 + Math.random() * 12, -2, 20),
      { dir: Math.random() < 0.5 ? 1 : -1, next: 3 + Math.random() * 3, digs: 0 });
    toast('\u{1F575} the metal detector man. follow him.');

  } else if (kind === 'volleyball') {
    const ball = meshOf(new THREE.SphereGeometry(0.34, 12, 10), 0xfdfdfa);
    const stripe = meshOf(new THREE.BoxGeometry(0.7, 0.09, 0.09), 0x3a76c4, { outline: false });
    ball.add(stripe);
    const a = Math.random() * Math.PI * 2;
    addProp('volleyball', ball, runner.x + 16 + Math.random() * 12, clamp(runner.z + (Math.random() - 0.5) * 12, -4, 20),
      { vx: Math.sin(a) * 6, vz: Math.cos(a) * 6, life: 22, kicked: false });
    toast('\u{1F3D0} loose ball!');

  } else if (kind === 'lowtide') {
    // the sea walks out, exposing a huge cool flat — and then comes back
    ev.surge -= 11; ev.lowTide = 15;
    bus.banner('LOW TIDE', 'the sea pulls way out — go, go, go');
    toast('\u{1F30A} a whole cool flat, briefly');
    AU.sweep(500, 200, 1.1, 'sine', 0.06);

  } else if (kind === 'civilwar') {
    // one gull robs another and the entire flock forgets you exist
    let n = 0;
    for (const b of flock) {
      if (b.kind !== 'gull') continue;
      b.state = 'circle';
      b.orbitR = 4 + Math.random() * 3;
      b.orbitSpeed = (Math.random() < 0.5 ? -1 : 1) * (1.8 + Math.random());
      b.swoopAt = S.t + 999;
      b.civil = 20;
      n++;
    }
    if (n >= 2) {
      ev.civilwar = 14;
      bus.banner('SEAGULL CIVIL WAR', 'walk through the middle of it');
      toast('\u{1F426} they have turned on each other');
      AU.gullCall(); AU.screech();
      say('this is not about me. excellent.', true);
    }

  } else if (kind === 'rescue') {
    startRescue(runner);

  } else if (kind === 'dustdevil') {
    // a small giddy tornado. it is not hostile, it is five years old.
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const r = 0.4 + i * 0.28;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1 + i * 0.02, 5, 12),
        new THREE.MeshBasicMaterial({ color: 0xe6d3a8, transparent: true, opacity: 0.5 - i * 0.04 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.4 + i * 0.75;
      g.add(ring);
    }
    const px = clamp(runner.x + 20 + Math.random() * 24, W.xMin, W.goalX - 12);
    const p = addProp('dustdevil', g, px, clamp(4 + Math.random() * 14, -2, 22),
      { life: 26, ang: Math.random() * 6.3, spun: 0, carried: [] });
    // it has been collecting things
    for (let i = 0; i < 2; i++) p.carried.push(rollItem(Math.random, Math.random() < 0.35));
    toast('\u{1F32A} a dust devil, carrying somebody\'s things');

  } else if (kind === 'surfschool') {
    // a wobbling line of beginners crossing your path with foam boards
    const g = new THREE.Group();
    const boards = [];
    for (let i = 0; i < 5; i++) {
      const person = new THREE.Group();
      const b = meshOf(new THREE.CapsuleGeometry(0.27, 0.62, 4, 8), [0x3ec4d4, 0xf06a8a, 0xffd166, 0x8fd45a, 0xc792ff][i]);
      b.position.y = 0.95; person.add(b);
      const h = meshOf(new THREE.SphereGeometry(0.25, 10, 8), 0xe8c9a4); h.position.y = 1.5; person.add(h);
      const board = meshOf(new THREE.CapsuleGeometry(0.5, 1.9, 4, 8), 0xfdfdfa);
      board.rotation.set(Math.PI / 2, 0, 0.3); board.scale.z = 0.28;
      board.position.set(0.6, 1.0, 0); person.add(board);
      person.position.set(i * 2.3, 0, (i % 2) * 0.9);
      g.add(person); boards.push(person);
    }
    const px = clamp(runner.x + 26 + Math.random() * 22, W.xMin, W.goalX - 16);
    addProp('surfschool', g, px, 20, { boards, life: 34, dropped: false });
    toast('\u{1F3C4} surf school, crossing. slowly.');

  } else if (kind === 'fisherman') {
    const g = new THREE.Group();
    const body = meshOf(new THREE.CapsuleGeometry(0.3, 0.7, 4, 8), 0x6d8f5e); body.position.y = 1.0; g.add(body);
    const head = meshOf(new THREE.SphereGeometry(0.27, 10, 8), 0xe8c9a4); head.position.y = 1.65; g.add(head);
    const hat = meshOf(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10), 0xcbb582); hat.position.y = 1.86; g.add(hat);
    const rod = meshOf(new THREE.CylinderGeometry(0.035, 0.02, 3.4, 5), 0x5a4632);
    rod.rotation.z = -0.9; rod.position.set(-1.0, 2.0, 0); g.add(rod);
    const bucket = meshOf(new THREE.CylinderGeometry(0.3, 0.26, 0.44, 8), 0x3a86c4);
    bucket.position.set(0.9, 0.22, 0.4); g.add(bucket);
    const px = clamp(runner.x + 24 + Math.random() * 24, W.xMin, W.goalX - 14);
    addProp('fisherman', g, px, clamp(-8 + Math.random() * 4, W.zMin + 1, -3),
      { r: 7, castAt: S.t + 2 + Math.random() * 3, hooked: false });
    toast('\u{1F3A3} surf fisherman. mind his backcast.');
  }
  ev.nextAt = S.t + 12 + Math.random() * 10;
  S.stats.events++;
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

  // ---- grunion run: total bird amnesty
  if (ev.grunion > 0) {
    ev.grunion -= dt;
    S.aggro = 0;
    if (ev.grunion <= 0) toast('the birds are coming back.', 'warn');
  }
  // ---- dolphin escort: a small buff, and they judge you if you ignite
  if (ev.escort > 0) {
    ev.escort -= dt;
    if (S.heatState >= 4) {
      ev.escort = 0;
      toast('the dolphins peel away, embarrassed for you', 'warn');
      say('no — come back —', true);
    }
  }
  updateProps(dt, runner);
  updateRescue(dt, runner);

  if (S.t >= ev.nextAt) {
    const pool = [['cloud', 22], ['whale', 15], ['dolphins', 17], ['sealions', 15],
                  ['sandcastle', 15], ['kite', 12], ['detector', 14], ['volleyball', 14],
                  ['dustdevil', 13], ['surfschool', 11]];
    if (S.level >= 2) pool.push(['focus', 18], ['sneaker', 14], ['wedding', 11], ['fisherman', 12]);
    if (S.level >= 3) pool.push(['grunion', 8], ['lowtide', 12], ['civilwar', 10]);
    // Rare, and gated hard: level 3+, feet genuinely in trouble, and only once
    // you're past the halfway mark — so the truck at the top of the beach is a
    // run you can actually win, and never appears mid-level out of nowhere.
    const pastHalf = runner.x > lerp(W.startX, W.goalX, 0.5);
    if (S.level >= 3 && pastHalf && !S.shoes && !S.rescue && S.heatState >= 2) {
      pool.push(['rescue', 8]);
    }
    let tot = 0; for (const [, w] of pool) tot += w;
    let r = Math.random() * tot; let pick = 'cloud';
    for (const [k, w] of pool) { r -= w; if (r <= 0) { pick = k; break; } }
    fireEvent(pick, runner);
  }
}

/** The physical set dressing: things you can bump into, wake up, or knock over. */
function updateProps(dt, runner) {
  const ev = S.ev;
  for (const p of [...ev.props]) {
    p.t += dt;
    const d = Math.hypot(runner.x - p.x, runner.z - p.z);

    if (p.kind === 'dolphins') {
      p.life -= dt;
      p.mesh.position.x = damp(p.mesh.position.x, runner.x - 4, 1.2, dt);
      p.mesh.position.y = -0.6 + Math.sin(S.t * 1.6) * 0.9;
      p.mesh.rotation.z = Math.sin(S.t * 1.6) * 0.35;
      if (p.life <= 0 || ev.escort <= 0) dropProp(p);

    } else if (p.kind === 'sealions') {
      // they snore. run at them and the whole heap goes off like a car alarm.
      p.mesh.position.y = groundY(p.x, p.z) + Math.sin(S.t * 0.9) * 0.04;
      if (!p.woke && d < p.r && runner.speed > 6.5) {
        p.woke = true;
        const a = Math.atan2(runner.x - p.x, runner.z - p.z);
        runner.kx += Math.sin(a) * 16; runner.kz += Math.cos(a) * 16;
        runner.trip('stumble', '\u{1F9AD} YOU WOKE THE SEA LIONS');
        S.aggro = Math.min(100, S.aggro + 18);
        AU.bark(0.16); setTimeout(() => AU.bark(0.14), 180); setTimeout(() => AU.bark(0.12), 380);
        bus.shake(1);
        say('sorry! SORRY!', true);
      } else if (!p.woke && d < p.r + 3 && runner.speed <= 6.5 && !p.praised) {
        p.praised = true;
        toast('\u{1F92B} tiptoeing past the sea lions  +250'); addScore(250);
      }

    } else if (p.kind === 'sandcastle') {
      if (d < p.r) {
        for (const c of p.castles) {
          if (c.userData.gone) continue;
          const cd = Math.hypot(runner.x - (p.x + c.position.x), runner.z - (p.z + c.position.z));
          if (cd < 1.2) {
            c.userData.gone = true;
            c.scale.set(1.3, 0.12, 1.3);
            particles.burst(p.x + c.position.x, groundY(p.x, p.z) + 0.4, p.z + c.position.z, 10,
              { color: 0xe8cf9a, size: 0.3, ttl: 0.7, spread: 1.8 });
            AU.poof();
            S.guilt = 6;
            toast('\u{1F62C} you kicked over a child\'s sandcastle', 'bad');
            say(['sorry, sorry, sorry.', 'I didn\'t see it!', 'oh no. oh no.'][Math.floor(Math.random() * 3)], true);
          }
        }
      }

    } else if (p.kind === 'kite') {
      p.life -= dt;
      p.mesh.rotation.z = Math.sin(S.t * 2) * 0.1;
      if (p.life < 6) {                       // he starts reeling it in
        p.x += 4.5 * dt; p.z += 1.2 * dt;
        p.mesh.position.set(p.x, groundY(p.x, p.z) + 0.1 + (6 - p.life) * 0.25, p.z);
        if (p.pad) { p.pad.x = p.x; p.pad.z = p.z; }
        if (!p.reeled) { p.reeled = true; toast('the kite guy is reeling it back in!', 'warn'); }
      }
      if (p.life <= 0) dropProp(p);

    } else if (p.kind === 'wedding') {
      if (!p.crashed && d < p.r) {
        p.crashed = true;
        S.guilt = 8;
        toast('\u{1F4F8} WEDDING CRASHER — you are in every photo', 'bad');
        say('excuse me. sorry. lovely dress.', true);
        // the photographer will find you
        p.flashUntil = S.t + 8;
      }
      if (p.flashUntil && S.t < p.flashUntil && Math.random() < dt * 1.6) {
        bus.flash(0.7);
        AU.tone(2000, 0.04, 'sine', 0.05);
      }

    } else if (p.kind === 'detector') {
      // paces the beach and periodically digs; loot appears where he stops
      p.x += p.dir * 1.5 * dt;
      if (p.x < W.xMin + 6 || p.x > W.goalX - 6) p.dir *= -1;
      p.mesh.position.set(p.x, groundY(p.x, p.z), p.z);
      p.mesh.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      p.mesh.children[4].rotation.y = Math.sin(S.t * 2.2) * 0.5;   // sweeping the coil
      p.next -= dt;
      if (p.next <= 0 && p.digs < 4) {
        p.next = 5 + Math.random() * 4; p.digs++;
        AU.tone(1500, 0.06, 'sine', 0.05); AU.tone(1800, 0.08, 'sine', 0.04, 0.07);
        particles.burst(p.x + p.dir, groundY(p.x, p.z) + 0.2, p.z, 8,
          { color: 0xe8cf9a, size: 0.28, ttl: 0.6, spread: 1.4 });
        dropItem(rollItem(Math.random, Math.random() < 0.4), p.x + p.dir * 2, p.z);
        toast('\u{1F575} he found something. it is yours now.');
      }

    } else if (p.kind === 'volleyball') {
      p.life -= dt;
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.vx *= Math.pow(0.55, dt); p.vz *= Math.pow(0.55, dt);
      p.x = clamp(p.x, W.xMin, W.xMax); p.z = clamp(p.z, W.zMin, W.zMax);
      const bounce = Math.abs(Math.sin(S.t * 5)) * Math.min(1, Math.hypot(p.vx, p.vz) / 6);
      p.mesh.position.set(p.x, groundY(p.x, p.z) + 0.34 + bounce * 0.5, p.z);
      p.mesh.rotation.x += dt * 4; p.mesh.rotation.z += dt * 3;
      if (!p.kicked && d < 1.4) {
        p.kicked = true;
        if (runner.speed > 6) {
          // full cartoon: feet up, sky, everything everywhere
          runner.trip('faceplant', '\u{1F3D0} YOU STOOD ON THE BALL');
          runner.vy = 5.5; runner.grounded = false;
          p.vx = (Math.random() - 0.5) * 18; p.vz = (Math.random() - 0.5) * 18;
          AU.thwack();
        } else {
          p.vx = Math.sin(runner.facing) * 22; p.vz = Math.cos(runner.facing) * 22;
          toast('\u{1F3D0} nice touch! the players cheer  +300');
          addScore(300); AU.coin();
          S.aggro = Math.max(0, S.aggro - 12);       // even the gulls respect it
          say('yeah! did you see that?', true);
        }
        setTimeout(() => { p.kicked = false; }, 900);
      }
      if (p.life <= 0) dropProp(p);

    } else if (p.kind === 'dustdevil') {
      p.life -= dt;
      p.ang += (Math.random() - 0.5) * dt * 2;
      p.x += Math.sin(p.ang) * 5.5 * dt;
      p.z = clamp(p.z + Math.cos(p.ang) * 3 * dt, -2, 24);
      p.x = clamp(p.x, W.xMin + 4, W.xMax - 4);
      p.mesh.position.set(p.x, groundY(p.x, p.z), p.z);
      p.mesh.rotation.y += dt * 7;
      p.mesh.children.forEach((r, i) => { r.rotation.z = S.t * (2 + i * 0.4); });
      if (Math.random() < dt * 12) {
        particles.spawn(p.x + (Math.random() - 0.5) * 2.4, groundY(p.x, p.z) + Math.random() * 4,
          p.z + (Math.random() - 0.5) * 2.4,
          { color: 0xe6d3a8, size: 0.3, ttl: 0.7, vy: 2.2, opacity: 0.5 });
      }
      // get close and it hands over its haul, then spins you for your trouble
      if (d < 3.2 && p.carried.length) {
        const key = p.carried.pop();
        dropItem(key, p.x + (Math.random() - 0.5) * 5, p.z + (Math.random() - 0.5) * 5);
        toast('\u{1F32A} it drops something and giggles');
        AU.poof();
      }
      if (d < 2 && S.t - (p.spun || 0) > 3) {
        p.spun = S.t;
        runner.trip('stumble', '\u{1F32A} SPUN');
        S.feet.L = Math.min(100, S.feet.L + 6); S.feet.R = Math.min(100, S.feet.R + 6);
        AU.noise(0.4, 1800, 0.06, true);
        say('wheeeee — ow.', true);
      }
      if (p.life <= 0) dropProp(p);

    } else if (p.kind === 'surfschool') {
      p.life -= dt;
      p.z -= 1.6 * dt;                                  // shuffling down to the water
      p.mesh.position.set(p.x, groundY(p.x, p.z), p.z);
      p.boards.forEach((b, i) => { b.rotation.z = Math.sin(S.t * 3 + i) * 0.1; });   // wobbling
      if (!p.dropped && p.z < 6) {
        p.dropped = true;
        // the instructor's whistle. every bird looks up.
        AU.tone(2100, 0.18, 'sine', 0.05); AU.tone(2400, 0.2, 'sine', 0.04, 0.16);
        S.aggro = Math.min(100, S.aggro + 20);
        toast('\u{1F3C4} the instructor blows the whistle — the birds heard that', 'bad');
        // and somebody drops a board, which is a fine place to stand
        const bx = p.x + 1, bz = p.z + 2;
        const board = meshOf(new THREE.CapsuleGeometry(0.6, 2.2, 4, 8), 0xfdfdfa);
        board.rotation.x = Math.PI / 2; board.scale.z = 0.3;
        board.position.set(bx, groundY(bx, bz) + 0.25, bz);
        levelGroup.add(board);
        S.refuges.push({ x: bx, z: bz, r: 1.8, h: 0.4, type: 'board', mesh: board, crab: false, crabSprung: false });
      }
      if (p.life <= 0 || p.z < W.zMin) dropProp(p);

    } else if (p.kind === 'fisherman') {
      p.mesh.position.set(p.x, groundY(p.x, p.z), p.z);
      p.mesh.rotation.y = -Math.PI / 2 + Math.sin(S.t * 0.4) * 0.3;
      if (S.t > p.castAt) {
        p.castAt = S.t + 6 + Math.random() * 5;
        AU.sweep(900, 1600, 0.3, 'sine', 0.05);
        if (d < p.r && !runner.stumbleT) {
          // snagged on the backcast, dragged a few feet, profusely apologised to
          const a = Math.atan2(p.x - runner.x, p.z - runner.z);
          runner.kx += Math.sin(a) * 13; runner.kz += Math.cos(a) * 13;
          runner.trip('stumble', '\u{1F3A3} HOOKED ON HIS BACKCAST');
          say('sorry! sorry! he says sorry!', true);
        }
      }
    }
  }

  // ---- low tide: the sea walks out and leaves a cool flat behind
  if (ev.lowTide > 0) {
    ev.lowTide -= dt;
    ev.surge = Math.min(ev.surge, -9);
    if (ev.lowTide <= 0) { toast('the tide is coming back in!', 'warn'); ev.surge = 4; }
  }
  // ---- civil war: they are far too busy with each other
  if (ev.civilwar > 0) {
    ev.civilwar -= dt;
    S.aggro = Math.max(0, S.aggro - 30 * dt);
    if (ev.civilwar <= 0) toast('...they have remembered you.', 'warn');
  }
  // guilt: you move slower when you feel bad about yourself
  if (S.guilt > 0) S.guilt -= dt;
}

// ============================================================
// THE RESCUE — somebody walked all the way back to the truck for your shoes
// ============================================================
function mkRescuer() {
  const g = new THREE.Group();
  const rig = new THREE.Group(); g.add(rig);
  const torso = meshOf(new THREE.CapsuleGeometry(0.27, 0.32, 4, 10), 0xef5b8c);
  torso.position.y = 1.04; rig.add(torso);
  const shorts = meshOf(new THREE.CapsuleGeometry(0.28, 0.09, 4, 10), 0xfdfdfa);
  shorts.position.y = 0.79; rig.add(shorts);
  const head = meshOf(new THREE.SphereGeometry(0.29, 14, 12), 0xf3c9a0);
  head.position.y = 1.55; rig.add(head);
  const hair = meshOf(new THREE.SphereGeometry(0.30, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), 0x6b4226);
  hair.position.y = 1.57; rig.add(hair);
  const pony = meshOf(new THREE.CapsuleGeometry(0.1, 0.42, 4, 8), 0x6b4226);
  pony.position.set(0, 1.45, -0.3); pony.rotation.x = 0.5; rig.add(pony);
  const shades = meshOf(new THREE.BoxGeometry(0.42, 0.1, 0.08), 0x241a20, { outlineScale: 1.12 });
  shades.position.set(0, 1.6, 0.26); rig.add(shades);
  // one arm up, holding the shoes overhead so you can see them coming
  const armUp = new THREE.Group(); armUp.position.set(0.32, 1.24, 0);
  const upper = meshOf(new THREE.CapsuleGeometry(0.08, 0.34, 4, 8), 0xf3c9a0);
  upper.position.y = 0.22; armUp.add(upper);
  rig.add(armUp);
  const armLo = new THREE.Group(); armLo.position.set(-0.32, 1.24, 0);
  const lower = meshOf(new THREE.CapsuleGeometry(0.08, 0.34, 4, 8), 0xf3c9a0);
  lower.position.y = -0.24; armLo.add(lower);
  rig.add(armLo);
  const shoes = emojiSprite('\u{1F45F}', 1.5);
  shoes.position.set(0.34, 1.95, 0); rig.add(shoes);
  const legL = new THREE.Group(); legL.position.set(-0.15, 0.74, 0);
  const ll = meshOf(new THREE.CapsuleGeometry(0.1, 0.34, 4, 8), 0xf3c9a0); ll.position.y = -0.25; legL.add(ll);
  rig.add(legL);
  const legR = new THREE.Group(); legR.position.set(0.15, 0.74, 0);
  const lr = meshOf(new THREE.CapsuleGeometry(0.1, 0.34, 4, 8), 0xf3c9a0); lr.position.y = -0.25; legR.add(lr);
  rig.add(legR);
  g.userData = { rig, armUp, legL, legR, shoes };
  return g;
}
function startRescue(runner) {
  if (S.rescue || S.shoes > 0) return;
  const g = mkRescuer();
  // she comes from the truck end of the beach, out on the hot open sand
  const rx = clamp(runner.x + 42 + Math.random() * 22, W.xMin + 6, W.goalX - 8);
  const rz = clamp(runner.z + (Math.random() - 0.5) * 12, 2, 22);
  g.position.set(rx, groundY(rx, rz), rz);
  levelGroup.add(g);
  const marker = emojiSprite('\u{1F45F}', 2.6);
  marker.material.fog = false; marker.material.depthTest = false; marker.renderOrder = 895;
  levelGroup.add(marker);
  S.rescue = { x: rx, z: rz, mesh: g, marker, patience: 26, phase: 0, wave: 0 };
  bus.banner('SOMEBODY IS COMING', 'she went back to the truck for your shoes');
  toast('\u{1F45F} SHE BROUGHT YOUR SHOES — GET TO HER', 'tip');
  AU.fanfare();
  say('wait — is that — SHE WENT BACK FOR MY SHOES!', true);
}
export function updateRescue(dt, runner) {
  const r = S.rescue;
  if (r) {
    r.patience -= dt;
    r.phase += dt;
    // she walks toward you, waving the shoes over her head
    const dx = runner.x - r.x, dz = runner.z - r.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.4) {
      const sp = 2.6;
      r.x += dx / d * sp * dt;
      r.z += dz / d * sp * dt;
    }
    const u = r.mesh.userData;
    r.mesh.position.set(r.x, groundY(r.x, r.z) + Math.abs(Math.sin(r.phase * 7)) * 0.05, r.z);
    r.mesh.rotation.y = Math.atan2(dx, dz);
    u.legL.rotation.x = Math.sin(r.phase * 7) * 0.55;
    u.legR.rotation.x = -Math.sin(r.phase * 7) * 0.55;
    u.armUp.rotation.z = -0.5 + Math.sin(r.phase * 9) * 0.45;    // waving them at you
    u.rig.rotation.z = Math.sin(r.phase * 7) * 0.05;
    r.marker.position.set(r.x, groundY(r.x, r.z) + 4.6 + Math.sin(r.phase * 3) * 0.3, r.z);

    if (d < 2.4) {                                    // CAUGHT HER
      levelGroup.remove(r.mesh); levelGroup.remove(r.marker);
      S.rescue = null;
      // short on purpose: enough to run the back half home, not a free pass
      S.shoes = 18 + Math.random() * 12;
      S.feet.L = 0; S.feet.R = 0;
      S.health = Math.min(100, S.health + 30);
      S.stats.rescues++;
      addScore(2500);
      bus.banner('SHOES.', 'RUN. ' + S.shoes.toFixed(0) + ' seconds.');
      toast('\u{1F45F} SHOES ON — GO GO GO. +2500');
      AU.fanfare(); AU.shanty();
      bus.shake(0.5);
      particles.burst(runner.x, runner.y + 1.2, runner.z, 30,
        { color: 0xffd94a, size: 0.42, ttl: 1.3, vy: 3, spread: 3.4 });
      say('I love you. I love you so much. shoes.', true);
      // The truck is parked where trucks are parked: up at the top of the
      // beach where the level already ends. She only ever reaches you in the
      // back half (see the event gate), so it's a real run but a winnable one.
      if (S.goal) { levelGroup.remove(S.goal.mesh); levelGroup.remove(S.goal.marker); }
      S.goal = buildGoal('raptor', W.goalX, 17 + Math.random() * 5);
      toast('\u{1F6FB} the truck is up at the top — ' +
            Math.round(Math.hypot(W.goalX - runner.x, S.goal.z - runner.z)) + 'm');
      return;
    }
    if (r.patience <= 0) {
      levelGroup.remove(r.mesh); levelGroup.remove(r.marker);
      S.rescue = null;
      toast('...she waited as long as she could.', 'bad');
      say('no — wait — come back —', true);
    }
  }
  // shoes wear off eventually; they were never really your size
  if (S.shoes > 0) {
    S.shoes -= dt;
    if (S.shoes <= 0) {
      toast('the shoes come off. of course they do.', 'bad');
      say('oh come ON.', true);
    }
  }
}

// ============================================================
// PIRATE'S TREASURE — half-buried, always off the sensible route
// ============================================================
function buildChest(x, z) {
  const g = new THREE.Group();
  const box = meshOf(new THREE.BoxGeometry(1.7, 1.0, 1.2), 0x7a5636);
  box.position.y = 0.32; g.add(box);
  const lid = meshOf(new THREE.BoxGeometry(1.8, 0.3, 1.3), 0x9a6f45);
  lid.position.y = 0.9; g.add(lid);
  const band = meshOf(new THREE.BoxGeometry(1.85, 0.16, 1.35), 0xd8b25a, { outline: false });
  band.position.y = 0.55; g.add(band);
  const sandpile = meshOf(new THREE.SphereGeometry(1.5, 10, 6), 0xe8cf9a);
  sandpile.scale.set(1, 0.28, 1); sandpile.position.y = 0.1; g.add(sandpile);
  const glint = emojiSprite('\u{2728}', 1.4); glint.position.y = 2.1; g.add(glint);
  g.position.set(x, groundY(x, z), z);
  levelGroup.add(g);
  return { x, z, mesh: g, lid, opened: false };
}
/** Open it and take whatever's in there. Some of it is a mistake. */
function openChest(ch, runner) {
  ch.opened = true;
  ch.lid.rotation.x = -1.5; ch.lid.position.set(0, 1.05, -0.72);
  AU.fanfare();
  bus.shake(0.6);
  particles.burst(ch.x, groundY(ch.x, ch.z) + 1.2, ch.z, 22,
    { color: 0xffd94a, size: 0.4, ttl: 1.1, vy: 2.6, spread: 2.6 });
  S.stats.chests++;

  const roll = Math.random();
  if (roll < 0.24) {
    grant('doubloons');
    bus.banner('GOLD DOUBLOONS', 'rich, and considerably slower');
    say('I am rich! I am so slow, but I am rich!', true);
  } else if (roll < 0.44) {
    grant('boots');
    bus.banner("PIRATE'S BOOTS", 'the sand cannot reach you. everyone can hear you.');
  } else if (roll < 0.60) {
    grant('compass');
    bus.banner('CURSED COMPASS', 'it is not wrong. it is mean.');
    say('why would it point THERE.', true);
  } else if (roll < 0.78) {
    // an enormous crab lives here and is furious about the intrusion
    spawnAngryCrab(ch.x, ch.z);
    bus.banner('A CRAB', 'an enormous, furious crab');
    say('AH! AH! THAT IS A BIG CRAB!', true);
  } else {
    grant('mapfrag');
  }
}
function spawnAngryCrab(x, z) {
  const g = new THREE.Group();
  const body = meshOf(new THREE.SphereGeometry(0.8, 10, 8), 0xd9502f);
  body.scale.set(1.25, 0.62, 1); body.position.y = 0.55; g.add(body);
  for (const side of [-1, 1]) {
    const claw = meshOf(new THREE.BoxGeometry(0.55, 0.34, 0.34), 0xe4633f);
    claw.position.set(side * 1.15, 0.55, 0.5); g.add(claw);
    for (let i = 0; i < 3; i++) {
      const leg = meshOf(new THREE.CylinderGeometry(0.07, 0.05, 0.8, 4), 0xc4452a, { outline: false });
      leg.rotation.z = side * 0.9; leg.position.set(side * 0.85, 0.3, -0.3 - i * 0.4); g.add(leg);
    }
  }
  for (const side of [-1, 1]) {
    const eye = meshOf(new THREE.SphereGeometry(0.13, 6, 6), 0x201a1a, { outline: false });
    eye.position.set(side * 0.28, 1.0, 0.55); g.add(eye);
  }
  g.position.set(x, groundY(x, z), z);
  levelGroup.add(g);
  S.crabs.push({ x, z, mesh: g, t: 0, cool: 0 });
  AU.crab();
}
function updateAngryCrabs(dt, runner) {
  for (const c of S.crabs) {
    c.t += dt;
    const dx = runner.x - c.x, dz = runner.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.2 && d < 42) {
      const sp = 4.6;
      c.x += dx / d * sp * dt;
      c.z += dz / d * sp * dt;
    }
    // crabs go sideways, obviously
    c.mesh.position.set(c.x, groundY(c.x, c.z) + Math.abs(Math.sin(c.t * 12)) * 0.12, c.z);
    c.mesh.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
    c.cool -= dt;
    if (d < 1.9 && c.cool <= 0) {
      c.cool = 1.6;
      S.health -= 7;
      const a = Math.atan2(-dx, -dz);
      runner.kx += Math.sin(a) * 11; runner.kz += Math.cos(a) * 11;
      runner.trip('stumble', '\u{1F980} THE CRAB HAS YOU');
      AU.crab(); AU.thwack();
      say('OW! OW! LET GO!', true);
    }
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
export function checkChests(dt, runner) {
  updateAngryCrabs(dt, runner);
  for (const ch of S.chests) {
    if (ch.opened) continue;
    ch.mesh.children[4].position.y = 2.1 + Math.sin(S.t * 2) * 0.18;
    if (Math.hypot(runner.x - ch.x, runner.z - ch.z) < 2.6) openChest(ch, runner);
  }
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
  S.coolPads = []; S.guilt = 0; S.prophet = null;
  S.chests = []; S.crabs = [];
  if (S.rescue) { levelGroup.remove(S.rescue.mesh); levelGroup.remove(S.rescue.marker); }
  S.rescue = null; S.shoes = 0; S.keysUsed = false;
  particles.clear(); prints.clear();

  S.seed = Math.floor(Math.random() * 90000) + 10000;
  seedNoise(S.seed);
  const rng = mulberry32(S.seed ^ 0x5EED);

  applyWeather(pickWeather(rng));
  S.windDir = rng() * Math.PI * 2;
  rebuildTerrain();
  resetTide();
  buildScenery(rng);
  buildSanderlings();

  // ---- goal
  let gk = S.forceGoal;
  if (!gk) {
    if (S.islandPending) { gk = 'island'; S.islandPending = false; S.isIsland = true; }
    else if (S.level === 1) gk = 'truck';
    else if (rng() < 0.16) gk = 'nursery';
    else {
      const pool = ['truck', 'flipflops', 'shower', 'umbrella', 'tidepools'];
      gk = pool[Math.floor(rng() * pool.length)];
    }
  }
  if (gk !== 'island') S.isIsland = false;
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
  const legs = 5;
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

  // ---- the chest: always well off the sensible line, out in the hot dunes
  if (!S.isIsland && rng() < 0.45) {
    const cx = lerp(W.startX, W.goalX, 0.2 + rng() * 0.6);
    S.chests.push(buildChest(cx, 22 + rng() * 8));
  }

  // the Wash Prophet stands apart from everything, somewhere along the way
  const px = lerp(W.startX, W.goalX, 0.25 + rng() * 0.5);
  spawnProphet(px, clamp(-4 + rng() * 6, W.zMin + 2, 8));

  // a couple of willet groups doze on the open sand as tripwires
  for (let i = 0; i < 2; i++) {
    const wx = lerp(W.startX, W.goalX, 0.2 + rng() * 0.6);
    spawnWillets(wx, clamp(4 + rng() * 14, -2, 22), 3);
  }

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
