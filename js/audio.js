// ============================================================
// audio.js — everything synthesized, zero assets
// ============================================================
import { clamp, lerp } from './engine.js';

export const AU = {
  ctx: null, master: null, surfGain: null, surfFilter: null,
  jingleAt: 0, jingleI: 0, beaconAt: 0,

  ensure() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.75;
      this.master.connect(this.ctx.destination);
      this._surf();
    } catch (e) { this.ctx = null; }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  _surf() {
    const ctx = this.ctx, len = 4 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain(); g.gain.value = 0.11;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.085;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.055;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(); lfo.start();
    this.surfGain = g; this.surfFilter = lp;
  },
  /** surf gets louder/brighter as you near the water */
  surfProximity(k) {
    if (!this.surfGain) return;
    this.surfGain.gain.value = lerp(0.05, 0.20, clamp(k, 0, 1));
    this.surfFilter.frequency.value = lerp(320, 900, clamp(k, 0, 1));
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
    if (surface === 'water') { this.noise(0.14, 1400, 0.13, true); return; }
    if (surface === 'wood') { this.tone(150, 0.06, 'triangle', 0.11); return; }
    this.tone(78 + state * 10, 0.06, 'triangle', 0.12);
    if (state >= 2) this.noise(0.05 + state * 0.035, 4200, 0.045 + state * 0.028, true);
  },
  hop() { this.sweep(280, 460, 0.14, 'triangle', 0.11); },
  land(hard) { this.tone(90, 0.09, 'triangle', hard ? 0.2 : 0.11); this.noise(0.1, 700, 0.07); },
  pickup() { this.tone(880, 0.08, 'square', 0.11); this.tone(1320, 0.11, 'square', 0.1, 0.05); },
  reject() { this.tone(220, 0.12, 'square', 0.1); this.tone(160, 0.16, 'square', 0.1, 0.08); },
  poof() { this.noise(0.22, 600, 0.1); },
  squeak() { this.tone(1900, 0.09, 'sine', 0.13); this.tone(2500, 0.12, 'sine', 0.1, 0.05); },
  thwack() { this.noise(0.09, 320, 0.28); this.tone(170, 0.14, 'square', 0.18); },
  splash(big) { this.noise(big ? 0.8 : 0.32, big ? 800 : 1300, big ? 0.2 : 0.11, true); },
  screech() { this.sweep(2500, 680, 0.45, 'sawtooth', 0.1); },
  gullCall() { for (let i = 0; i < 3; i++) setTimeout(() => this.sweep(1600, 900, 0.13, 'sawtooth', 0.07), i * 170); },
  bark(v = 0.13) { this.sweep(300, 175, 0.12, 'sawtooth', v); setTimeout(() => this.sweep(325, 165, 0.14, 'sawtooth', v), 165); },
  sizzle() { this.noise(0.5, 5200, 0.09, true); },
  crab() { for (let i = 0; i < 4; i++) this.tone(1400 + i * 180, 0.04, 'square', 0.09, i * 0.045); },
  scout() { this.tone(520, 0.09, 'sine', 0.09); this.tone(780, 0.12, 'sine', 0.08, 0.06); },
  shanty() { [392, 494, 587, 494, 587, 740].forEach((f, i) => this.tone(f, 0.16, 'square', 0.13, i * 0.11)); },
  fanfare() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.2, 'square', 0.15, i * 0.13)); },
  sad() { [392, 370, 349, 175].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, i * 0.22)); },
  tick() { this.tone(1500, 0.025, 'square', 0.05); },
  coin() { this.tone(988, 0.06, 'square', 0.12); this.tone(1319, 0.14, 'square', 0.12, 0.05); },

  /** audio beacon for the level's goal — the navigation system */
  beacon(kind, dist) {
    if (!this.ctx || dist > 95) return;
    const ctx = this.ctx, v = clamp(1 - dist / 95, 0, 1);
    if (kind === 'jingle') {
      if (ctx.currentTime < this.jingleAt) return;
      const mel = [523, 659, 784, 659, 523, 659, 392, 0, 523, 659, 784, 880, 784, 659, 523, 0];
      const f = mel[this.jingleI++ % mel.length];
      this.jingleAt = ctx.currentTime + 0.2;
      if (f) this.tone(f, 0.17, 'square', 0.15 * v);
      return;
    }
    if (ctx.currentTime < this.beaconAt) return;
    if (kind === 'bark') { this.bark(0.12 * v); this.beaconAt = ctx.currentTime + 1.6; }
    else if (kind === 'drip') { this.tone(1200, 0.05, 'sine', 0.11 * v); this.tone(880, 0.06, 'sine', 0.09 * v, 0.06); this.beaconAt = ctx.currentTime + 1.0; }
    else if (kind === 'chime') { this.tone(1046, 0.14, 'sine', 0.1 * v); this.tone(1568, 0.16, 'sine', 0.07 * v, 0.09); this.beaconAt = ctx.currentTime + lerp(2.4, 0.7, v); }
    else { this.tone(980, 0.09, 'sine', 0.09 * v); this.beaconAt = ctx.currentTime + lerp(2.4, 0.55, v); }
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
