// ============================================================
// audio.js — everything synthesized, zero assets
// ============================================================
import { clamp, lerp } from './engine.js';

const STORE_KEY = 'dbyf_vol';
function loadVol() {
  const v = parseFloat(localStorage.getItem(STORE_KEY));
  return isNaN(v) ? 0.55 : clamp(v, 0, 1);
}

export const AU = {
  ctx: null, master: null, bus: null, surfGain: null, surfFilter: null,
  jingleAt: 0, jingleI: 0, beaconAt: 0,
  volume: loadVol(), muted: false,

  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Soft master chain: everything is synthesized square/saw, which is
      // fatiguing raw. Roll off the top end and squash the peaks so nothing
      // can ever stab, no matter how many cues land at once.
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.30;

      const tone = this.ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2100;
      tone.Q.value = 0.4;

      const shelf = this.ctx.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 1400;
      shelf.gain.value = -8;

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -26;
      comp.knee.value = 26;
      comp.ratio.value = 10;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;

      this.out = this.ctx.createGain();
      this.out.gain.value = this.muted ? 0 : this.volume;

      this.master.connect(tone); tone.connect(shelf); shelf.connect(comp);
      comp.connect(this.out); this.out.connect(this.ctx.destination);
      this._surf();
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    try { localStorage.setItem(STORE_KEY, String(this.volume)); } catch (e) { }
    if (this.out) this.out.gain.value = this.muted ? 0 : this.volume;
  },
  toggleMute() {
    this.muted = !this.muted;
    if (this.out) this.out.gain.value = this.muted ? 0 : this.volume;
    return this.muted;
  },

  _surf() {
    const ctx = this.ctx, len = 4 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.085;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.025;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.surfGain = g; this.surfFilter = lp;
  },
  /** surf gets louder/brighter as you near the water */
  surfProximity(k) {
    if (!this.surfGain) return;
    this.surfGain.gain.value = lerp(0.025, 0.085, clamp(k, 0, 1));
    this.surfFilter.frequency.value = lerp(300, 700, clamp(k, 0, 1));
  },

  tone(freq, dur, type = 'square', vol = 0.14, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  sweep(f0, f1, dur, type = 'sawtooth', vol = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur + 0.04);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.06);
  },
  noise(dur, freq, vol = 0.12, hp = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, len = Math.max(1, Math.floor(dur * ctx.sampleRate));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
  },

  // ---- gameplay sfx ----
  step(state, surface) {
    if (!this.ctx) return;
    if (surface === 'water') { this.noise(0.14, 1100, 0.07, true); return; }
    if (surface === 'wood') { this.tone(150, 0.06, 'triangle', 0.07); return; }
    this.tone(78 + state * 10, 0.06, 'triangle', 0.075);
    if (state >= 2) this.noise(0.05 + state * 0.03, 3000, 0.022 + state * 0.014, true);
  },
  hop() { this.sweep(280, 440, 0.14, 'triangle', 0.07); },
  land(hard) { this.tone(90, 0.09, 'triangle', hard ? 0.11 : 0.07); this.noise(0.1, 600, 0.04); },
  pickup() { this.tone(880, 0.09, 'triangle', 0.085); this.tone(1320, 0.11, 'triangle', 0.06, 0.05); },
  reject() { this.tone(220, 0.12, 'triangle', 0.07); this.tone(160, 0.16, 'triangle', 0.06, 0.08); },
  poof() { this.noise(0.22, 500, 0.06); },
  squeak() { this.tone(1400, 0.09, 'sine', 0.07); this.tone(1800, 0.12, 'sine', 0.055, 0.05); },
  thwack() { this.noise(0.09, 300, 0.13); this.tone(170, 0.14, 'triangle', 0.1); },
  splash(big) { this.noise(big ? 0.8 : 0.32, big ? 700 : 1000, big ? 0.09 : 0.055, true); },
  screech() { this.sweep(1400, 620, 0.4, 'triangle', 0.06); },
  gullCall() { for (let i = 0; i < 2; i++) setTimeout(() => this.sweep(1150, 780, 0.14, 'triangle', 0.045), i * 200); },
  bark(v = 0.075) { this.sweep(300, 175, 0.12, 'triangle', v); setTimeout(() => this.sweep(325, 165, 0.14, 'triangle', v), 170); },
  sizzle() { this.noise(0.5, 2600, 0.035, true); },
  crab() { for (let i = 0; i < 4; i++) this.tone(1000 + i * 120, 0.04, 'triangle', 0.05, i * 0.05); },
  scout() { this.tone(520, 0.1, 'sine', 0.06); this.tone(780, 0.13, 'sine', 0.05, 0.06); },
  shanty() { [392, 494, 587, 494, 587, 740].forEach((f, i) => this.tone(f, 0.17, 'triangle', 0.065, i * 0.12)); },
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.24, 'triangle', 0.07, i * 0.15)); },
  sad() { [392, 349, 262].forEach((f, i) => this.tone(f, 0.34, 'sine', 0.075, i * 0.26)); },
  tick() { this.tone(1000, 0.02, 'sine', 0.022); },
  coin() { this.tone(988, 0.06, 'triangle', 0.065); this.tone(1319, 0.13, 'triangle', 0.055, 0.05); },

  /** audio beacon for the level's goal — the navigation system */
  beacon(kind, dist) {
    if (!this.ctx || dist > 95) return;
    const ctx = this.ctx, v = clamp(1 - dist / 95, 0, 1);
    if (kind === 'jingle') {
      if (ctx.currentTime < this.jingleAt) return;
      const mel = [523, 659, 784, 659, 523, 659, 392, 0, 523, 659, 784, 880, 784, 659, 523, 0];
      const f = mel[this.jingleI++ % mel.length];
      this.jingleAt = ctx.currentTime + 0.22;
      if (f) this.tone(f, 0.17, 'triangle', 0.055 * v);
      return;
    }
    if (ctx.currentTime < this.beaconAt) return;
    if (kind === 'bark') { this.bark(0.06 * v); this.beaconAt = ctx.currentTime + 1.8; }
    else if (kind === 'horn') {                       // a big truck, two friendly honks
      this.tone(220, 0.16, 'triangle', 0.06 * v);
      this.tone(165, 0.2, 'triangle', 0.05 * v, 0.2);
      this.beaconAt = ctx.currentTime + lerp(3.2, 1.1, v);
    }
    else if (kind === 'alarm') {                      // the car keys' chirp
      this.tone(1400, 0.05, 'square', 0.04 * v);
      this.tone(1400, 0.05, 'square', 0.04 * v, 0.12);
      this.beaconAt = ctx.currentTime + lerp(2.8, 0.9, v);
    }
    else if (kind === 'drip') { this.tone(1200, 0.05, 'sine', 0.055 * v); this.tone(880, 0.06, 'sine', 0.045 * v, 0.06); this.beaconAt = ctx.currentTime + 1.2; }
    else if (kind === 'chime') { this.tone(1046, 0.14, 'sine', 0.05 * v); this.tone(1568, 0.16, 'sine', 0.035 * v, 0.09); this.beaconAt = ctx.currentTime + lerp(2.6, 0.9, v); }
    else { this.tone(980, 0.09, 'sine', 0.045 * v); this.beaconAt = ctx.currentTime + lerp(2.6, 0.7, v); }
  },
};

// ---------- the voice of a man in pain ----------
let voiceGate = 0;
export function say(text, force) {
  const now = performance.now() / 1000;
  if (!force && now - voiceGate < 2.6) return;
  voiceGate = now;
  try {
    if (!window.speechSynthesis) return;
    if (speechSynthesis.speaking) { if (!force) return; speechSynthesis.cancel(); }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.4; u.pitch = 0.8 + Math.random() * 0.45; u.volume = 0.95;
    speechSynthesis.speak(u);
  } catch (e) { }
}

export const OW = [
  ['ooh. warm.', 'toasty.', 'hm. spicy sand.'],
  ['ow ow ow ow', 'ow. ow. OW.', 'hot hot hot'],
  ['HOT HOT HOT HOT', 'WHY IS SAND', 'BAD BEACH! BAD!'],
  ['MY FEET ARE ON FIRE', 'I AM A TORCH', 'EVERYTHING IS PAIN'],
];
