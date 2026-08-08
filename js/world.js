// ============================================================
// world.js — terrain, the heat field, ocean, sky, weather
// ============================================================
import * as THREE from 'three';
import { clamp, lerp, smoothstep, noise2, fbm, toon, meshOf, faceSprite, mulberry32 } from './engine.js';
import { S, W, effHeat } from './state.js';

// ---------------- weather characters ----------------
export const WEATHER = {
  clear:   { key: 'clear',   name: 'A NICE DAY',   heat: 1.00, aggro: 1.00, wash: 0,
             sky: [0x8fd0ff, 0xdff2ff], fog: [90, 340], fogC: 0xd8eeff, light: 0xfff4dc, amb: 1.05, sun: 'smug' },
  noon:    { key: 'noon',    name: 'HIGH NOON',    heat: 1.34, aggro: 1.00, wash: -1,
             sky: [0x7ec8ff, 0xfff0d0], fog: [100, 360], fogC: 0xffeed0, light: 0xffffff, amb: 1.25, sun: 'rage' },
  marine:  { key: 'marine',  name: 'MARINE LAYER', heat: 0.70, aggro: 1.15, wash: 0,
             sky: [0x9aa8b2, 0xc8d2d8], fog: [16, 78],  fogC: 0xc2ccd4, light: 0xdfe6ec, amb: 0.85, sun: 'hidden' },
  golden:  { key: 'golden',  name: 'GOLDEN HOUR',  heat: 0.80, aggro: 1.70, wash: 0,
             sky: [0xff9a4d, 0xffd9a0], fog: [70, 300], fogC: 0xffc98a, light: 0xffbb66, amb: 0.95, sun: 'sleepy' },
  lowtide: { key: 'lowtide', name: 'LOW TIDE',     heat: 1.08, aggro: 1.30, wash: 5,
             sky: [0x8fd0ff, 0xdff2ff], fog: [90, 340], fogC: 0xd8eeff, light: 0xfff4dc, amb: 1.05, sun: 'smug' },
  drizzle: { key: 'drizzle', name: 'DRIZZLE',      heat: 0.66, aggro: 0.80, wash: 1,
             sky: [0x8f9fb0, 0xb8c6d2], fog: [30, 130], fogC: 0xaebcca, light: 0xcfd8e2, amb: 0.9, sun: 'hidden' },
  // a prankster: shoves you sideways in gusts and scatters loose gear
  wind:    { key: 'wind',    name: 'THE WIND',     heat: 0.88, aggro: 0.9,  wash: 1,  gust: 1,
             sky: [0x9cc4e4, 0xd6e6f2], fog: [60, 260], fogC: 0xd2e2ee, light: 0xf2f0e4, amb: 1.0, sun: 'smug' },
  // no visible weather at all. everything just cools worse. it's not the heat.
  humid:   { key: 'humid',   name: 'THE HUMIDITY', heat: 1.12, aggro: 1.15, wash: 0,  coolMul: 0.55,
             sky: [0xb9c7c0, 0xe4e2cf], fog: [40, 190], fogC: 0xdcdcc8, light: 0xf0ecd8, amb: 1.1, sun: 'sleepy' },
};
const WEATHER_POOL = [
  ['clear', 26], ['noon', 19], ['marine', 13], ['golden', 12],
  ['lowtide', 11], ['drizzle', 8], ['wind', 12], ['humid', 10],
];

// ---------------- scene ----------------
export const scene = new THREE.Scene();
export const hemi = new THREE.HemisphereLight(0xfff4dc, 0x9c8a66, 1.05);
export const sunLight = new THREE.DirectionalLight(0xffffff, 1.15);
sunLight.position.set(50, 80, -30);
scene.add(hemi, sunLight);
scene.fog = new THREE.Fog(0xd8eeff, 90, 340);

// sky dome (gradient)
const skyGeo = new THREE.SphereGeometry(480, 24, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x8fd0ff) }, bot: { value: new THREE.Color(0xdff2ff) } },
  vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, clamp(h*1.15+0.15,0.0,1.0)), 1.0); }',
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

// ---------------- terrain height ----------------
export function groundY(x, z) {
  let y = (z - W.zMin) * 0.05;
  const d = smoothstep(15, 30, z);
  if (d > 0) y += d * (1.2 + 3.2 * noise2(x * 0.022 + 7, z * 0.03 + 3));
  y += smoothstep(-8, 6, z) * 0.16 * noise2(x * 0.16, z * 0.16);
  return y;
}
const flatY = (z) => (z - W.zMin) * 0.05;

// ---------------- the wave metronome ----------------
export let waveZ = W.zMin;
const WET0 = -18, WET_ROWS = 34;
const wetAt = new Float32Array(WET_ROWS).fill(-999);
export function waveLine(t) {
  const s = (Math.sin(t * 0.42) * 0.62 + Math.sin(t * 0.26 + 2.1) * 0.38 + 1) / 2;
  return W.zMin + 13 * Math.pow(s, 1.5) + (S.weather ? S.weather.wash : 0) + (S.ev ? S.ev.surge : 0);
}
export function updateTide(t) {
  waveZ = waveLine(t);
  for (let r = 0; r < WET_ROWS; r++) if (WET0 + r <= waveZ) wetAt[r] = t;
}
export function wetness(z, t) {
  if (z <= waveZ) return 1;
  const r = Math.floor(z - WET0);
  if (r < 0) return 1;
  if (r >= WET_ROWS) return 0;
  return clamp(1 - (t - wetAt[r]) / 11, 0, 1);
}

// ---------------- the heat field (this IS the level design) ----------------
/**
 * Cool corridors wind through scorching zones. Reading this map is the game;
 * the sand's colour is drawn from the exact same numbers, so what you see is
 * literally what burns you.
 */
const CELL = 15;
export function blobDensity() {
  // more and bigger patches as you climb — but never a wall-to-wall inferno
  const lava = S.diff.lava ?? 1;
  return clamp((0.24 + 0.07 * (S.level - 1)) * lava, 0, 0.86);
}
/** Discrete scorching patches. You can see each one coming and go around it. */
function blobHeat(x, z) {
  const density = blobDensity();
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  let hot = 0;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const gx = cx + i, gz = cz + j;
      if (noise2(gx * 12.9 + 21.3, gz * 5.7 + 31.1) > density) continue;  // cell stays cool
      const ox = noise2(gx * 7.3 + 0.7, gz * 3.1 + 1.9);
      const oz = noise2(gx * 3.7 + 11.3, gz * 9.1 + 5.3);
      const sz = noise2(gx * 5.1 + 41.7, gz * 7.9 + 17.3);
      const bx = (gx + 0.18 + ox * 0.64) * CELL;
      const bz = (gz + 0.18 + oz * 0.64) * CELL;
      const rad = 3.4 + sz * 5.2;
      const d = Math.hypot(x - bx, z - bz);
      if (d < rad) hot = Math.max(hot, smoothstep(1, 0.5, d / rad));
    }
  }
  return hot;
}
export function baseHeat(x, z) {
  // Mostly pleasant sand, with puddles of lava in it.
  let h = 0.14 + (fbm(x * 0.05 + 41, z * 0.06 + 13) - 0.5) * 0.16;
  h += blobHeat(x, z) * 1.04;
  h += smoothstep(6, 26, z) * 0.16;                 // dunes run warmer
  h -= smoothstep(6, -4, z) * 0.08;                 // the wash is kind
  return clamp(h, 0.02, 1.6);
}
export function shadeAt(x, z) {
  const ev = S.ev;
  if (!ev) return 0;
  let s = 0;
  for (const c of ev.clouds) {
    const d = Math.hypot(x - c.x, z - c.z);
    if (d < c.r) s = Math.max(s, 1 - d / c.r);
  }
  return s;
}
export function heatAt(x, z, t) {
  if (z <= waveEdgeAt(x, t)) return -1;             // in the water
  let h = baseHeat(x, z) * (1 - 0.94 * wetness(z, t));
  const ev = S.ev;
  if (ev && ev.focus && ev.focus.armed) {
    const d = Math.hypot(x - ev.focus.x, z - ev.focus.z);
    if (d < ev.focus.r) h += 0.85 * (1 - d / ev.focus.r);
  }
  h -= shadeAt(x, z) * 0.55;
  // packed damp sand around the sandcastles, and whatever the kite is lying on
  for (const p of S.coolPads) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r) h -= 0.85 * (1 - d / p.r);
  }
  return h;
}

// ---------------- sand mesh ----------------
const SAND_W = 580, SAND_D = 62, SEG_X = 224, SEG_Z = 44;
const sandGeo = new THREE.PlaneGeometry(SAND_W, SAND_D, SEG_X, SEG_Z);
sandGeo.rotateX(-Math.PI / 2);
sandGeo.translate(0, 0, (W.zMin + W.zMax) / 2 + 1);
sandGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sandGeo.attributes.position.count * 3), 3));
const sandMesh = new THREE.Mesh(sandGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
sandMesh.receiveShadow = true;
scene.add(sandMesh);

function refreshSandHeights() {
  const pos = sandGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundY(pos.getX(i), pos.getZ(i)));
  pos.needsUpdate = true;
  sandGeo.computeVertexNormals();
}

const C_COOL = [1.00, 0.97, 0.86];   // bleached, safe
const C_WARM = [0.99, 0.72, 0.36];   // getting spicy
const C_HOT  = [0.93, 0.20, 0.09];   // do not stand here
const C_WET  = [0.44, 0.36, 0.29];
export function paintSand(t) {
  const pos = sandGeo.attributes.position, col = sandGeo.attributes.color;
  const eh = effHeat();
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.0);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const w = wetness(z, t);
    let h = baseHeat(x, z) * eh;
    const ev = S.ev;
    if (ev && ev.focus && ev.focus.armed) {
      const d = Math.hypot(x - ev.focus.x, z - ev.focus.z);
      if (d < ev.focus.r) h += 0.9 * (1 - d / ev.focus.r);
    }
    let r, g, b;
    // strong contrast: the colour IS the tell, so it must be unmissable
    const k = clamp((h - 0.26) / 0.58, 0, 1);
    if (k < 0.5) {
      const u = k / 0.5;
      r = lerp(C_COOL[0], C_WARM[0], u); g = lerp(C_COOL[1], C_WARM[1], u); b = lerp(C_COOL[2], C_WARM[2], u);
    } else {
      const u = (k - 0.5) / 0.5;
      r = lerp(C_WARM[0], C_HOT[0], u); g = lerp(C_WARM[1], C_HOT[1], u); b = lerp(C_WARM[2], C_HOT[2], u);
      if (k > 0.72) { const s = (k - 0.72) / 0.28 * pulse * 0.16; r += s; g += s * 0.35; }   // shimmer
    }
    if (w > 0) { r = lerp(r, C_WET[0], w); g = lerp(g, C_WET[1], w); b = lerp(b, C_WET[2], w); }
    const sh = shadeAt(x, z);
    if (sh > 0) { const f = 1 - sh * 0.42; r *= f; g *= f; b *= f * 1.04; }
    col.setXYZ(i, r, g, b);
  }
  col.needsUpdate = true;
}

// ---------------- ocean + wash + foam (a living shoreline) ----------------
/** the water's edge wobbles along the beach instead of being a ruled line */
export function waveEdgeAt(x, t) {
  return waveZ + Math.sin(x * 0.125 + t * 1.7) * 0.85 + Math.sin(x * 0.043 - t * 1.1) * 0.5;
}
const STRIP_SEG = 150, STRIP_X0 = -292, STRIP_X1 = 292;
/** A band that follows the wavy shoreline: near edge and far edge per column. */
function strip(color, opacity, order) {
  const g = new THREE.BufferGeometry();
  const verts = new Float32Array((STRIP_SEG + 1) * 2 * 3);
  const idx = [];
  for (let i = 0; i < STRIP_SEG; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    idx.push(a, b, c, c, b, d);
  }
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false,
  }));
  m.renderOrder = order; scene.add(m);
  return m;
}
function setStrip(mesh, t, nearFn, farFn) {
  const p = mesh.geometry.attributes.position.array;
  for (let i = 0; i <= STRIP_SEG; i++) {
    const x = lerp(STRIP_X0, STRIP_X1, i / STRIP_SEG);
    const zn = nearFn(x), zf = farFn(x);
    p[i * 6 + 0] = x; p[i * 6 + 1] = flatY(zn) + 0.05; p[i * 6 + 2] = zn;
    p[i * 6 + 3] = x; p[i * 6 + 4] = flatY(zf) + 0.04; p[i * 6 + 5] = zf;
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}
const ocean = strip(0x1b7fb0, 1, 2);
const shallow = strip(0x3fb3cc, 0.8, 3);
const wash = strip(0x9fe8f4, 0.5, 4);
const foam = strip(0xffffff, 0.92, 5);

// rolling swell out past the break so the sea has motion
const swellGeo = new THREE.PlaneGeometry(640, 46, 96, 12);
swellGeo.rotateX(-Math.PI / 2);
const swell = new THREE.Mesh(swellGeo, toon(0x2a86b8));
swell.position.set(0, -0.9, -48);
scene.add(swell);

export function updateOcean(t) {
  const edge = (x) => waveEdgeAt(x, t);
  setStrip(ocean, t, edge, () => -75);
  setStrip(shallow, t, edge, (x) => edge(x) - 4.2);
  setStrip(wash, t, () => W.zMin - 1.6, edge);
  setStrip(foam, t, (x) => edge(x) - 0.85 - Math.sin(x * 0.3 + t * 3) * 0.25, edge);
  const pos = swellGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, Math.sin(x * 0.085 + t * 1.5) * 0.45 + Math.sin(z * 0.2 - t * 1.2) * 0.3);
  }
  pos.needsUpdate = true;
  swell.geometry.computeVertexNormals();
}

// ---------------- the Sun, a character ----------------
function drawSun(g, px, mood) {
  const c = px / 2;
  const body = mood === 'rage' ? '#ff6a22' : mood === 'sleepy' ? '#ffb347' : '#ffd93d';
  g.clearRect(0, 0, px, px);
  g.fillStyle = body;
  g.beginPath(); g.arc(c, c, px * 0.30, 0, Math.PI * 2); g.fill();
  g.strokeStyle = body; g.lineWidth = px * 0.035; g.lineCap = 'round';
  const rays = mood === 'rage' ? 16 : 12;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * px * 0.345, c + Math.sin(a) * px * 0.345);
    g.lineTo(c + Math.cos(a) * px * (mood === 'rage' ? 0.46 : 0.42), c + Math.sin(a) * px * (mood === 'rage' ? 0.46 : 0.42));
    g.stroke();
  }
  g.fillStyle = '#20141a';
  if (mood === 'sleepy') {
    g.lineWidth = px * 0.028; g.strokeStyle = '#20141a';
    g.beginPath(); g.arc(c - px * 0.10, c - px * 0.03, px * 0.06, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    g.beginPath(); g.arc(c + px * 0.10, c - px * 0.03, px * 0.06, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  } else {
    // sunglasses
    g.fillRect(c - px * 0.19, c - px * 0.075, px * 0.16, px * 0.085);
    g.fillRect(c + px * 0.03, c - px * 0.075, px * 0.16, px * 0.085);
    g.fillRect(c - px * 0.04, c - px * 0.05, px * 0.08, px * 0.022);
  }
  g.strokeStyle = '#20141a'; g.lineWidth = px * 0.03; g.lineCap = 'round';
  g.beginPath();
  if (mood === 'rage') g.arc(c, c + px * 0.14, px * 0.11, Math.PI * 1.15, Math.PI * 1.85);   // grin
  else g.arc(c - px * 0.03, c + px * 0.06, px * 0.11, Math.PI * 0.12, Math.PI * 0.58);        // smirk
  g.stroke();
}
export let sunSprite = faceSprite((g, px) => drawSun(g, px, 'smug'), 30);
sunSprite.position.set(60, 62, -120);
scene.add(sunSprite);
function setSunMood(mood) {
  scene.remove(sunSprite);
  sunSprite = faceSprite((g, px) => drawSun(g, px, mood), mood === 'rage' ? 40 : 30);
  sunSprite.position.set(60, 62, -120);
  sunSprite.visible = mood !== 'hidden';
  scene.add(sunSprite);
}

// ---------------- scenery (dunes, grass, palms) ----------------
export const sceneryGroup = new THREE.Group();
scene.add(sceneryGroup);

function duneGrass(x, z, rng) {
  const g = new THREE.Group();
  const n = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 1.1 + rng() * 0.8, 4), toon(0x8fae4e));
    blade.position.set((rng() - 0.5) * 0.9, 0.5, (rng() - 0.5) * 0.9);
    blade.rotation.z = (rng() - 0.5) * 0.7;
    g.add(blade);
  }
  g.position.set(x, groundY(x, z), z);
  return g;
}
function palm(x, z, rng) {
  const g = new THREE.Group();
  const t = meshOf(new THREE.CylinderGeometry(0.16, 0.3, 5.4, 6), 0x8a6242, { outlineScale: 1.12 });
  t.position.y = 2.7; t.rotation.z = 0.1; g.add(t);
  for (let i = 0; i < 7; i++) {
    const f = meshOf(new THREE.ConeGeometry(0.55, 3.0, 4), 0x3f8f4c, { outlineScale: 1.1 });
    const a = (i / 7) * Math.PI * 2;
    f.position.set(0.5 + Math.cos(a) * 1.3, 5.3, Math.sin(a) * 1.3);
    f.rotation.set(Math.PI / 2.2, 0, -a + Math.PI / 2);
    g.add(f);
  }
  g.position.set(x, groundY(x, z), z);
  g.rotation.y = rng() * 6.28;
  return g;
}
function lifeguardTower(x, z) {
  const g = new THREE.Group();
  for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) {
    const leg = meshOf(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 6), 0xd4443a, { outlineScale: 1.15 });
    leg.position.set(lx, 1.7, lz); g.add(leg);
  }
  const cab = meshOf(new THREE.BoxGeometry(2.9, 1.7, 2.9), 0xf3e9d2); cab.position.y = 4.15; g.add(cab);
  const roof = meshOf(new THREE.ConeGeometry(2.5, 1.1, 4), 0xd4443a); roof.position.y = 5.5; roof.rotation.y = Math.PI / 4; g.add(roof);
  const rail = meshOf(new THREE.BoxGeometry(3.2, 0.12, 0.12), 0xf3e9d2); rail.position.set(0, 3.5, 1.6); g.add(rail);
  g.position.set(x, groundY(x, z), z);
  return g;
}

// ---------------- heat haze ----------------
const hazeGroup = new THREE.Group();
scene.add(hazeGroup);
const hazeBars = [];
{
  const geo = new THREE.PlaneGeometry(2.2, 1.4);
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.visible = false; hazeGroup.add(m); hazeBars.push({ m, x: 0, z: 0, ph: Math.random() * 6.28 });
  }
}
/** Shimmer only where the sand is genuinely dangerous — an honest tell. */
export function updateHaze(t, px, pz) {
  const eh = effHeat();
  let i = 0;
  for (const b of hazeBars) {
    if (b.reroll === undefined || t > b.reroll) {
      b.reroll = t + 1.2 + Math.random() * 1.5;
      const ang = Math.random() * Math.PI * 2, r = 6 + Math.random() * 26;
      b.x = px + Math.cos(ang) * r; b.z = clamp(pz + Math.sin(ang) * r, W.zMin, W.zMax);
    }
    const h = baseHeat(b.x, b.z) * eh * (1 - wetness(b.z, t));
    if (h > 0.85) {
      b.m.visible = true;
      const y = groundY(b.x, b.z);
      b.m.position.set(b.x + Math.sin(t * 2 + b.ph) * 0.3, y + 0.7 + Math.sin(t * 1.5 + b.ph) * 0.2, b.z);
      b.m.material.opacity = 0.10 + 0.10 * Math.abs(Math.sin(t * 2.4 + b.ph));
    } else b.m.visible = false;
    i++;
  }
}
export function faceHaze(camera) { for (const b of hazeBars) if (b.m.visible) b.m.quaternion.copy(camera.quaternion); }

// ---------------- level setup ----------------
export function pickWeather(rng) {
  if (S.forceWeather) return WEATHER[S.forceWeather];
  if (S.level === 1) return WEATHER.clear;
  let tot = 0; for (const [, w] of WEATHER_POOL) tot += w;
  let roll = rng() * tot;
  for (const [k, w] of WEATHER_POOL) { roll -= w; if (roll <= 0) return WEATHER[k]; }
  return WEATHER.clear;
}
export function applyWeather(wx) {
  S.weather = wx;
  skyMat.uniforms.top.value.setHex(wx.sky[0]);
  skyMat.uniforms.bot.value.setHex(wx.sky[1]);
  scene.fog.color.setHex(wx.fogC);
  scene.fog.near = wx.fog[0]; scene.fog.far = wx.fog[1];
  hemi.intensity = wx.amb;
  sunLight.color.setHex(wx.light);
  sunLight.intensity = wx.key === 'marine' || wx.key === 'drizzle' ? 0.5 : 1.2;
  setSunMood(S.diffKey === 'august' && wx.sun !== 'hidden' ? 'rage' : wx.sun);
}
export function buildScenery(rng) {
  while (sceneryGroup.children.length) sceneryGroup.remove(sceneryGroup.children[0]);
  for (let i = 0; i < 110; i++) sceneryGroup.add(duneGrass(W.xMin + rng() * (W.xMax - W.xMin), 24 + rng() * 7, rng));
  for (let i = 0; i < 18; i++) sceneryGroup.add(palm(W.xMin + 10 + rng() * (W.xMax - W.xMin - 20), 27 + rng() * 4, rng));
  for (let i = 0; i < 4; i++) sceneryGroup.add(lifeguardTower(W.xMin + 40 + rng() * (W.xMax - W.xMin - 80), 21 + rng() * 3));
}
export function resetTide() { wetAt.fill(-999); }
export function rebuildTerrain() { refreshSandHeights(); }
