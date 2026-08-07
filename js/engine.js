// ============================================================
// engine.js — math, noise, toon materials, particles, decals
// ============================================================
import * as THREE from 'three';

// ---------- math ----------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
export function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------- seeded rng ----------
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- value noise ----------
let perm = new Uint8Array(512);
export function seedNoise(seed) {
  const rng = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const hash2 = (ix, iz) => perm[(perm[ix & 255] + (iz & 255)) & 255] / 255;
export function noise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  const u = fade(fx), v = fade(fz);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  return noise2(x, z) * 0.6 + noise2(x * 2.1 + 5.3, z * 2.1 + 9.1) * 0.3 + noise2(x * 4.3, z * 4.3) * 0.1;
}

// ---------- toon look ----------
let gradTex = null;
function gradientMap() {
  if (gradTex) return gradTex;
  const c = document.createElement('canvas'); c.width = 4; c.height = 1;
  const g = c.getContext('2d');
  const steps = ['#6b6b78', '#a9a9b4', '#dedee6', '#ffffff'];
  steps.forEach((s, i) => { g.fillStyle = s; g.fillRect(i, 0, 1, 1); });
  gradTex = new THREE.CanvasTexture(c);
  gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
  gradTex.generateMipmaps = false;
  return gradTex;
}
/** Toon material — the whole game's look lives here. */
export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({
    color, gradientMap: gradientMap(),
    emissive: opts.emissive || 0x000000,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity !== undefined ? opts.opacity : 1,
    side: opts.side || THREE.FrontSide,
  });
}
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x1a1016, side: THREE.BackSide });
/** Cheap cartoon outline: an inverted-hull copy behind the mesh. */
export function outline(mesh, scale = 1.07) {
  const o = new THREE.Mesh(mesh.geometry, OUTLINE_MAT);
  o.scale.multiplyScalar(scale);
  o.renderOrder = -1;
  mesh.add(o);
  return mesh;
}
export function meshOf(geo, color, opts) {
  const m = new THREE.Mesh(geo, toon(color, opts));
  if (!opts || opts.outline !== false) outline(m, (opts && opts.outlineScale) || 1.07);
  return m;
}

// ---------- soft round sprite texture ----------
let puffTex = null;
export function puffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

// ---------- particles ----------
export class Particles {
  constructor(scene, count = 220) {
    this.pool = []; this.live = [];
    const tex = puffTexture();
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.visible = false; scene.add(s); this.pool.push(s);
    }
  }
  spawn(x, y, z, opts = {}) {
    const s = this.pool.pop();
    if (!s) return;
    s.visible = true;
    s.position.set(x, y, z);
    s.material.color.setHex(opts.color !== undefined ? opts.color : 0xffffff);
    s.material.opacity = opts.opacity !== undefined ? opts.opacity : 0.85;
    const sc = opts.size || 0.5;
    s.scale.setScalar(sc);
    this.live.push({
      s, life: 0, ttl: opts.ttl || 0.8,
      vx: opts.vx || 0, vy: opts.vy !== undefined ? opts.vy : 1.2, vz: opts.vz || 0,
      grow: opts.grow !== undefined ? opts.grow : 1.6, size: sc,
      fade: opts.fade !== undefined ? opts.fade : 1, drag: opts.drag || 0.6,
    });
  }
  burst(x, y, z, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * (opts.spread || 1.4);
      this.spawn(x, y, z, Object.assign({}, opts, {
        vx: Math.cos(a) * r + (opts.vx || 0),
        vz: Math.sin(a) * r + (opts.vz || 0),
        vy: (opts.vy !== undefined ? opts.vy : 1.2) * (0.6 + Math.random() * 0.8),
        size: (opts.size || 0.5) * (0.7 + Math.random() * 0.6),
      }));
    }
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life += dt;
      const k = p.life / p.ttl;
      if (k >= 1) {
        p.s.visible = false; this.pool.push(p.s); this.live.splice(i, 1); continue;
      }
      const d = Math.exp(-p.drag * dt * 4);
      p.vx *= d; p.vz *= d;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.s.scale.setScalar(p.size * (1 + k * p.grow));
      p.s.material.opacity = (1 - k) * p.fade * 0.9;
    }
  }
  clear() {
    for (const p of this.live) { p.s.visible = false; this.pool.push(p.s); }
    this.live.length = 0;
  }
}

// ---------- footprint decals ----------
export class Footprints {
  constructor(scene, count = 60) {
    this.pool = []; this.live = [];
    const geo = new THREE.PlaneGeometry(0.26, 0.44);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0, depthWrite: false,
      }));
      m.visible = false; m.renderOrder = 3; scene.add(m); this.pool.push(m);
    }
  }
  stamp(x, y, z, rot, color, strength) {
    const m = this.pool.pop();
    if (!m) return;
    m.visible = true;
    m.position.set(x, y + 0.02, z);
    m.rotation.y = rot;
    m.material.color.setHex(color);
    m.material.opacity = strength;
    this.live.push({ m, life: 0, ttl: 6, str: strength });
  }
  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      f.life += dt;
      const k = f.life / f.ttl;
      if (k >= 1) { f.m.visible = false; this.pool.push(f.m); this.live.splice(i, 1); continue; }
      f.m.material.opacity = f.str * (1 - k);
    }
  }
  clear() {
    for (const f of this.live) { f.m.visible = false; this.pool.push(f.m); }
    this.live.length = 0;
  }
}

// ---------- billboard emoji/text sprite ----------
export function emojiSprite(char, size = 1.6) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '96px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(char, 64, 70);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  s.scale.setScalar(size);
  return s;
}

/** A face drawn on a canvas — for the Sun and weather characters. */
export function faceSprite(draw, size, px = 256) {
  const c = document.createElement('canvas'); c.width = c.height = px;
  draw(c.getContext('2d'), px);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, fog: false, depthWrite: false,
  }));
  s.scale.setScalar(size);
  return s;
}
