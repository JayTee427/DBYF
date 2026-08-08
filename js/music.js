// ============================================================
// music.js — a surf-rock score, synthesized live. No assets.
//
// Runs a lookahead scheduler over a 16-step bar: walking bass, brushed
// drums, and a twangy reverb-drenched lead. It reads the weather for its
// mood and your predicament for its intensity, so the beach scores itself.
// Everything routes through AU.master, so the volume slider and mute
// already own it.
// ============================================================
import { clamp, lerp } from './engine.js';

// E natural minor / pentatonic — the surf key
const ROOTS = { E: 82.41, C: 65.41, G: 98.00, D: 73.42, A: 110.00 };
const PROG = ['E', 'C', 'G', 'D'];                 // i – VI – III – VII
const PENT = { E: [329.63, 392.00, 440.00, 493.88, 587.33],
               C: [261.63, 329.63, 392.00, 440.00, 523.25],
               G: [392.00, 440.00, 493.88, 587.33, 659.25],
               D: [293.66, 349.23, 392.00, 440.00, 523.25] };

/** Per-weather character. Everything here is deliberately gentle. */
const MOODS = {
  clear:   { bpm: 118, drums: 1.00, lead: 1.00, verb: 0.30, detune: 0, swing: 0.06 },
  noon:    { bpm: 132, drums: 1.10, lead: 1.05, verb: 0.22, detune: 0, swing: 0.03 },
  marine:  { bpm: 92,  drums: 0.45, lead: 0.70, verb: 0.60, detune: -4, swing: 0.10 },
  drizzle: { bpm: 88,  drums: 0.40, lead: 0.62, verb: 0.62, detune: -6, swing: 0.12 },
  golden:  { bpm: 104, drums: 0.80, lead: 1.05, verb: 0.45, detune: 0, swing: 0.10 },
  lowtide: { bpm: 112, drums: 0.90, lead: 0.95, verb: 0.35, detune: 0, swing: 0.07 },
  wind:    { bpm: 124, drums: 0.95, lead: 0.90, verb: 0.40, detune: 3, swing: 0.05 },
  humid:   { bpm: 86,  drums: 0.60, lead: 0.70, verb: 0.50, detune: -9, swing: 0.14 },
  title:   { bpm: 96,  drums: 0.55, lead: 0.85, verb: 0.55, detune: 0, swing: 0.12 },
};

export const MUSIC = {
  ctx: null, bus: null, verbIn: null, on: true, playing: false,
  step: 0, nextAt: 0, timer: null,
  mood: MOODS.title, targetMood: MOODS.title,
  intensity: 0, targetIntensity: 0,
  level: 0.55,

  init(ctx, destination) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;                       // faded in on start

    // a cheap surf plate: short feedback delay under a lowpass
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.098;
    const fb = ctx.createGain(); fb.gain.value = 0.34;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass'; damp.frequency.value = 1700;
    const verbSend = ctx.createGain(); verbSend.gain.value = 0.35;
    delay.connect(damp); damp.connect(fb); fb.connect(delay);
    verbSend.connect(delay); delay.connect(this.bus);
    this.verbIn = verbSend;

    this.bus.connect(destination);
    try { this.on = localStorage.getItem('dbyf_music') !== '0'; } catch { }
  },

  setMood(key) {
    this.targetMood = MOODS[key] || MOODS.clear;
    if (!this.playing) this.mood = this.targetMood;
  },
  /** 0 = strolling, 1 = feet on fire and the sky full of gulls */
  setIntensity(v) { this.targetIntensity = clamp(v, 0, 1); },

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('dbyf_music', this.on ? '1' : '0'); } catch { }
    if (!this.on) this.fade(0, 0.4);
    else if (this.playing) this.fade(this.level, 0.8);
    return this.on;
  },
  fade(to, secs) {
    if (!this.bus) return;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(to, t + secs);
  },

  start(moodKey) {
    if (!this.ctx) return;
    this.setMood(moodKey);
    this.mood = this.targetMood;
    if (this.playing) { this.fade(this.on ? this.level : 0, 1.2); return; }
    this.playing = true;
    this.step = 0;
    this.nextAt = this.ctx.currentTime + 0.08;
    this.fade(this.on ? this.level : 0, 1.4);
    this._loop();
  },
  stop(secs = 0.9) {
    this.fade(0, secs);
    this.playing = false;
    clearTimeout(this.timer);
  },

  _loop() {
    if (!this.playing) return;
    // ease mood + intensity so transitions never lurch
    const m = this.mood, t = this.targetMood;
    for (const k of ['bpm', 'drums', 'lead', 'verb', 'detune', 'swing']) {
      m[k] = lerp(m[k], t[k], 0.06);
    }
    this.intensity = lerp(this.intensity, this.targetIntensity, 0.05);

    const bpm = m.bpm * lerp(1, 1.16, this.intensity);
    const stepDur = 60 / bpm / 4;                   // sixteenths
    while (this.nextAt < this.ctx.currentTime + 0.18) {
      this._schedule(this.step, this.nextAt, stepDur);
      this.step = (this.step + 1) % 64;             // four bars
      const swung = (this.step % 2) ? m.swing * stepDur : -m.swing * stepDur;
      this.nextAt += stepDur + swung;
    }
    this.timer = setTimeout(() => this._loop(), 35);
  },

  _voice(type, freq, at, dur, vol, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(dest || this.bus);
    o.start(at); o.stop(at + dur + 0.03);
    return { o, g };
  },
  _noise(at, dur, freq, vol, hp) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(dur * ctx.sampleRate));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = hp ? 'highpass' : 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.bus);
    src.start(at);
  },

  _schedule(step, at, stepDur) {
    const m = this.mood;
    const bar = Math.floor(step / 16);
    const chord = PROG[bar % PROG.length];
    const root = ROOTS[chord] * Math.pow(2, m.detune / 1200);
    const s = step % 16;
    const I = this.intensity;

    // ---- bass: driving surf eighths on the root, walking up at the turn
    if (s % 2 === 0) {
      const walk = (s === 12) ? 1.122 : (s === 14) ? 1.26 : 1;
      const vol = 0.085 * lerp(0.85, 1.15, I);
      this._voice('triangle', root * walk, at, stepDur * 1.7, vol);
    }

    // ---- drums
    const dv = m.drums;
    if (dv > 0.2) {
      if (s === 0 || s === 6 || s === 8 || (s === 14 && I > 0.4)) {
        // kick: a pitch-dropping thump
        const k = this._voice('sine', 96, at, 0.16, 0.10 * dv);
        k.o.frequency.exponentialRampToValueAtTime(42, at + 0.11);
      }
      if (s === 4 || s === 12) this._noise(at, 0.13, 1500, 0.045 * dv, true);   // snare
      if (s % 2 === 0 || I > 0.55) this._noise(at, 0.03, 6000, 0.012 * dv, true); // hats
      // a little tom fill going into the loop when things are hairy
      if (I > 0.6 && bar === 3 && s >= 12) {
        const f = this._voice('sine', 180 - (s - 12) * 22, at, 0.13, 0.06 * dv);
        f.o.frequency.exponentialRampToValueAtTime(70, at + 0.12);
      }
    }

    // ---- lead: twangy pentatonic phrases, drenched in the plate
    const scale = PENT[chord];
    const play = (s === 0 || s === 3 || s === 6 || s === 10 || s === 11 || s === 14);
    if (play && m.lead > 0.3) {
      const idx = (step * 7 + bar * 3) % scale.length;
      const note = scale[idx] * Math.pow(2, m.detune / 1200);
      const vol = 0.055 * m.lead * lerp(0.8, 1.25, I);
      const dur = stepDur * (s === 0 ? 3.2 : 1.8);
      const v = this._voice('triangle', note, at, dur, vol);
      // the surf twang: a quick downward bend into the note
      v.o.frequency.setValueAtTime(note * 0.985, at);
      v.o.frequency.linearRampToValueAtTime(note, at + 0.05);
      // send to the plate
      const sendGain = this.ctx.createGain();
      sendGain.gain.value = m.verb;
      v.g.connect(sendGain); sendGain.connect(this.verbIn);
    }
  },
};
